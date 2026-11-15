# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

0.1.14 is the first release published on GitHub. Earlier versions were developed in a private repository, so their tags and commit history are not part of [this repository](https://github.com/smith8ca/Glint).

## [Unreleased]

---

## [0.1.23] - 2026-11-15

### Added

- README: a screenshot of a real Glint comment on a GitLab merge request, in the "Example output" section

---

## [0.1.22] - 2026-11-15

### Changed

- Architecture diagram redrawn to show the choice of AI provider (Claude, a local model, or a hosted OpenAI-compatible API), the network boundary and the numbered request flow. It is now also shown in the README as `assets/png/architecture.png`

---

## [0.1.21] - 2026-11-15

### Security

- Malformed JSON sent to `/webhook` no longer returns Express's HTML error page, which included a stack trace and internal file paths and could be triggered without a valid webhook token (the body is parsed before authentication). Errors now get a short JSON body with no details: `400 {"error":"Bad Request: invalid JSON body"}`, `413` for an oversized body, and a generic `500` for anything unexpected. Rejected bodies are logged at `warn`
- The Docker image sets `NODE_ENV=production`

### Changed

- Express upgraded from 4 to 5. A webhook request with no JSON body is still answered with `200 Ignored`
- TypeScript upgraded from 5 to 7, and `npm run dev` now uses `tsx` instead of `ts-node`, which does not support TypeScript 7
- dotenv upgraded from 16 to 18; supertest and its types updated (tests only)
- Unknown routes return `404 {"error":"Not Found"}` as JSON instead of Express's HTML page
- Dependabot no longer proposes major `@types/node` updates, which must match the Node version in use

### Added

- README: an example of a generated merge request summary

---

## [0.1.20] - 2026-11-15

### Added

- **OpenAI-compatible AI provider.** Set `AI_PROVIDER=openai-compatible` to write summaries and release notes with any server that implements the OpenAI Chat Completions API: OpenAI, a local [Ollama](https://ollama.com/) server (nothing leaves your network), LM Studio, vLLM, OpenRouter or Gemini's OpenAI-compatible endpoint. Configured with `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `OPENAI_MODEL` (required) and `OPENAI_API_KEY` (optional). Tested against Ollama
- `MAX_DIFF_CHARS` option (default `20000`, minimum `1000`) to limit how much diff is sent to the model, for models with a small context window. Applies to both providers
- The startup log line now includes the `provider`

### Changed

- `ANTHROPIC_API_KEY` is required only when `AI_PROVIDER` is `anthropic`, which remains the default, so existing deployments need no change
- Prompts moved to a shared module used by every provider; the Claude prompts are unchanged
- Log messages say "the AI provider" instead of "Claude" (`Sending diffs to the AI provider`)
- The e2e test runs against whichever provider is configured

---

## [0.1.19] - 2026-11-15

No changes to the application; the image is functionally identical to 0.1.18.

### Added

- GitHub issue forms (bug report, feature request) and a pull request template
- `CODE_OF_CONDUCT.md`, adopting the Contributor Covenant 2.1
- Dependabot configuration for npm, GitHub Actions and the Docker base image, opening weekly update pull requests against `dev`
- README badges for the release build and the latest release

---

## [0.1.18] - 2026-11-15

### Added

- Structured logging with [pino](https://github.com/pinojs/pino): one JSON object per line on stdout, with `level`, ISO `time`, `service`, `msg` and per-event fields (`event`, `projectId`, `mrIid` or `tag`, `durationMs`). Rejected webhooks (bad token or signature, invalid payload) are logged at `warn`, ignored events at `debug`
- `LOG_LEVEL` option (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`; default `info`), validated at startup
- `SECURITY.md` with the vulnerability reporting policy (GitHub private vulnerability reporting; only the latest release is supported)
- `npm run typecheck` type-checks the source and the tests; CI runs it before the build

### Changed

- **Log format.** Logs are now JSON lines instead of plain text such as `[webhook] Posted AI summary to MR !42`. Update anything that parses or greps the old format. For readable output while developing, pipe through `npx pino-pretty`
- `@anthropic-ai/sdk` upgraded from 0.36 to 1.8, which uses Claude API version `2026-10-21` and sends the API key as `Authorization: Bearer`. No configuration change is needed. Clears the last npm deprecation warning (`node-domexception`). The SDK is now licensed under Apache-2.0

### Fixed

- The Docker image no longer ships the compiled unit tests: the build uses `tsconfig.build.json`, which excludes `src/**/__tests__/**`
- `.gitlab-ci.yml`: the `release` job no longer cuts a duplicate patch release when the `main` commit already has a `vX.Y.Z` tag (same fix as `release.yml` got in 0.1.16)

---

## [0.1.17] - 2026-11-14

### Added

- [Project wiki](https://github.com/smith8ca/Glint/wiki) with guides for setup, configuration, webhooks, deployment, private CAs, security, API reference, architecture, development, CI/CD, troubleshooting and FAQ; linked from the README

### Changed

- Test tooling upgraded from Vitest 2 to Vitest 5.1 (and `@vitest/coverage-v8` 5.1, on Vite 8). Clears all 10 dev-only `npm audit` findings (3 critical, including `tinypool` and `esbuild`) and the Vite CJS deprecation warning. No effect on the published image, which ships production dependencies only

### Fixed

- README corrections: `ci.yml` runs on pull requests and manual runs, not branch pushes; the example `docker-compose.yml` needs its inline `environment:` placeholders replaced (they override `env_file:`); the e2e test also needs `WEBHOOK_SECRET` and a non-empty `GITLAB_TOKEN`, and must run without `WEBHOOK_SIGNING_TOKEN`

---

## [0.1.16] - 2026-11-13

### Changed

- GitHub Actions upgraded to their Node 24 releases (`actions/checkout`, `setup-node` and `upload-artifact` v7; `docker/build-push-action` v7; `docker/setup-buildx-action`, `login-action` and `setup-qemu-action` v4), clearing the Node 20 deprecation warnings
- `ci.yml` no longer runs on branch pushes, only on pull requests (plus `workflow_dispatch` on demand), so PR branches are checked once instead of twice

### Fixed

- `release.yml` no longer cuts a duplicate patch release when a push to `main` lands on a commit that already has a `vX.Y.Z` tag (as happened with v0.1.15, which is the same commit as v0.1.14)

---

## [0.1.15] - 2026-11-13

No changes. Same commit as 0.1.14, published by the duplicate-release bug fixed in 0.1.16.

---

## [0.1.14] - 2026-11-13

First public release. Includes the changes from the private 0.1.12–0.1.14 releases.

### Added

- GitHub Actions workflows: `ci.yml` (build, unit tests with coverage, e2e typecheck, Docker build) and `release.yml` (`:dev` image from `dev`; patch tag, `:vX.Y.Z`/`:latest` multi-arch images on GHCR and a GitHub Release from `main`)
- README **Security considerations** and **AI attribution** sections
- CI: optional `SONAR_PROJECT_KEY` variable overrides `sonar.projectKey`
- gitleaks secret scanning: a pre-commit hook in `.githooks/` (enable with `git config core.hooksPath .githooks`) and a `Secret scan` job in the GitHub CI workflow
- `GITLAB_CA_FILE` option to trust a private or self-signed CA for GitLab API calls. Works from `.env`, Docker and the shell, and fails at startup if the file is missing or not PEM. Docs now recommend it over `GITLAB_REJECT_UNAUTHORIZED=false`

### Changed

- Runtime upgraded from Node 18 (end of life) to Node 22 in the Docker image and CI; `engines.node >=22`
- Docs and config scrubbed of environment-specific hostnames and paths; `docker-compose.yml` is now a generic example with TLS verification on by default
- `CONTRIBUTING.md` uses pull-request workflow wording; roadmap items are listed without issue-tracker links
- Licence holder and package author set to Chuckworks Engineering

### Removed

- GitLab issue and merge request templates (`.gitlab/`)

### Fixed

- The e2e test no longer reports the webhook receiver as having exited unexpectedly when the test stops it during cleanup

### Security

- Failed GitLab API calls no longer log the raw axios error, which included the `PRIVATE-TOKEN` header
- Legacy `X-Gitlab-Token` secret is compared in constant time
- Webhook payloads are validated (positive integer project ID and MR IID, well-formed release tag) and rejected with `400` otherwise
- Resolved all production dependency vulnerabilities (1 critical, 4 high, 2 moderate)

---

## [0.1.11] - 2026-06-22

### Added

- CI: `dev` and `production` publish jobs now declare GitLab Environments backed by `PROD_URL` and `DEVL_URL` CI/CD variables, giving each deployment a dashboard link and a tracked deployment tier

### Changed

- Restructured steering/reference documentation (`CLAUDE.md`) — consolidated environment variable tables, CI/CD stage descriptions, and Docker setup instructions

---

## [0.1.10] - 2026-06-18

### Added

- Vitest unit test suite with 99% code coverage across all source modules — Express app, config loading, webhook secret validation (legacy and HMAC signing modes), and webhook route handling
- `unit-test` CI job that runs on every pipeline and generates an LCOV coverage report

### Changed

- `sonar-scan` job moved to depend on `unit-test` artifacts, ensuring coverage data is always included in SonarQube analysis; configured to recognize test file locations and the LCOV report path

---

## [0.1.9] - 2026-06-18

### Added

- SAST scanning on every push via GitLab's built-in SAST template
- Secret detection on every push via GitLab's built-in Secret Detection template
- Environment tracking for `dev` and `production` publish jobs

### Changed

- CI pipeline expanded from two stages to four: `test` and `secret-detection` now run ahead of `build` and `publish`, surfacing feedback earlier
- `sonar-scan` moved from the `build` stage to the `test` stage
- Node.js built-in module imports standardized to the explicit `node:` prefix (`node:crypto`, `node:https`)

### Fixed

- Minor code cleanup in the Claude and webhook service modules (simplified conditionals, tightened null checks)

---

## [0.1.8] - 2026-06-18

### Added

- HMAC-based webhook signature verification (`WEBHOOK_SIGNING_TOKEN`) using a timing-safe comparison, with requests outside a 5-minute timestamp window rejected as replay attempts

### Changed

- Architecture diagram now uses a system-native monospace font stack, removing the external Google Fonts dependency
- Resolved all SonarQube code quality findings: safer null handling, consistent `node:` module prefixes, minor logic simplification

### Security

- At least one of `WEBHOOK_SECRET` or `WEBHOOK_SIGNING_TOKEN` is now required at startup — the server fails fast if neither is configured

---

## [0.1.7] - 2026-06-18

### Added

- Signing token support (`WEBHOOK_SIGNING_TOKEN`): HMAC-SHA256 payload verification following the [Standard Webhooks](https://www.standardwebhooks.com/) spec. Validates the `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers sent by GitLab 19.0+. Provides payload integrity checking and replay protection (5-minute timestamp window). The existing `WEBHOOK_SECRET` (legacy `X-Gitlab-Token` header check) remains fully supported — at least one of the two must be set; the signing token takes priority when both are configured.

### Changed

- Updated `.env.example`, README, CONTRIBUTING, and CLAUDE.md to document both authentication options

---

## [0.1.6] - 2026-04-08

Released as a series of automated patch versions (v0.1.2 through v0.1.6) via the CI versioning pipeline between 2026-04-07 and 2026-04-08.

### Added

- CI: `release` job on `main` that reads the latest `vX.Y.Z` tag, increments the patch version, and creates the new tag via the GitLab API on every push to `main`
- CI: `publish:tag` job creates a GitLab Release after pushing the versioned image, triggering Glint to generate and populate AI release notes automatically
- SonarQube integration: `sonar-scan` job in the build stage, triggered on MR events, `main`, and `dev` (non-blocking — does not fail the pipeline)
- GitLab merge request templates: Default, Feature, and Bug Fix (`.gitlab/merge_request_templates/`)
- GitLab issue templates: Bug and Feature Request (`.gitlab/issue_templates/`)

### Changed

- Updated README to document the release notes flow, Release events webhook trigger, CI/CD pipeline, versioning model, and `GITLAB_REJECT_UNAUTHORIZED`
- CI pipeline consolidated: SonarQube scan merged into the `build` stage alongside `typecheck`
- `docker-compose.yml` environment variable names corrected for local development

---

## [0.1.1] - 2026-04-07

### Added

- Docker support: multi-stage `Dockerfile` in `webhook-receiver/`, `.dockerignore`, and root-level `docker-compose.yml` for one-command deployment. Runs as a non-root `glint` user. Reads configuration from `webhook-receiver/.env` at runtime — never baked into the image.
- Initial GitLab CI/CD pipeline (`.gitlab-ci.yml`): TypeScript type-checking on every push, Docker image publishing to the GitLab Container Registry on `dev` pushes and version tags
- SVG brand assets in `assets/`: logo (512×512), icon (256×256), favicon (64×64), banner (1280×400), and social preview (1200×630) — orange git-branch arc with purple AI sparkle motif

### Changed

- Updated ROADMAP to mark Docker and CI/CD as shipped and move them into the `v0.1.x` section

---

## [0.1.0] - 2026-03-21

### Added

- Express webhook receiver (`POST /webhook`) handling both `Merge Request Hook` and `Release Hook` GitLab events
- Secret token validation middleware (`X-Gitlab-Token` header) to authenticate incoming webhooks
- Health check endpoint (`GET /health`) for liveness monitoring
- Async processing model: responds HTTP 202 immediately while AI generation runs in the background
- **MR review summaries**: fetches MR details and diffs from the GitLab API, sends to Claude, and posts a structured summary (Summary, Key Changes, Review Notes) as a comment on the MR
- **AI-generated release notes**: on release creation, fetches commits between the new tag and the previous release tag, sends to Claude, and updates the release description with structured notes (Features, Bug Fixes, Improvements, Breaking Changes, Chores)
- GitLab API client: MR details, MR diffs, posting MR notes, listing releases, comparing refs, fetching commits by tag, updating release descriptions
- Diff truncation at 20,000 characters with inline notice to stay within model context limits
- `GITLAB_REJECT_UNAUTHORIZED` option for self-hosted GitLab instances with self-signed SSL certificates
- Environment-based configuration with fail-fast validation on startup
- End-to-end test suite with a mock GitLab server that exercises the full MR review flow against the real Claude API
- TypeScript throughout, targeting ES2020 with CommonJS modules

---

[Unreleased]: https://github.com/smith8ca/Glint/compare/v0.1.23...HEAD
[0.1.23]: https://github.com/smith8ca/Glint/compare/v0.1.22...v0.1.23
[0.1.22]: https://github.com/smith8ca/Glint/compare/v0.1.21...v0.1.22
[0.1.21]: https://github.com/smith8ca/Glint/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/smith8ca/Glint/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/smith8ca/Glint/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/smith8ca/Glint/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/smith8ca/Glint/compare/v0.1.16...v0.1.17
[0.1.16]: https://github.com/smith8ca/Glint/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/smith8ca/Glint/releases/tag/v0.1.15
[0.1.14]: https://github.com/smith8ca/Glint/releases/tag/v0.1.14
