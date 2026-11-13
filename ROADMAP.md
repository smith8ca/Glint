# Roadmap

This roadmap outlines the planned direction for **Glint**. The project currently delivers a working self-hosted webhook receiver that generates AI-powered MR review summaries and release notes via Claude, posting results directly into GitLab. The items below represent natural next steps across stability, intelligence, and scale. This roadmap is aspirational — priorities may shift based on real-world usage. Community input is welcome; open an issue to discuss ideas, report pain points, or propose new features.

---

## Shipped in v0.1.0

- [x] Webhook receiver with secret token validation and async processing
- [x] AI-generated MR review summaries (Summary, Key Changes, Review Notes)
- [x] AI-generated release notes on GitLab release events
- [x] SSL support for self-signed certificates (`GITLAB_REJECT_UNAUTHORIZED`)
- [x] End-to-end test suite with mock GitLab server
- [x] Project documentation (README, CHANGELOG, CONTRIBUTING, ROADMAP)

---

## Shipped in v0.1.x

- [x] Multi-stage `Dockerfile` and `docker-compose.yml` for zero-friction self-hosting
- [x] GitLab CI/CD pipeline: TypeScript type-checking, SonarQube analysis, Docker image publishing
- [x] Automated patch versioning — every push to `main` creates a `vX.Y.Z` tag automatically
- [x] Automated GitLab Releases — `publish:tag` creates a release and triggers AI-generated release notes
- [x] Webhook signing token support (`WEBHOOK_SIGNING_TOKEN`) — HMAC-SHA256 payload verification following the [Standard Webhooks](https://www.standardwebhooks.com/) spec (GitLab 19.0+); includes payload integrity checking and 5-minute replay protection window
- [x] SAST and Secret Detection scanning on every push, via GitLab's built-in security templates
- [x] GitLab Environments for `dev` and `production` publish jobs, backed by `DEVL_URL`/`PROD_URL`
- [x] Vitest unit test suite with 99% code coverage, wired into CI (`unit-test` job feeds the SonarQube scan)

---

## Phase 1 — Stability & Operations

Foundational improvements to make the service reliable and straightforward to self-host in production.

- Structured logging (e.g. [pino](https://github.com/pinojs/pino) or [winston](https://github.com/winstonjs/winston)) with configurable log levels and JSON output
- Retry logic with exponential backoff for transient failures in Claude and GitLab API calls
- Request queue with configurable concurrency limit to handle webhook bursts without dropping events

---

## Phase 2 — Smarter Analysis

Improvements to the quality and granularity of the AI review output.

- Support for MR update events so that new commits pushed to an open MR trigger a fresh summary
- Smarter diff filtering: automatically skip lock files (`package-lock.json`, `yarn.lock`, `Gemfile.lock`, etc.), minified assets, and generated code before sending to Claude
- Configurable prompt templates — allow per-project or per-file-type customisation of the review instructions sent to Claude
- Per-file inline MR comments in addition to the top-level summary note, so feedback is anchored to specific lines in the diff

---

## Phase 3 — Flexibility & Scale

Broader deployment options and provider support for teams with more complex needs.

- Group-level webhook support so a single deployment can cover all projects within a GitLab group or instance
- Web dashboard for viewing MR summary history, inspecting prompt/response pairs, and managing configuration
- Webhook event log with replay capability to aid debugging and allow re-processing of previously received events

---

## Phase 4 — Multi-Provider AI Support

Allow teams to swap out or extend the AI backend without changing application code.

- Provider abstraction layer: define a common `AIProvider` interface (`summarizeMR`, `generateReleaseNotes`) so providers are interchangeable
- **OpenAI** provider: support `gpt-4o` and other OpenAI models via the official Node.js SDK; configured with `AI_PROVIDER=openai` and `OPENAI_API_KEY`
- **Azure OpenAI** provider: support deployments hosted on Azure OpenAI Service for teams with existing Azure agreements
- **Ollama** provider: support locally-hosted open-source LLMs (e.g. Llama 3, Mistral, Gemma) via [Ollama](https://ollama.com/) for fully air-gapped deployments; configured with `AI_PROVIDER=ollama` and `OLLAMA_BASE_URL`
- **Google Gemini** provider: support Gemini models via the Google AI SDK as an additional hosted option
- Per-project provider override: allow different GitLab projects to use different providers or models via configuration
- Provider capability detection: gracefully handle providers that lack streaming or tool-use features
