# Kế hoạch hoàn thiện và đưa vào sử dụng

Đích duy nhất: Control Center xử lý một repo thật từ đầu đến cuối bằng **mô hình thật**, và một người nghiệm thu kết quả.
Quy tắc bằng chứng: lần chạy mà đầu ra "mô hình" do trợ lý viết **không** được tính cho TC03/TC04 hay TC07/TC08 thật.

| Gói | Nội dung | Trạng thái | Chặn bởi |
|---|---|---|---|
| A. AI thật (TC03/04) | Hai Work Order có trần token, mỗi nhà cung cấp một cái | CHƯA CHẠY | khóa API của người dùng (chưa cấp) |
| B. Dùng được trên repo khác | Repo theo đăng ký (owner/name tùy ý), sửa bằng khối thay thế có neo, hồ sơ kiểm thử theo repo | **Phần cục bộ XONG**: test 273/274 (1 bỏ qua), chạy thử trên repo thật có tệp 53 KB (672 test đích đạt). Chưa: PR do chính ứng dụng mở | token GitHub của người dùng (chưa cấp) |
| C. Sửa lỗi CI (TC08) | Log CI đúng SHA hiện tại → vòng sửa có giới hạn → cùng nhánh | CHƯA LÀM | cần B hoàn tất + repo thử có CI |
| D. Nghiệm thu thí điểm | Chứng thư PDF (Kho), CSP (xuất hàng) bằng mô hình thật qua ứng dụng; PR do ứng dụng mở, CI đích xanh, người rà soát | CHƯA | A, B (PR thật), quyền ghi repo |
| E. Windows/phát hành | `npm-ci-test` thật trên Windows; TC17 máy sạch; quyết định ký mã; tag → Release nháp | MỘT PHẦN: cài/nâng cấp/gỡ đạt trên runner; TC17 do người dùng cài thử | máy Windows sạch (người dùng sẽ làm), chứng thư ký mã |

Hoãn (P2): Kanban/Audit riêng, Skills registry, Claude-Mem, SQLite, đa người dùng, hiệu năng ngoài kiểm tra nhanh. Chỉ kéo lại nếu thí điểm cho thấy cần.

"Đưa vào sử dụng" (phải đạt trước khi gọi stable): ≥ 2 repo × ≥ 3 lần chạy liên tiếp bằng mô hình thật, PR do ứng dụng mở, CI repo đích xanh, một người rà soát, không sửa tay; TC17 đạt; mọi Release Gate bắt buộc đạt.
