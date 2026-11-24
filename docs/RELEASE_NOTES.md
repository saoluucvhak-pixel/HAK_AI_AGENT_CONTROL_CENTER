# HAK AI Agent Control Center 0.2.0-rc.1 (release candidate — KHÔNG phải bản ổn định)

**Bộ cài chưa được ký mã.** Windows SmartScreen có thể cảnh báo; không cần tắt Defender. Kiểm tra SHA-256 trong `SHA256SUMS.txt` trước khi cài.

## Mới
- AI Provider Manager: Claude (Anthropic), Gemini, OpenAI-compatible/OmniRoute; API key lưu bằng Windows DPAPI, không hiển thị lại; timeout, retry, giới hạn token/chi phí, số Agent đồng thời, model riêng cho từng Agent.
- Work Order đa Agent: kế hoạch phụ thuộc (DAG), chạy song song, chuyển giao kết quả giữa Agent, thử lại có giới hạn, hủy/tạm dừng, ngân sách token, phê duyệt gắn phạm vi và hết hạn, khôi phục sau gián đoạn.
- Bộ cài Windows (không cần quyền Administrator), kèm Node.js runtime; dữ liệu ở `%LOCALAPPDATA%\HAK\AI_AGENT_CONTROL_CENTER`.
- Agent sửa mã (cần Git): workspace cô lập, phạm vi sửa được phê duyệt, kiểm thử cố định (`node --test`/`npm test`), tự sửa lại có giới hạn, phê duyệt lần hai gắn đúng commit trước khi đẩy nhánh `hak/*` và mở PR nháp. Kiểm thử chạy mã do AI viết với quyền của bạn nên cần xác nhận rõ.
- Sửa lỗi bảo mật: kiểm tra Host/Origin, xác thực danh sách công việc, phê duyệt do server cấp.

## Giới hạn đã biết
- Agent sửa mã mới được kiểm thử trên repo git cục bộ với model mô phỏng; chưa chạy trên GitHub/model thật; chưa tự sửa lỗi CI GitHub. Bản cài không kèm Git: cần cài Git for Windows để dùng tính năng này.
- Chưa có bằng chứng gọi Claude/Gemini **thật**; danh tính model không được xác minh độc lập.
- Chưa có sao lưu/phục hồi cho dữ liệu mới, chưa đo hiệu năng, chưa có đa người dùng.
- Xem `docs/ACCEPTANCE_REPORT.md` và `docs/BACKLOG.md`.
