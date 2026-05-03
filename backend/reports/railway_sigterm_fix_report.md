# Railway Container SIGTERM Fix Report
**Date:** 2026-02-22
**Scope:** Diagnose and fix Railway container being SIGTERM'd after boot — stale Prisma Client, missing root health check, and debug script cleanup

---

## Summary of Changes

The Railway production container was booting successfully but immediately receiving SIGTERM, causing a restart loop. Three root causes were identified and fixed across 4 commits:

1. **Stale debug scripts** referencing the removed `reminderOffsetMinutes` column were being compiled by `tsc` into `dist/`
2. **No `prisma generate`** in the build script — the Prisma Client was never regenerated from the latest schema on Railway
3. **No root `/` route** — Railway's default health check hits `/` which returned 404, marking the service unhealthy

---

## Git Commit History

| Commit | Message | Fix |
|---|---|---|
| `092b4ea` | `fix: remove stale debug scripts referencing reminderOffsetMinutes` | Deleted 20 junk files |
| `f153c15` | `fix: add prisma generate to build script` | Build now generates fresh Prisma Client |
| `9627152` | `diag: add PORT debug log to server.ts boot` | Diagnostic logging |
| `3384ddd` | `fix: add root / health check route for Railway` | Railway health check passes |

---

## Per-File Breakdown

---

### 1. `package.json`

**What changed:** Build script updated to include `prisma generate` before `tsc`.

**Why:** Without `prisma generate`, Railway installed `@prisma/client` from npm but never generated the actual client code from `prisma/schema.prisma`. The compiled `dist/` used a stale Prisma Client that didn't know about telegram fields, notification fields, or user default settings.

**Diff:**
```diff
-    "build": "tsc",
+    "build": "prisma generate && tsc",
```

**Full updated file:**
```json
{
  "name": "ai-mom-backend",
  "version": "1.0.0",
  "description": "AI-MOM Backend API — Phase 1",
  "main": "dist/server.js",
  "scripts": {
    "build": "prisma generate && tsc",
    "dev": "nodemon --exec ts-node src/server.ts",
    "start": "node dist/server.js",
    "prisma:migrate": "npx prisma migrate dev",
    "prisma:generate": "npx prisma generate",
    "prisma:studio": "npx prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^6.3.1",
    "axios": "^1.13.5",
    "bcrypt": "^5.1.1",
    "chrono-node": "^2.9.0",
    "cors": "^2.8.6",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.2.0",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "helmet": "^8.1.0",
    "jsonwebtoken": "^9.0.2",
    "node-cron": "^4.2.1",
    "openai": "^6.22.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.0",
    "@types/helmet": "^0.0.48",
    "@types/jsonwebtoken": "^9.0.8",
    "@types/node": "^22.13.1",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.16.0",
    "nodemon": "^3.1.9",
    "pg": "^8.18.0",
    "prisma": "^6.3.1",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.3"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```

---

### 2. `src/app.ts`

**What changed:** Added `GET /` root route returning `200 OK`.

**Why:** Railway's default health check hits the root path `/`. Without this route, the server returned 404 on `/`, Railway marked the service unhealthy after 3 failed checks, and sent SIGTERM to restart.

**Diff:**
```diff
 // Routes
 // ----------------------------------------------------------------------

+// Root health check (Railway default)
+app.get("/", (_req, res) => {
+    res.status(200).send("OK");
+});
+
 // Health check
 app.get("/api/health", (_req, res) => {
     res.json({ success: true, message: "AI-MOM API is running." });
 });
```

**Full updated file:**
```typescript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import recurringRoutes from "./routes/recurring.routes";
import notificationRoutes from "./routes/notification.routes";
import telegramRoutes from "./routes/telegram.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import env from "./config/env";
import { telegramWebhook } from "./controllers/telegram.controller";
import aiRoutes from "./routes/ai.routes";
import settingsRoutes from "./routes/settings.routes";

const app = express();

console.log("🔥 DEPLOY VERSION: CORS FIX ACTIVE 🔥");

// ----------------------------------------------------------------------
// 🚨 CRITICAL: CORS MUST BE THE FIRST MIDDLEWARE
// ----------------------------------------------------------------------
app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://aimom-black.vercel.app"
        ],
        credentials: true
    })
);

// Explicit Preflight Handling
app.options("*", cors());

// ----------------------------------------------------------------------
// Security & Body Parsing
// ----------------------------------------------------------------------
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Request Logger (Dev only)
if (env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[HTTP] ${req.method} ${req.url}`);
        next();
    });
}

