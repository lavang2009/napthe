# NAPPAY Card Topup — Vercel + Firebase

Production-oriented sample for:

Firebase Auth → NAPPAY Charging v2 → callback/check → Firestore transaction → one-time balance credit.

## Main protections

- Email/password Firebase authentication.
- NAPPAY Partner Key stays server-side.
- Card code and serial are encrypted at rest with AES-256-GCM.
- Firestore client writes are disabled for balances and transactions.
- Balance credit runs in one Firestore transaction and is idempotent.
- Both NAPPAY callback and active `check` can resolve `99 → 1`.
- Network errors are stored as `provider_unknown` instead of falsely declaring failure. The same request ID is then checked later.
- NAPPAY endpoint fallback: `app.nappay.vn` then `nappay.vn`.
- API logs never print Partner Key or card PIN.

## Firebase

1. Enable Authentication → Email/Password.
2. Create Firestore.
3. Deploy `firestore.rules`.
4. Create a Firebase Admin service account and set the Admin environment variables.

## NAPPAY

Create Merchant API of type **Đổi thẻ cào**, method `POST`, with callback:

`https://YOUR-DOMAIN.vercel.app/api/nappay/callback`

NAPPAY documents the Charging v2 endpoint as:

`https://app.nappay.vn/chargingws/v2`

and also documents `https://nappay.vn/chargingws/v2` as the root-domain variant. This project tries the root-domain endpoint first and falls back to the app subdomain if the first connection fails. The request uses `POST` and supports `application/x-www-form-urlencoded` or JSON. citehttps://app.nappay.vn/tai-lieu-api

## Environment variables

Copy `.env.example` to `.env.local` for local development, or configure the same values in Vercel.

Generate a 32-byte AES key:

`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Never expose:

- `NAPPAY_PARTNER_KEY`
- `FIREBASE_PRIVATE_KEY`
- `APP_ENCRYPTION_KEY`

## Run

`npm install`

`npm run dev`

## Health check

`GET /api/health`

It checks Firebase client/admin variables, NAPPAY credentials, encryption key and displays configured NAPPAY hosts.

## Callback

`GET /api/nappay/callback` returns an online message for browser testing.

Real NAPPAY callbacks must use `POST`.

## Charging

`POST /api/charge` with a Firebase Bearer token.

If the provider returns `99`, the client checks `/api/check` automatically. If NAPPAY returns `1`, the server uses a Firestore transaction to credit `amount` exactly once.


## If `/api/charge` returns network errors

`GET /api/charge` only proves the Vercel route is online. A real card submission uses `POST /api/charge`. The server tries both documented NAPPAY Charging v2 hosts. If the provider connection fails before an HTTP response arrives, the transaction is marked `PROVIDER_UNKNOWN` and can be resolved later with `POST /api/check` instead of blindly resubmitting the card.

If NAPPAY has IP whitelist enabled for Merchant ID 916, the NAPPAY Merchant settings must allow the server that sends the request. Do not expose secrets in the browser or GitHub.
