# Báo cáo nghiệm thu — 0.2.0-rc.1

Trạng thái phát hành: **RELEASE CANDIDATE. Chưa đủ điều kiện stable.** Quy tắc: BLOCKED/NOT_RUN không được tính là PASS.
"PASS (mô phỏng)" nghĩa là kiểm thử tự động với gateway HTTP giả; **không** chứng minh Claude/Gemini thật.

| Test | Nội dung | Kết quả | Bằng chứng / lý do |
|---|---|---|---|
| TC01 | Cài đặt, khởi động, shortcut, một instance | NOT_RUN | chờ job `release-windows.yml` (xem phần cập nhật CI) |
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
| TC12 | Sao lưu và phục hồi | NOT_IMPLEMENTED (dữ liệu v2) | backlog B-04 |
| TC13 | Nâng cấp bảo toàn dữ liệu | NOT_RUN | chờ CI Windows |
| TC14 | Gỡ cài đặt | NOT_RUN | chờ CI Windows |
| TC15 | Bảo mật | PARTIAL | Host/Origin/token/rate-limit/secret có test; chưa pentest, chưa quét phụ thuộc |
| TC16 | Hiệu năng | NOT_RUN | backlog B-07 |
| TC17 | Trải nghiệm người dùng trên Windows sạch | NOT_RUN | cần người dùng |

## Release gates
1 Source: chưa đủ (chưa quét bí mật/phụ thuộc độc lập) · 2 Application: đạt ở mức mô phỏng · 3 Real AI: **chưa đạt** · 4 Multi-Agent: đạt mức mô phỏng · 5 GitHub: **chưa đạt** · 6 Windows: chờ CI · 7 Acceptance: **chưa có xác nhận của người có thẩm quyền**.
