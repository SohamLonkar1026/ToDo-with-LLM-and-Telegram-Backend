# Phase 3.5B — Notification System Hardening Report

## 1. Overview
This phase focused on stabilizing the notification and reminder subsystem by addressing potential race conditions, scalability issues, and data integrity risks. No new user-facing features were added.

## 2. Implemented Fixes

### 🛡️ Transaction Safety (Atomicity)
**Risk:** If the server crashed after updating a task but before creating a notification, the user would miss the reminder forever (data inconsistency).
**Fix:** Wrapped the `Task.update` and `Notification.create` operations in a `prisma.$transaction`.
**Benefit:** Either both succeed, or both fail. No partial state.

### ⏱️ Scheduler Architecture (Reliability)
**Risk:** The previous `setInterval` implementation drifts over time and has no control mechanism.
**Fix:** Replaced with `node-cron` running on a strict `* * * * *` (every minute) schedule.
**Concurrency Guard:** Added an in-memory boolean lock (`isJobRunning`) to prevent overlapping executions if a job takes longer than 1 minute.
**Scalability Note:** This implementation is safe for a single-instance backend. For horizontal scaling (multiple backend replicas), this should be moved to a separate worker service or use a distributed lock (e.g., Redis).

### 🚀 Query Optimization (Performance)
**Risk:** `findMany({ where: { status: "PENDING" } })` would load ANY pending task, even those due next year, causing memory bloat as the DB grows.
**Fix:** Implemented filtered fetching in `reminder.service.ts`:
- Tasks with active `snoozedUntil`.
- Tasks where `dueDate` is passed (Overdue).
- Tasks due within the next 24 hours (for "Due Soon" checks).
**Benefit:** Drastically reduces the working set size.

### 🔍 Validation Guard (Integrity)
**Risk:** Invalid data (missing `dueDate`, negative offset) could crash the reminder engine loop.
**Fix:** Added explicit checks inside the processing loop.
- Skips tasks with missing dates or invalid offsets.
- Logs warnings instead of crashing.

### 📄 Pagination (Scalability)
**Risk:** `GET /api/notifications` returned all history, eventually crashing the frontend.
**Fix:** Added `page` and `limit` parameters to the API.
**Default:** `page=1`, `limit=20`.

### 🪵 Error Handling (Observability)
**Risk:** Generic `console.log` made debugging hard.
**Fix:** Standardized logs with tags:
- `[SCHEDULER]`
- `[REMINDER_ENGINE]`
- `[VALIDATION_FAIL]`
- `[TX_FAIL]`

## 3. Verification Steps

### Scheduler
1. Start backend.
2. Observe `[SCHEDULER] Initializing Reminder Job...` log.
3. Observe `[SCHEDULER] Starting reminder check...` every minute (e.g., 10:00:00, 10:01:00).

### Transactions
1. Review `src/services/reminder.service.ts`.
2. Confirm `prisma.$transaction([...])` block usage.

### Pagination
1. Request `GET /api/notifications?page=1&limit=5`.
2. Response includes `notifications` array and `totalPages`.

## 4. Remaining Risks
- **Horizontal Scaling:** As noted, `node-cron` runs in-process. If we deploy 5 backend instances, we will have 5 schedulers sending duplicate notifications. **Mitigation:** Run the scheduler on a single dedicated instance or implement Redis-based locking in Phase 4.
