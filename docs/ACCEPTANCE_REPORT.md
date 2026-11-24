# Báo cáo nghiệm thu — 0.2.0-rc.1

> Cập nhật 24/11/2026: công cụ chạy trong **container/CI**, không chạy trên Windows. Đã gỡ gói Windows (bộ cài, launcher, job CI Windows) và DPAPI; khóa API đọc từ biến môi trường. Các lỗi P1 của báo cáo rà soát (chạy lại, remote lệch, nền cũ, cắt kết quả) đã sửa kèm test hồi quy; các mục cũ liên quan Windows bên dưới chỉ còn giá trị lịch sử.

Trạng thái phát hành: **RELEASE CANDIDATE. Chưa đủ điều kiện stable.** Quy tắc: BLOCKED/NOT_RUN không được tính là PASS.
"PASS (mô phỏng)" nghĩa là kiểm thử tự động với gateway HTTP giả; **không** chứng minh Claude/Gemini thật.

| Test | Nội dung | Kết quả | Bằng chứng / lý do |
|---|---|---|---|
| TC01 | Cài đặt trên Windows | KHÔNG ÁP DỤNG | Quyết định ngày 24/11/2026: công cụ chạy trong container/CI, không chạy trên Windows; gói bộ cài đã gỡ (xem docs/KE_HOACH_HOAN_THIEN.md) |
| TC02 | Cấu hình AI, khởi động lại, bí mật không vào log/file cấu hình | PASS (mô phỏng) | `tests/v2-http-e2e.test.js`, `provider-manager.test.js`; DPAPI thật: chạy ở CI Windows |
| TC03 | Claude thật | BLOCKED | cần API key Anthropic của người dùng |
| TC04 | Gemini thật | BLOCKED | cần API key Google của người dùng |
| TC05 | Giao việc 1 Agent, phê duyệt, kết quả, lịch sử | PASS (mô phỏng) | `operator-mvp-e2e`, `orchestrator.test.js` |
| TC06 | Multi-Agent ≥ 4 Agent, handoff, dependency, tổng hợp | PASS (mô phỏng) | `orchestrator.test.js`, `v2-http-e2e` (5 Agent) |
| TC07 | Agent sửa repo, branch, test, PR | PARTIAL: PASS (chạy thật trên repo GitHub này, model do trợ lý phiên viết) | Lần chạy thật: Work Order → cổng 1 → worktree → `node --test` 203/203 trên `main` → cổng 2 gắn commit `51d75aa6` → đẩy nhánh `hak/1069f1ba-12dc` → PR nháp [#128](https://github.com/saoluucvhak-pixel/HAK_AI_AGENT_CONTROL_CENTER/pull/128). **Không phải** lần gọi API nhà cung cấp (chưa có API key); PR do trợ lý mở bằng công cụ GitHub vì ứng dụng chưa có token. Lần chạy này phát hiện và sửa lỗi: đẩy nhánh mất xác thực do lọc biến môi trường quá chặt (nay có test hồi quy) |
| (gói B) | Sửa tệp lớn trên repo thật khác | PASS (cục bộ, model do trợ lý viết) | `HAK_XUATHANG_APP`: `app/index.html` 53 KB sửa bằng khối thay thế, 672/672 test đích đạt, repo người dùng không đổi, không đẩy gì lên GitHub. Không phải bằng chứng mô hình thật |
| TC08 | CI lỗi → Agent sửa | NOT_IMPLEMENTED (vòng sửa kiểm thử cục bộ đã có; chưa lấy log GitHub CI) | backlog B-03 |
| TC09 | Phê duyệt thiếu/hết hạn/đổi phạm vi bị từ chối | PASS | `approvals.test.js`, `orchestrator.test.js` |
| TC10 | Mất kết nối AI | PASS (mô phỏng, mức đơn vị) | lỗi 5xx/mạng → RETRY_PENDING, dữ liệu giữ nguyên |
| TC11 | Khởi động lại khi đang chạy | PASS (mô phỏng) | test crash recovery; HTTP restart |
| TC12 | Sao lưu và phục hồi | PARTIAL | sao lưu + kiểm tra + phục hồi vào thư mục trống có manifest SHA-256 (`data-backup.test.js`, API `/api/v2/backups`); chưa phục hồi trên máy độc lập, chưa có nút phục hồi trên UI |
| TC13 | Nâng cấp trên Windows | KHÔNG ÁP DỤNG | Quyết định ngày 24/11/2026: công cụ chạy trong container/CI, không chạy trên Windows; gói bộ cài đã gỡ (xem docs/KE_HOACH_HOAN_THIEN.md) |
| TC14 | Gỡ cài đặt trên Windows | KHÔNG ÁP DỤNG | Quyết định ngày 24/11/2026: công cụ chạy trong container/CI, không chạy trên Windows; gói bộ cài đã gỡ (xem docs/KE_HOACH_HOAN_THIEN.md) |
| TC15 | Bảo mật | PARTIAL | Host/Origin/token/rate-limit/secret có test; chưa pentest, chưa quét phụ thuộc |
| TC16 | Hiệu năng | NOT_RUN | backlog B-07 |
| TC17 | Trải nghiệm trên Windows | KHÔNG ÁP DỤNG | Quyết định ngày 24/11/2026: công cụ chạy trong container/CI, không chạy trên Windows; gói bộ cài đã gỡ (xem docs/KE_HOACH_HOAN_THIEN.md) |

## Release gates (Gate 6 – Windows: không áp dụng)
1 Source: chưa đủ (chưa quét bí mật/phụ thuộc độc lập; CI xanh trên `208b37f`) · 2 Application: đạt ở mức mô phỏng · 3 Real AI: **chưa đạt** · 4 Multi-Agent: đạt mức mô phỏng · 5 GitHub: **chưa đạt** · 6 Windows: có SETUP.exe + checksum + cài/nâng cấp/gỡ đạt trên runner CI; **chưa ký mã, chưa thử trên Windows sạch của người dùng (TC17)** · 7 Acceptance: **chưa có xác nhận của người có thẩm quyền**.

Artifact: job `windows` của workflow *Windows release* (run 45310148992) tải lên `HAK_AI_AGENT_SETUP_0.2.0-rc.1.exe`, `HAK_AI_AGENT_PORTABLE_0.2.0-rc.1.zip`, `SHA256SUMS.txt`. SHA-256 bộ cài (từ log CI): `d87a98cb7426978243ba948e83b313e236a2f74f3887e179b4ed98ccf016bcaa`.
