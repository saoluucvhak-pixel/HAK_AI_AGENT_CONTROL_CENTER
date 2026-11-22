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

## Integrated modules on this branch
- `src/core.js`: Task Observer event registry, last event per task.
- `src/observer-api.js`: opt-in local-only POST `/api/agent-events` and GET `/api/agent-status`, both require bearer token `HAK_OBSERVER_TOKEN` (>=24 chars). State is in memory, lost after restart. Browser panel asks for token each time and never persists it.
- `src/chief-of-staff.js`: planning, work-order proposal and merge-gate policy, **not yet connected to an execution queue**.
- `src/integrations.js` and `src/policy.js`: opt-in OmniRoute client and Claude-Mem reviewed-export policy contract. Neither sends requests automatically.
- `src/github.js`: repository and GitHub Actions monitoring. No write privileges needed.

## Windows smoke test
```powershell
npm run check
npm test
$env:HAK_OBSERVER_TOKEN="replace-with-long-random-secret"
npm start
```
Open `http://127.0.0.1:4317`. Paste the token into Observer panel. In a second terminal:
```powershell
$headers=@{Authorization="Bearer $env:HAK_OBSERVER_TOKEN"}
$body=@{taskId="demo";agentId="coder-1";status="running"} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4317/api/agent-events -Headers $headers -ContentType "application/json" -Body $body
```
Click 'Đọc trạng thái Agent'. This tests a synthetic event, not a real Ruflo agent.

## Outstanding production gates
Persistent event store, authentication/RBAC for network users, audit log, per-project data isolation, GitHub API pagination and rate-limit handling, provider telemetry, Archify renderer integration, real OCR statistics, independent security review and an end-to-end Windows deployment test. Do not label these complete.

## Persistence and topology (next milestone)
When `HAK_OBSERVER_TOKEN` is set, Observer events are appended to `HAK_EVENT_STORE_PATH` (default `./data/agent-events.jsonl`) with an fsync before acknowledgment, replayed on restart. The file is sensitive: use local NTFS permissions, backup policy and disk encryption. A corrupt log fails startup rather than silently discarding records. No compaction or retention policy yet.
GET `/api/topology` returns an explicitly **proposed** HAK architecture graph, and GET `/api/topology.mmd` exports Mermaid text for manual Archify review. This is not the Archify runtime.
The dashboard remains bound to localhost. Do not publish these endpoints or open a network listener without authentication/RBAC and threat modeling.
