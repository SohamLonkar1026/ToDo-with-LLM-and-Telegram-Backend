# Phase 3.5C — Reminder Query & Logic Precision Report

## 1. Updated Service Code (`reminder.service.ts`)

```typescript
import { NotificationType } from "@prisma/client";
import prisma from "../utils/prisma";

export const checkAndTriggerReminders = async () => {
    const currentTime = new Date();
    // Use ISO string for logs
    console.log(`[REMINDER_ENGINE] Check started at ${currentTime.toISOString()}`);

    try {
        // ------------------------------------------------------------------
        // QUERY 1: SNOOZED TASKS
        // ------------------------------------------------------------------
        // Strict: snoozedUntil <= now
        const snoozedTasks = await prisma.task.findMany({
            where: {
                status: "PENDING",
                snoozedUntil: {
                    lte: currentTime
                }
            }
        });

        // ------------------------------------------------------------------
        // QUERY 2: OVERDUE TASKS
        // ------------------------------------------------------------------
        // Strict: Snooze IS NULL AND Due <= Now AND (Never Reminded OR Reminded Before Due)
        const overdueTasks = await prisma.task.findMany({
            where: {
                status: "PENDING",
                snoozedUntil: null,
                dueDate: {
                    lte: currentTime
                }
                // Removed invalid "OR" block. We fetch all overdue tasks and filter strictly in memory.
            }
        });

        // ------------------------------------------------------------------
        // QUERY 3: DUE SOON TASKS (Pre-computation)
        // ------------------------------------------------------------------
        // Strict: Snooze IS NULL AND LastReminder IS NULL AND (DueDate - Offset <= Now) AND DueDate > Now
        // This requires Raw SQL because "DueDate - Offset" is dynamic per row.
        const dueSoonIdsRaw = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Task"
            WHERE "status" = 'PENDING'
            AND "snoozedUntil" IS NULL
            AND "lastReminderSentAt" IS NULL
            AND "dueDate" > NOW()
            AND ("dueDate" - ("reminderOffsetMinutes" * INTERVAL '1 minute')) <= NOW()
        `;

        const dueSoonIds = dueSoonIdsRaw.map(r => r.id);
        
        let dueSoonTasks: any[] = [];
        if (dueSoonIds.length > 0) {
            dueSoonTasks = await prisma.task.findMany({
                where: { id: { in: dueSoonIds } }
            });
        }

        // ------------------------------------------------------------------
        // MERGE & DEDUPLICATE
        // ------------------------------------------------------------------
        // 1. Filter Overdue Logic (Memory fallback for simple query)
        const actionableOverdue = overdueTasks.filter(t => {
            if (!t.lastReminderSentAt) return true; // Never reminded
            return t.lastReminderSentAt < t.dueDate; // Reminded ONLY before it was due
        });

        const rawAllTasks = [...snoozedTasks, ...actionableOverdue, ...dueSoonTasks];

        // 2. Deduplicate using Map to prevent double-processing (Edge case protection)
        const taskMap = new Map();
        for (const task of rawAllTasks) {
            taskMap.set(task.id, task);
        }
        const uniqueTasks = Array.from(taskMap.values());

        if (uniqueTasks.length > 5000) {
            console.warn(`[REMINDER_ENGINE][SAFETY_WARNING] Large task batch detected: ${uniqueTasks.length} tasks.`);
        }

        console.log(`[REMINDER_ENGINE] Processing ${uniqueTasks.length} actionable tasks...`);

        // ------------------------------------------------------------------
        // EXECUTION LOOP (Standard)
        // ------------------------------------------------------------------
        for (const task of uniqueTasks) {
            // ... (Logic determination and Transaction) ...
            // See reminder.service.ts for full loop
        }

    } catch (error) {
        console.error("[REMINDER_ENGINE] [CRITICAL_FAIL] Engine aborted", error);
    }
};
```

## 2. Deduplication Safety
We introduced a critical safety step:
```typescript
const taskMap = new Map();
for (const task of rawAllTasks) {
    taskMap.set(task.id, task);
}
const uniqueTasks = Array.from(taskMap.values());
```
This guarantees that even if a task logically falls into multiple query buckets (e.g., a race condition or edge case where `snoozedUntil` expiry aligns exactly with a due date check), it will **only be processed once**.

## 3. Query Corrections
- **Overdue Query**: Removed the invalid `lt` comparison. We now fetch pending overdue tasks and strictly filter them in memory to support the "Due Soon -> Overdue" escalation logic.
- **Due Soon Query**: Retained the Raw SQL implementation as it provides the only way to accurately filter `dueDate - offset <= now` without caching massive datasets.

## 4. Complexity Analysis
- **Deduplication**: O(N) where N is the number of actionable tasks. Using a `Map` is highly efficient.
- **Total Complexity**: Still effectively O(Total_Pending_Tasks) due to the database scans, but the in-memory processing is now robust and minimal.
