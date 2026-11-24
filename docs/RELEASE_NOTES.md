# HAK AI Agent Control Center 0.2.0-rc.1 (release candidate — KHÔNG phải bản ổn định)

**Bộ cài chưa được ký mã.** Windows SmartScreen có thể cảnh báo; không cần tắt Defender. Kiểm tra SHA-256 trong `SHA256SUMS.txt` trước khi cài.

## Mới
- AI Provider Manager: Claude (Anthropic), Gemini, OpenAI-compatible/OmniRoute; API key lưu bằng Windows DPAPI, không hiển thị lại; timeout, retry, giới hạn token/chi phí, số Agent đồng thời, model riêng cho từng Agent.
- Work Order đa Agent: kế hoạch phụ thuộc (DAG), chạy song song, chuyển giao kết quả giữa Agent, thử lại có giới hạn, hủy/tạm dừng, ngân sách token, phê duyệt gắn phạm vi và hết hạn, khôi phục sau gián đoạn.
- Bộ cài Windows (không cần quyền Administrator), kèm Node.js runtime; dữ liệu ở `%LOCALAPPDATA%\HAK\AI_AGENT_CONTROL_CENTER`.
- Sửa lỗi bảo mật: kiểm tra Host/Origin, xác thực danh sách công việc, phê duyệt do server cấp.

## Giới hạn đã biết
- Agent **chỉ tạo đề xuất văn bản**. Chưa sửa mã, chưa tạo branch/PR, chưa sửa lỗi CI tự động.
- Chưa có bằng chứng gọi Claude/Gemini **thật**; danh tính model không được xác minh độc lập.
- Chưa có sao lưu/phục hồi cho dữ liệu mới, chưa đo hiệu năng, chưa có đa người dùng.
- Xem `docs/ACCEPTANCE_REPORT.md` và `docs/BACKLOG.md`.
