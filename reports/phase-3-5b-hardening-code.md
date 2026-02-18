# Phase 3.5B — Notification System Hardening Code

This report contains the full source code for the files modified during the notification system hardening phase.

## 1. Backend: Reminder Service (Hardened)
`src/services/reminder.service.ts`

**Key Changes:**
- **Transaction Safety**: Uses `prisma.$transaction`.
- **Optimization**: Filtered fetching for "Due Soon", "Overdue", and "Snooze".
- **Validation**: Checks for missing `dueDate` or invalid offsets.
- **Logging**: Structured logs (`[REMINDER_ENGINE]`).

```typescript
import { NotificationType } from "@prisma/client";
import prisma from "../utils/prisma";

export const checkAndTriggerReminders = async () => {
    const currentTime = new Date();
    console.log(`[REMINDER_ENGINE] Check started at ${currentTime.toISOString()}`);

    try {
        // 3. Query Optimization: Fetch only actionable tasks
        const tasks = await prisma.task.findMany({
            where: {
                status: "PENDING",
                OR: [
                    { snoozedUntil: { lte: currentTime } }, // Snooze expired
                    { dueDate: { lte: currentTime } },      // Overdue
                    {                                       // Due soon & never reminded
                        AND: [
                            { lastReminderSentAt: null },
                            // Note: We can't easily query calculated fields (dueDate - offset) in standard Prisma without raw SQL or calculated columns.
                            // For improved performance without raw SQL, we'll fetch tasks due in the next 24 hours (or reasonable window) 
                            // and filter in memory, OR assume the 'Overdue' and 'Snooze' checks cover the critical path, 
                            // and we accept a slightly wider fetch for the 'Due Soon' check.
                            // However, the prompt asks to filter where "reminderTime <= now".
                            // Since reminderTime is dynamic (dueDate - offset), we can't fully filter it in the WHERE clause efficiently without raw query.
                            // We will fetch based on status and then strictly filter in-memory for the dynamic calculation, 
                            // BUT we can optimize by ensuring we don't fetch tasks way in the future.
                            // For this strict requirement, we'll stick to the provided logic but acknowledge the limitation.
                            // To strictly follow "Do NOT load all pending tasks", we should at least filter by dueDate < (now + max_offset).
                            // Let's assume a max offset of 24h for safety in fetching.
                            { dueDate: { lte: new Date(currentTime.getTime() + 24 * 60 * 60 * 1000) } }
                        ]
                    }
                ]
            }
        });

        console.log(`[REMINDER_ENGINE] Processing ${tasks.length} potential tasks...`);

        for (const task of tasks) {
            // 4. Validation Guard
            if (!task.dueDate) {
                console.warn(`[REMINDER_ENGINE] [VALIDATION_FAIL] Task ${task.id} missing dueDate. Skipping.`);
                continue;
            }
            if (task.reminderOffsetMinutes === undefined || task.reminderOffsetMinutes < 0) {
                console.warn(`[REMINDER_ENGINE] [VALIDATION_FAIL] Task ${task.id} has invalid offset ${task.reminderOffsetMinutes}. Skipping.`);
                continue;
            }

            const reminderTime = new Date(task.dueDate.getTime() - task.reminderOffsetMinutes * 60000);
            let notificationType: NotificationType | null = null;
            let message = "";
            let updateData: any = {};

            // Logic Determination
            if (task.snoozedUntil && currentTime >= task.snoozedUntil) {
                // Snooze Wakeup
                notificationType = currentTime > task.dueDate ? NotificationType.OVERDUE : NotificationType.REMINDER;
                const prefix = notificationType === NotificationType.OVERDUE ? "Snoozed Overdue" : "Snoozed Reminder";
                message = `${prefix}: Task "${task.title}" is ready!`;
                updateData = { snoozedUntil: null, lastReminderSentAt: currentTime };
                console.log(`[REMINDER_ENGINE] [SNOOZE_WAKEUP] Task ${task.id}`);
            } else if (currentTime > task.dueDate) {
                // Overdue
                // Only if never sent OR sent before it was overdue (prevent spamming overdue)
                // Actually, standard logic usually sends overdue once. 
                // If lastReminderSentAt is NULL, we send. 
                // If lastReminderSentAt < dueDate (meaning we sent the "Due Soon" reminder), we send "Overdue".
                if (!task.lastReminderSentAt || task.lastReminderSentAt < task.dueDate) {
                    notificationType = NotificationType.OVERDUE;
                    message = `Overdue: Task "${task.title}" is overdue!`;
                    updateData = { lastReminderSentAt: currentTime };
                    console.log(`[REMINDER_ENGINE] [OVERDUE] Task ${task.id}`);
                }
            } else if (currentTime >= reminderTime) {
                // Due Soon
                if (!task.lastReminderSentAt) {
                    notificationType = NotificationType.REMINDER;
                    message = `Reminder: Task "${task.title}" is due at ${task.dueDate.toLocaleString()}`;
                    updateData = { lastReminderSentAt: currentTime };
                    console.log(`[REMINDER_ENGINE] [DUE_SOON] Task ${task.id}`);
                }
            }

            // 1. Transaction Safety
            if (notificationType && message) {
                try {
                    await prisma.$transaction([
                        // Update Task
                        prisma.task.update({
                            where: { id: task.id },
                            data: updateData
                        }),
                        // Create Notification
                        prisma.notification.create({
                            data: {
                                userId: task.userId,
                                taskId: task.id,
                                type: notificationType,
                                message: message
                            }
                        })
                    ]);
                    console.log(`[REMINDER_ENGINE] [SUCCESS] Notification sent for Task ${task.id}`);
                } catch (txError) {
                    console.error(`[REMINDER_ENGINE] [TX_FAIL] Failed to process Task ${task.id}`, txError);
                }
            }
        }
    } catch (error) {
        console.error("[REMINDER_ENGINE] [CRITICAL_FAIL] Engine aborted", error);
    }
};
```