// ----------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------

// Root health check (Railway default)
app.get("/", (_req, res) => {
    res.status(200).send("OK");
});

// Health check
app.get("/api/health", (_req, res) => {
    res.json({ success: true, message: "AI-MOM API is running." });
});

// Webhook
app.post("/api/telegram/webhook", telegramWebhook);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/settings", settingsRoutes);

// Centralized error handler
app.use(errorMiddleware);

export default app;
```

---

### 3. `src/server.ts`

**What changed:** Added `PORT ENV` debug log before `app.listen()`.

**Why:** Diagnostic — to verify in Railway logs that `process.env.PORT` is correctly injected and resolved.

**Diff:**
```diff
         // 3. Start Server
+        console.log("PORT ENV:", process.env.PORT, "| Resolved PORT:", PORT);
         const server = app.listen(PORT, "0.0.0.0", () => {
```

**Full updated file:**
```typescript
console.log("🚀 IST DEPLOY CHECK");

import app from "./app";
import env from "./config/env";
import prisma from "./utils/prisma";
import { startReminderJob } from "./jobs/reminder.job";
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
        console.log('[PRISMA_SINGLETON_ACTIVE]');

        // 2. Initialize Scheduler (Once)
        startReminderJob();
        console.log("[BOOT] Reminder scheduler initialized");

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
```

---

### 4. Deleted Files (20 total)

**Why:** Stale debug/test scripts and log files that were cluttering the repo. Three of them (`reproduce_task_failure.js`, `verify_prod.js`, `verify_reminder_stages.ts`) contained references to the removed `reminderOffsetMinutes` column.

| # | File | Reason |
|---|---|---|
| 1 | `reproduce_task_failure.js` | ⚠️ References `reminderOffsetMinutes` |
| 2 | `verify_prod.js` | ⚠️ References `reminderOffsetMinutes` |
| 3 | `verify_reminder_stages.ts` | ⚠️ References `reminderOffsetMinutes` |
| 4 | `reproduce_telegram_auth.js` | Debug script |
| 5 | `verify_db_constraints.js` | Debug script |
| 6 | `verify_db_constraints.ts` | Debug script |
| 7 | `verify_user_columns.js` | Debug script |
| 8 | `verify_telegram_e2e.ts` | Debug script |
| 9 | `test-db.ts` | Debug script |
| 10 | `hard_reset_schema.ts` | Debug script |
| 11 | `reset_db.ts` | Debug script |
| 12 | `cleanup_telegram_duplicates.ts` | Debug script |
| 13 | `audit_results.json` | Debug output |
| 14 | `build_error.log` | Build artifact |
| 15 | `build_log.txt` | Build artifact |
| 16 | `check_build.bat` | Debug batch file |
| 17 | `e2e_output.txt` | Test output |
| 18 | `mig_log.txt` | Migration log |
| 19 | `test_output.txt` | Test output |
| 20 | `tsc_error.log` | Build artifact |

---

## Verification

| Check | Result |
|---|---|
| `GET /` (production URL) | ✅ Returns `"OK"` with 200 |
| `GET /api/health` (production URL) | ✅ Returns `{"success":true,"message":"AI-MOM API is running."}` |
| `git grep reminderOffsetMinutes -- "*.ts" "*.js"` | ✅ Zero matches |
| Build script includes `prisma generate` | ✅ `"build": "prisma generate && tsc"` |
| Server binds on `0.0.0.0` | ✅ `app.listen(PORT, "0.0.0.0")` |
| Port sourced from `process.env.PORT` | ✅ Fallback `4000` |
| PORT debug log added | ✅ `console.log("PORT ENV:", ...)` |

---

## Root Cause Analysis

```
┌─────────────────────────────────────────────────┐
│            SIGTERM Restart Loop                 │
│                                                 │
│  1. Railway deploys container                   │
│  2. npm run build → tsc (no prisma generate)    │
│  3. dist/ has stale Prisma Client               │
│  4. Server boots → prisma.$connect() → OK       │
│  5. Railway health check hits / → 404           │
│  6. Health check fails 3 times                  │
│  7. Railway sends SIGTERM → container restarts   │
│  8. Meanwhile, cron fires with stale client     │
│  9. Prisma queries fail (unknown fields)        │
│  10. Loop repeats                               │
└─────────────────────────────────────────────────┘

Fix applied:
  ✅ prisma generate && tsc → fresh Prisma Client
  ✅ GET / → 200 OK → health check passes
  ✅ Stale scripts deleted → clean tsc output
```
