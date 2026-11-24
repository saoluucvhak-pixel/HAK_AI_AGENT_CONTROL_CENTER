# Hướng dẫn sử dụng (Windows)

## Cài đặt
1. Tải `HAK_AI_AGENT_SETUP_<phiên bản>.exe` và đối chiếu SHA-256 với `SHA256SUMS.txt`.
2. Chạy bộ cài (không cần quyền Administrator). Bộ cài chưa ký nên Windows có thể hiện cảnh báo SmartScreen.
3. Mở **HAK AI Agent Control Center** từ Desktop/Start Menu. Trình duyệt sẽ mở giao diện tại `http://127.0.0.1:4317` (hoặc cổng kế tiếp nếu 4317 bị chiếm).

## Cấu hình AI (không cần sửa file)
1. Vào mục **AI Provider Manager**.
2. Chọn loại (Claude / Gemini / OpenAI-compatible hoặc OmniRoute), đặt tên, nhập endpoint, model và API key rồi **Lưu kết nối**. Key được mã hóa bằng DPAPI theo tài khoản Windows của bạn.
3. Bấm **Kiểm tra kết nối**. Kết quả chỉ chứng minh kết nối và xác thực HTTP; danh tính model không được xác minh độc lập.
4. Nhập **đơn giá token** nếu muốn xem chi phí hoặc đặt giới hạn chi phí. Không có đơn giá thì chi phí hiển thị là "không xác định".
5. (Tùy chọn) gán model riêng cho từng Agent.

## Giao việc cho nhiều Agent
1. Mục **Work Order đa Agent**: nhập mục tiêu, mô tả, chọn Agent (tối đa 8 chuyên môn), giới hạn token → **Tạo kế hoạch**.
2. Xem danh sách công việc và phụ thuộc, bấm **Phê duyệt phạm vi** (hiệu lực 24 giờ). Sửa Work Order sau đó sẽ hủy phê duyệt.
3. Bấm **Bắt đầu**. Theo dõi tiến độ; có thể **Tạm dừng** hoặc **Hủy**.
4. Xem **kết quả từng Agent** hoặc **báo cáo tổng hợp**. Đây là đề xuất do AI tạo; hãy rà soát trước khi dùng. Chỉ gửi nội dung không nhạy cảm.

## Khi có sự cố
- Thông báo lỗi nêu bước, nguyên nhân và việc cần làm. Lỗi tạm thời có nút tiếp tục/thử lại phần chưa xong.
- Nếu ứng dụng đóng khi đang chạy, công việc chuyển sang "Bị gián đoạn", kết quả đã xong được giữ. Chạy lại phần gián đoạn cần bạn xác nhận vì có thể tính phí lần nữa.
- Nhật ký: `%LOCALAPPDATA%\HAK\AI_AGENT_CONTROL_CENTER\logs\server.log` (không chứa API key).
- Dừng ứng dụng: nút **Dừng ứng dụng** hoặc shortcut **Dừng HAK** trong Start Menu.

## Nâng cấp và gỡ cài đặt
- Chạy bộ cài mới đè lên bản cũ; dữ liệu trong `%LOCALAPPDATA%\HAK\AI_AGENT_CONTROL_CENTER` được giữ nguyên.
- Gỡ cài đặt giữ dữ liệu theo mặc định; hộp thoại sẽ hỏi nếu muốn xóa luôn.

## Sao lưu
Hiện cần sao chép thủ công thư mục dữ liệu khi ứng dụng đã dừng (tính năng sao lưu/phục hồi tích hợp cho dữ liệu mới chưa có — xem backlog B-04). API key trong `secrets.dpapi.json` chỉ giải mã được bởi cùng tài khoản Windows.
