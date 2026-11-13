import Anthropic from '@anthropic-ai/sdk';
import { Config } from '../config';
import { MRDetails, DiffFile, Commit } from './gitlab';

const MAX_DIFF_CHARS = 20_000;
const MAX_COMMIT_CHARS = 15_000;

export function createClaudeClient(config: Config): {
  summarizeMR: (details: MRDetails, diffs: DiffFile[]) => Promise<string>;
  generateReleaseNotes: (
    releaseName: string,
    tagName: string,
    prevTagName: string | null,
    commits: Commit[],
    diffs: DiffFile[]
  ) => Promise<string>;
} {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  return {
    async summarizeMR(details, diffs) {
      let diffText = diffs
        .map((d) => {
          let label = '';
          if (d.new_file) {
            label = '(new file)';
          } else if (d.deleted_file) {
            label = '(deleted)';
          } else if (d.renamed_file) {
            label = `(renamed from ${d.old_path})`;
          }
          return `### ${d.new_path} ${label}\n\`\`\`diff\n${d.diff}\n\`\`\``;
        })
        .join('\n\n');

      let truncated = false;
      if (diffText.length > MAX_DIFF_CHARS) {
        diffText = diffText.slice(0, MAX_DIFF_CHARS);
        truncated = true;
      }

      const prompt = `You are a helpful code reviewer. Summarize the following GitLab merge request clearly and concisely for the development team.

## MR Details
- **Title**: ${details.title}
- **Author**: ${details.author.name} (@${details.author.username})
- **Branch**: \`${details.source_branch}\` → \`${details.target_branch}\`
- **Description**: ${details.description ?? '(none provided)'}

## Changed Files (${diffs.length} file${diffs.length === 1 ? '' : 's'})
${diffText}${truncated ? '\n\n*(diff truncated due to size)*' : ''}

Please provide:
1. **Summary** — 2–3 sentences describing what this MR does and why
2. **Key Changes** — a bullet list of the notable changes
3. **Review Notes** — any areas that deserve extra attention or potential concerns

Keep the tone professional and constructive.`;

      const message = await client.messages.create({
        model: config.anthropicModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = message.content[0];
      if (block?.type !== 'text') {
        throw new Error('Unexpected response structure from Claude API');
      }
      return block.text;
    },

    async generateReleaseNotes(releaseName, tagName, prevTagName, commits, diffs) {
      const commitList = commits
        .map((c) => `- ${c.short_id} ${c.title} (${c.author_name})`)
        .join('\n');

      let diffText = diffs
        .map((d) => {
          let label = '';
          if (d.new_file) {
            label = '(new file)';
          } else if (d.deleted_file) {
            label = '(deleted)';
          }
          return `### ${d.new_path} ${label}\n\`\`\`diff\n${d.diff}\n\`\`\``;
        })
        .join('\n\n');

      let diffTruncated = false;
      if (diffText.length > MAX_DIFF_CHARS) {
        diffText = diffText.slice(0, MAX_DIFF_CHARS);
        diffTruncated = true;
      }

      let commitsTruncated = false;
      let finalCommitList = commitList;
      if (finalCommitList.length > MAX_COMMIT_CHARS) {
        finalCommitList = finalCommitList.slice(0, MAX_COMMIT_CHARS);
        commitsTruncated = true;
      }

      const rangeDescription = prevTagName
        ? `Changes from \`${prevTagName}\` to \`${tagName}\``
        : `All commits up to \`${tagName}\` (first release)`;

      const prompt = `You are a technical writer generating release notes for a software project. Write clear, user-facing release notes for the following GitLab release.

## Release Details
- **Release name**: ${releaseName}
- **Tag**: \`${tagName}\`
- **Scope**: ${rangeDescription}
- **Commits**: ${commits.length} commit${commits.length === 1 ? '' : 's'}

## Commit Log
${finalCommitList}${commitsTruncated ? '\n*(truncated)*' : ''}

## Code Changes
${diffText || '*(no diff available)*'}${diffTruncated ? '\n\n*(diff truncated due to size)*' : ''}

Generate well-structured release notes in Markdown. Use these sections as appropriate (omit any that don't apply):

### 🚀 New Features
### 🐛 Bug Fixes
### ♻️ Improvements
### ⚠️ Breaking Changes
### 🔧 Internal / Chores

Rules:
- Each bullet point should be user-facing and meaningful — avoid low-level implementation details
- Infer the category from the commit message (feat/fix/refactor/chore/docs prefixes are common signals)
- If a breaking change is detected, call it out clearly
- Keep language concise and direct`;

      const message = await client.messages.create({
        model: config.anthropicModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = message.content[0];
      if (block?.type !== 'text') {
        throw new Error('Unexpected response structure from Claude API');
      }
      return block.text;
    },
  };
}
