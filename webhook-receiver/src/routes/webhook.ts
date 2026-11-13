import { Router, Request, Response } from 'express';
import { Config } from '../config';
import { validateSecret } from '../middleware/validateSecret';
import { createGitlabClient } from '../services/gitlab';
import { createClaudeClient } from '../services/claude';
import { describeError } from '../utils/errors';

interface MRPayload {
  object_kind: 'merge_request';
  project: { id: number };
  object_attributes: {
    iid: number;
    action: string;
  };
}

interface ReleasePayload {
  object_kind: 'release';
  project: { id: number };
  tag: string;
  name: string;
  action: string;
}

const HANDLED_MR_ACTIONS = new Set(['open', 'reopen']);

/** GitLab project IDs and MR IIDs are always positive integers. */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

const MAX_TAG_LENGTH = 255;
const WHITESPACE = /\s/;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Git tag names are non-empty and never contain whitespace or control characters. */
function isValidTagName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TAG_LENGTH) {
    return false;
  }
  return !WHITESPACE.test(value) && !CONTROL_CHARACTER.test(value);
}

export function webhookRouter(config: Config): Router {
  const router = Router();
  const gitlab = createGitlabClient(config);
  const claude = createClaudeClient(config);

  router.post('/', validateSecret(config), (req: Request, res: Response): void => {
    const event = req.headers['x-gitlab-event'];

    if (event === 'Merge Request Hook') {
      handleMergeRequest(req, res);
    } else if (event === 'Release Hook') {
      handleRelease(req, res);
    } else {
      res.status(200).json({ message: `Ignored: event '${event}'` });
    }
  });

  function handleMergeRequest(req: Request, res: Response): void {
    const payload = req.body as MRPayload;
    if (payload.object_kind !== 'merge_request') {
      res.status(200).json({ message: 'Ignored: not a merge_request event' });
      return;
    }

    if (!isPositiveInt(payload.project?.id) || !isPositiveInt(payload.object_attributes?.iid)) {
      res.status(400).json({ error: 'Bad Request: invalid project id or merge request iid' });
      return;
    }

    const { action } = payload.object_attributes;
    if (!HANDLED_MR_ACTIONS.has(action)) {
      res.status(200).json({ message: `Ignored: action '${action}'` });
      return;
    }

    res.status(202).json({ message: 'Accepted' });

    const projectId = payload.project.id;
    const mrIid = payload.object_attributes.iid;

    (async () => {
      console.log(`[webhook] Processing MR !${mrIid} in project ${projectId}…`);
      const [details, diffs] = await Promise.all([
        gitlab.getMRDetails(projectId, mrIid),
        gitlab.getMRDiffs(projectId, mrIid),
      ]);

      console.log(`[webhook] Sending ${diffs.length} diffs to Claude…`);
      const summary = await claude.summarizeMR(details, diffs);

      const noteBody = [
        '## AI-Generated MR Summary',
        '',
        summary,
        '',
        '---',
        '*This summary was generated automatically. Please verify before relying on it.*',
      ].join('\n');

      await gitlab.postMRNote(projectId, mrIid, noteBody);
      console.log(`[webhook] Posted AI summary to MR !${mrIid}`);
    })().catch((err) => {
      console.error(`[webhook] Error processing MR !${mrIid}: ${describeError(err)}`);
    });
  }

  function handleRelease(req: Request, res: Response): void {
    const payload = req.body as ReleasePayload;
    if (payload.object_kind !== 'release') {
      res.status(200).json({ message: 'Ignored: not a release event' });
      return;
    }

    if (!isPositiveInt(payload.project?.id) || !isValidTagName(payload.tag)) {
      res.status(400).json({ error: 'Bad Request: invalid project id or release tag' });
      return;
    }

    if (payload.action !== 'create') {
      res.status(200).json({ message: `Ignored: release action '${payload.action}'` });
      return;
    }

    res.status(202).json({ message: 'Accepted' });

    const projectId = payload.project.id;
    const tagName = payload.tag;
    const releaseName = typeof payload.name === 'string' && payload.name ? payload.name : tagName;

    (async () => {
      console.log(`[webhook] Processing release ${tagName} in project ${projectId}…`);

      // Find previous release tag to determine commit range
      const releases = await gitlab.getReleases(projectId);
      const currentIndex = releases.findIndex((r) => r.tag_name === tagName);
      const prevRelease = currentIndex === -1 ? undefined : releases[currentIndex + 1];
      const prevTagName = prevRelease?.tag_name ?? null;

      console.log(
        `[webhook] Comparing ${prevTagName ?? '(initial)'} → ${tagName}…`
      );

      // Fetch commits and diffs
      let commits: Awaited<ReturnType<typeof gitlab.getTagCommits>>;
      let diffs: Awaited<ReturnType<typeof gitlab.getMRDiffs>>;
      if (prevTagName) {
        const compare = await gitlab.compareRefs(projectId, prevTagName, tagName);
        commits = compare.commits;
        diffs = compare.diffs;
      } else {
        commits = await gitlab.getTagCommits(projectId, tagName);
        diffs = [];
      }

      console.log(
        `[webhook] Sending ${commits.length} commits and ${diffs.length} diffs to Claude…`
      );
      const notes = await claude.generateReleaseNotes(
        releaseName,
        tagName,
        prevTagName,
        commits,
        diffs
      );

      const description = [
        notes,
        '',
        '---',
        '*Release notes generated automatically by AI. Please review before publishing.*',
      ].join('\n');

      await gitlab.updateRelease(projectId, tagName, description);
      console.log(`[webhook] Updated release notes for ${tagName}`);
    })().catch((err) => {
      console.error(`[webhook] Error processing release ${tagName}: ${describeError(err)}`);
    });
  }

  return router;
}
