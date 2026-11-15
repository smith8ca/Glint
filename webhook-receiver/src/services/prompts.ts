import { MRDetails, DiffFile, Commit } from './gitlab';

const MAX_COMMIT_CHARS = 15_000;

function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

/** The prompt for an MR review summary. Shared by every AI provider. */
export function buildMRSummaryPrompt(
  details: MRDetails,
  diffs: DiffFile[],
  maxDiffChars: number
): string {
  const fullDiff = diffs
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

  const { text: diffText, truncated } = truncate(fullDiff, maxDiffChars);

  return `You are a helpful code reviewer. Summarize the following GitLab merge request clearly and concisely for the development team.

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
}

/** The prompt for release notes. Shared by every AI provider. */
export function buildReleaseNotesPrompt(
  releaseName: string,
  tagName: string,
  prevTagName: string | null,
  commits: Commit[],
  diffs: DiffFile[],
  maxDiffChars: number
): string {
  const fullCommitList = commits
    .map((c) => `- ${c.short_id} ${c.title} (${c.author_name})`)
    .join('\n');

  const fullDiff = diffs
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

  const { text: diffText, truncated: diffTruncated } = truncate(fullDiff, maxDiffChars);
  const { text: commitList, truncated: commitsTruncated } = truncate(
    fullCommitList,
    MAX_COMMIT_CHARS
  );

  const rangeDescription = prevTagName
    ? `Changes from \`${prevTagName}\` to \`${tagName}\``
    : `All commits up to \`${tagName}\` (first release)`;

  return `You are a technical writer generating release notes for a software project. Write clear, user-facing release notes for the following GitLab release.

## Release Details
- **Release name**: ${releaseName}
- **Tag**: \`${tagName}\`
- **Scope**: ${rangeDescription}
- **Commits**: ${commits.length} commit${commits.length === 1 ? '' : 's'}

## Commit Log
${commitList}${commitsTruncated ? '\n*(truncated)*' : ''}

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
}
