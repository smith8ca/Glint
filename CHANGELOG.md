# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

0.1.14 is the first release published on GitHub. Earlier versions were developed in a private repository, so their tags and commit history are not part of [this repository](https://github.com/smith8ca/Glint).

## [Unreleased]

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

[Unreleased]: https://github.com/smith8ca/Glint/compare/v0.1.16...HEAD
[0.1.16]: https://github.com/smith8ca/Glint/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/smith8ca/Glint/releases/tag/v0.1.15
[0.1.14]: https://github.com/smith8ca/Glint/releases/tag/v0.1.14
