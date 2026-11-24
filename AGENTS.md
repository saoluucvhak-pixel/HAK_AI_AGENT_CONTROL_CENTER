# AGENTS.md — HAK AI Control Center

Repo này đóng vai trò **bộ mô hình, tiêu chuẩn và quy trình điều phối** cho AI ở phiên làm việc hiện tại (tương tự `obra/superpowers`, `ruvnet/ruflo`, `heydamir/unslop`).

## Nguyên tắc vận hành cho mọi phiên AI
- **Thực thi trực tiếp ở phiên hiện tại:** Không yêu cầu Windows launcher hay cổng AI nội bộ trung gian.
- **Một prompt làm trọn gói:** Khi người dùng yêu cầu test, sửa hoặc nâng cấp bất kỳ repo nào (`saoluucvhak-pixel/<repo>` hoặc dự án mới), AI tự động chạy đủ 5 pha trong `SKILL.md`:
  1. Kiểm tra repo, PR, CI và baseline tests.
  2. Áp dụng đúng chuẩn từ `config/repos.json` (`skillRepositories`) qua `src/skills-registry.js` (đã chống trùng lặp).
  3. Cô lập nhánh mới, viết test tái hiện (TDD), sửa lỗi / nâng cấp dứt điểm.
  4. Xác minh lại toàn bộ `check` + `test` + `acceptance` pass 100%.
  5. Mở PR, chờ CI xanh, squash-merge vào `main` và dọn sạch nhánh thừa/xung đột.
