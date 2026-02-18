# Telegram Generate-Link Auth Failure Report

## 1️⃣ Route Mount Configuration
-   **File**: `backend/src/app.ts`
-   **Code**: `app.use("/api/telegram", telegramRoutes);`
-   **Status**: ✅ Correctly mounted.

## 2️⃣ Route Definition
-   **File**: `backend/src/routes/telegram.routes.ts`
-   **Code**: `router.post('/link/generate', authMiddleware, telegramController.generateLink);`
-   **Status**: ✅ Protected by `authMiddleware`.

## 3️⃣ Auth Middleware
-   **File**: `backend/src/middleware/auth.middleware.ts`
-   **Logic**:
    -   Verifies JWT.
    -   Checks DB for user existence (Added in previous fix).
    -   **Attaches User ID**: `req.userId = decoded.userId;`
-   **Status**: ✅ Correct.

## 4️⃣ Generate Link Controller (THE BUG)
-   **File**: `backend/src/controllers/telegram.controller.ts`
-   **Code**:
    ```typescript
    export const generateLink = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.userId; // <--- ERROR HERE
            if (!userId) {
                return res.status(401).json({ success: false, error: "Unauthorized" });
            }
            // ...
    ```
-   **Diagnosis**:
    -   The middleware sets `req.userId`.
    -   The controller reads `req.user.userId`.
    -   `req.user` is undefined.
    -   Result: `userId` is undefined -> returns 401.

## 5️⃣ Runtime Error
-   **Reproduction**: `reproduce_telegram_auth.js`
-   **Result**: 
    ```json
    {
      "success": false,
      "error": "Unauthorized"
    }
    ```
-   **Frontend Impact**: The frontend receives 401, causing `api.ts` interceptor to wipe the token and log the user out.

## 🚀 Root Cause
**Property Access Mismatch.**
The `authMiddleware` attaches the user ID to `req.userId`, but the `telegram.controller.ts` attempts to read it from `req.user.userId`.

## 🛠 Recommended Fix
Update `telegram.controller.ts` to use the correct property:

```diff
- const userId = (req as any).user?.userId;
+ const userId = (req as any).userId;
```
