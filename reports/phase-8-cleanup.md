# Phase 8 – Architecture Cleanup Reference

## Removed/Refactored Items
-   **Refactored**: `snooze.controller.ts` -> Business logic moved to `snooze.service.ts`.
-   **Fixed**: `snooze.controller.ts` -> Removed `(req as any).userId` in favor of `req.userId`.
-   **Fixed**: `notification.controller.ts` -> Removed `(req as any).userId` in favor of `req.userId`.

## Routes Audit
-   `/api/tasks`: Standardized (GET, POST, PUT, DELETE).
-   `/api/recurring`: Standardized (POST).
-   `/api/notifications`: Standardized (GET, PUT, POST).
-   `/api/auth`: Standardized (POST).
-   `/api/system`: Standardized (GET).

## Logging Standards
-   Prefixes: `[BOOT]`, `[REMINDER_ENGINE]`, `[SCHEDULER]`.
-   Guards: `process.env.NODE_ENV !== 'production'`.
