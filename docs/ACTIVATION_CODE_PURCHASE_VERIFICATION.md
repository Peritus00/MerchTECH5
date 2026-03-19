# Activation Code Purchase - Verification Checklist

This document defines the end-to-end verification steps for the activation code purchase feature.

## Prerequisites

1. Run migration: `npm run db:migrate-activation-code-purchase`
2. Ensure Stripe is configured (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
3. Ensure Brevo SMS is configured (BREVO_API_KEY, BREVO_SMS_SENDER)

## Verification Steps

### 1. Guest Purchase Flow (Playlist)

- [ ] Navigate to a protected playlist access page (`/playlist-access/[id]`)
- [ ] Click "Buy Activation Code" (blue button to the right of "Enter Activation Code")
- [ ] Enter a valid phone number in the modal
- [ ] Click "Continue to Payment"
- [ ] Complete Stripe checkout (use test card 4242 4242 4242 4242)
- [ ] Verify redirect to checkout-success with message "Your activation code has been sent via text"
- [ ] Verify SMS received with activation code and content name
- [ ] Enter the received code in the access page
- [ ] Verify access granted and sign-in/sign-up prompt shown for guest
- [ ] Verify "Continue as Guest" grants full access without attaching code

### 2. Guest Purchase Flow (Slideshow)

- [ ] Navigate to a protected slideshow access page (`/slideshow-access/[id]`)
- [ ] Repeat steps from Playlist flow
- [ ] Verify SMS and code redemption work identically

### 3. Post-Auth Code Attachment

- [ ] As guest, enter valid code and tap "Sign In"
- [ ] Complete login
- [ ] Verify redirect back to access page and code is attached (redirect to player)
- [ ] Verify code appears in "My Access Codes" tab
- [ ] Verify no need to re-enter code on next visit

### 4. Admin / Creator Management

- [ ] As content creator, go to Activation Codes > All Generated
- [ ] Verify purchased codes appear with price ($5.00 default)
- [ ] Edit a code: change max uses, expiration, price
- [ ] Verify updates persist
- [ ] Create new code manually with custom price
- [ ] Verify price displays in list and is editable

### 5. Signed-In User Flow

- [ ] As signed-in user, enter valid activation code
- [ ] Verify code attaches immediately and redirects to player (no guest prompt)
- [ ] Verify no regression in existing attach flow

### 6. Idempotency

- [ ] Trigger Stripe webhook retry (or simulate duplicate checkout.session.completed)
- [ ] Verify only one activation code created, one SMS sent
- [ ] Verify activation_code_purchases has single row per session

## API Endpoints

- `POST /api/activation-codes/purchase-session` - Creates Stripe checkout (no auth)
- `POST /api/webhooks/stripe` - Handles checkout.session.completed for type=activation_code

## Data Model

- `activation_codes.price_cents` - Default 500 ($5.00)
- `activation_code_purchases` - Tracks fulfillment per Stripe session
