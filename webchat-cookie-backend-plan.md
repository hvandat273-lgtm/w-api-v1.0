# Webchat Plan: Backend-Managed Cookie

## Mục tiêu

Xây dựng webchat trong frontend hiện có (`web/`) để người dùng chat, upload file và có giao diện gần giống Gemini, nhưng không dùng Gemini API và không lưu cookie ở client.

Cookie/session/token dùng để gọi dịch vụ upstream sẽ được lưu ở backend thông qua `config.json` hoặc storage backend hiện có. Client chỉ đăng nhập vào hệ thống `chatgpt2api` bằng auth key nội bộ và gọi API backend của dự án.

## Nguyên tắc thiết kế

- Client không biết cookie upstream.
- Client không ghi cookie upstream vào `localStorage`, `localforage`, cookie trình duyệt, hoặc request payload.
- Backend chịu trách nhiệm chọn account/cookie phù hợp để xử lý chat.
- Frontend chỉ gửi nội dung chat, file đính kèm và conversation id.
- Auth frontend tiếp tục dùng cơ chế hiện tại: `Authorization: Bearer <auth-key>`.
- Nếu cần bảo mật hơn cho auth key nội bộ, triển khai thêm HttpOnly session cookie riêng cho app, nhưng cookie upstream vẫn chỉ nằm ở backend.

## Kiến trúc đề xuất

```text
Browser Webchat
  |
  | Authorization: Bearer <user/admin key>
  v
FastAPI Backend
  |
  | Load upstream cookie/account from config/storage
  v
Chat upstream/service adapter
  |
  v
Response stream/non-stream
```

## Backend

### 1. Cấu hình cookie/account

Mở rộng `config.json` hoặc storage backend để lưu danh sách account phục vụ chat.

Ví dụ cấu trúc đề xuất:

```json
{
  "chat": {
    "enabled": true,
    "default_model": "auto",
    "accounts": [
      {
        "id": "account-1",
        "name": "Default Chat Account",
        "enabled": true,
        "cookie": "backend-only-cookie-value",
        "proxy": "",
        "metadata": {}
      }
    ]
  }
}
```

Ghi chú:

- Không trả field `cookie` về frontend ở bất kỳ API nào.
- API quản trị chỉ được phép hiển thị `id`, `name`, `enabled`, `last_used_at`, `status`.
- Nếu cần sửa cookie qua UI admin, request gửi lên backend một lần rồi backend lưu lại; sau khi lưu không echo raw cookie về client.

### 2. Service quản lý account chat

Tạo service mới, ví dụ:

- `services/chat_account_service.py`
- Load account từ config/storage.
- Filter account `enabled`.
- Chọn account theo round-robin hoặc quota/status.
- Mask cookie khi trả dữ liệu quản trị.
- Cập nhật `last_used_at`, `last_error`, `disabled_reason` nếu upstream lỗi.

### 3. API webchat nội bộ

Thêm router mới, ví dụ `api/chat.py`.

Endpoint MVP:

```text
POST /api/chat/completions
GET  /api/chat/conversations
POST /api/chat/conversations
GET  /api/chat/conversations/{id}
DELETE /api/chat/conversations/{id}
```

Payload chat:

```json
{
  "conversation_id": "optional-id",
  "model": "auto",
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    }
  ],
  "attachments": [
    {
      "id": "file-id",
      "name": "image.png",
      "mime_type": "image/png"
    }
  ],
  "stream": true
}
```

Backend flow:

1. Xác thực bằng `require_identity()`.
2. Validate message và file.
3. Chọn account/cookie backend.
4. Gọi adapter chat upstream bằng cookie backend.
5. Stream hoặc trả response thường.
6. Lưu conversation metadata nếu triển khai server-side history.

### 4. Upload file

Endpoint:

```text
POST /api/chat/files
GET  /api/chat/files/{file_id}
DELETE /api/chat/files/{file_id}
```

MVP hỗ trợ:

- Image: `png`, `jpg`, `jpeg`, `webp`.
- Text: `txt`, `md`, `json`, `csv`, `log`.

Backend lưu file trong `data/chat_uploads/`.

Giới hạn đề xuất:

- File đơn: 20 MB.
- Tổng file mỗi message: 5 file.
- Chỉ admin cấu hình được giới hạn.

### 5. Adapter chat

