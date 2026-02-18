# Phase 3 Code Dump

## `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
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

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tasks     Task[]
}

model Task {
  id                    String   @id @default(uuid())
  title                 String
  description           String?
  dueDate               DateTime
  estimatedMinutes      Int
  priority              Priority @default(MEDIUM)
  status                Status   @default(PENDING)
  reminderOffsetMinutes Int      @default(60)
  lastReminderSentAt    DateTime?
  userId                String
  user                  User     @relation(fields: [userId], references: [id])
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([userId])
}
```

## `src/services/reminder.service.ts`
```typescript
import prisma from "../utils/prisma";

export const checkAndTriggerReminders = async () => {
    const currentTime = new Date();

    try {
        const tasks = await prisma.task.findMany({
            where: {
                status: "PENDING"
            }
        });

        for (const task of tasks) {
            const reminderTime = new Date(task.dueDate.getTime() - task.reminderOffsetMinutes * 60000);

            // 1. Overdue Check
            // Trigger if current time > due date
            // AND (never reminded OR reminded before it was overdue - i.e., the "Due Soon" reminder)
            if (currentTime > task.dueDate) {
                if (!task.lastReminderSentAt || task.lastReminderSentAt < task.dueDate) {
                    console.log(`Overdue: Task "${task.title}" is overdue`);
                    
                    await prisma.task.update({
                        where: { id: task.id },
                        data: { lastReminderSentAt: currentTime }
                    });
                }
            } 
            // 2. Due Soon Check
            // Trigger if current time >= reminder time
            // AND never reminded
            else if (currentTime >= reminderTime) {
                if (!task.lastReminderSentAt) {
                    console.log(`Reminder: Task "${task.title}" is due at ${task.dueDate}`);
                    
                    await prisma.task.update({
                        where: { id: task.id },
                        data: { lastReminderSentAt: currentTime }
                    });
                }
            }
        }
    } catch (error) {
        console.error("Error in reminder service:", error);
    }
};
```

## `src/jobs/reminder.job.ts`
```typescript
import { checkAndTriggerReminders } from "../services/reminder.service";

export const startReminderJob = () => {
    // Run immediately on start
    console.log("Reminder engine running...");
    checkAndTriggerReminders();

    // Run every 60 seconds (60,000 ms)
    setInterval(() => {
        console.log("Reminder engine running...");
        checkAndTriggerReminders();
    }, 60000);
};
```

## `src/server.ts`
```typescript
import app from "./app";
import env from "./config/env";
import { startReminderJob } from "./jobs/reminder.job";

const PORT = env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 AI-MOM API running on http://localhost:${PORT}`);
    console.log(`📋 Environment: ${env.NODE_ENV}`);

    // Start Background Jobs
    startReminderJob();
});
```
