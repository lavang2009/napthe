# NAPPAY Card Topup — Vercel + Firebase

Bản production mẫu cho luồng: Firebase Auth → NAPPAY Charging v2 → callback/check → Firestore transaction → cộng balance.

## 1. Firebase

Bật Authentication → Sign-in method → Email/Password.

Tạo Firestore Database và deploy `firestore.rules`.

Tạo Service Account để lấy `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

## 2. NAPPAY

Tạo kết nối API loại **Đổi thẻ cào**, method `POST`, callback:

`https://YOUR-DOMAIN.vercel.app/api/nappay/callback`

Charging endpoint mặc định:

`https://app.nappay.vn/chargingws/v2`

## 3. Environment Variables

Copy `.env.example` thành `.env.local` khi chạy local hoặc nhập cùng các biến vào Vercel.

Tạo khóa AES-256:

`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Không đưa `NAPPAY_PARTNER_KEY`, `FIREBASE_PRIVATE_KEY` hoặc `APP_ENCRYPTION_KEY` vào frontend.

## 4. Chạy

`npm install`

`npm run dev`

## 5. Production flow

- User đăng ký/đăng nhập bằng Firebase Email/Password.
- Frontend gửi ID token trong `Authorization: Bearer ...`.
- Server tạo `cardTransactions/{requestId}` trước khi gọi NAPPAY.
- Charging v2 dùng sign `md5(partner_key + code + command + partner_id + request_id + serial + telco)`.
- Nếu NAPPAY trả `99`, frontend tự gọi `/api/check` định kỳ.
- Nếu NAPPAY hoặc callback trả `1`, server dùng Firestore transaction để cộng tiền đúng một lần.
- Callback xác minh `callback_sign = md5(partner_key + code + serial)`.
- Admin đọc giao dịch qua server-side API; client không có quyền ghi balance/transaction.

## 6. Kiểm tra

`GET /api/health`

`GET /api/nappay/callback` → endpoint kiểm tra bằng trình duyệt; callback thật dùng POST.

`/api/charge` và `/api/check` phải gọi bằng POST.
