import axios, { AxiosInstance } from 'axios';
import https from 'node:https';
import tls from 'node:tls';
import { Config } from '../config';

/**
 * Certificates to trust for GitLab: Node's defaults plus the configured CA.
 * Passing `ca` replaces the defaults, so they are included explicitly. Returns
 * undefined when no CA is configured, leaving Node's normal behaviour untouched.
 */
export function trustedCertificates(extraCa: string | undefined): string[] | undefined {
  if (!extraCa) return undefined;
  // getCACertificates('default') (Node 22.15+) also keeps any NODE_EXTRA_CA_CERTS.
  const defaults =
    typeof tls.getCACertificates === 'function'
      ? tls.getCACertificates('default')
      : [...tls.rootCertificates];
  return [...defaults, extraCa];
}

export interface MRDetails {
  iid: number;
  title: string;
  description: string | null;
  state: string;
  source_branch: string;
  target_branch: string;
  author: { name: string; username: string };
  web_url: string;
}

export interface DiffFile {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
}

export interface Commit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_name: string;
}

export interface Release {
  tag_name: string;
  name: string;
  description: string;
  released_at: string;
}

export interface CompareResult {
  commits: Commit[];
  diffs: DiffFile[];
}

export function createGitlabClient(config: Config): {
  getMRDetails: (projectId: number, mrIid: number) => Promise<MRDetails>;
  getMRDiffs: (projectId: number, mrIid: number) => Promise<DiffFile[]>;
  postMRNote: (projectId: number, mrIid: number, body: string) => Promise<void>;
  getReleases: (projectId: number) => Promise<Release[]>;
  compareRefs: (projectId: number, from: string, to: string) => Promise<CompareResult>;
  getTagCommits: (projectId: number, tagName: string) => Promise<Commit[]>;
  updateRelease: (projectId: number, tagName: string, description: string) => Promise<void>;
} {
  const client: AxiosInstance = axios.create({
    baseURL: config.gitlabBaseUrl,
    headers: { 'PRIVATE-TOKEN': config.gitlabToken },
    httpsAgent: new https.Agent({
      rejectUnauthorized: config.gitlabRejectUnauthorized,
      ca: trustedCertificates(config.gitlabCaCertificate),
    }),
  });

  return {
    async getMRDetails(projectId, mrIid) {
      const { data } = await client.get<MRDetails>(
        `/api/v4/projects/${projectId}/merge_requests/${mrIid}`
      );
      return data;
    },

    async getMRDiffs(projectId, mrIid) {
      const { data } = await client.get<DiffFile[]>(
        `/api/v4/projects/${projectId}/merge_requests/${mrIid}/diffs`,
        { params: { per_page: 100 } }
      );
      return data;
    },

    async postMRNote(projectId, mrIid, body) {
      await client.post(
        `/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`,
        { body }
      );
    },

    async getReleases(projectId) {
      const { data } = await client.get<Release[]>(
        `/api/v4/projects/${projectId}/releases`,
        { params: { per_page: 10 } }
      );
      return data;
    },

    async compareRefs(projectId, from, to) {
      const { data } = await client.get<CompareResult>(
        `/api/v4/projects/${projectId}/repository/compare`,
        { params: { from, to, straight: true } }
      );
      return data;
    },

    async getTagCommits(projectId, tagName) {
      const { data } = await client.get<Commit[]>(
        `/api/v4/projects/${projectId}/repository/commits`,
        { params: { ref_name: tagName, per_page: 100 } }
      );
      return data;
    },

    async updateRelease(projectId, tagName, description) {
      await client.put(
        `/api/v4/projects/${projectId}/releases/${encodeURIComponent(tagName)}`,
        { description }
      );
    },
  };
}
