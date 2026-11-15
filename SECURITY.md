# Security policy

## Supported versions

Glint is released as a single line of patch versions. Only the latest release gets security fixes. Fixes ship in a new patch release, and the `:latest` image on GHCR always points to it.

| Version | Supported |
|---|---|
| Latest release (see [Releases](https://github.com/smith8ca/Glint/releases/latest)) | Yes |
| Anything older | No. Please upgrade |

## Reporting a vulnerability

**Please don't report security problems in public issues, pull requests or discussions.**

Report them privately through GitHub's private vulnerability reporting:

1. Go to the repository's [**Security** tab](https://github.com/smith8ca/Glint/security).
2. Click **Report a vulnerability**.
3. Describe the problem, the affected version or commit, and how to reproduce it. A proof of concept helps, but please don't include real secrets, tokens or data from systems you don't own.

You should get an acknowledgement within 7 days. Once the report is confirmed, a fix is released as soon as practical and you'll be credited in the advisory unless you'd rather not be.

## Scope

In scope:

- the webhook receiver in `webhook-receiver/` (authentication, payload validation, handling of GitLab and Anthropic credentials);
- the published container image `ghcr.io/smith8ca/glint`;
- the CI and release workflows in this repository.

Out of scope:

- vulnerabilities in GitLab, the Anthropic API or third-party dependencies themselves (report them upstream; do tell us if Glint needs to update or work around one);
- AI output that is wrong or misleading because of content in an MR or commit (prompt injection). This is a known limitation, described under [Security considerations](README.md#security-considerations) in the README. Report it only if it lets an attacker do more than influence the generated text;
- problems that need an already compromised host, `.env` file or GitLab token.

## Hardening guidance

For how to deploy Glint safely (webhook authentication, token scope, TLS and what data is sent to Anthropic), see [Security considerations](README.md#security-considerations) in the README and the [Security](https://github.com/smith8ca/Glint/wiki/Security) page in the wiki.
