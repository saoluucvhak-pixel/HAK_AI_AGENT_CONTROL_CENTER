# Kiểm toán và backlog hợp nhất

Baseline kiểm toán: `main@ee21a90` (sau PR #125). Cập nhật theo nhánh `claude/vigilant-goodall-uj2yw3`.
PR #126 (HAK_TEST_AI_WINDOWS) đang mở, chưa merge, không xung đột với nhánh này. PR #116 (test readiness) đang mở từ trước, chưa xem xét lại.

## 1. Phân loại chức năng

| Chức năng | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|
| Task Observer + Event Store (JSONL) | IMPLEMENTED_AND_VERIFIED | test cục bộ + CI Win/Ubuntu |
| Dashboard GitHub (repo/PR/CI chỉ đọc) | IMPLEMENTED_NOT_VERIFIED | cần token GitHub thật; chỉ có test mô phỏng |
| GitHub CI analysis / Patch proposal / Patch executor | PARTIALLY_IMPLEMENTED | có module + test, chưa được nối vào Agent; chưa chạy trên repo thật |
| Operator API cũ (`/api/operator/*`, 1 Agent) | IMPLEMENTED_AND_VERIFIED (gateway mô phỏng) | `tests/operator-mvp-e2e.test.js` |
| Agent Engine cũ (tuần tự, 1 gateway) | DEPRECATED | thay bằng `src/orchestrator.js` (vẫn dùng cho đường cũ) |
| Provider Adapter OpenAI-compatible/OmniRoute, Anthropic, Gemini | IMPLEMENTED_NOT_VERIFIED | test hợp đồng bằng HTTP giả; **chưa gọi API thật** (không có khóa) |
| Provider Manager + giao diện cấu hình | IMPLEMENTED_AND_VERIFIED (mô phỏng) | `provider-manager`, `v2-http-e2e`, ảnh chụp UI |
| Kho bí mật: Windows DPAPI | IMPLEMENTED_NOT_VERIFIED | test thật chỉ chạy trên Windows (CI matrix) |
| Phê duyệt gắn phạm vi (server cấp, hết hạn, đổi phạm vi → hủy) | IMPLEMENTED_AND_VERIFIED | `approvals.test.js`, `orchestrator.test.js` |
| Multi-Agent: DAG, handoff, song song, retry, timeout, hủy, tạm dừng, ngân sách, checkpoint | IMPLEMENTED_AND_VERIFIED (mô phỏng) | `orchestrator.test.js` (18 ca) |
| Khôi phục sau gián đoạn (INTERRUPTED, không tự chạy lại) | IMPLEMENTED_AND_VERIFIED | test mô phỏng crash |
| Agent sửa mã: workspace cô lập (git worktree), sửa trong phạm vi được phê duyệt, kiểm thử cố định, tự sửa lại có giới hạn, phê duyệt lần 2 gắn đúng commit, đẩy nhánh `hak/*`, PR nháp | IMPLEMENTED_AND_VERIFIED (repo git cục bộ, model mô phỏng) | `code-change.test.js`, `workspace.test.js`, `v2-http-e2e.test.js`; chưa chạy trên repo GitHub thật, chưa có model thật |
| Vòng lặp sửa lỗi CI GitHub (đọc log CI → sửa → cập nhật PR) | NOT_IMPLEMENTED | cơ chế sửa lại có sẵn; chưa nối nguồn phản hồi từ GitHub CI (module `github-ci-investigation` đã có) |
| HAK AI Skills registry / Code Quality gate / Claude-Mem theo dự án | NOT_IMPLEMENTED (tích hợp) | module Claude-Mem bridge cũ chỉ là cầu "reviewed-export-only" |
| OCR, Orca | PARTIALLY_IMPLEMENTED | probe kết nối; không tích hợp vào Work Order |
| Kết nối Claude/Gemini thật | BLOCKED_BY_EXTERNAL_DEPENDENCY | cần API key của người dùng |
| Bộ cài Windows (Inno Setup, per-user, runtime Node kèm) | IMPLEMENTED_AND_VERIFIED (runner CI) | cài/nâng cấp/gỡ 21/21 trên `6a74382`; chưa thử trên Windows sạch của người dùng |
| Ký mã (code signing) | NOT_IMPLEMENTED | bộ cài **chưa ký** |
| Sao lưu/phục hồi dữ liệu v2 | PARTIALLY_IMPLEMENTED | `src/data-backup.js` + test; chưa có UI phục hồi |
| SQLite / truy vấn lịch sử lớn | NOT_IMPLEMENTED | JSON atomic + `.bak` đủ cho quy mô hiện tại; chưa đo |
| Hiệu năng 1/4/8 Agent, 1.000 công việc | NOT_RUN | chưa đo |

## 2. Lỗi đã xử lý trong gói này

- P0 DNS rebinding: máy chủ không kiểm tra `Host` → nay trả 421 cho Host lạ.
- P0 `GET /api/operator/session` cấp token cho mọi origin → nay từ chối Origin lạ / `Sec-Fetch-Site: cross-site`.
- P0 `GET /api/operator/jobs` không xác thực → nay cần token.
- P0 `verifyApproval` tự xác nhận bằng chính dữ liệu request → nay dùng bản ghi phê duyệt do server cấp, gắn hash phạm vi + hạn dùng.
- P1 `.env` bị ghi đè mất cấu hình khác bởi `configure-ai-windows.ps1` → nay hợp nhất + sao lưu `.env.bak` (chưa chạy được trên Linux; cần kiểm tra trên Windows).
- `/api/health` báo `mode: read-only` dù có POST → nay `operator` + `version`.

## 3. Backlog còn lại

| Mã | Ưu tiên | Nội dung | Tiêu chí nghiệm thu |
|---|---|---|---|
| B-01 | P0 | Kiểm thử Claude thật + Gemini thật (TC03/TC04) | Khóa của người dùng; công việc không nhạy cảm; lưu bằng chứng |
| B-02 | P0 | Chạy `release-windows.yml` xanh trên commit phát hành; kiểm thử cài trên Windows sạch (TC01/13/14, TC17 bởi người) | artifact + `INSTALLER_TEST_RESULTS.json` |
| B-03 | P1 | Còn lại: chạy trên repo GitHub thật được cấp quyền, nối phản hồi GitHub CI vào vòng sửa (TC07/08). Phần cục bộ đã xong | PR thật trên repo thử nghiệm; CI đỏ → Agent sửa → CI xanh |
| B-04 | P1 | Hoàn thiện phục hồi trên UI và kiểm thử phục hồi trên máy độc lập (đã có sao lưu/xác minh/phục hồi dòng lệnh, TC12) | khôi phục độc lập, đối chiếu checksum |
| B-05 | P1 | Tích hợp HAK Code Quality / Skills qua CLI có phiên bản | gate thật, không dùng kết quả AI tự đánh giá |
| B-06 | P1 | Ký mã bộ cài | chứng thư do người có thẩm quyền cấp |
| B-07 | P2 | Đo hiệu năng, quyết định SQLite | số liệu đo có cấu hình máy |
| B-08 | P2 | Màn hình Kanban, Audit log, Chi phí riêng; hiện gộp trong Work Order + Tổng quan | |
| B-09 | P2 | Mô hình phân quyền nhiều người dùng (hiện một người vận hành cục bộ) | |
| B-10 | P1 | Quét phụ thuộc/bí mật tự động, kiểm thử bảo mật bởi bên thứ hai | báo cáo |
