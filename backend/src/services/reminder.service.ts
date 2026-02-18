import { NotificationType, Task } from "@prisma/client";
import prisma from "../utils/prisma";
import * as telegramService from "./telegram.service";

// 2️⃣ Reminder Stage Configuration
const REMINDER_STAGES = [
    { key: "12h", offsetMs: 12 * 60 * 60 * 1000 },
    { key: "6h", offsetMs: 6 * 60 * 60 * 1000 },
    { key: "3h", offsetMs: 3 * 60 * 60 * 1000 },
    { key: "1h", offsetMs: 1 * 60 * 60 * 1000 }
];

// Tolerance window to prevent spam after downtime
const TOLERANCE_MS = 2 * 60 * 1000; // 2 minutes

export const checkAndTriggerReminders = async () => {
    const currentTime = new Date();
    // Use ISO string for logs
    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] Check started at ${currentTime.toISOString()}`);

    try {
        // ------------------------------------------------------------------
        // QUERY: FETCH CANDIDATE TASKS
        // ------------------------------------------------------------------
        // We fetch ALL pending tasks that might need attention.
        // Filtering happens in memory for complex stage logic.
        // We optimize by filtering out tasks clearly in the far future,
        // but since we have 12h reminders, we need tasks at least 12h away.
        // Actually, fetching all PENDING tasks is safest for now unless volume is huge.
        // Given earlier "5000 tasks" warning, let's try to be slightly specific if possible,
        // but 'reminderStagesSent' logic is hard to query purely in SQL without complex JSON ops.
        // So we fetch PENDING tasks.
        const tasks = await prisma.task.findMany({
            where: {
                status: "PENDING"
            }
        });

        if (tasks.length > 5000) {
            console.warn(`[REMINDER_ENGINE][SAFETY_WARNING] Large task batch detected: ${tasks.length} tasks.`);
        }

        if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] Processing ${tasks.length} pending tasks...`);

        // ------------------------------------------------------------------
        // EXECUTION LOOP
        // ------------------------------------------------------------------
        for (const task of tasks) {
            let notificationType: NotificationType | null = null;
            let message = "";
            let updateData: any = {};
            let stageKeyToAppend: string | null = null;

            // 🛡️ Guard 1 (Snooze Override)
            // If snoozedUntil > now, SKIP stage evaluation completely.
            // But we must check if snooze is EXPIRED.
            if (task.snoozedUntil) {
                if (task.snoozedUntil > currentTime) {
                    continue; // Task is strictly snoozed, ignore.
                }

                // Snooze Expired? Trigger Snooze Wakeup
                if (task.snoozedUntil <= currentTime) {
                    notificationType = currentTime > task.dueDate ? NotificationType.OVERDUE : NotificationType.REMINDER;
                    const prefix = notificationType === NotificationType.OVERDUE ? "Snoozed Overdue" : "Snoozed Reminder";
                    message = `${prefix}: Task "${task.title}" is ready!`;
                    updateData = { snoozedUntil: null, lastReminderSentAt: currentTime };
                    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [SNOOZE_WAKEUP] Task ${task.id}`);
                }
            }
            // 🛡️ Multi-Stage Logic (Only if NOT snoozed/wakeup-handled)
            else if (task.dueDate > currentTime) {
                // Normalize reminderStagesSent
                const sentStages: string[] = Array.isArray(task.reminderStagesSent)
                    ? (task.reminderStagesSent as string[])
                    : [];

                // Loop Stages
                for (const stage of REMINDER_STAGES) {
                    const stageTime = new Date(task.dueDate.getTime() - stage.offsetMs);

                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[DEBUG_SCHEDULER] Task ${task.id} Due: ${task.dueDate.toISOString()}`);
                        console.log(`[DEBUG_SCHEDULER] Stage ${stage.key} Time: ${stageTime.toISOString()}`);
                        console.log(`[DEBUG_SCHEDULER] Now: ${currentTime.toISOString()}`);
                    }

                    // 🛡️ Guard 2 (CreatedAt): No retroactive reminders
                    if (stageTime < task.createdAt) continue;

                    // 🛡️ Guard 3 (Tolerance): No spam after downtime
                    // Allow trigger if stageTime is within the last 2 minutes
                    // condition: stageTime <= now AND stageTime >= now - tolerance
                    const timeDiff = currentTime.getTime() - stageTime.getTime();
                    const isDue = stageTime <= currentTime;
                    const isWithinTolerance = timeDiff <= TOLERANCE_MS;

                    if (isDue && isWithinTolerance) {
                        // Check if already sent
                        if (!sentStages.includes(stage.key)) {
                            // TRIGGER!
                            notificationType = NotificationType.REMINDER;
                            message = `Reminder: Task "${task.title}" is due in ${stage.key}`;
                            stageKeyToAppend = stage.key;
                            updateData = {
                                lastReminderSentAt: currentTime,
                                reminderStagesSent: [...sentStages, stage.key]
                            };
                            if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [STAGE_${stage.key}] Task ${task.id}`);

                            // 🛡️ Guard 4 (Break): Only one reminder per tick
                            break;
                        }
                    }
                }
            }
            // 🛡️ Overdue Logic (Separate)
            else if (currentTime > task.dueDate) {
                // Condition: Overdue Not Already Sent
                // usage of lastReminderSentAt for overdue tracking
                // If lastReminderSentAt is null OR it was sent BEFORE due date, then we haven't sent OVERDUE yet.
                const neverReminded = !task.lastReminderSentAt;
                const remindedBeforeDue = task.lastReminderSentAt && task.lastReminderSentAt < task.dueDate;

                if (neverReminded || remindedBeforeDue) {
                    notificationType = NotificationType.OVERDUE;
                    message = `Overdue: Task "${task.title}" is overdue!`;
                    updateData = { lastReminderSentAt: currentTime };
                    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [OVERDUE] Task ${task.id}`);
                }
            }

            // ------------------------------------------------------------------
            // TRANSACTION ALREADY
            // ------------------------------------------------------------------
            if (notificationType && message) {
                try {
                    await prisma.$transaction([
                        prisma.task.update({ where: { id: task.id }, data: updateData }),
                        prisma.notification.create({
                            data: {
                                userId: task.userId,
                                taskId: task.id,
                                type: notificationType,
                                message: message
                            }
                        })
                    ]);
                    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [SUCCESS] Notification sent for Task ${task.id}`);

                    // Telegram Notification (Fire & Forget, but logged)
                    try {
                        const user = await prisma.user.findUnique({
                            where: { id: task.userId },
                            select: { id: true, telegramChatId: true, email: true, password: true, createdAt: true, updatedAt: true }
                        });

                        if (user && user.telegramChatId) {
                            await telegramService.sendReminderNotification(task, user as any);
                        }
                    } catch (err) {
                        console.error("[REMINDER_ENGINE] [TELEGRAM_FAIL]", err);
                    }

                } catch (txError) {
                    console.error(`[REMINDER_ENGINE] [TX_FAIL] Task ${task.id}`, txError);
                }
            }
        }

    } catch (error) {
        console.error("[REMINDER_ENGINE] [CRITICAL_FAIL] Engine aborted", error);
    }
};
