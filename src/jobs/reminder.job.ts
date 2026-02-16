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
    console.log("[SCHEDULER] Initializing Reminder Job...");

    // Schedule: Every minute (Robust cron syntax)
    // Concurrency Guard: Ensure only one instance runs at a time
    cron.schedule("* * * * *", async () => {
        if (isJobRunning) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn("[SCHEDULER] Skipping execution: Previous job still running.");
            }
            return;
        }

        // Lock acquisition
        isJobRunning = true;
        totalRuns++;
        lastRunAt = new Date();
        const startTime = Date.now();

        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log("[SCHEDULER] Starting reminder check...");
            }
            await checkAndTriggerReminders();
            // Success: Clear any previous error
            lastError = null;
        } catch (error: any) {
            console.error("[SCHEDULER] Error during execution:", error);
            // Failure: Capture error message
            lastError = error instanceof Error ? error.message : String(error);
        } finally {
            // Calculate duration regardless of success/failure
            lastDurationMs = Date.now() - startTime;
            isJobRunning = false;
            // Only log lock release in dev, it's spammy
            if (process.env.NODE_ENV !== 'production') {
                console.log("[SCHEDULER] Job finished. Lock released.");
            }
        }
    });

    console.log("[SCHEDULER] Reminder Job Scheduled (* * * * *).");
};
