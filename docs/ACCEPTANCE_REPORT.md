# Báo cáo nghiệm thu — 0.2.0-rc.1

Trạng thái phát hành: **RELEASE CANDIDATE. Chưa đủ điều kiện stable.** Quy tắc: BLOCKED/NOT_RUN không được tính là PASS.
"PASS (mô phỏng)" nghĩa là kiểm thử tự động với gateway HTTP giả; **không** chứng minh Claude/Gemini thật.

| Test | Nội dung | Kết quả | Bằng chứng / lý do |
|---|---|---|---|
| TC01 | Cài đặt, khởi động, shortcut, một instance | PASS (runner CI) | commit `6a74382`, run Windows release: 8/8 kiểm tra, `INSTALLER_TEST_RESULTS.json`. Chạy trên runner GitHub `windows-2022` (không phải máy sạch của người dùng) |
| TC02 | Cấu hình AI, khởi động lại, bí mật không vào log/file cấu hình | PASS (mô phỏng) | `tests/v2-http-e2e.test.js`, `provider-manager.test.js`; DPAPI thật: chạy ở CI Windows |
| TC03 | Claude thật | BLOCKED | cần API key Anthropic của người dùng |
| TC04 | Gemini thật | BLOCKED | cần API key Google của người dùng |
| TC05 | Giao việc 1 Agent, phê duyệt, kết quả, lịch sử | PASS (mô phỏng) | `operator-mvp-e2e`, `orchestrator.test.js` |
| TC06 | Multi-Agent ≥ 4 Agent, handoff, dependency, tổng hợp | PASS (mô phỏng) | `orchestrator.test.js`, `v2-http-e2e` (5 Agent) |
| TC07 | Agent sửa repo, branch, test, PR | NOT_IMPLEMENTED | backlog B-03 |
| TC08 | CI lỗi → Agent sửa | NOT_IMPLEMENTED | backlog B-03 |
| TC09 | Phê duyệt thiếu/hết hạn/đổi phạm vi bị từ chối | PASS | `approvals.test.js`, `orchestrator.test.js` |
| TC10 | Mất kết nối AI | PASS (mô phỏng, mức đơn vị) | lỗi 5xx/mạng → RETRY_PENDING, dữ liệu giữ nguyên |
| TC11 | Khởi động lại khi đang chạy | PASS (mô phỏng) | test crash recovery; HTTP restart |
| TC12 | Sao lưu và phục hồi | PARTIAL | sao lưu + kiểm tra + phục hồi vào thư mục trống có manifest SHA-256 (`data-backup.test.js`, API `/api/v2/backups`); chưa phục hồi trên máy độc lập, chưa có nút phục hồi trên UI |
| TC13 | Nâng cấp bảo toàn dữ liệu | PASS (runner CI) | cài `0.0.1-upgrade-fixture` → nâng cấp `0.2.0-rc.1`; Work Order và tệp đánh dấu còn nguyên; installer tự dừng backend |
| TC14 | Gỡ cài đặt | PASS (runner CI) | gỡ im lặng: shortcut, runtime, tiến trình bị xóa; dữ liệu người dùng được giữ; `/PURGEDATA=1` xóa dữ liệu. Chưa kiểm tra hộp thoại xác nhận tương tác |
| TC15 | Bảo mật | PARTIAL | Host/Origin/token/rate-limit/secret có test; chưa pentest, chưa quét phụ thuộc |
| TC16 | Hiệu năng | NOT_RUN | backlog B-07 |
| TC17 | Trải nghiệm người dùng trên Windows sạch | NOT_RUN | cần người dùng |

## Release gates
1 Source: chưa đủ (chưa quét bí mật/phụ thuộc độc lập; CI xanh trên `6a74382`) · 2 Application: đạt ở mức mô phỏng · 3 Real AI: **chưa đạt** · 4 Multi-Agent: đạt mức mô phỏng · 5 GitHub: **chưa đạt** · 6 Windows: có SETUP.exe + checksum + cài/nâng cấp/gỡ đạt trên runner CI; **chưa ký mã, chưa thử trên Windows sạch của người dùng (TC17)** · 7 Acceptance: **chưa có xác nhận của người có thẩm quyền**.

Artifact: job `windows` của workflow *Windows release* (run 45306712016) tải lên `HAK_AI_AGENT_SETUP_0.2.0-rc.1.exe`, `HAK_AI_AGENT_PORTABLE_0.2.0-rc.1.zip`, `SHA256SUMS.txt`. SHA-256 bộ cài (từ log CI): `45670455dada454c1d95c614b7fd01886648deb268e2d97e107d462a2bebfab9`.
