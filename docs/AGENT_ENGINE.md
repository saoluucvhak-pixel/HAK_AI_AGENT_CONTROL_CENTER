# HAK Agent Engine — initial execution contract

The engine in `src/agent-engine.js` is a **library API**, not an autonomous desktop controller. It executes approved non-sensitive work orders sequentially through the existing local OmniRoute adapter, with an opt-in gate and a maximum of eight distinct agent roles.

## Preconditions
- A valid `createWorkOrder` input with ID, project ID, description and acceptance criteria.
- Distinct roles from the supported delegation role list.
- An explicit approval object `{approved:true,workOrderId,approvedBy,reason}`.
- Private environment `HAK_AGENT_EXECUTION_ENABLED=true`, `HAK_OMNIROUTE_ENABLED=true`, `HAK_OMNIROUTE_API_KEY` and a loopback gateway.
- The caller must authenticate the approving human separately. This module validates the assertion's shape and matching work-order ID, **not** the approver's identity.

## Execution and limits
`executeApprovedWorkOrder({workOrder,roles,approval,env,onEvent})` invokes the gateway once per role, sequentially. It emits queued/running/passed or failed events to an optional callback. The first failed role stops subsequent roles. The returned audit report contains only output SHA256 and length, not model output; caller must separately arrange secure output storage and human review. Model identity is self-reported and not independently verified. Callback failure propagates and stops execution.

This does **not** run tools, modify repositories, create PRs, write files, execute shell commands, verify independent provider traces, or approve production. Do not pass sensitive work orders. CI uses injected mock model runners; no paid model requests are made.
