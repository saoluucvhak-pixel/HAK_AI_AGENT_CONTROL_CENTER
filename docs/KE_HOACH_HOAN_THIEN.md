# Kế hoạch hoàn thiện và đưa vào sử dụng

**Mục đích xuyên suốt (do chủ dự án xác định): dùng Control Center để VIẾT và KIỂM TRA LẠI các repo khác.** Hai chế độ ngang hàng: *Write* (Agent sửa mã) và *Review* (kiểm tra lại, chỉ đọc). Review cũng dùng để kiểm tra đầu ra của Write trước cổng phê duyệt 2.

Đích duy nhất: Control Center xử lý một repo thật từ đầu đến cuối bằng **mô hình thật**, và một người nghiệm thu kết quả.
Quy tắc bằng chứng: lần chạy mà đầu ra "mô hình" do trợ lý viết **không** được tính cho TC03/TC04 hay TC07/TC08 thật.

| Gói | Nội dung | Trạng thái | Chặn bởi |
|---|---|---|---|
| A. AI thật (TC03/04) | Hai Work Order có trần token, mỗi nhà cung cấp một cái | CHƯA CHẠY | khóa API của người dùng (chưa cấp) |
| B. Dùng được trên repo khác | Repo theo đăng ký (owner/name tùy ý), sửa bằng khối thay thế có neo, hồ sơ kiểm thử theo repo | **Phần cục bộ XONG**: test 273/274 (1 bỏ qua), chạy thử trên repo thật có tệp 53 KB (672 test đích đạt). Chưa: PR do chính ứng dụng mở | token GitHub của người dùng (chưa cấp) |
| R. Review (kiểm tra lại, chỉ đọc) | Lát 1 XONG: tầng tĩnh xác định (bí mật, quyền workflow, action không ghim, `npm install` trong CI, thiếu lockfile, CSP, tệp thực thi, Electron không an toàn, `shell.open*`, `innerHTML`, thư viện đóng gói sẵn) đọc thẳng từ đối tượng git; tầng thực thi tùy chọn (kiểm thử + `npm audit`, cần xác nhận); tầng AI tùy chọn với **trích dẫn bắt buộc `path:line` + đoạn trích, được xác minh tại commit gốc** (không khớp thì gắn "chưa xác minh"); báo cáo tách bằng chứng công cụ khỏi nhận định AI. Chưa làm: review diff/PR trước cổng 2; tích hợp `HAK_CODE_QUALITY_TEST` qua CLI có phiên bản; biến phát hiện thành Work Order | Tầng AI cần khóa API (BLOCKED tới khi có) |
| C. Sửa lỗi CI (TC08) | Log CI đúng SHA hiện tại → vòng sửa có giới hạn → cùng nhánh | CHƯA LÀM | cần B hoàn tất + repo thử có CI |
| D. Nghiệm thu thí điểm | Chứng thư PDF (Kho), CSP (xuất hàng) bằng mô hình thật qua ứng dụng; PR do ứng dụng mở, CI đích xanh, người rà soát | CHƯA | A, B (PR thật), quyền ghi repo |
| E. ~~Windows/phát hành~~ | ĐÃ GỠ (24/11/2026): công cụ chạy trong container/CI | không áp dụng |
| S. Sửa lõi sau rà soát | XONG: chạy lại thay đổi bị chặn, remote khớp GitHub repo + gắn vào phê duyệt, nền lấy từ remote đã fetch, quét không bị cắt âm thầm, sao lưu không chứa khóa, khóa qua biến môi trường | test hồi quy |
| K. Chế độ dòng lệnh cho container/CI | CHƯA LÀM: `review`/`write` không giao diện, Dockerfile không root, workflow mẫu, cổng phê duyệt qua cơ chế của CI, sandbox cho mã AI viết | quyết định về sandbox |

Hoãn (P2): Kanban/Audit riêng, Skills registry, Claude-Mem, SQLite, đa người dùng, hiệu năng ngoài kiểm tra nhanh. Chỉ kéo lại nếu thí điểm cho thấy cần.

"Đưa vào sử dụng" (phải đạt trước khi gọi stable): ≥ 2 repo × ≥ 3 lần chạy liên tiếp bằng mô hình thật, PR do ứng dụng mở, CI repo đích xanh, một người rà soát, không sửa tay; mọi Release Gate bắt buộc đạt (không còn TC17/Windows).

## Gói R: tiêu chí nghiệm thu (golden set)
Các lần rà soát thủ công là bộ chuẩn. Mỗi mục ghi tầng phải bắt được:

| Repo @ commit | Phát hiện kỳ vọng | Tầng | Kết quả hiện tại |
|---|---|---|---|
| HAK_KHO_OFFLINE @ 5fb78da | CI dùng `npm install` | tĩnh | BẮT ĐƯỢC (`ci.yml:12`) |
| HAK_KHO_OFFLINE @ 5fb78da | CSP có `unsafe-inline` | tĩnh | BẮT ĐƯỢC (`src/renderer/index.html:5`) |
| HAK_KHO_OFFLINE @ 5fb78da | Workflow không khai báo `permissions` | tĩnh | BẮT ĐƯỢC |
| HAK_KHO_OFFLINE @ 5fb78da | `ct:open` gọi `shell.openPath` (liệt kê) | tĩnh | BẮT ĐƯỢC (danh sách vị trí) |
| HAK_KHO_OFFLINE @ 5fb78da | Thư mục ChungThu nhận `.exe` rồi `ct:open` mở nó (chuỗi suy luận) | AI | **BLOCKED** tới khi có khóa API thật |
| HAK_XUATHANG_APP @ 4de02ec | Không có CSP | tĩnh | BẮT ĐƯỢC |
| HAK_XUATHANG_APP @ 4de02ec | Workflow cấp `contents: write` cả luồng | tĩnh | BẮT ĐƯỢC |
| HAK_XUATHANG_APP @ 4de02ec | Action không ghim SHA | tĩnh | BẮT ĐƯỢC (11 action) |
| HAK_XUATHANG_APP @ 4de02ec | `HAKDocs.exe` đóng sẵn; 9 thư viện ngoài `npm audit` | tĩnh | BẮT ĐƯỢC |
| cả hai | Kiểm thử của repo và `npm audit` | thực thi | ĐẠT (672 và 226 test; audit 0 lỗ hổng) |

Quy tắc: kết quả do trợ lý viết tay không tính; chỉ đầu ra của ứng dụng. Tầng AI không bao giờ bị giả lập: không có nhà cung cấp thì báo BLOCKED.
