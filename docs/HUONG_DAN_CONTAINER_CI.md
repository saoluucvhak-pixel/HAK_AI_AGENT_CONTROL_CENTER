# Hướng dẫn vận hành: container và CI

Mục đích: dùng Control Center để AI **viết** và **kiểm tra lại** code của repo khác, trong container hoặc CI. Không có bộ cài Windows.

## 1. Chạy bằng Docker

```bash
docker build --target runtime -t hak:runtime .
```

Kiểm tra lại một repo (chỉ đọc, không cần mô hình, chạy được không có mạng):

```bash
docker run --rm --network none --read-only --tmpfs /tmp:rw,exec --cap-drop ALL --security-opt no-new-privileges \
  -e HOME=/tmp -v "$PWD/repo-can-kiem-tra:/work:ro" hak:runtime review --repo /work --fail-on error --out /tmp/report.md
```

Mã thoát (ổn định, dùng cho cổng CI): `0` ổn · `1` có phát hiện/không đạt · `2` sai cấu hình · `3` lỗi công cụ · `4` phê duyệt không khớp · `5` remote không khớp · `10` chờ phê duyệt.

## 2. Các chế độ

| Lệnh | Việc | Cần mô hình | Ghi vào repo |
|---|---|---|---|
| `review` | Tầng tĩnh xác định (bí mật, quyền workflow, action không ghim, `npm install` trong CI, CSP, tệp thực thi, Electron, `shell.open*`, `innerHTML`, thư viện đóng gói sẵn). `--execute --consent-execute-code`: chạy kiểm thử + `npm audit` của repo. `--ai`: thêm nhận định AI có trích dẫn được xác minh | chỉ với `--ai` | không |
| `write` | AI sửa mã trong worktree riêng, chạy kiểm thử, tự sửa lại có giới hạn, tạo `hak-change.bundle` | **có** | không (chỉ tạo bundle) |
| `publish` | Đẩy đúng commit đã duyệt và mở PR **nháp** | không | đẩy nhánh `hak/*` |
| `serve` | Giao diện web | tùy | tùy |

`write` **không bao giờ giả lập**: không có `HAK_PROVIDER` thì thoát mã 2.

## 3. Mô hình và khóa (biến môi trường)

```
HAK_PROVIDER=anthropic | gemini | openai-compatible
HAK_MODEL=<mã model>
HAK_ENDPOINT=<url>            # tùy chọn
ANTHROPIC_API_KEY | GEMINI_API_KEY | HAK_API_KEY     # khóa, nạp từ secret của nền tảng
HAK_GITHUB_TOKEN              # chỉ để mở PR nháp (fine-grained, tối thiểu quyền)
```

Khóa không được ghi ra đĩa, không vào sao lưu, không vào báo cáo; bí mật tìm thấy trong mã bị ẩn trước khi gửi cho mô hình.

## 4. Hai cổng phê duyệt cho CI (gắn băm, không gắn lời hứa)

1. `write` lần đầu **chỉ in kế hoạch và `planHash`**, thoát mã 10, **không gọi mô hình**. Băm gắn: mục tiêu, phạm vi, lệnh kiểm thử, số lần sửa, ngân sách, Agent, **SHA nền**, **remote đích**, chế độ sandbox.
2. Người có thẩm quyền xem kế hoạch, chạy lại với `--approve <planHash>`. Đổi bất cứ thứ gì (kể cả nhánh gốc đã tiến) thì băm đổi và lần chạy bị từ chối (mã 4).
3. `write` kết thúc ở `VERIFIED` với `headSha` và `hak-change.bundle`; **chưa đẩy gì**.
4. `publish` cần `--approve-publish <headSha>` khớp đúng commit trong bundle; kiểm tra remote khớp `--github-repo`; chỉ đẩy nhánh `hak/*`; PR luôn là **nháp**, không merge.

Trong GitHub Actions, hai cổng này là hai *Environment* có "required reviewers" (xem `examples/ci/hak-write.yml`).

## 5. Cô lập khi chạy test mã do AI viết

`HAK_SANDBOX`:
- `netns` (mặc định, **từ chối chạy nếu không cô lập được**): bước test chạy trong network namespace riêng (không có mạng). Cần `unshare` được phép; Docker mặc định thường không cho.
- `container`: bạn xác nhận container đã chặn mạng (`docker run --network none ...`). Được ghi vào bằng chứng.
- `off`: không cô lập, **chỉ khi phát triển**.

Khuyến nghị tối thiểu cho mọi lần chạy: người dùng không root (image đã sẵn), `--read-only` + `--tmpfs /tmp`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit`, `--memory`. Bước cài phụ thuộc (`npm ci --ignore-scripts`) cần mạng; muốn chặn mạng khi chạy test thì tách hai container (tạo/cài với mạng, kiểm thử với `--network none`).

**Giới hạn:** chưa có seccomp/AppArmor riêng, giới hạn CPU/đĩa chỉ qua tham số Docker, và mã AI viết vẫn chạy với quyền của người dùng trong container. Đừng gắn thư mục chứa bí mật vào container.

## 6. Repo bind-mount thuộc user khác

Công cụ đưa đường dẫn `--repo` bạn chỉ định vào `safe.directory` (không bao giờ `*`), nên repo mount chỉ đọc thuộc uid khác vẫn đọc được. Hook, fsmonitor, ký commit của repo luôn bị tắt.

## 7. Nghiệm thu (bằng chứng)

Workflow `container-acceptance.yml` dựng image và chạy trong container đã làm cứng (không mạng, FS gốc chỉ đọc, không capability, không root): bộ test của repo, `review` repo mount chỉ đọc (mã thoát 1 với lỗi, 0 khi sạch), và kiểm tra `write` từ chối giả lập. Kết quả nằm ở tab Actions của PR.

**Chưa có bằng chứng:** mô hình thật (cần khóa của bạn), PR do chính công cụ mở bằng token thật, các workflow mẫu `examples/ci/*` chạy đầu-cuối trên repo thật.
