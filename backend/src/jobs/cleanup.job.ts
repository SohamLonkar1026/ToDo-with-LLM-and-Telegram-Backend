import cron from "node-cron";
import * as taskRepository from "../repositories/task.repository";

export const startCleanupJob = () => {
    console.log(`[CRON INIT] Cleanup Job initialized | PID: ${process.pid}`);

    // Schedule: Every hour at minute 0 (0 * * * *)
    cron.schedule("0 * * * *", async () => {
        console.log(`[CRON RUN] Cleaning up completed tasks | PID: ${process.pid} | ${new Date().toISOString()}`);

        try {
            const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const deletedCount = await taskRepository.deleteManyCompletedBefore(threshold);

            console.log(`[CleanupJob] Deleted ${deletedCount} completed tasks`);
        } catch (err) {
            console.error('[CLEANUP_CRON_ERROR] Failed to delete completed tasks:', err);
        }
    });

    console.log("[SCHEDULER] Cleanup Job Scheduled (0 * * * *).");
};
