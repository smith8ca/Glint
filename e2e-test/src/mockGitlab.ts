import express from 'express';
import http from 'node:http';
import mrDetails from './fixtures/mrDetails.json';
import mrDiff from './fixtures/mrDiff.json';

export interface CapturedNote {
  projectId: string;
  mrIid: string;
  body: string;
  receivedAt: Date;
}

export interface MockGitlabServer {
  server: http.Server;
  capturedNotes: CapturedNote[];
  port: number;
  close: () => Promise<void>;
}

export function startMockGitlabServer(port: number): Promise<MockGitlabServer> {
  const app = express();
  app.use(express.json());

  const capturedNotes: CapturedNote[] = [];

  // GET MR details
  app.get('/api/v4/projects/:projectId/merge_requests/:mrIid', (req, res) => {
    console.log(`[MockGitLab] GET MR details  project=${req.params['projectId']} mr=${req.params['mrIid']}`);
    res.json(mrDetails);
  });

  // GET MR diffs
  app.get('/api/v4/projects/:projectId/merge_requests/:mrIid/diffs', (req, res) => {
    console.log(`[MockGitLab] GET MR diffs     project=${req.params['projectId']} mr=${req.params['mrIid']}`);
    res.json(mrDiff);
  });

  // POST MR note — this is what we're waiting for
  app.post('/api/v4/projects/:projectId/merge_requests/:mrIid/notes', (req, res) => {
    const note: CapturedNote = {
      projectId: req.params['projectId'] ?? '',
      mrIid: req.params['mrIid'] ?? '',
      body: req.body.body as string,
      receivedAt: new Date(),
    };
    capturedNotes.push(note);
    console.log(`[MockGitLab] Note posted      project=${note.projectId} mr=${note.mrIid} (${note.body.length} chars)`);
    res.status(201).json({ id: Date.now(), body: note.body });
  });

  // Internal inspection endpoint for the test runner
  app.get('/__test__/notes', (_req, res) => {
    res.json(capturedNotes);
  });

  const server = http.createServer(app);

  function closeServer(): Promise<void> {
    return new Promise((res) => server.close(() => res()));
  }

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      resolve({ server, capturedNotes, port, close: closeServer });
    });
    server.on('error', reject);
  });
}
