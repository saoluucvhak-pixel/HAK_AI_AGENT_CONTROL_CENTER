# HAK AI Operations Dashboard — read-only pilot

## Run
Node.js >=20: `npm start`, then visit http://127.0.0.1:4317. Optional `GITHUB_TOKEN` (read-only) via environment for private repos/rate limits; never commit credentials. Localhost-only binding; no login or public hosting.

## What is real
GitHub repository metadata, open PRs and latest Actions run via GitHub REST, refreshed server-side at most once per minute. API failures display as errors, **not** as zero activity. PR list is first 30, workflow runs first 10; totals are not exhaustive if pagination exceeds first page.

## What is not implemented
No live agent events, Task Observer integration, Archify rendering, OmniRoute costs, Claude-Mem search, OCR statistics, approval or merge actions. The dashboard explicitly labels these as unconnected.

## Security and roadmap
Read-only allowlist of HAK repositories, loopback server, CSP, textContent rendering (no untrusted HTML), outbound GitHub-only fetch. For shared deployment, add authentication, RBAC, HTTPS, audit and secrets management before opening any network listener.
Next PRs: Task Observer event ingest with persistence and project-scoped permissions; Archify source-backed topology export; OmniRoute metrics with secrets redaction; OCR job statistics; release gate integration. Each needs contract tests, offline/error behavior and CI.
