import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { spawn, ChildProcess } from 'node:child_process';
import axios from 'axios';
import { startMockGitlabServer } from './mockGitlab';
import webhookPayload from './fixtures/mrWebhook.json';

const MOCK_GITLAB_PORT = Number.parseInt(process.env['MOCK_GITLAB_PORT'] ?? '4000', 10);
const RECEIVER_PORT = Number.parseInt(process.env['RECEIVER_PORT'] ?? '3001', 10);
const NOTE_TIMEOUT_MS = Number.parseInt(process.env['NOTE_TIMEOUT_MS'] ?? '60000', 10);
const RECEIVER_DIR = path.resolve(__dirname, '../../webhook-receiver');
const RECEIVER_URL = `http://localhost:${RECEIVER_PORT}`;

/** Read the receiver's .env file so the test always uses the same credentials. */
function loadReceiverConfig(): Record<string, string> {
  const envPath = path.join(RECEIVER_DIR, '.env');
  if (!fs.existsSync(envPath)) return {};
  return dotenv.parse(fs.readFileSync(envPath));
}

async function poll<T>(
  fn: () => Promise<T | null>,
  intervalMs: number,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  // Attempts must run one after another, so poll recursively rather than
  // awaiting inside a loop.
  const attempt = async (): Promise<T> => {
    if (Date.now() >= deadline) {
      throw new Error(`Polling timed out after ${timeoutMs}ms`);
    }
    const result = await fn();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    return attempt();
  };

  return attempt();
}

async function waitForReceiver(timeoutMs: number): Promise<void> {
  await poll(
    async () => {
      try {
        await axios.get(`${RECEIVER_URL}/health`);
        return true;
      } catch {
        return null;
      }
    },
    200,
    timeoutMs
  );
}

function spawnReceiver(mockGitlabUrl: string, receiverConfig: Record<string, string>): ChildProcess {
  const env = {
    ...process.env,
    // Spread all values from the receiver's .env so required vars are always present
    ...receiverConfig,
    // Override only what the test needs to control
    PORT: String(RECEIVER_PORT),
    GITLAB_BASE_URL: mockGitlabUrl,
  };

  const child = spawn('node', ['dist/index.js'], {
    cwd: RECEIVER_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d: Buffer) => process.stdout.write(`  [receiver] ${d}`));
  child.stderr?.on('data', (d: Buffer) => process.stderr.write(`  [receiver] ${d}`));

  return child;
}

async function run(): Promise<void> {
  console.log('\n=== GitLab MR Webhook Receiver — E2E Test ===\n');

  const receiverConfig = loadReceiverConfig();
  const webhookSecret = receiverConfig['WEBHOOK_SECRET'];
  const anthropicApiKey = receiverConfig['ANTHROPIC_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'];

  if (!webhookSecret) {
    console.error('[test] ERROR: WEBHOOK_SECRET not found in webhook-receiver/.env');
    process.exit(1);
  }
  if (!anthropicApiKey) {
    console.error('[test] ERROR: ANTHROPIC_API_KEY not found in webhook-receiver/.env');
    process.exit(1);
  }

  // 1. Start mock GitLab server
  console.log(`[test] Starting mock GitLab server on port ${MOCK_GITLAB_PORT}…`);
  const mockGitlab = await startMockGitlabServer(MOCK_GITLAB_PORT);
  console.log(`[test] Mock GitLab ready`);

  const mockGitlabUrl = `http://localhost:${MOCK_GITLAB_PORT}`;
  let receiver: ChildProcess | null = null;
  // Set once the test itself stops the receiver, so that exit isn't reported as unexpected.
  let stopping = false;

  const cleanup = async () => {
    stopping = true;
    if (receiver) {
      receiver.kill();
      receiver = null;
    }
    await mockGitlab.close();
  };

  try {
    // 2. Spawn webhook receiver
    console.log(`[test] Spawning webhook receiver from ${RECEIVER_DIR}…`);
    receiver = spawnReceiver(mockGitlabUrl, receiverConfig);

    let receiverExited = false;
    receiver.on('exit', (code) => {
      receiverExited = true;
      if (!stopping) {
        console.error(`\n[test] Receiver process exited unexpectedly (code ${code ?? 'null'})`);
      }
    });

    // 3. Wait for receiver to be ready
    console.log('[test] Waiting for receiver to be ready…');
    await waitForReceiver(15_000);
    console.log('[test] Receiver is ready\n');

    if (receiverExited) throw new Error('Receiver process exited before becoming ready');

    // 4. Send test webhook using the same secret the receiver was configured with
    console.log('[test] Sending test MR webhook…');
    const response = await axios.post(`${RECEIVER_URL}/webhook`, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Gitlab-Token': webhookSecret,
        'X-Gitlab-Event': 'Merge Request Hook',
      },
    });
    console.log(`[test] Webhook accepted (HTTP ${response.status})\n`);

    // 5. Wait for AI note to be posted on mock server
    console.log(`[test] Waiting up to ${NOTE_TIMEOUT_MS / 1000}s for AI summary note…`);
    const note = await poll(
      async () => {
        const res = await axios.get<typeof mockGitlab.capturedNotes>(`${mockGitlabUrl}/__test__/notes`);
        return res.data.length > 0 ? res.data[0] : null;
      },
      500,
      NOTE_TIMEOUT_MS
    );

    // 6. Report result
    console.log('\n✓ TEST PASSED — AI summary was posted!\n');
    console.log('━'.repeat(60));
    console.log(note.body);
    console.log('━'.repeat(60) + '\n');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n✗ TEST FAILED — ${message}\n`);
    await cleanup();
    process.exit(1);
  }

  await cleanup();
  console.log('[test] Done.');
}

/** Entry point: never rejects, so the top-level call cannot leave a floating promise. */
async function main(): Promise<void> {
  try {
    await run();
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`\n✗ Unexpected error — ${message}\n`);
    process.exit(1);
  }
}

void main();
