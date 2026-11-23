# HAK Core — Phase handoff and operator acceptance checklist

## Automated phase: verified on PR heads

- PR #82–#96 merged into `main` after passing GitHub-hosted Windows Server 2022 and Ubuntu 24.04 Node 22 CI.
- Latest CI proof: [PR #96 run 45149474327](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45149474327), both OS jobs successful and both diagnostic artifacts present.
- The CI matrix includes `npm run check`, `npm test`, the isolated real HTTP dashboard smoke, diagnostic packet integrity check, and exact GitHub Actions provenance validation. PR-head runs do **not** independently prove push-to-main success.
- A manual `workflow_dispatch` option exists for authorized maintainers to recheck the current `main` SHA using GitHub Actions. Run it on `main`, then record the resulting run ID and two OS artifacts here or in Issue #32.

## Windows operator handoff (approved disposable workstation)

1. Install official Node.js 22 and Git on a test Windows 10/11 machine/VM with no production credentials or sensitive datasets. Checkout the exact approved `main` commit. Record SHA, Windows build and Node version.
2. Double-click `HAK_TEST_WINDOWS.cmd` for an isolated local HTTP smoke with disposable Observer storage and an ephemeral secret. Record pass/fail, operator and timestamp. This is not a production deployment.
3. Double-click `HAK_EXPORT_ACCEPTANCE_WINDOWS.cmd` to run baseline checks, export a local acceptance packet and verify its digest. Review and redact before sharing; the packet remains on the operator's computer by default.
4. Follow [CONTROLLED_WINDOWS_ACCEPTANCE.md](./CONTROLLED_WINDOWS_ACCEPTANCE.md) for startup, loopback isolation, restart replay, backup/restore drill, and optional real provider tests. Use approved disposable fixtures and protect traces.
5. Have a separate authorized reviewer inspect the evidence, security controls, RBAC, recovery and integrations. Record each gate as `passed`, `blocked` or `pending` in [Issue #32](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/issues/32).

## Acceptance boundaries

| Scope | Current decision | Reason |
| --- | --- | --- |
| GitHub-hosted HAK Core CI (PR heads) | Verified | Both OS jobs and diagnostic artifacts for PR #96 |
| Exact release `main` workflow | Pending independent run evidence | PR-head CI is not a push-to-main attestation |
| Real Windows workstation | Pending operator test | GitHub-hosted Windows Server runner is not a Windows desktop installation |
| External AI tools / Orca / OCR | Pending real execution evidence | CI mocks and health probes cannot certify integration behavior |
| Production security and business sign-off | Pending | Requires independent review and authorized approval |

**Production-ready is false.** Do not close Issue #32 or claim production acceptance based only on this phase handoff.
