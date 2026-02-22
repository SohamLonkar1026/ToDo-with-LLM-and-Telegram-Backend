import cron from "node-cron";
import prisma from "../utils/prisma";

export const startCleanupJob = () => {
    console.log(`[CRON INIT] Cleanup Job initialized | PID: ${process.pid}`);

    // Schedule: Every hour at minute 0 (0 * * * *)
    cron.schedule("0 * * * *", async () => {
        console.log(`[CRON RUN] Cleaning up completed tasks | PID: ${process.pid} | ${new Date().toISOString()}`);

        try {
            const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const result = await prisma.task.deleteMany({
                where: {
                    status: "COMPLETED",
                    completedAt: {
                        lte: threshold,
                        not: null
                    }
                }
            });

            console.log(`[CleanupJob] Deleted ${result.count} completed tasks`);
        } catch (err) {
            console.error('[CLEANUP_CRON_ERROR] Failed to delete completed tasks:', err);
        }
    });

    console.log("[SCHEDULER] Cleanup Job Scheduled (0 * * * *).");
};
