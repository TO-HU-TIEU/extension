# Assistant — bản cập nhật công khai

Tải bản ổn định mới nhất tại [Releases](https://github.com/TO-HU-TIEU/extension/releases/latest).

Trong Assistant: **Cài đặt → Cập nhật extension → Kiểm tra cập nhật**.

Giải nén gói `assistant-update-VERSION.zip`, chép các file vào thư mục extension đang dùng và bấm **Tải lại** trong trang quản lý tiện ích Chrome. Tải lại trang đang dùng sau khi cập nhật.

Gói cập nhật không chứa `config.local.js`; giữ nguyên file này để bảo toàn kết nối. Cài đặt nằm trong bộ nhớ trình duyệt được giữ nguyên khi cập nhật vào thư mục hiện tại.

Repo này chỉ lưu các file phân phối công khai của extension. Không lưu khoá API, tài khoản, dữ liệu trình duyệt hoặc companion cá nhân. Push tag trùng phiên bản manifest để tự đóng gói và phát hành ZIP qua GitHub Actions.

## Cập nhật ngay

Tải và chạy install-assistant-updater.cmd trong Releases một lần, chọn thư mục Assistant đang dùng trong Chrome. Bộ cài tự tải và giải nén trình cập nhật, đã kèm bộ chạy Windows. Sau đó dùng Cài đặt → Kiểm tra cập nhật → Cập nhật ngay. Trình cập nhật sao lưu file cũ, giữ nguyên kết nối và dữ liệu trình duyệt, tự tải lại extension khi hoàn tất.
