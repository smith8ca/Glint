# Contributing to Glint

Thanks for your interest in contributing! This guide will help you get set up and submit your first pull request.

---

## Getting started

### Prerequisites

- **Node.js 22+** (check with `node --version`)
- A **GitLab personal access token** with `api` scope (for the webhook receiver to post MR comments)
- An **Anthropic API key** (for Claude-powered review summaries)
- **[gitleaks](https://github.com/gitleaks/gitleaks#installing)** (for the pre-commit secret scan; on Windows: `winget install Gitleaks.Gitleaks`)

### Clone and install

```bash
git clone https://github.com/smith8ca/Glint.git
cd Glint

# Install dependencies for the webhook receiver
cd webhook-receiver
npm install

# Install dependencies for the e2e test runner
cd ../e2e-test
npm install
```

Copy `webhook-receiver/.env.example` to `webhook-receiver/.env` and fill in your credentials before running anything.

### Enable the secret-scanning hook

The repository ships a pre-commit hook that runs gitleaks on your staged changes and stops the commit if it finds a credential. Enable it once per clone, from the repository root:

```bash
git config core.hooksPath .githooks
```

The same scan runs in CI on every push and pull request, so a commit that skips the hook (`--no-verify`) is still caught before it is merged. If gitleaks flags a deliberate fake value in a test, add a `// gitleaks:allow` comment to that line.

---

## Development workflow

All active development happens on the `dev` branch. The `main` branch is reserved for stable releases.

1. Make sure your local `dev` branch is up to date:
   ```bash
   git checkout dev
   git pull origin dev
   ```
2. Create a new branch from `dev` using one of these naming conventions:
   - `feature/short-description` — new functionality
   - `fix/short-description` — bug fixes
   - `chore/short-description` — maintenance, dependency updates, config changes
3. Keep commits focused. One logical change per commit makes reviews easier and history cleaner.

---

## Making changes

| Concern                                                      | Where to look                                       |
| ------------------------------------------------------------ | --------------------------------------------------- |
| Webhook authentication (secret token or HMAC-SHA256)         | `webhook-receiver/src/middleware/validateSecret.ts` |
| Webhook event routing                                        | `webhook-receiver/src/routes/webhook.ts`            |
| AI review behaviour (prompts, Claude config)                 | `webhook-receiver/src/services/claude.ts`           |
| GitLab API interactions (comments, MR data, release updates) | `webhook-receiver/src/services/gitlab.ts`           |
| Environment variable loading and validation                  | `webhook-receiver/src/config.ts`                    |
| End-to-end tests and mock GitLab server                      | `e2e-test/`                                         |

If you are adding a new integration point or utility, prefer extending an existing file over creating a new one unless the new file meaningfully improves clarity.

---

## Running the e2e test

The e2e test suite runs the full webhook flow against a real Claude API call and a local mock GitLab server. It reads credentials from `webhook-receiver/.env`, so make sure that file is configured first.

```bash
cd e2e-test
npm test
```

Be aware that each test run will consume Anthropic API credits.

---

## Submitting a pull request

1. Push your branch and open a pull request **targeting `dev`** (not `main`).
2. Give it a descriptive title that summarises what changes and why — for example:
   - "feat: include changed file list in Claude prompt"
   - "fix: handle empty MR diff gracefully"
3. In the description, explain the motivation, what you changed, and any relevant trade-offs.
4. If your pull request relates to an open issue, link it with a closing keyword (e.g. `Closes #12`).
5. Keep the pull request focused. If you have unrelated improvements, open a separate pull request.

---

## Code style

- **TypeScript strict mode** is enabled — do not disable or work around strict checks.
- Use meaningful, self-documenting names for variables, functions, and types. Avoid single-letter names outside of short lambdas.
- Follow the existing Express patterns in the codebase (middleware, route handlers, error propagation).
- Avoid adding new dependencies unless they solve a problem that cannot be reasonably handled with what is already installed. If you do add one, explain why in your pull request description.
- There is no linter configured yet — just aim for consistency with the surrounding code.

---

## Reporting bugs and requesting features

Please open an issue on the project repository. Include:

- **Bug reports**: steps to reproduce, expected behaviour, actual behaviour, and any relevant logs or error messages.
- **Feature requests**: the problem you are trying to solve, your proposed solution, and any alternatives you considered.

No contributor licence agreement is required. Contributions are welcome from anyone.
