import cron from "node-cron";
import { checkAndTriggerReminders } from "../services/reminder.service";

let isJobRunning = false;
let lastRunAt: Date | null = null;
let lastDurationMs: number | null = null;
let lastError: string | null = null;
let totalRuns = 0;

export const getReminderMetrics = () => ({
    isJobRunning,
    lastRunAt,
    lastDurationMs,
    lastError,
    totalRuns,
});

export const startReminderJob = () => {
    console.log(`[CRON INIT] Reminder Job initialized | PID: ${process.pid}`);

    // Schedule: Every minute (Robust cron syntax)
    // Schedule: Every minute (Robust cron syntax)
    // Concurrency Guard: Ensure only one instance runs at a time
    cron.schedule("* * * * *", async () => {
        console.log(`[CRON RUN] Checking reminders | PID: ${process.pid} | ${new Date().toISOString()}`);
        if (isJobRunning) return;
        isJobRunning = true;

        try {
            await checkAndTriggerReminders();
        } catch (err) {
            console.error('[REMINDER_CRON_ERROR]', err);
        } finally {
            isJobRunning = false;
        }
    });

    console.log("[SCHEDULER] Reminder Job Scheduled (* * * * *).");
};
