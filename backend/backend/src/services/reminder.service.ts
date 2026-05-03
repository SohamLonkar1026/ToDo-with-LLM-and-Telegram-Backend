import { NotificationType, Task } from "@prisma/client";
import prisma from "../utils/prisma";
import * as telegramService from "./telegram.service";

// 2️⃣ Cron Execution Contract
const TOLERANCE_WINDOW_MS = 60 * 1000; // 60 seconds

type Stage = {
    label: string;
    triggerTime: Date;
};

export const checkAndTriggerReminders = async () => {
    const now = new Date();
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[REMINDER_ENGINE] Check started at ${now.toISOString()}`);
    }

    try {
        // 3️⃣ Task Eligibility Rules
        const tasks = await prisma.task.findMany({
            where: {
                status: "PENDING",
                OR: [
                    { snoozedUntil: null },
                    { snoozedUntil: { lte: now } }
                ]
            }
        });

        if (tasks.length > 5000) {
            console.warn(`[REMINDER_ENGINE][SAFETY_WARNING] Large task batch detected: ${tasks.length} tasks.`);
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[REMINDER_ENGINE] Processing ${tasks.length} eligible tasks...`);
        }

        // ------------------------------------------------------------------
        // EXECUTION LOOP
        // ------------------------------------------------------------------
        for (const task of tasks) {
            // 4️⃣ Stage Generation Logic
            const start = task.createdAt;
            const due = task.dueDate;
            const duration = due.getTime() - start.getTime();

            if (duration <= 0) {
                continue; // Skip invalid tasks
            }

            // 3️⃣ Add Empty Reminder Short-Circuit (Performance Optimization)
            if (
                (!task.notifyBeforeHours || (task.notifyBeforeHours as number[]).length === 0) &&
                (!task.notifyPercentage || (task.notifyPercentage as number[]).length === 0)
            ) {
                continue;
            }

            // 7️⃣ Native String[] — no JSON cast needed (cast removed after prisma generate)
            const sentStages: string[] = (task.reminderStagesSent as unknown as string[]) ?? [];

            // Generate candidate stages
            const stages: Stage[] = [];

            // Time-Based Stages
            if (task.notifyBeforeHours && Array.isArray(task.notifyBeforeHours)) {
                for (const hour of task.notifyBeforeHours) {
                    const triggerTime = new Date(due.getTime() - hour * 60 * 60 * 1000);

                    // Discard if triggerTime <= start
                    if (triggerTime.getTime() <= start.getTime()) {
                        continue;
                    }

                    stages.push({
                        label: `before_${hour}h`,
                        triggerTime
                    });
                }
            }

            // Percentage-Based Stages
            if (task.notifyPercentage && Array.isArray(task.notifyPercentage)) {
                for (const percentage of task.notifyPercentage) {
                    const triggerTime = new Date(start.getTime() + (percentage / 100) * duration);

                    // Discard if triggerTime >= due
                    if (triggerTime.getTime() >= due.getTime()) {
                        continue;
                    }

                    stages.push({
                        label: `percent_${percentage}`,
                        triggerTime
                    });
                }
            }

            // 6️⃣ Stage Sorting (MANDATORY)
            stages.sort((a, b) => a.triggerTime.getTime() - b.triggerTime.getTime());

            // 8️⃣ Eligibility Filtering & 9️⃣ Anti-Flood Protection
            let stageSent = false;

            for (const stage of stages) {
                // 8️⃣ Eligibility Filtering
                const isEligibleTime = stage.triggerTime.getTime() <= now.getTime() &&
                    stage.triggerTime.getTime() > now.getTime() - TOLERANCE_WINDOW_MS;
                const notAlreadySent = !sentStages.includes(stage.label);

                if (!isEligibleTime || !notAlreadySent) {
                    continue;
                }

                // 9️⃣ Anti-Flood Protection (Strict Rule)
                if (task.lastReminderSentAt) {
                    const gapMs = now.getTime() - task.lastReminderSentAt.getTime();
                    const minGapMs = (task.minGapMinutes || 58) * 60 * 1000;

                    if (gapMs < minGapMs) {
                        if (process.env.NODE_ENV !== 'production') {
                            console.log(`[ANTI_FLOOD] Task ${task.id} blocked: gap ${gapMs}ms < minGap ${minGapMs}ms`);
                        }
                        break; // STOP processing this task
                    }
                }

                // Send notification
                const message = `Reminder: Task "${task.title}" - ${stage.label}`;

                try {
                    await prisma.$transaction([
                        prisma.task.update({
                            where: { id: task.id },
                            data: {
                                lastReminderSentAt: now,
                                reminderStagesSent: {
                                    push: stage.label
                                }
                            }
                        }),
                        prisma.notification.create({
                            data: {
                                userId: task.userId,
                                taskId: task.id,
                                type: NotificationType.REMINDER,
                                message: message
                            }
                        })
                    ]);

                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[REMINDER_ENGINE] [STAGE_${stage.label}] Task ${task.id} sent successfully`);
                    }

                    // Telegram Notification (Fire & Forget)
                    try {
                        const user = await prisma.user.findUnique({
                            where: { id: task.userId },
                            select: { id: true, telegramChatId: true }
                        });

                        if (user && user.telegramChatId) {
                            await telegramService.sendReminderNotification(task, user as any);
                            console.log(`[TELEGRAM] Task ${task.id} notification sent`);
                        }
                    } catch (telegramError) {
                        console.error(`[TELEGRAM_FAIL] Task ${task.id}`, telegramError);
                    }

                    stageSent = true;
                    break; // 🔟 One Stage Per Task Per Cron Cycle

                } catch (txError) {
                    console.error(`[REMINDER_ENGINE] [TX_FAIL] Task ${task.id}`, txError);
                    break;
                }
            }

            // Handle overdue tasks (separate logic)
            // 🔒 DB-level atomic guard: only one cron cycle wins the race.
            // updateMany with NOT { has: "overdue" } means the WHERE clause
            // is evaluated inside a row-locked transaction — if another cycle
            // already appended "overdue", this returns count=0 and we skip.
            const overdueLabel = "overdue";

            if (!stageSent && now > due) {
                try {
                    const claimed = await prisma.task.updateMany({
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        where: {
                            id: task.id,
                            NOT: {
                                reminderStagesSent: { has: overdueLabel }
                            }
                        } as any,
                        data: {
                            lastReminderSentAt: now,
                            reminderStagesSent: { push: overdueLabel }
                        }
                    });

                    // claimed.count === 0 means another cron cycle already sent it
                    if (claimed.count === 0) {
                        continue;
                    }

                    await prisma.notification.create({
                        data: {
                            userId: task.userId,
                            taskId: task.id,
                            type: NotificationType.OVERDUE,
                            message: `Overdue: Task "${task.title}" is overdue!`
                        }
                    });

                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[REMINDER_ENGINE] [OVERDUE] Task ${task.id} sent successfully`);
                    }

                    // Telegram for overdue (fire & forget)
                    try {
                        const user = await prisma.user.findUnique({
                            where: { id: task.userId },
                            select: { id: true, telegramChatId: true }
                        });

                        if (user && user.telegramChatId) {
                            await telegramService.sendReminderNotification(task, user as any);
                            console.log(`[TELEGRAM] Overdue Task ${task.id} notification sent`);
                        }
                    } catch (telegramError) {
                        console.error(`[TELEGRAM_FAIL] Overdue Task ${task.id}`, telegramError);
                    }

                } catch (txError) {
                    console.error(`[REMINDER_ENGINE] [OVERDUE_TX_FAIL] Task ${task.id}`, txError);
                }
            }
        }

    } catch (error) {
        console.error("[REMINDER_ENGINE] [CRITICAL_FAIL] Engine aborted", error);
    }
};
