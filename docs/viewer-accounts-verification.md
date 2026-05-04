# Viewer accounts — manual verification

Use against a running API with the `041_viewer_accounts` migration applied.

## Admin toggles

1. **Creator signups** (`signups_enabled`): `PATCH /api/admin/settings/signups` — normal `/api/auth/register` returns 503 when disabled.
2. **Viewer signups** (`viewer_signups_enabled`): `PATCH /api/admin/settings/viewer-signups` — `/api/auth/register-viewer` returns 503 with `VIEWER_SIGNUPS_DISABLED` when disabled.
3. **Viewer upgrades** (`viewer_upgrades_enabled`): `PATCH /api/admin/settings/viewer-upgrades` — when disabled, viewer cannot `POST /api/auth/upgrade-viewer-to-free` (403 `VIEWER_UPGRADES_DISABLED`) or start Stripe checkout (403 same code).

Public reads: `GET /api/settings/signups-enabled`, `GET /api/settings/viewer-signups-enabled`, `GET /api/settings/viewer-upgrades-enabled`.

## Viewer registration & code attach

- With viewer signups **on**, `POST /api/auth/register-viewer` with valid `email`, `username`, `password` and optional `activationCode` returns 201 with `user.accountType === 'viewer'` and token.
- Invalid or unusable `activationCode` should roll back user creation (409/400 from attach helper).

## Access bypass

- Logged-in viewer with code attached in `user_activation_codes` should access protected playlist/slideshow per server rules (playlist token / slideshow access route).

## Write lockdown

As a viewer JWT, `POST`/`PATCH`/`DELETE` on creator routes (e.g. QR create, media upload confirm, playlist create) should return **403** with `VIEWER_ACCOUNT_RESTRICTED` (or project-specific code).

## Upgrade path

- With viewer upgrades **on**: viewer completes paid Stripe checkout → webhook sets `account_type` to `creator` and paid tier.
- Free path: `POST /api/auth/upgrade-viewer-to-free` with viewer upgrades **on** sets creator + `subscription_tier` `free`.

## App smoke checks

- Tabs: Media, Playlists, Slideshows, QR, Access, Store, Sales, Analytics hidden for `accountType === 'viewer'`.
- `/subscription`: viewer sees banner; paid tiers disabled when upgrades off; confirming **Free** runs upgrade then email flow for new users.
- Protected playlist/slideshow guest header: link to `/auth/register-viewer` with code query param.
