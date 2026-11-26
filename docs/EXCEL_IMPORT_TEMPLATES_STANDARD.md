# Chuẩn Cấu hình Mẫu nhập Excel tùy biến (Excel Import Templates)

Tài liệu chuẩn hóa trong Control Center, đồng bộ với skill `hak-excel-import-templates` tại [`saoluucvhak-pixel/HAK_AI_SKILLS`](https://github.com/saoluucvhak-pixel/HAK_AI_SKILLS/blob/main/skills/hak-excel-import-templates/SKILL.md).

## 1. Quản lý danh mục mẫu (CRUD & Bảo mật)
- Tạo mới, Chỉnh sửa, Sao chép (Duplicate), Xóa và Đặt làm mặc định; hỗ trợ chế độ **Tự nhận diện (Auto-detect)** song song.
- Mở file Excel mẫu thực tế từ máy, chọn sheet làm việc và dòng tiêu đề (1, 2, 3,... hoặc tiêu đề gộp nhiều dòng).
- **Bảo mật:** Chỉ lưu metadata cấu hình mẫu; không lưu hoặc upload file Excel mẫu lên server (xử lý hoàn toàn phía client).

## 2. Ghép cột linh hoạt & Dry-run Probe
- 11 trường cốt lõi: `Số phiếu`, `Biển số xe`, `Ngày giờ cân` (hoặc tách ngày/giờ), `Khối lượng hàng (net)`, `Cân lần 1 (tare)`, `Cân lần 2 (gross)`, `Đơn vị tính`, `Kho nhận/xuất`, `Ghi chú`, `Tài xế`, `Đơn vị vận chuyển (ĐVVC)`.
- Bắt buộc: `Biển số xe`, `Ngày cân`, và `Khối lượng hàng` (hoặc đủ cả `Cân lần 1` & `Cân lần 2`).
- Chuẩn hóa khối lượng về `kg`, giữ nguyên số `0` ở đầu của `Số phiếu` dạng text (`"0101"`, `"00456"`), bỏ qua dòng chữ ký/ngày ký cuối bảng.
- **Dry-run Probe:** Báo hợp lệ/thiếu cột, đếm số phiếu, tổng tấn & kg, preview dòng đầu, cảnh báo dòng lỗi kèm số dòng Excel, và đối chiếu số liệu công bố ở đầu file (nếu có).

## 3. Nhập hàng loạt & Snapshot
- Ghép theo **tên tiêu đề** để chịu được việc đối tác chèn cột hoặc đổi thứ tự cột.
- Khi lỗi thiếu/trùng cột hoặc thiếu đơn vị: cho chọn mẫu khác, sửa nhanh mapping đợt đó, hoặc chuyển sang Auto-detect mà **không làm mất dữ liệu đợt hiện tại**.
- Lưu snapshot cấu hình cùng từng đợt để mở lại đợt cũ vẫn đọc đúng dù mẫu mặc định đã đổi.

## 4. Tự sinh & tải file Excel mẫu (`.xlsx`)
- Nút `"📥 Tải file mẫu này"` xuất file `.xlsx` đúng sheet, đúng dòng tiêu đề, đúng vị trí cột đã ghép, kèm **3 dòng dữ liệu mẫu chuẩn**, Sheet danh sách xe/tài xế và Sheet hướng dẫn.

## 5. Cách gọi nhanh từ Control Center
```bash
npm run mission -- saoluucvhak-pixel/<TEN_REPO> excel-import
```