Tạo lớp adapter tách biệt để sau này đổi backend dễ hơn.

Ví dụ:

```text
services/chat/
  account_service.py
  file_service.py
  upstream_adapter.py
  conversation_service.py
```

Adapter nhận:

- messages
- selected model
- file references
- backend-only cookie
- proxy config nếu có

Adapter trả:

- normal response
- stream chunks
- error normalized

## Frontend

### 1. Route mới

Tạo trang:

```text
web/src/app/chat/page.tsx
```

Thêm menu `Chat` vào:

```text
web/src/components/top-nav.tsx
```

Nếu webchat là chức năng chính, đổi default route user từ `/image` sang `/chat` trong:

```text
web/src/store/auth.ts
```

### 2. UI giống Gemini

Layout:

- Sidebar trái: new chat, lịch sử hội thoại, search.
- Main panel: màn hình welcome hoặc message thread.
- Composer fixed dưới: textarea auto-grow, attach file, send, stop.
- File chip hiển thị trước khi gửi.
- Mobile: sidebar chuyển thành drawer/dialog.

Các trạng thái cần có:

- Empty state.
- Sending.
- Streaming.
- Uploading file.
- Error với retry.
- Conversation rename/delete.

### 3. Client không xử lý cookie upstream

Frontend chỉ gọi:

```text
POST /api/chat/completions
POST /api/chat/files
```

Frontend không có field nhập cookie trong trang chat.

Nếu cần trang admin để cấu hình account/cookie:

- Chỉ admin thấy trang cấu hình.
- Form cho phép paste cookie và submit.
- Sau submit, input bị clear.
- API response không trả raw cookie.

### 4. Lưu lịch sử

Có 2 lựa chọn:

MVP:

- Lưu history ở client bằng `localforage`.
- Chỉ lưu messages và file metadata.
- Không lưu cookie.

Production tốt hơn:

- Lưu history ở backend trong `data/chat_conversations/` hoặc DB.
- User có thể đồng bộ history giữa thiết bị.
- Dễ audit và kiểm soát quota.

Đề xuất: MVP dùng localforage để nhanh, sau đó nâng lên backend history.

## Bảo mật

- Không log raw cookie.
- Không trả raw cookie ở API response.
- Mask cookie khi hiển thị: `abcd...wxyz`.
- Giới hạn upload file theo MIME và size.
- Chặn path traversal khi lưu file.
- Nếu dùng stream, đảm bảo lỗi upstream không leak header/cookie.
- Chỉ admin được tạo/sửa/xóa backend chat account.
- User thường chỉ được chat và xem history của chính mình.

## Thứ tự triển khai

### Phase 1: MVP text chat

1. Tạo `api/chat.py`.
2. Tạo `services/chat/upstream_adapter.py`.
3. Load cookie từ config backend.
4. Tạo `/api/chat/completions` non-stream.
5. Tạo `web/src/app/chat/page.tsx`.
6. Thêm navigation `Chat`.
7. Lưu history client-side bằng `localforage`.

### Phase 2: Upload file

1. Tạo `/api/chat/files`.
2. Lưu file vào `data/chat_uploads/`.
3. Hỗ trợ image và text file.
4. Composer hiển thị file chips.
5. Gửi file references vào `/api/chat/completions`.

### Phase 3: Streaming

1. Backend trả `StreamingResponse`.
2. Frontend dùng `fetch` + `ReadableStream`.
3. Thêm nút stop bằng `AbortController`.
4. Append token vào assistant message theo thời gian thực.

### Phase 4: Admin quản lý cookie/account

1. Trang admin cấu hình chat accounts.
2. API CRUD account.
3. Mask cookie trong response.
4. Health check account.
5. Disable account tự động khi lỗi lặp lại.

### Phase 5: Server-side history

1. Tạo conversation storage.
2. Gắn conversation với user key id.
3. API list/get/delete/rename.
4. Migration từ localforage nếu cần.

## Tiêu chí hoàn thành MVP

- User đăng nhập bằng auth key hiện có.
- User vào `/chat`.
- Gửi được text message.
- Backend dùng cookie trong config để gọi upstream.
- Frontend không thấy hoặc lưu cookie upstream.
- Refresh trang vẫn còn history local.
- Không có raw cookie trong API response, console log, network response, hoặc UI.