## 2. Backend: Reminder Job (Scheduler)
`src/jobs/reminder.job.ts`

**Key Changes:**
- **Reliability**: Uses `node-cron` with `* * * * *` syntax.
- **Concurrency**: `isJobRunning` lock prevents overlapping executions.

```typescript
import cron from "node-cron";
import { checkAndTriggerReminders } from "../services/reminder.service";

let isJobRunning = false;

export const startReminderJob = () => {
    console.log("[SCHEDULER] Initializing Reminder Job...");

    // Schedule: Every minute (Robust cron syntax)
    // Concurrency Guard: Ensure only one instance runs at a time
    cron.schedule("* * * * *", async () => {
        if (isJobRunning) {
            console.warn("[SCHEDULER] Skipping execution: Previous job still running.");
            return;
        }

        isJobRunning = true;
        
        try {
            console.log("[SCHEDULER] Starting reminder check...");
            await checkAndTriggerReminders();
        } catch (error) {
            console.error("[SCHEDULER] Error during execution:", error);
        } finally {
            isJobRunning = false;
            console.log("[SCHEDULER] Job finished. Lock released.");
        }
    });

    console.log("[SCHEDULER] Reminder Job Scheduled (* * * * *).");
};
```

## 3. Backend: Notification Service (Pagination)
`src/services/notification.service.ts`

**Key Changes:**
- **Pagination**: Accepts `page` and `limit`.
- **Response**: Returns `notifications`, `totalCount`, `totalPages`, `currentPage`.

```typescript
import prisma from "../utils/prisma";

export const getNotifications = async (userId: string, page: number = 1, limit: number = 20) => {
    const skip = (page - 1) * limit;

    const [notifications, totalCount] = await prisma.$transaction([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit
        }),
        prisma.notification.count({ where: { userId } })
    ]);

    return {
        notifications,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
    };
};

export const markAsRead = async (userId: string, notificationId: string, unread: boolean = false) => {
    return prisma.notification.update({
        where: { id: notificationId, userId },
        data: { read: !unread },
    });
};
```

## 4. Backend: Notification Controller (Parsing)
`src/controllers/notification.controller.ts`

**Key Changes:**
- **Query Parsing**: Parses `page` and `limit` from query string defaults to `1` and `20`.

```typescript
import { Request, Response, NextFunction } from "express";
import * as notificationService from "../services/notification.service";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const result = await notificationService.getNotifications(userId, page, limit);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).userId;
        const { unread } = req.body; // Check if explicitly marking as unread
        const notification = await notificationService.markAsRead(userId, req.params.id as string, unread); // Pass unread status
        res.json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};
```
