# GitHub Patch Executor — live acceptance

This acceptance is **opt-in and performs real GitHub writes**. It is not a mock. Do not run on production data. The script only accepts `HAK_AI_AGENT_CONTROL_CENTER` and `hak-fix/acceptance-...` branches.

## Preconditions
- A dedicated, non-sensitive existing text file on `main` and an approved proposed replacement.
- A completed GitHub Actions run with `head_sha` equal to the exact `main` SHA in the proposal.
- The current Git blob SHA for each changed file.
- A GitHub token scoped to this repository with Contents and Pull Requests write permissions.
- Explicit operator approval; never paste the token into a proposal, PR or logs.

Example proposal schema (replace placeholders with real observed SHA values, never guess):

```json
{
  "repository": "HAK_AI_AGENT_CONTROL_CENTER",
  "runId": 123456,
  "baseSha": "REPLACE_WITH_40_CHARACTER_MAIN_SHA",
  "rationale": "Acceptance-only change to an isolated fixture file",
  "changes": [
    {"path":"tests/fixtures/patch-acceptance.txt","expectedBlobSha":"REPLACE_WITH_40_CHARACTER_BLOB_SHA","newContent":"acceptance fixture v2\n"}
  ]
}
```

Use an **existing** fixture file: the proposal validator and executor intentionally do not support new files.

Run only after reviewing the exact patch:

```sh
GITHUB_TOKEN=... HAK_PATCH_ACCEPTANCE=I_ACKNOWLEDGE_GITHUB_WRITES node scripts/accept-github-patch.mjs ./proposal.json hak-fix/acceptance-unique-id
```

The script writes one atomic commit on a new branch, opens a draft PR, then independently checks the branch SHA and PR. Verify GitHub Actions on that PR, inspect changed files, and close the draft PR if it is only an acceptance fixture. **Never merge the fixture change to main.** On failure, inspect the branch and use read-only recovery before retrying; do not blindly repeat writes.

This is a runbook, **not evidence that a live run has happened**. Record run ID, base SHA, branch, commit SHA, PR URL, workflow job conclusions and reviewer decision after executing.
