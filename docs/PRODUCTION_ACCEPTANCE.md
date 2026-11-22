# HAK AI Agent & Tools — Production Acceptance Runbook

## Verified automatically
The CI matrix runs on GitHub-hosted Windows Server 2022 and Ubuntu 24.04 with Node 22. Tests start the actual HTTP dashboard, validate API authentication, write and replay a Task Observer event, and validate the OmniRoute HTTP protocol against a local mock. These checks do **not** prove real provider, OCR or multi-agent execution.

## Windows desktop checklist
1. Install Node.js 22 and Git from their official sources. Clone `main`. On Windows, double-click `HAK_START_WINDOWS.cmd` to start or reopen the existing HAK Dashboard on port 4317. The launcher does not start a duplicate server and refuses to open a non-HAK service on that port.
2. Run `npm run check`, `npm test`, `npm start` and open `http://127.0.0.1:4317`.
3. Observer read-only status is automatic on loopback, without a token. Event writes still require a bearer token. The server generates an ephemeral secret when none is provided, so external agents cannot post events until a shared `HAK_OBSERVER_TOKEN` of 24+ random characters is explicitly configured; keep it out of chat, screenshots and Git. Use `HAK_EVENT_STORE_PATH` in a user-protected folder. Restart and verify an event survives.
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

## Optional real OmniRoute challenge
`npm run verify:omniroute` is fail-closed by default. It performs a single minimal, non-sensitive model request only if `HAK_OMNIROUTE_LIVE_TEST=true`, `HAK_OMNIROUTE_ENABLED=true`, a valid local `HAK_OMNIROUTE_URL`, and a private `HAK_OMNIROUTE_API_KEY` are already configured by the operator. The check compares an exact marker and prints no answer text or credentials. A pass confirms only that the configured local gateway returned the expected text; it does not independently verify provider identity, billing, licensing or production readiness. CI uses mocks and never calls a paid provider.

## Offline OCR transcription acceptance
On a trusted local computer, prepare a private JSON array of transcription pairs with fields `approved:true`, `sensitive:false`, `expected` and `actual`. Only use approved non-sensitive cases; do not commit the dataset. Run `npm run accept:ocr -- <local-file.json> 0.02` to enforce a 2% character error rate threshold. This compares provided text only and never executes the OCR engine. Output includes aggregate counts, error rate and pass/fail, never the supplied texts or file path. A pass does not imply production readiness; representative dataset selection, engine execution and human approval are separate requirements.

## Local Observer backup integrity
Stop the Dashboard before backing up to avoid concurrent writes. Run `npm run backup:observer -- create ./data/agent-events.jsonl <new-private-backup-path>`; this refuses to overwrite an existing backup and prints a SHA256 digest. Run `npm run backup:observer -- verify <backup-path> <sha256>` to verify the checksum and JSONL event structure. The verification command **does not restore** or modify the live store. Keep backups in a user-protected location; they contain task IDs, agent IDs and event timestamps. Test recovery separately on a non-production copy before approving production use.

## Isolated recovery drill
Run `npm run drill:observer -- <backup-path> <sha256>` after creating and verifying a private Observer backup. The drill checks SHA256, copies the backup into a temporary directory, replays the event store, compares event counts, and removes the temporary copy. It never overwrites or modifies the active Observer store. This is automated recovery rehearsal only, not a full operational restore or production sign-off.
