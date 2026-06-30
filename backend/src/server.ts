console.log("🚀 IST DEPLOY CHECK");

import app from "./app";
import env from "./config/env";
import db from "./utils/firestore";
import { startReminderJob } from "./jobs/reminder.job";
import { startCleanupJob } from "./jobs/cleanup.job";
import systemRoutes from "./routes/system.routes";

// Monitoring Routes
app.use("/api/system", systemRoutes);


const PORT = env.PORT;

async function startServer() {
    try {
        // 1. Verify Firestore connectivity
        await db.listCollections();
        if (env.NODE_ENV !== 'production') {
            console.log("✅ [BOOT] Firestore connected");
        }

        // 2. Initialize Scheduler (Once)
        startReminderJob();
        startCleanupJob();
        console.log("[BOOT] Reminder & Cleanup schedulers initialized");

        // 3. Start Server
        console.log("PORT ENV:", process.env.PORT, "| Resolved PORT:", PORT);
        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`[BOOT] Server started | PID: ${process.pid}`);
            console.log(`🚀 AI-MOM API running on http://localhost:${PORT}`);
            console.log(`📋 Environment: ${env.NODE_ENV}`);
        });

        // Hardening: Prevent hanging connections
        server.setTimeout(30000);

        // Graceful Shutdown
        process.on('SIGTERM', async () => {
            console.log('[SHUTDOWN] Closing server...');
            server.close(async () => {
                await db.terminate();
                console.log('[SHUTDOWN] Server closed');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error("❌ [BOOT FAILURE]", error);
        process.exit(1);
    }
}

startServer();
