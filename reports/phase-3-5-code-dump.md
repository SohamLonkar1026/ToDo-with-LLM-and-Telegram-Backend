# Phase 3.5 Code Dump

## `prisma/schema.prisma`
```prisma
// ...
model User {
  // ...
  notifications Notification[]
}

model Task {
  // ...
  notifications Notification[]
}

enum NotificationType {
  REMINDER
  OVERDUE
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  taskId    String
  type      NotificationType
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

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
            if (currentTime > task.dueDate) {
                if (!task.lastReminderSentAt || task.lastReminderSentAt < task.dueDate) {
                    console.log(`Overdue: Task "${task.title}" is overdue`);
                    
                    await prisma.task.update({
                        where: { id: task.id },
                        data: { lastReminderSentAt: currentTime }
                    });

                    // Persist Notification
                    await prisma.notification.create({
                        data: {
                            userId: task.userId,
                            taskId: task.id,
                            type: "OVERDUE",
                            message: `Overdue: Task "${task.title}" is overdue!`
                        }
                    });
                }
            } 
            // 2. Due Soon Check
            else if (currentTime >= reminderTime) {
                if (!task.lastReminderSentAt) {
                    console.log(`Reminder: Task "${task.title}" is due at ${task.dueDate}`);
                    
                    await prisma.task.update({
                        where: { id: task.id },
                        data: { lastReminderSentAt: currentTime }
                    });

                    // Persist Notification
                    await prisma.notification.create({
                        data: {
                            userId: task.userId,
                            taskId: task.id,
                            type: "REMINDER",
                            message: `Reminder: Task "${task.title}" is due at ${task.dueDate.toLocaleString()}`
                        }
                    });
                }
            }
        }
    } catch (error) {
        console.error("Error in reminder service:", error);
    }
};
```

## `src/routes/notification.routes.ts`
```typescript
import { Router } from "express";
import { authMiddleware as authenticate } from "../middleware/auth.middleware";
import * as notificationController from "../controllers/notification.controller";

const router = Router();

router.get("/", authenticate, notificationController.getNotifications);
router.put("/:id/read", authenticate, notificationController.markAsRead);

export default router;
```

## `src/controllers/notification.controller.ts`
```typescript
import { Request, Response, NextFunction } from "express";
import * as notificationService from "../services/notification.service";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).userId;
        const notifications = await notificationService.getNotifications(userId);
        res.json({ success: true, data: notifications });
    } catch (error) {
        next(error);
    }
};
// ... markAsRead
```
