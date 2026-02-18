# Phase 9D: Telegram Account Linking System (Security Hardening)

## 🚀 Overview
We have implemented a secure, time-limited Telegram account linking system to replace the previous auto-creation logic. This ensures identity integrity by enforcing a strict **One-User-One-Telegram** policy using a 5-minute numeric verification code.

## 🛡️ Security Measures Implemented

### 1. Database Integrity
-   **Unique Constraint**: `telegramChatId` is now `@unique` in the `User` model. This physically prevents multiple users from sharing the same Telegram account.
-   **Cleanup**: A script was run to identify and nullify duplicate `telegramChatId` entries before applying the constraint.

### 2. Secure Linking Process
-   **Short-Lived Codes**: Linking codes (`telegramLinkCode`) satisfy strong randomness (6-digits) and expire strictly after **5 minutes**.
-   **Transaction-Safe Generation**: The `generateLinkCode` service loops to ensure the generated code is unique across the system before saving.
-   **Strict Validation**: The linking process checks:
    -   Code match.
    -   Expiry (`now < expiresAt`).
    -   Collision (is this Telegram account already linked to *another* user?).

### 3. Poller Security Guard
-   **Strict Order of Operations**:
    1.  `/link <code>`: **ALLOWED** (The only way to authenticate).
    2.  `/start`: **ALLOWED** (Provides instructions).
    3.  **SECURITY GATE**: Checks if `message.chat.id` exists in the DB.
        -   **IF NOT**: Returns "Please link your account first" and **STOPS** execution.
    4.  **Normal Flow**: Only runs for verified users.
-   **No Auto-Creation**: All logic that created users from Telegram messages has been removed.

## 💻 Tech Stack Changes

### Backend
-   **New Service**: `src/services/telegram.link.service.ts`
-   **New Controller**: `src/controllers/telegram.controller.ts`
-   **New Route**: `POST /api/telegram/link/generate`
-   **Updated Poller**: `src/services/telegram.poller.ts` (Security logic applied).

### Frontend
-   **Sidebar**: Added "Connect Telegram" button (via `MessageSquare` icon).
-   **New Component**: `TelegramLinkModal.tsx`
    -   Generates code via API.
    -   Displays ` /link 123456 ` with copy-to-clipboard.
    -   Shows expiry timer instructions.

## ⚠️ Important Deployment Note
The database migration command (`npx prisma migrate dev`) encountered connectivity issues (`P1001` - Can't reach database).

**Action Required**:
You must run the migration manually from your terminal when the database is reachable:
```bash
cd backend
npx prisma migrate dev --name phase_9d_telegram_linking
```

## ✅ Verification Checklist
Once the migration is applied:

1.  **Test Linking**:
    -   Click "Connect Telegram" on Dashboard.
    -   Send `/link <code>` to bot.
    -   **Expected**: "✅ Telegram successfully linked..."

2.  **Test Expiry**:
    -   Generate code, wait 5 minutes.
    -   Send `/link <code>`.
    -   **Expected**: "❌ Invalid or expired..."

3.  **Test Unlinked Access**:
    -   Unlink account (or use new Telegram account).
    -   Send `/menu`.
    -   **Expected**: "❌ Please link your account first..."
