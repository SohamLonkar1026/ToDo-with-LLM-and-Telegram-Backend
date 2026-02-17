import app from "./app";
import env from "./config/env";
import prisma from "./utils/prisma";
import { startReminderJob } from "./jobs/reminder.job";
import { initializeTelegramPoller, stopTelegramPoller } from "./services/telegram.poller";
import systemRoutes from "./routes/system.routes";

// Monitoring Routes
app.use("/api/system", systemRoutes);


const PORT = env.PORT;

async function startServer() {
    try {
        // 1. Connect to Database
        await prisma.$connect();
        if (env.NODE_ENV !== 'production') {
            console.log("✅ [BOOT] Database connected");
        }

        // 2. Initialize Scheduler (Once)
        startReminderJob();
        console.log("[BOOT] Reminder scheduler initialized");

        // 3. Start Server
        const server = app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 AI-MOM API running on http://localhost:${PORT}`);
            console.log(`📋 Environment: ${env.NODE_ENV}`);
        });

        // Hardening: Prevent hanging connections
        server.setTimeout(30000);

        // 4. Initialize Telegram Poller
        // initializeTelegramPoller();

        // Graceful Shutdown
        process.on('SIGTERM', async () => {
            console.log('[SHUTDOWN] Closing server...');
            // stopTelegramPoller();
            server.close(async () => {
                await prisma.$disconnect();
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
