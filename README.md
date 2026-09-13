# NAPPAY Card Topup — Vercel Complete Demo

Next.js + Firebase Auth + Firestore + Firebase Admin + NAPPAY Charging API v2.

## Tính năng
- Đăng ký/đăng nhập Email + Password.
- Mỗi giao dịch gắn với UID người dùng.
- Gửi thẻ qua NAPPAY ở server.
- Tự kiểm tra giao dịch pending (99) định kỳ ở client; khi 99 -> 1 sẽ cộng tiền.
- NAPPAY callback `/api/nappay/callback` cũng có thể cộng tiền.
- Chống cộng trùng bằng Firestore transaction trên `cardTransactions/{requestId}`.
- Lịch sử giao dịch người dùng.
- Admin dashboard `/admin` qua `ADMIN_EMAILS`.
- Không cho client ghi `users.balance` hoặc `cardTransactions`.

## Firebase
1. Authentication -> Sign-in providers -> Email/Password -> Enable.
2. Firestore Database.
3. Service account cho Firebase Admin.
4. Deploy `firestore.rules`.

## NAPPAY
Endpoint mặc định: `https://app.nappay.vn/chargingws/v2`

Charging sign:
`md5(partner_key + code + command + partner_id + request_id + serial + telco)`

Check sign:
`md5(partner_key + command + partner_id + request_id)`

Callback sign:
`md5(partner_key + code + serial)`

NAPPAY phải kích hoạt API cho Merchant theo tài liệu chính thức.

## Environment
Xem `.env.example`. `NAPPAY_PARTNER_KEY`, `FIREBASE_PRIVATE_KEY`, `APP_ENCRYPTION_KEY` chỉ đặt server-side.

## Local
```bash
npm install
npm run dev
```

## Vercel
Import repository, chọn framework Next.js, khai báo Environment Variables rồi redeploy.


## Khắc phục lỗi không đăng ký được

1. Firebase Console → Authentication → Sign-in providers → bật Email/Password.
2. Tạo `.env.local` từ `.env.example` và điền đúng Firebase Web App config.
3. Điền Firebase Admin credentials và NAPPAY credentials ở server.
4. Khởi động lại `npm run dev` sau khi đổi `.env.local`.
5. Có thể mở `/api/health` để kiểm tra server đã nhận đủ cấu hình: `firebaseClient`, `firebaseAdmin`, `nappay` đều phải là `true`.

Tài khoản Firebase được tạo ở frontend trước; việc tạo hồ sơ Firestore là bước đồng bộ riêng nên lỗi server không làm tài khoản vừa tạo bị mất.
