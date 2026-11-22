# HAK Chief of Staff Agent — operating model

Chief of Staff is the **planning and governance** layer above AI Orchestrator/Ruflo. It does not replace agent execution or review.

## Responsibilities
1. Capture HAK owner requests as structured work orders with explicit acceptance criteria.
2. Classify priority, dependencies, scope, affected repository, cost and risks.
3. Propose task allocation to 1–8 specialized agents, each with its own branch/worktree.
4. Receive Task Observer status and CI reports, summarize blockers and risks.
5. Suggest approved model routes via OmniRoute, and approved project-scoped knowledge via Claude-Mem; neither is enabled automatically.
6. Produce daily/weekly summaries when explicitly scheduled and authorized.
7. Present decisions requiring human approval (sensitive data, expense, external API, production release, merge).

## Approval gates
No automatic branch merge, production deployment, purchase, payment, sensitive-data export or access change. Require CI passed, security passed, independent review approved, no conflicts, explicit authorized approval.

## Current implementation
`src/chief-of-staff.js` is a pure local work-order, delegation proposal, status summary and merge-gate library. No autonomous agent runtime, API server, queue, database, Claude-Mem plugin, scheduling or dashboard is implemented by this PR.

## Next implementation steps
- Authenticated persistence and RBAC with append-only audit events.
- Orchestrator adapter and task graph with retries/timeouts/budget.
- Real Task Observer and GitHub Actions ingestion.
- Model gateway and memory connectors with data classification.
- UI for approvals, status and reporting.
- Synthetic end-to-end tests, then controlled pilot on one HAK repo.
