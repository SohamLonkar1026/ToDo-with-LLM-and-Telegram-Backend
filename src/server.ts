console.log("🚀 IST DEPLOY CHECK");

import app from "./app";
import env from "./config/env";
import prisma from "./utils/prisma";
import { startReminderJob } from "./jobs/reminder.job";
import systemRoutes from "./routes/system.routes";
import axios from "axios";

// ─── TEMPORARY: Model Discovery (REMOVE AFTER IDENTIFYING CORRECT MODEL) ────
async function listGeminiModels() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) { console.log("[MODEL_DISCOVERY] No GEMINI_API_KEY set"); return; }

        let allModels: any[] = [];
        let pageToken = "";
        let page = 0;

        // Paginate through all models
        do {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
            const res = await axios.get(url);
            const models = res.data.models || [];
            allModels = allModels.concat(models);
            pageToken = res.data.nextPageToken || "";
            page++;
        } while (pageToken);

        console.log(`[MODEL_DISCOVERY] Total models found: ${allModels.length} (${page} pages)`);

        // Filter and show only models supporting generateContent
        const gcModels = allModels.filter((m: any) =>
            m.supportedGenerationMethods?.includes("generateContent")
        );

        console.log(`[MODEL_DISCOVERY] Models supporting generateContent (${gcModels.length}):`);
        for (const m of gcModels) {
            const methods = m.supportedGenerationMethods?.join(", ") || "none";
            console.log(`  ✅ ${m.name} | methods: ${methods}`);
        }
    } catch (err: any) {
        console.error("[MODEL_DISCOVERY] Failed:", err?.response?.data || err.message);
    }
}
listGeminiModels();

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
        console.log('[PRISMA_SINGLETON_ACTIVE]');

        // 2. Initialize Scheduler (Once)
        startReminderJob();
        console.log("[BOOT] Reminder scheduler initialized");

        // 3. Start Server
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
