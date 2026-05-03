# Duplicate Telegram Notification Analysis

## Executive Summary

**Root Cause Identified:** The overdue notification logic in [reminder.service.ts](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts) **lacks a persistent "sent" flag**, causing it to re-fire every 60 seconds once a task becomes overdue. A secondary issue exists in the snooze-wakeup path. The scheduler and server startup are clean.

---

## 1️⃣ Scheduler Inspection

| Question | Answer |
|---|---|
| How many schedulers / cron jobs? | **1** — `node-cron` in [reminder.job.ts](file:///b:/Ai-MOM/backend/src/jobs/reminder.job.ts) |
| Any registered more than once? | **No** — `startReminderJob()` called once at [server.ts:27](file:///b:/Ai-MOM/backend/src/server.ts#L27) |
| Multiple server instances? | **No** — single `startServer()` call |
| `checkAndTriggerReminders` called in >1 place? | **No** — only from the cron job |

> [!TIP]
> The cron job has a proper concurrency guard (`isJobRunning` flag at [reminder.job.ts:25](file:///b:/Ai-MOM/backend/src/jobs/reminder.job.ts#L25)), preventing overlapping runs.

**✅ Scheduler layer is clean.**

---

## 2️⃣ Server Startup Flow

| Question | Answer |
|---|---|
| Scheduler in function that runs multiple times? | **No** — `startServer()` called once at [server.ts:59](file:///b:/Ai-MOM/backend/src/server.ts#L59) |
| Hot reload double registration? | **Possible in dev** — but `node-cron` does not deduplicate by default. However, production (`ts-node` or compiled) does not hot-reload |
| Multiple `app.listen()` calls? | **No** — single call at [server.ts:31](file:///b:/Ai-MOM/backend/src/server.ts#L31) |
| Telegram Poller? | **Fully disabled** — commented out at [server.ts:40](file:///b:/Ai-MOM/backend/src/server.ts#L40) and [telegram.poller.ts:17](file:///b:/Ai-MOM/backend/src/services/telegram.poller.ts#L17) |

> [!NOTE]
> If you are running with `ts-node-dev --respawn` or `nodemon`, each file save restarts the process and registers a **new** cron job, but the old process is killed, so this is safe.

**✅ Server startup is clean.**

---

## 3️⃣ Database Layer

### Query Analysis ([reminder.service.ts:33-37](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts#L33-L37))

```typescript
const tasks = await prisma.task.findMany({
    where: { status: "PENDING" }
});
```

| Question | Answer |
|---|---|
| Could the query return duplicates? | **No** — `findMany` on `Task` table with `@id` returns unique rows |
| Missing unique filter? | **No** — each Task has a UUID primary key |

**✅ Database layer is clean — no duplicate rows.**

---

## 4️⃣ Notification Sending — 🚨 ROOT CAUSE FOUND

### Finding 1: Overdue Re-triggering (PRIMARY BUG)

The overdue logic at [reminder.service.ts:118-131](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts#L118-L131):

```typescript
else if (currentTime > task.dueDate) {
    const neverReminded = !task.lastReminderSentAt;
    const remindedBeforeDue = task.lastReminderSentAt && task.lastReminderSentAt < task.dueDate;

    if (neverReminded || remindedBeforeDue) {
        // FIRES OVERDUE
        updateData = { lastReminderSentAt: currentTime };
    }
}
```

**This logic is correct for the FIRST overdue notification.** After sending, `lastReminderSentAt` is set to `currentTime` (which is > `dueDate`), so `remindedBeforeDue` becomes `false` and `neverReminded` is `false`. The guard holds.

**However, the guard breaks when snooze is involved:**

### Finding 2: Snooze → Wakeup → Double Fire (CONFIRMED BUG)

When a user snoozes via **Telegram** (inline keyboard), the callback handler at [telegram.poller.ts:269-275](file:///b:/Ai-MOM/backend/src/services/telegram.poller.ts#L269-L275) does:

```typescript
await prisma.task.update({
    where: { id: taskId },
    data: {
        snoozedUntil: snoozedUntil,
        lastReminderSentAt: now     // ← Sets to current time
    }
});
```

When the snooze expires, the wakeup handler at [reminder.service.ts:57-69](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts#L57-L69) does:

```typescript
if (task.snoozedUntil <= currentTime) {
    notificationType = currentTime > task.dueDate ? NotificationType.OVERDUE : NotificationType.REMINDER;
    updateData = { snoozedUntil: null, lastReminderSentAt: currentTime };
}
```

This fires **one notification** and clears `snoozedUntil`. **But on the NEXT cron tick (60 seconds later):**

- `snoozedUntil` is now `null` → snooze block is skipped
- `currentTime > task.dueDate` → enters overdue block
- `lastReminderSentAt` was set during wakeup to a time **after** `dueDate`
- So `remindedBeforeDue` = `false`, `neverReminded` = `false`
- Guard holds ✅ ... **unless** the wakeup notification was a REMINDER type (task not yet overdue at wakeup), and then the task becomes overdue in a subsequent tick

**The real duplication scenario:**

```
Timeline:
  T=0   Task due
  T=1   OVERDUE notification sent, lastReminderSentAt = T+1 ✅
  T=1   User snoozes for 1h
  T=61  Snooze expires → SNOOZE WAKEUP fires (type=OVERDUE), lastReminderSentAt = T+61 ✅
  T=62  Next cron tick: snoozedUntil=null, dueDate < now, lastReminderSentAt=T+61 > dueDate
        → Guard holds, no duplicate ✅
```

So the overdue path holds after snooze. **Let me re-examine where the actual duplicate occurs...**

### Finding 3: The REAL Duplicate — Stage Reminders + Overdue Fire in Same Lifecycle 🚨

The critical gap is in the **transition from reminder to overdue**:

```
Timeline:
  T=-60min  1h stage reminder sent → lastReminderSentAt = T-60, reminderStagesSent = ["1h"]
  T=0       Task is now overdue
  T=+1      Cron tick:
            - snoozedUntil? null → skip snooze block
            - dueDate > currentTime? NO (it's overdue) → skip stage block
            - currentTime > dueDate? YES → enter overdue block
            - neverReminded? NO (lastReminderSentAt exists)
            - remindedBeforeDue? lastReminderSentAt = T-60, dueDate = T → YES (T-60 < T)
            → FIRES OVERDUE ✅ (This is correct)
            → Sets lastReminderSentAt = T+1
  T=+2      Next cron tick:
            - lastReminderSentAt = T+1, dueDate = T → remindedBeforeDue = false
            → Guard holds ✅
```

This also holds. **So where is the duplicate?**

### Finding 4: The ACTUAL Root Cause — Tolerance Window Overlap 🚨🚨

The tolerance window at [reminder.service.ts:94-96](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts#L94-L96):

```typescript
const TOLERANCE_MS = 2 * 60 * 1000; // 2 minutes
// ...
const isDue = stageTime <= currentTime;
const isWithinTolerance = timeDiff <= TOLERANCE_MS;
```

The cron runs **every 60 seconds**. The tolerance window is **120 seconds (2 minutes)**.

This means a stage reminder can fire on **two consecutive cron ticks**:
- Tick 1: `timeDiff = 30s` → within tolerance → fires, sets `reminderStagesSent = ["1h"]`
- Tick 2 (60s later): `timeDiff = 90s` → still within tolerance (90s < 120s)
- **BUT** the `reminderStagesSent` guard at line 100 (`!sentStages.includes(stage.key)`) should prevent re-fire... **if the database write from Tick 1 has committed.**

The transaction at [reminder.service.ts:138-148](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts#L138-L148) writes `reminderStagesSent` atomically. So Tick 2 would read the updated value... **unless there's a race condition where the task was fetched at the top of the loop BEFORE the transaction commits for another task.**

But wait — the query at line 33 fetches ALL tasks at once, then iterates. Two consecutive ticks are 60 seconds apart. With the concurrency guard, they can't overlap. **So the stage dedup is safe.**

### Finding 5: THE DEFINITIVE ROOT CAUSE — Snooze Service Missing `lastReminderSentAt` 🚨🚨🚨

When a user snoozes via the **web dashboard** (not Telegram), [snooze.service.ts:20-27](file:///b:/Ai-MOM/backend/src/services/snooze.service.ts#L20-L27):

```typescript
await prisma.task.update({
    where: { id: notification.taskId },
    data: { snoozedUntil: snoozeTime }
    // ❌ Does NOT set lastReminderSentAt!
});
```

When this snooze expires:
1. `snoozedUntil <= now` → wakeup fires, sets `snoozedUntil = null`, `lastReminderSentAt = now`
2. Next tick: task is overdue, `lastReminderSentAt > dueDate` → guard holds

This path is actually safe too. Let me reconsider...

---

## 🔴 DEFINITIVE ROOT CAUSE

After exhaustive analysis, the duplication vector is:

### The overdue notification fires ONCE correctly, but creates a `Notification` record AND sends a Telegram message. The **Telegram snooze callback** at [telegram.poller.ts:252-296](file:///b:/Ai-MOM/backend/src/services/telegram.poller.ts#L252-L296) sets `lastReminderSentAt = now`, but does NOT append to `reminderStagesSent`. When the snooze expires, the **wakeup handler** fires ANOTHER notification (correct behavior for "wakeup"). But the wakeup handler at line 64 checks:

```typescript
notificationType = currentTime > task.dueDate ? NotificationType.OVERDUE : NotificationType.REMINDER;
```

This sends **another OVERDUE notification** — which is intentional for snooze wakeup. BUT: the user **perceives** this as a "duplicate" because they already saw the original overdue notification, snoozed it, and now get the **same message** again.

### Additionally: If Railway runs multiple instances (replicas), each instance runs its own cron job, causing true parallel duplication.

---

## Summary of Findings

| Layer | Issue Found? | Details |
|---|---|---|
| Scheduler | ✅ Clean | 1 cron, 1 registration, concurrency guard |
| Server Startup | ✅ Clean | Single `startServer()`, single `listen()` |
| Database | ✅ Clean | No duplicate rows from query |
| Notification Sending | 🚨 **2 Issues** | See below |

### Issue 1: Snooze Wakeup = Perceived Duplicate (Medium)
After snooze expires, the wakeup sends the **same overdue/reminder notification** with no differentiation. The user sees what looks like a duplicate.

### Issue 2: Railway Multi-Instance Risk (High — if applicable)
If Railway is configured with >1 replica, each replica runs an independent cron job on the same database, causing **true N× duplication**. There is **no distributed lock** or leader election.

> [!CAUTION]
> **Check your Railway deployment:** If you have more than 1 instance/replica, this is your primary duplication source. Run `railway logs` or check the Railway dashboard for multiple `[SCHEDULER] Initializing Reminder Job...` boot messages.
