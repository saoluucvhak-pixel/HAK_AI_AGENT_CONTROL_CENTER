# Manual live acceptance through GitHub Actions

The workflow `.github/workflows/github-patch-live-acceptance.yml` is **manual-only** (`workflow_dispatch`), never run by a PR or a push. It uses the repository-scoped `GITHUB_TOKEN` and writes only to `tests/fixtures/patch-acceptance.txt` on a new `hak-fix/acceptance-<run-id>` branch, opening a Draft PR through the actual executor. The workflow does not merge the PR.

1. Confirm the main branch CI has completed. Copy the CI run ID for the **exact current main commit**. A stale, incomplete or failed run is rejected by the acceptance harness before any write.
2. In GitHub Actions, open **GitHub Patch Live Acceptance (manual only)** and select **Run workflow** on main. Enter the CI run ID and review the rationale.
3. Check the job logs for `status: verified`, branch SHA, commit SHA and PR URL. Check that the PR is draft, changes only the isolated fixture, and has no unrelated files.
4. Inspect its CI jobs and close the draft PR after recording evidence; **do not merge** this acceptance fixture.
5. If the workflow fails, inspect the branch and use the read-only recovery function. Do not re-run blindly.

The workflow requires GitHub Actions permissions to create contents and PRs; repository or organization settings may restrict `GITHUB_TOKEN`. If permissions prevent the draft PR, do not elevate credentials without owner review. The workflow is intentionally **not invoked by this code change**. The resulting Actions run and PR are the evidence of live execution, not the existence of this workflow.
