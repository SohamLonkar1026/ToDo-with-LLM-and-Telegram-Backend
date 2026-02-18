# Phase 3.6 – Reminder Engine Monitoring Implementation

## 1. `backend/src/jobs/reminder.job.ts`

```typescript
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
            console.warn("[SCHEDULER] Skipping execution: Previous job still running.");
            return;
        }

        // Lock acquisition
        isJobRunning = true;
        totalRuns++;
        lastRunAt = new Date();
        const startTime = Date.now();

        try {
            console.log("[SCHEDULER] Starting reminder check...");
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
            console.log("[SCHEDULER] Job finished. Lock released.");
        }
    });

    console.log("[SCHEDULER] Reminder Job Scheduled (* * * * *).");
};
```

## 2. `backend/src/controllers/system.controller.ts`

```typescript
import { Request, Response } from "express";
import { getReminderMetrics } from "../jobs/reminder.job";

export const getReminderHealth = (req: Request, res: Response) => {
    const metrics = getReminderMetrics();
    const uptimeSeconds = process.uptime();

    const status = metrics.lastError ? "degraded" : "healthy";

    res.json({
        status,
        ...metrics,
        uptimeSeconds: Math.floor(uptimeSeconds) 
    });
};
```

## 3. `backend/src/routes/system.routes.ts`

```typescript
import { Router } from "express";
import { getReminderHealth } from "../controllers/system.controller";

const router = Router();

router.get("/reminder-health", getReminderHealth);

export default router;
```

## 4. `backend/src/server.ts`

```typescript
import app from "./app";
import env from "./config/env";
import { startReminderJob } from "./jobs/reminder.job";
import systemRoutes from "./routes/system.routes";

// Monitoring Routes
app.use("/api/system", systemRoutes);


const PORT = env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 AI-MOM API running on http://localhost:${PORT}`);
    console.log(`📋 Environment: ${env.NODE_ENV}`);

    // Start Background Jobs
    startReminderJob();
});
```
