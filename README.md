# Glint

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js ≥22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/get-docker/)
[![Powered by Claude](https://img.shields.io/badge/Powered%20by-Claude%20AI-D97706?logo=anthropic&logoColor=white)](https://anthropic.com)

![Glint Banner](assets/png/social-preview.png)

A self-hosted GitLab webhook receiver that automatically posts AI-generated code review summaries on merge requests and generates release notes using Claude (Anthropic). Designed for self-hosted GitLab CE (free tier) — no paid GitLab features required.

- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Project structure](#project-structure)
- [Setup](#setup)
  - [1. Clone the repository](#1-clone-the-repository)
  - [2. Configure environment variables](#2-configure-environment-variables)
  - [3. Install dependencies](#3-install-dependencies)
- [Running the webhook receiver](#running-the-webhook-receiver)
  - [With Docker (recommended)](#with-docker-recommended)
  - [Without Docker](#without-docker)
- [Configuring the GitLab webhook](#configuring-the-gitlab-webhook)
- [Running the unit tests](#running-the-unit-tests)
- [Running the end-to-end test](#running-the-end-to-end-test)
- [Environment variables](#environment-variables)
  - [GitLab with a private or self-signed CA](#gitlab-with-a-private-or-self-signed-ca)
- [CI/CD](#cicd)
  - [GitHub Actions](#github-actions)
  - [GitLab CI (self-hosted)](#gitlab-ci-self-hosted)
- [Versioning](#versioning)
- [Security considerations](#security-considerations)
- [AI attribution](#ai-attribution)

&nbsp;

## How it works

**Merge request review**

1. A merge request is opened or reopened in GitLab
2. GitLab fires a `Merge Request Hook` webhook to this service
3. The service validates the request token and responds `202 Accepted` immediately
4. Asynchronously, it fetches the MR details and diffs from the GitLab API
5. The diffs are sent to Claude, which returns a structured summary
6. The summary is posted as a comment on the MR via the GitLab Notes API

**Release notes generation**

1. A release is created in GitLab
2. GitLab fires a `Release Hook` webhook to this service
3. The service validates the request token and responds `202 Accepted` immediately
4. Asynchronously, it fetches the commits between the new release tag and the previous tag from the GitLab API
5. The commits are sent to Claude, which returns structured release notes
6. The release description is updated with the generated notes via the GitLab Releases API

## Prerequisites

- **Anthropic API key** ([get one here](https://console.anthropic.com/))
- **GitLab personal access token** with `api` scope ([create one here](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html))
- **Docker** and **Docker Compose** — for the recommended production setup
- **Node.js v22 or later** — only required if running without Docker

## Project structure

```
glint/
├── webhook-receiver/          # Express server that receives and processes webhooks
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── app.ts             # Express app setup
│   │   ├── config.ts          # Environment variable loading
│   │   ├── routes/
│   │   │   ├── webhook.ts     # POST /webhook — handles Merge Request and Release webhook events
│   │   │   └── health.ts      # GET /health — health check
│   │   ├── services/
│   │   │   ├── gitlab.ts      # GitLab API client (fetch MR diffs, commits, post notes/release descriptions)
│   │   │   └── claude.ts      # Anthropic API client (generate MR summaries and release notes)
│   │   └── middleware/
│   │       └── validateSecret.ts  # Webhook auth: legacy secret token or HMAC-SHA256 signing token
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
├── e2e-test/                  # End-to-end test runner
│   ├── src/
│   │   ├── mockGitlab.ts      # Mock GitLab API server (port 4000)
│   │   ├── fixtures/
│   │   │   ├── mrWebhook.json # Sample webhook payload
│   │   │   ├── mrDetails.json # Sample MR details response
│   │   │   └── mrDiff.json    # Sample MR diff response
│   └── package.json
├── .gitlab-ci.yml             # CI/CD pipeline
├── docker-compose.yml
```

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/smith8ca/Glint.git
cd Glint
```

### 2. Configure environment variables

```bash
cp webhook-receiver/.env.example webhook-receiver/.env
```

Edit `webhook-receiver/.env` with your values:

```dotenv
PORT=3000
GITLAB_BASE_URL=https://gitlab.example.com
GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx

# Webhook authentication — set one (or both; signing token takes priority)
WEBHOOK_SECRET=your-webhook-secret                  # legacy X-Gitlab-Token check
# WEBHOOK_SIGNING_TOKEN=whsec_xxxxxxxxxxxxxxxxxxxx  # HMAC-SHA256 (GitLab 19.0+, recommended)

ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
# ANTHROPIC_MODEL=claude-sonnet-4-6      # optional — defaults to claude-sonnet-4-6
# GITLAB_CA_FILE=/path/to/ca.crt         # trust a private/self-signed CA for GitLab
```

### 3. Install dependencies

Only required if running [without Docker](#without-docker).

```bash
# Webhook receiver
cd webhook-receiver && npm install

# End-to-end tests
cd ../e2e-test && npm install
```

## Running the webhook receiver

| Method | Path       | Description                                                    |
| ------ | ---------- | -------------------------------------------------------------- |
| `POST` | `/webhook` | Receives GitLab `Merge Request Hook` and `Release Hook` events |
| `GET`  | `/health`  | Health check                                                   |

### With Docker (recommended)

```bash
# From the repo root
docker compose up -d --build   # First run, or after code changes — builds image and starts
docker compose up -d           # After .env changes only — recreates container, no rebuild
docker compose logs -f glint   # Follow logs
docker compose down            # Stop and remove the container
```

Configuration is read from `webhook-receiver/.env` at container start — it is never baked into the image. This means `.env` changes take effect with `docker compose up -d` and do **not** require a rebuild. Only changes to the application source code require `--build`.

The compose file exposes the server on `$PORT` (default `3000`) and requires an external Docker network named `docker-shared` — create it once if it doesn't already exist:

```bash
docker network create docker-shared
```

The container runs as a non-root user, includes a health check on `GET /health`, and restarts automatically unless explicitly stopped.

### Without Docker

**Development** (TypeScript, hot reload via `ts-node`):

```bash
cd webhook-receiver
npm run dev
```

**Production** (compile then run):

```bash
cd webhook-receiver
npm run build
npm start
```

## Configuring the GitLab webhook

1. In your GitLab project, go to **Settings > Webhooks**
2. Click **Add new webhook**
3. Set the following:
   - **URL**: `http://<your-server-host>:3000/webhook`
   - **Secret token**: the value you set for `WEBHOOK_SECRET` (if using legacy auth)
   - **Signing token**: copy the generated `whsec_…` value into `WEBHOOK_SIGNING_TOKEN` (GitLab 19.0+, recommended — verifies payload integrity via HMAC-SHA256)
   - **Trigger**: check **Merge request events** and **Release events**
   - Leave all other triggers unchecked
4. Click **Add webhook**

> **Self-hosted / local network**: If your GitLab instance cannot reach your webhook server, go to **Admin Area > Settings > Network > Outbound requests** and enable **Allow requests to the local network from webhooks and integrations**.

## Running the unit tests

The webhook receiver has a Vitest unit test suite (99% coverage) covering the Express app, config loading, secret/signature validation, and webhook route handling. No external services or credentials are required.

```bash
cd webhook-receiver
npm test              # run once
npm run test:coverage # run with an LCOV coverage report
```

## Running the end-to-end test

The e2e test starts a mock GitLab API server, spawns the webhook receiver against it, fires a test webhook, and waits for Claude to post an AI-generated note. It uses the **real Anthropic API** and reads credentials from `webhook-receiver/.env`.

```bash
cd e2e-test
npm test
```

**What to expect:**

1. A mock GitLab server starts on port 4000
2. The webhook receiver starts on port 3001 (pointed at the mock)
3. A test `Merge Request Hook` payload is sent to the receiver
4. The receiver fetches the fixture MR details and diffs from the mock server
5. Claude generates a summary (real API call — takes a few seconds)
6. The summary is posted back to the mock server as a note
7. The test prints the captured note body and exits with code `0`

> The e2e test only requires `ANTHROPIC_API_KEY` to be set in `webhook-receiver/.env`.

## Environment variables

All variables are configured in `webhook-receiver/.env`.

At least one of `WEBHOOK_SECRET` or `WEBHOOK_SIGNING_TOKEN` must be set. The signing token takes priority when both are configured.

| Variable                     | Required | Default             | Description                                                                                          |
| ---------------------------- | -------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `GITLAB_BASE_URL`            | Yes      | —                   | Base URL of your self-hosted GitLab instance (no trailing slash)                                     |
| `GITLAB_TOKEN`               | Yes      | —                   | GitLab personal access token with `api` scope                                                        |
| `WEBHOOK_SECRET`             | One of¹  | —                   | Legacy secret token — matched against the `X-Gitlab-Token` header                                    |
| `WEBHOOK_SIGNING_TOKEN`      | One of¹  | —                   | HMAC-SHA256 signing token (GitLab 19.0+, `whsec_…`). Verifies payload integrity and prevents replays |
| `ANTHROPIC_API_KEY`          | Yes      | —                   | Anthropic API key for Claude                                                                         |
| `ANTHROPIC_MODEL`            | No       | `claude-sonnet-4-6` | Claude model to use for summaries and release notes                                                  |
| `GITLAB_CA_FILE`             | No       | —                   | Path to a PEM CA certificate (or bundle) to trust for GitLab, for a private or self-signed CA        |
| `GITLAB_REJECT_UNAUTHORIZED` | No       | `true`              | Set to `false` to skip TLS verification for GitLab. Last resort — use `GITLAB_CA_FILE` instead       |
| `PORT`                       | No       | `3000`              | Port the server listens on                                                                           |

¹ At least one of `WEBHOOK_SECRET` or `WEBHOOK_SIGNING_TOKEN` is required.

### GitLab with a private or self-signed CA

If your GitLab instance uses a certificate from a private CA, point `GITLAB_CA_FILE` at that CA's certificate in PEM format. Glint trusts it in addition to the standard public CAs, for GitLab API calls only.

- **Docker:** mount the certificate read-only and set the path inside the container — see the commented `GITLAB_CA_FILE` and `volumes` lines in `docker-compose.yml`.
- **Without Docker:** set `GITLAB_CA_FILE` in `webhook-receiver/.env` to the certificate's path on the host.

Glint checks the file at startup and exits with an error if it is missing or isn't a PEM certificate, so a wrong path shows up immediately rather than as a TLS failure on the first webhook.

You can get the CA certificate from your GitLab administrator, or export it from your browser's certificate viewer. Avoid `GITLAB_REJECT_UNAUTHORIZED=false`: it turns off certificate checking entirely, exposing your `GITLAB_TOKEN` to anyone who can intercept the connection.

> Node's own `NODE_EXTRA_CA_CERTS` also works, but only when set in the process environment (Docker Compose `environment:`, or the shell). Node reads it before `.env` is loaded, so it has no effect inside `webhook-receiver/.env`.

## CI/CD

Glint ships pipelines for both GitHub and self-hosted GitLab. They follow the same branching model: work merges into `dev`, and every merge to `main` cuts a release.

### GitHub Actions

| Workflow                        | Trigger                                 | Result                                                                                                              |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`      | Pull requests, pushes to other branches | Typecheck and compile, Vitest suite with coverage, e2e harness typecheck, Docker build (no push)                    |
| `.github/workflows/release.yml` | Push to `dev`                           | Runs CI, then pushes `ghcr.io/smith8ca/glint:dev` (`linux/amd64` + `linux/arm64`)                                    |
| `.github/workflows/release.yml` | Push to `main`                          | Runs CI, bumps the patch version, pushes `:vX.Y.Z` and `:latest`, and creates a GitHub Release with generated notes |

No secrets are needed: the workflows use the built-in `GITHUB_TOKEN` to push to GitHub Container Registry and create releases. Enable **secret scanning** and **push protection** in the repository's security settings.

### GitLab CI (self-hosted)

`.gitlab-ci.yml` defines a four-stage pipeline:

| Stage              | Job                | Trigger                  | Result                                                                                                                   |
| ------------------ | ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `test`             | `sast`             | Every push               | GitLab SAST template (non-blocking)                                                                                      |
| `test`             | `unit-test`        | Every push               | Runs the Vitest suite and uploads an LCOV report                                                                         |
| `test`             | `sonar-scan`       | MR events, `main`, `dev` | SonarQube analysis using the `unit-test` LCOV report (non-blocking)                                                      |
| `secret-detection` | `secret_detection` | Every push               | GitLab Secret Detection template                                                                                         |
| `build`            | `typecheck`        | Every push               | Compiles TypeScript — fails fast on type errors                                                                          |
| `publish`          | `release`          | Push to `main`           | Bumps the patch version and creates a `vX.Y.Z` tag via the GitLab API                                                    |
| `publish`          | `publish:dev`      | Push to `dev`            | Pushes `glint:dev`; reports the `dev` GitLab Environment (`DEVL_URL`)                                                    |
| `publish`          | `publish:tag`      | Git tag `vX.Y.Z`         | Pushes `glint:vX.Y.Z`/`glint:latest`, creates a GitLab Release, reports the `production` GitLab Environment (`PROD_URL`) |

CI/CD variables:

| Variable               | Required  | Purpose                                                                                                                   |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `RELEASE_TOKEN`        | yes       | Project access token with `api` and `write_repository` scopes (Developer role or above), used to create tags and releases |
| `SONAR_HOST_URL`       | for Sonar | SonarQube server URL; its hostname is used to trust a self-signed certificate                                             |
| `SONAR_TOKEN`          | for Sonar | SonarQube analysis token                                                                                                  |
| `SONAR_PROJECT_KEY`    | no        | Overrides `sonar.projectKey` from `sonar-project.properties`                                                              |
| `PROD_URL`, `DEVL_URL` | no        | Links shown in **Deployments > Environments**                                                                             |

Publish jobs run on **shell runners** (tagged `shell`) to avoid docker-in-docker. If your GitLab registry uses a self-signed certificate, each shell runner host must trust it. One-time setup per host (replace `<registry-host>` with your registry hostname):

```bash
sudo bash -c '
  mkdir -p /etc/docker/certs.d/<registry-host> &&
  openssl s_client -showcerts -connect <registry-host>:443 </dev/null 2>/dev/null \
    | openssl x509 -outform PEM \
    > /etc/docker/certs.d/<registry-host>/ca.crt &&
  chmod 755 /etc/docker/certs.d/<registry-host> &&
  chmod 644 /etc/docker/certs.d/<registry-host>/ca.crt &&
  echo "Done"
'
```

## Versioning

Releases are automatic and patch-level: every push to `main` reads the latest `vX.Y.Z` tag, increments the patch number, publishes the versioned image (`:vX.Y.Z`) and updates `:latest`. On GitHub, a push whose commit already carries a `vX.Y.Z` tag is skipped, so it doesn't cut a duplicate release.

- **GitHub:** the release workflow creates the tag and a GitHub Release with auto-generated notes in the same run.
- **GitLab:** the `release` job creates the tag via the GitLab API, which triggers `publish:tag` to build the image and create a GitLab Release. If Glint itself is pointed at the project, its Release Hook then replaces the placeholder description with AI-generated release notes.

## Security considerations

- **Webhook authentication** — every request must carry a valid `X-Gitlab-Token` or HMAC signature (`WEBHOOK_SIGNING_TOKEN`, recommended). Both are verified in constant time, and signed requests older than five minutes are rejected.
- **Token scope** — `GITLAB_TOKEN` can post notes and edit releases on every project it can access. Use a dedicated bot account or a project/group access token limited to the projects you want reviewed.
- **Prompt injection** — MR titles, descriptions, diffs and commit messages are sent to Claude verbatim. Anyone who can open an MR can influence the generated summary or release notes. Glint gives Claude no tools and only posts text, so the impact is limited to misleading content, but treat AI output as untrusted and review it before relying on it.
- **Data sent to Anthropic** — MR and release content (including code diffs) leaves your network for the Anthropic API. Don't enable Glint on projects whose code must not be shared with a third-party AI provider.
- **TLS** — keep `GITLAB_REJECT_UNAUTHORIZED` at its default (`true`). For a private CA, trust it with `GITLAB_CA_FILE` (see [GitLab with a private or self-signed CA](#gitlab-with-a-private-or-self-signed-ca)) instead of disabling verification.

## AI attribution

Glint was built with AI assistance. Much of the code, tests, CI configuration, and documentation in this repository was written in collaboration with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding assistant, and then reviewed, tested, and maintained by a human. Commits produced with AI assistance carry a `Co-Authored-By: Claude` trailer.

This is separate from Glint's runtime use of AI: the webhook receiver calls the [Anthropic Claude API](https://docs.anthropic.com/) to write MR summaries and release notes. That output is always labelled as AI-generated in GitLab and should be reviewed before you rely on it.
