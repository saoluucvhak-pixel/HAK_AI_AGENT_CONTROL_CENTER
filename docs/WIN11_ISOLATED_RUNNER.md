# Windows 11 isolated runner — setup and approval

**Never install this runner on a Windows computer holding HAK production data.** Use a dedicated Windows 11 VM with a disposable account, no mapped production drives, no access to company secrets, and no shared clipboard or folders. Snapshot the VM before registering the runner. A self-hosted runner executes repository code and must be treated as a high-trust execution endpoint.

## Administrator setup (one-time)

1. On the host Windows 11, create a dedicated Windows 11 VM using an approved virtualization product and a valid Windows license. Allocate sufficient CPU, RAM and disk for Node 22; isolate its network from company production resources. Do not use the personal Windows account as the runner account.
2. In GitHub repository **Settings → Environments**, create `hak-win11-acceptance`. Add required reviewers (an independent authorized approver), restrict deployment branches to protected `main`, and prevent self-review where supported. Reviewers must approve each job before it can execute.
3. In GitHub **Settings → Actions → Runners → New self-hosted runner**, choose Windows x64. Follow **GitHub's current, repository-generated instructions inside the VM** to download, verify, configure and run the official runner. Never paste the short-lived registration token into chat or an issue. Register with custom label `hak-win11-isolated`. Use a dedicated low-privilege VM account. Run interactively for acceptance, not as a persistent service.
4. In GitHub **Actions → Windows 11 Isolated Acceptance → Run workflow**, select `main`. Have the independent environment reviewer approve the job. Confirm the queued job selects only the isolated VM, not any other self-hosted runner. The job checks the exact main SHA, runs check/test, performs disposable loopback HTTP smoke, and uploads only redacted OS/Node/SHA metadata.
5. Review the result and sanitized evidence, then shut down the runner, remove its registration in GitHub Settings, and revert/destroy the disposable VM snapshot. The job does **not** authorize production acceptance.

## Controls and limitations

- Do not enable self-hosted runners for untrusted pull requests or other workflows; protect `main` and review changes to workflow files.
- GitHub-hosted Actions and self-hosted runner jobs are distinct evidence. VM test evidence supports Windows 11 compatibility, not physical hardware compatibility or real provider sign-off.
- Avoid secrets, API keys, customer documents and production network shares in runner environments. The workflow does not require any GitHub secrets.
- Runner label alone is not a security boundary; use a dedicated VM and the required reviewer environment gate. Runner setup requires administrator action and cannot be completed by the GitHub repository API.
- If an isolated Windows 11 VM is unavailable, use the operator-led `HAK_TEST_WINDOWS.cmd` and `HAK_EXPORT_ACCEPTANCE_WINDOWS.cmd` procedures from [CONTROLLED_WINDOWS_ACCEPTANCE.md](./CONTROLLED_WINDOWS_ACCEPTANCE.md).
