---
name: hak-control-center
description: "Điều phối AI ở phiên làm việc hiện tại để test, rà soát, sửa lỗi, nâng cấp hoặc xây mới bất kỳ repo/dự án nào theo chuẩn HAK + Superpowers + Ruflo + Unslop chỉ trong 1 prompt."
---

# HAK AI Control Center — Session-First Orchestration Standard

Control Center không yêu cầu cổng AI nội bộ hay Windows launcher. **AI ở phiên làm việc hiện tại** là bên trực tiếp thực thi toàn bộ quy trình trên nhánh của repo mục tiêu (hoặc dự án mới) theo đúng 5 pha chuẩn dưới đây.

## Quy tắc bắt buộc
1. **1 Prompt → Trọn gói:** Khi người dùng yêu cầu *"test / sửa / nâng cấp `<repo>`"*, thực hiện đầy đủ từ rà soát, sửa lỗi, nâng cấp, chạy test, mở PR, chờ CI xanh, gộp vào `main` và dọn nhánh thừa.
2. **Không đoán mò & không bỏ sót:** Áp dụng quy trình gốc của `obra/superpowers` (`systematic-debugging` → `test-driven-development` → `verification-before-completion`).
3. **Không trùng lặp tiêu chuẩn:** Dùng đúng 1 nguồn ưu tiên cho mỗi kỹ năng (`local:` > `HAK_AI_SKILLS` > `obra/superpowers` > `ruvnet/ruflo` > `heydamir/unslop` > `openai/codex-security` > `cloudflare/security-audit-skill` > `Asymptote-Labs/agent-beacon`).

## Quy trình 5 pha cho AI phiên hiện tại

### Pha 1 — Tiếp nhận & Chốt phạm vi (`brainstorming` / `writing-plans`)
- Xác định `targetRepo` (bất kỳ `owner/repo` hợp lệ nào hoặc thư mục dự án mới).
- Kiểm tra trạng thái GitHub: nhánh mặc định, PR đang mở/xung đột, các lần chạy CI gần nhất, và `package.json` / cấu trúc dự án.

### Pha 2 — Nạp mô hình & tiêu chuẩn phù hợp (`skills-registry`)
- **Logic / Bug / Test:** `systematic-debugging`, `test-driven-development`, `verification-before-completion` (`obra/superpowers`).
- **Kế toán / Lương / Định dạng:** `hak-accounting-report`, `hak-payroll-validator` (`HAK_AI_SKILLS`) — đồng bộ ngày & số theo Settings, nhập số có ngăn cách hàng nghìn, `"Từ ngày"` đầu tháng / `"Đến ngày"` hiện tại cho nhập tay.
- **Giao diện (UI/UX):** `unslop` (`heydamir/unslop`) + `web-interface-guidelines` / `agent-browser`.
- **Bảo mật & Kiến trúc:** `hak-code-auditor`, `security-audit`, `swarm-orchestration` / `sparc-methodology` (`ruvnet/ruflo`).

### Pha 3 — Cô lập nhánh & Kiểm tra nền (`using-git-worktrees`)
- Tạo nhánh mới từ `origin/main` (hoặc nhánh chính của repo).
- Chạy kiểm tra nền (`check`, `lint`, `test`) để nắm rõ lỗi hiện tại và CI đang đỏ (nếu có).

### Pha 4 — Thực thi theo chuẩn TDD (`test-driven-development`)
- **RED:** Viết test tái hiện lỗi hoặc test cho tính năng/nâng cấp mới (xác nhận fail trước).
- **GREEN:** Sửa code tối thiểu, sạch sẽ, không phá vỡ logic cũ.
- **REFACTOR:** Dọn gọn, kiểm tra lại edge case và bảo mật.

### Pha 5 — Nghiệm thu & Chốt nhánh (`verification-before-completion` + `finishing-a-development-branch`)
- Chạy lại toàn bộ `check` + `test` + `acceptance` (0 fail).
- Mở PR lên GitHub, theo dõi CI xanh 100%, squash-merge vào `main` và xóa nhánh thừa/xung đột.
- *(Nếu token phiên hiện tại chỉ có quyền đọc với repo ngoài: hoàn thành sửa + test pass cục bộ và báo rõ commit/patch cần push.)*
