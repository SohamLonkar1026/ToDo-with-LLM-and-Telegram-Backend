# System Report: Task Schema and Scheduler Code

This report provides the current Task schema and the scheduler implementations used for background jobs in the AI-MOM backend.

## 1. Task Schema
File: `b:\Ai-MOM\backend\prisma\schema.prisma`

```prisma
model Task {
  id                    String             @id @default(uuid())
  title                 String
  description           String?
  dueDate               DateTime
  estimatedMinutes      Int
  priority              Priority           @default(MEDIUM)
  status                Status             @default(PENDING)
  notifyBeforeHours     Int[]              @default([])
  notifyPercentage      Int[]              @default([])
  minGapMinutes         Int                @default(58)
  userId                String
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt
  lastReminderSentAt    DateTime?
  reminderStagesSent    Json?              @default("[]")
  snoozedUntil          DateTime?
  completedAt           DateTime?
  recurringTemplateId   String?
  notifications         Notification[]
  recurringTemplate     RecurringTemplate? @relation(fields: [recurringTemplateId], references: [id])
  user                  User               @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([status, completedAt])
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

enum Status {
  PENDING
  COMPLETED
}
```

## 2. Scheduler Code

The background jobs are powered by `node-cron`.

### A. Reminder Job
File: `b:\Ai-MOM\backend\src\jobs\reminder.job.ts`
Runs every minute to check and trigger task reminders.

```typescript
import cron from "node-cron";
import { checkAndTriggerReminders } from "../services/reminder.service";

let isJobRunning = false;

export const startReminderJob = () => {
    console.log(`[CRON INIT] Reminder Job initialized | PID: ${process.pid}`);

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
```

### B. Cleanup Job
File: `b:\Ai-MOM\backend\src\jobs\cleanup.job.ts`
Runs every hour to delete completed tasks older than 24 hours.

```typescript
import cron from "node-cron";
import prisma from "../utils/prisma";

export const startCleanupJob = () => {
    console.log(`[CRON INIT] Cleanup Job initialized | PID: ${process.pid}`);

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
```
