# HAK Core — GitHub-hosted CI acceptance evidence (2026-11-23)

## Scope
This is a **CI-only technical evidence record**, not production approval or an attestation that any external provider, desktop installation, or mobile device was tested. The PR checks were run on GitHub-hosted Windows Server 2022 and Ubuntu 24.04, Node.js 22.

## Verified pull-request evidence

| PR | GitHub Actions run | Result | Scope |
| --- | --- | --- | --- |
| #82 | [45132049586](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45132049586) | Windows/Ubuntu passed | Malformed HTTP request URL handled |
| #83 | CI passed before merge | Windows/Ubuntu passed | Observer backup source snapshot |
| #84 | CI passed before merge | Windows/Ubuntu passed | Orca probe fails closed |
| #85 | [45127895357](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45127895357) | Windows/Ubuntu passed | Per-OS diagnostic artifact upload |
| #86 | [45130726737](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45130726737) | Windows/Ubuntu passed | Packet integrity verification |
| #87 | [45134175291](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45134175291) | Windows/Ubuntu passed | Real loopback HTTP health smoke test |
| #88 | [45138011561](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45138011561) | Windows/Ubuntu passed | HTTP authorization and method restrictions |
| #89 | [45139096095](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45139096095) | Windows/Ubuntu passed | Observer status read-only behavior |
| #90 | [45139890369](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45139890369) | Windows/Ubuntu passed | Scoped acceptance evidence ledger |
| #91 | [45145532679](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/actions/runs/45145532679) | Windows/Ubuntu passed | Exact SHA and runner provenance in artifacts |

Starting with PR #91, each OS artifact also contains `ci-provenance.json` identifying the exact `GITHUB_SHA`, run ID, event and runner. This is GitHub-provided metadata, not an independent cryptographic signature.

These are **PR-head CI runs**, not independently verified push-to-main runs. The diagnostic packets explicitly set `readyForProduction:false` and do not attest real provider execution. CI artifacts are retained for 30 days, so preserve approved evidence elsewhere if needed for longer audit retention.

## Remaining gates before production

1. Verify the exact released `main` SHA with successful GitHub-hosted CI and archive the run ID and OS-specific evidence artifacts.
2. On an approved Windows workstation, verify startup, local-only binding, restart replay, backup/restore drill, and controlled shutdown with an operator-signed record.
3. Complete independent security/RBAC/secrets/dependency review and authorized acceptance decision.
4. Keep Orca desktop/mobile, Ruflo, Claude-Mem, OmniRoute, Archify, and OCR disabled or pending until **each** has real independently reviewed execution evidence. Do not infer readiness from mocks or connectivity probes.

See [PRODUCTION_ACCEPTANCE.md](./PRODUCTION_ACCEPTANCE.md) and [EVIDENCE_BASED_ACCEPTANCE.md](./EVIDENCE_BASED_ACCEPTANCE.md). Final acceptance is recorded separately in Issue #32; this document cannot approve it.
