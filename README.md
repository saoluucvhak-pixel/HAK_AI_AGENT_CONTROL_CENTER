# HAK AI Agent Control Center

Quản lý task và giám sát AI Agent HAK. Mọi thay đổi chức năng đi qua PR và CI.

## Windows quick start

Install Node.js 22+ once, then double-click `HAK_START_WINDOWS.cmd`. It starts the local dashboard at http://127.0.0.1:4317 and opens your browser. If HAK is already running, it opens the existing instance; if another program owns the port, it refuses to connect to it. Task Observer status reads require no manual token. Sending agent events still requires a configured bearer token. This is not a Windows installer or an acceptance of external AI agents.

## Windows acceptance baseline
After pulling the latest `main`, double-click `HAK_ACCEPT_WINDOWS.cmd` to run local syntax, unit tests and configured loopback connectivity checks. This is separate from `HAK_START_WINDOWS.cmd` (dashboard startup). The console remains open to show a sanitized status summary. It does not run real agents, certify external tools or mark production readiness. See `docs/PRODUCTION_ACCEPTANCE.md` and Issue #32 for the remaining operator-approved checks.

## Run a real AI task on Windows (MVP)

1. Install Node.js 22+ and run a compatible **local OmniRoute gateway**. The gateway must accept OpenAI-compatible `POST /v1/chat/completions`, and you need its API key and model identifier.
2. Double-click `HAK_CONFIG_AI_WINDOWS.cmd` once. Enter the **local** gateway URL, model, and API key at the hidden prompt. Settings are written to the Git-ignored local `.env` file. Do not share or commit this file.
3. Restart `HAK_START_WINDOWS.cmd`, open `http://127.0.0.1:4317`, and use **Giao việc cho AI**. Confirm before sending non-sensitive content.
4. Refresh the job list and choose **Xem kết quả AI**. Job metadata and outputs are stored under `data/agent-results` and restored on restart.

This MVP requires a working gateway; it does not automatically install Claude, Gemini or OmniRoute, and it does not modify code or merge PRs. AI output is a proposal requiring human review. Do not use it for sensitive documents without an approved provider/data policy. If HAK is already running, close its existing process before restarting with new settings.

## Kiểm tra và Thẩm định Repository khác (Repo Audit)

Trên Windows (PowerShell), luôn sử dụng `npm.cmd` thay vì `npm`:

```powershell
# Kiểm tra repository bất kỳ (ví dụ HAK_VC_NB) và xuất báo cáo Markdown:
npm.cmd run audit:repo -- HAK_VC_NB --md bao-cao.md --use-git-credential

# Kiểm tra với danh sách tệp nguồn tùy chỉnh:
npm.cmd run audit:repo -- HAK_VC_NB --paths "app/main/services/BackupService.js,app/main/reports/xlsxExport.js" --use-git-credential

# Kiểm tra tính đồng bộ của danh mục Skills nhúng với upstream HAK_AI_SKILLS:
npm.cmd run skills:check-sync -- --use-git-credential
```

