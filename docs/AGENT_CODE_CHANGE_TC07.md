# TC07 - lần chạy thử luồng Agent sửa mã

Tệp này được tạo bởi luồng "Agent sửa mã" của HAK AI Agent Control Center (`src/code-change.js`), không phải gõ tay vào nhánh.

Các bước đã chạy thật:

1. Work Order hoàn thành (Agent Backend) và có báo cáo tổng hợp kèm SHA-256.
2. Cổng 1: phê duyệt gắn phạm vi `docs/**`, lệnh kiểm thử `node-test`, SHA nhánh gốc và đồng ý chạy mã.
3. Chỉnh sửa trong git worktree riêng, trên nhánh `hak/*`; thư mục làm việc của người dùng không bị đổi.
4. Kiểm thử `node --test` chạy trong worktree.
5. Cổng 2: phê duyệt xuất bản gắn đúng commit đã kiểm thử, rồi đẩy nhánh `hak/*`.
6. PR nháp, không merge.

Giới hạn cần biết (không che giấu):

- Đầu ra của "mô hình" trong lần chạy này do trợ lý của phiên Claude Code viết, **không** phải một lần gọi API nhà cung cấp qua Provider Manager (chưa có API key). Do đó đây KHÔNG phải bằng chứng cho TC03/TC04.
- Nhánh gốc là `main` (chưa gồm PR #127), nên bài kiểm thử chạy trên mã của `main`.
- Phần tạo PR do trợ lý thực hiện qua công cụ GitHub, vì ứng dụng chưa được cấp token GitHub.
