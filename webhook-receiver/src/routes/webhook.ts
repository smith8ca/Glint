import { Router, Request, Response } from 'express';
import { Config } from '../config';
import { validateSecret } from '../middleware/validateSecret';
import { createGitlabClient } from '../services/gitlab';
import { createAiClient } from '../services/ai';
import { describeError } from '../utils/errors';
import { logger } from '../logger';

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
  const ai = createAiClient(config);

  router.post('/', validateSecret(config), (req: Request, res: Response): void => {
    const event = req.headers['x-gitlab-event'];

    if (event === 'Merge Request Hook') {
      handleMergeRequest(req, res);
    } else if (event === 'Release Hook') {
      handleRelease(req, res);
    } else {
      logger.debug({ event }, 'Ignored webhook: unhandled event type');
      res.status(200).json({ message: `Ignored: event '${event}'` });
    }
  });

  function handleMergeRequest(req: Request, res: Response): void {
    // Express 5 leaves req.body undefined when no JSON body was sent.
    const payload = (req.body ?? {}) as MRPayload;
    if (payload.object_kind !== 'merge_request') {
      res.status(200).json({ message: 'Ignored: not a merge_request event' });
      return;
    }

    if (!isPositiveInt(payload.project?.id) || !isPositiveInt(payload.object_attributes?.iid)) {
      logger.warn({ event: 'merge_request' }, 'Rejected webhook: invalid project id or MR iid');
      res.status(400).json({ error: 'Bad Request: invalid project id or merge request iid' });
      return;
    }

    const { action } = payload.object_attributes;
    if (!HANDLED_MR_ACTIONS.has(action)) {
      logger.debug({ event: 'merge_request', action }, 'Ignored webhook: unhandled MR action');
      res.status(200).json({ message: `Ignored: action '${action}'` });
      return;
    }

    res.status(202).json({ message: 'Accepted' });

    const projectId = payload.project.id;
    const mrIid = payload.object_attributes.iid;

    const log = logger.child({ event: 'merge_request', projectId, mrIid });

    (async () => {
      const started = Date.now();
      log.info('Processing merge request');
      const [details, diffs] = await Promise.all([
        gitlab.getMRDetails(projectId, mrIid),
        gitlab.getMRDiffs(projectId, mrIid),
      ]);

      log.info({ diffs: diffs.length }, 'Sending diffs to the AI provider');
      const summary = await ai.summarizeMR(details, diffs);

      const noteBody = [
        '## AI-Generated MR Summary',
        '',
        summary,
        '',
        '---',
        '*This summary was generated automatically. Please verify before relying on it.*',
      ].join('\n');

      await gitlab.postMRNote(projectId, mrIid, noteBody);
      log.info({ durationMs: Date.now() - started }, 'Posted AI summary');
    })().catch((err) => {
      log.error({ error: describeError(err) }, 'Failed to process merge request');
    });
  }

  function handleRelease(req: Request, res: Response): void {
    const payload = (req.body ?? {}) as ReleasePayload;
    if (payload.object_kind !== 'release') {
      res.status(200).json({ message: 'Ignored: not a release event' });
      return;
    }

    if (!isPositiveInt(payload.project?.id) || !isValidTagName(payload.tag)) {
      logger.warn({ event: 'release' }, 'Rejected webhook: invalid project id or release tag');
      res.status(400).json({ error: 'Bad Request: invalid project id or release tag' });
      return;
    }

    if (payload.action !== 'create') {
      logger.debug(
        { event: 'release', action: payload.action },
        'Ignored webhook: unhandled release action'
      );
      res.status(200).json({ message: `Ignored: release action '${payload.action}'` });
      return;
    }

    res.status(202).json({ message: 'Accepted' });

    const projectId = payload.project.id;
    const tagName = payload.tag;
    const releaseName = typeof payload.name === 'string' && payload.name ? payload.name : tagName;

    const log = logger.child({ event: 'release', projectId, tag: tagName });

    (async () => {
      const started = Date.now();
      log.info('Processing release');

      // Find previous release tag to determine commit range
      const releases = await gitlab.getReleases(projectId);
      const currentIndex = releases.findIndex((r) => r.tag_name === tagName);
      const prevRelease = currentIndex === -1 ? undefined : releases[currentIndex + 1];
      const prevTagName = prevRelease?.tag_name ?? null;

      log.info({ previousTag: prevTagName }, 'Comparing with previous release');

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

      log.info({ commits: commits.length, diffs: diffs.length }, 'Sending commits and diffs to the AI provider');
      const notes = await ai.generateReleaseNotes(
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
      log.info({ durationMs: Date.now() - started }, 'Updated release notes');
    })().catch((err) => {
      log.error({ error: describeError(err) }, 'Failed to process release');
    });
  }

  return router;
}
