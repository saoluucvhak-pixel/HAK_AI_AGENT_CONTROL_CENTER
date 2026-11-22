# HAK AI Agent & Tools — Production Acceptance Runbook

## Verified automatically
The CI matrix runs on GitHub-hosted Windows Server 2022 and Ubuntu 24.04 with Node 22. Tests start the actual HTTP dashboard, validate API authentication, write and replay a Task Observer event, and validate the OmniRoute HTTP protocol against a local mock. These checks do **not** prove real provider, OCR or multi-agent execution.

## Windows desktop checklist
1. Install Node.js 22 and Git from their official sources. Clone `main`.
2. Run `npm run check`, `npm test`, `npm start` and open `http://127.0.0.1:4317`.
3. For local-only Observer, generate a secret locally and set `HAK_OBSERVER_TOKEN` to 24+ random characters; keep it out of chat, screenshots and Git. Use `HAK_EVENT_STORE_PATH` in a user-protected folder. Restart and verify an event survives.
4. Install and start each **separately approved** tool according to its official instructions. Configure loopback URLs `HAK_OMNIROUTE_URL`, `HAK_RUFLO_URL`, `HAK_CLAUDE_MEM_URL`, `HAK_ARCHIFY_URL`, `HAK_OCR_URL` only when the tool really exposes the documented HTTP health route. This checker assumes `/health` for non-OmniRoute tools; a mismatch means the adapter needs work, not necessarily a tool failure.
5. Run `npm run check:tools`. Output only reports HTTP connectivity; it does not certify the external engine. OmniRoute checks `GET /v1/models`, optionally with a locally configured `HAK_OMNIROUTE_API_KEY`. Never paste keys into issues or CI logs.
6. Independently verify a real approved low-risk model request, Ruflo delegation with task evidence, Claude-Mem isolation and persistence, Archify source-backed diagram export, and OCR against a labeled dataset with an agreed accuracy threshold. Record provider versions and source commit IDs.
7. Complete RBAC, secrets management, retention and backup/restore, audit, threat model, dependency licensing, network exposure review, disaster recovery, operator training, and explicit business acceptance sign-off **before production**.

## Evidence and sign-off
| Tool | Minimum evidence | State |
| --- | --- | --- |
| Dashboard/Observer | Windows desktop screenshot, health endpoint, restart replay | CI-only |
| OmniRoute | Version, local endpoint, approved real request, latency/cost | Pending |
| Ruflo | Version, actual agents and trace of delegated work | Pending |
| Claude-Mem | Version, scope-isolation and restart retrieval | Pending |
| Archify | Version, real repository diagram and source links | Pending |
| OCR | Version, test set, accuracy, error review | Pending |
| Security | Independent review, RBAC, backup/restore | Pending |

A green connectivity probe is never sufficient to mark a tool production-ready.
