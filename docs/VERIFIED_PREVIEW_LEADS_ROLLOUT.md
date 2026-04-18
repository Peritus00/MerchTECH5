# Verified preview leads — rollout & validation

## Prerequisites

1. Run DB migration `040_preview_phone_leads_and_slideshow_phone_gate.sql` (or project migration runner) on production.
2. Set `FRONTEND_URL` / `EXPO_PUBLIC_FRONTEND_URL` to the base URL used in SMS verification links (must open the app or web client at `/preview-verify?t=...`).
3. SMS provider configured (same as coupon SMS).

## Abuse protections (implemented)

- Dedicated rate limiter on `POST /api/preview-leads/start` (see `previewLeadStartLimiter` in server middleware).
- Unverified duplicate leads for same phone + content replaced on new start.
- Verification token expiry (server-side, default 15 minutes).
- Marketing leads excluded from “marketing only” export unless explicit opt-in recorded.

## Manual test cases

| Case | Steps | Expected |
|------|--------|----------|
| Unlocked content | Open public playlist/slideshow without activation | Full access; no preview gate modal for unlock path |
| Locked, phone gate off | Locked item, `requirePhoneForPreview` false | 30s preview after optional legacy SMS flow / skip per gate settings |
| Locked, phone gate on | Locked item, `requirePhoneForPreview` true | Modal sends SMS; preview does **not** start until `/preview-leads/status` returns verified |
| Verification link | Tap link in SMS on **same device** | `/preview-verify` calls verify API; return to tab → polling picks up verified |
| Expired / bad token | Tamper with `t` in URL | Error message; no verified status |
| Slideshow parity | Enable phone gate on slideshow, scan | Same behavior as playlist |
| Owner export | Settings → Preview phone leads | Loads verified rows; marketing CSV only includes `marketing_opt_in` |
| Resend / repeat | Submit start twice quickly | Second attempt subject to rate limits / row replacement behavior |

## Rollout checks

- [ ] Migration applied; `preview_phone_leads` exists.
- [ ] `slideshows.require_phone_for_preview` column exists (or app handles 42703 fallback only in dev).
- [ ] Smoke test one real SMS on staging with real `FRONTEND_URL`.
- [ ] Confirm compliance copy: transactional vs marketing checkboxes in `PreviewGateModal` / `SmsOptInFields`.

## Notes

- **Same-device link only**: there is no desktop “enter code” fallback; users must open the link on the device where they requested preview.
- Preview **unlock JWT** from status endpoint is available for future server-side enforcement on media routes if needed.
