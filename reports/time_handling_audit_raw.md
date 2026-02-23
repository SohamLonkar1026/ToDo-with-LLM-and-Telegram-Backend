# Time Handling Audit: Codebase Dump

This report contains the full, untruncated source code for all components involved in date/time handling across the stack.

## 1. Backend: Data Layer
### Schema (`backend/prisma/schema.prisma`)
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                    String              @id @default(cuid())
  email                 String              @unique
  password              String
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt
  notifications         Notification[]
  recurringTemplates    RecurringTemplate[]
  tasks                 Task[]
  telegramChatId        String?             @unique
  telegramLinkCode      String?             @unique
  telegramLinkExpiresAt DateTime?
}

model Task {
  id                    String             @id @default(uuid())
  title                 String
  description           String?
  dueDate               DateTime
  estimatedMinutes      Int
  priority              Priority           @default(MEDIUM)
  status                Status             @default(PENDING)
  reminderOffsetMinutes Int                @default(60)
  userId                String
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt
  lastReminderSentAt    DateTime?
  reminderStagesSent    Json?              @default("[]")
  snoozedUntil          DateTime?
  recurringTemplateId   String?
  notifications         Notification[]
  recurringTemplate     RecurringTemplate? @relation(fields: [recurringTemplateId], references: [id])
  user                  User               @relation(fields: [userId], references: [id])

  @@index([userId])
}

model RecurringTemplate {
  id               String         @id @default(uuid())
  userId           String
  title            String
  estimatedMinutes Int?
  recurrenceType   RecurrenceType
  active           Boolean        @default(true)
  createdAt        DateTime       @default(now())
  user             User           @relation(fields: [userId], references: [id])
  tasks            Task[]
}

model Notification {
  id        String           @id @default(uuid())
  userId    String
  taskId    String
  message   String
  read      Boolean          @default(false)
  createdAt DateTime         @default(now())
  type      NotificationType
  task      Task             @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user      User             @relation(fields: [userId], references: [id])

  @@index([userId])
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

enum NotificationType {
  REMINDER
  OVERDUE
}

enum RecurrenceType {
  DAILY
  MONTHLY
  YEARLY
}

model ConversationSession {
  id                     String    @id @default(cuid())
  telegramChatId         String?   @unique
  telegramLinkCode       String?   @unique
  telegramLinkExpiresAt  DateTime?
  step                   String
  partialData            Json
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
}
```

## 2. Backend: API & Logic Layer
### Task Controller (`backend/src/controllers/task.controller.ts`)
```typescript
import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as taskService from "../services/task.service";

export async function createTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { title, description, dueDate, estimatedMinutes, priority, reminderOffsetMinutes } = req.body;

        if (!title || !dueDate || estimatedMinutes === undefined) {
            res.status(400).json({
                success: false,
                message: "title, dueDate, and estimatedMinutes are required.",
            });
            return;
        }

        console.log("[DEBUG_API] Raw Body dueDate:", dueDate);
        console.log("[DEBUG_API] Parsed Date ISO:", new Date(dueDate).toISOString());

        const task = await taskService.createTask(req.userId!, {
            title,
            description,
            dueDate,
            estimatedMinutes,
            priority,
            reminderOffsetMinutes,
        });

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
}

export async function getTasks(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const tasks = await taskService.getTasksByUser(req.userId!);

        if (tasks.length > 0) {
            console.log("[DEBUG_CORRUPTION] API GetTasks Sample:", tasks[0].dueDate);
            console.log("[DEBUG_CORRUPTION] API GetTasks ISO:", tasks[0].dueDate.toISOString());
        }

        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        next(error);
    }
}

export async function getPriorityTasks(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const tasks = await taskService.getTasksByPriority(req.userId!);
        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        next(error);
    }
}

export async function getTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { id } = req.params;
        if (typeof id !== "string") {
            res.status(400).json({ success: false, message: "Invalid Task ID." });
            return;
        }
        const task = await taskService.getTaskById(req.userId!, id);
        res.status(200).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
}

export async function updateTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { id } = req.params;
        if (typeof id !== "string") {
            res.status(400).json({ success: false, message: "Invalid Task ID." });
            return;
        }
        const task = await taskService.updateTask(
            req.userId!,
            id,
            req.body
        );
        res.status(200).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
}

export async function deleteTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { id } = req.params;
        if (typeof id !== "string") {
            res.status(400).json({ success: false, message: "Invalid Task ID." });
            return;
        }
        await taskService.deleteTask(req.userId!, id);
        res.status(200).json({ success: true, message: "Task deleted." });
    } catch (error) {
        next(error);
    }
}
```

### Task Service (`backend/src/services/task.service.ts`)
```typescript
import prisma from "../utils/prisma";
import { Priority, Status } from "@prisma/client";

interface CreateTaskInput {
    title: string;
    description?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority?: Priority;
    reminderOffsetMinutes?: number;
}

interface UpdateTaskInput {
    title?: string;
    description?: string;
    dueDate?: string;
    estimatedMinutes?: number;
    priority?: Priority;
    status?: Status;
    reminderOffsetMinutes?: number;
}

export async function createTask(userId: string, data: CreateTaskInput) {
    return prisma.task.create({
        data: {
            title: data.title,
            description: data.description,
            dueDate: new Date(data.dueDate),
            estimatedMinutes: data.estimatedMinutes,
            priority: data.priority || "MEDIUM",
            reminderOffsetMinutes: data.reminderOffsetMinutes ?? 60,
            userId,
        },
    });
}

export async function getTasksByUser(userId: string) {
    return prisma.task.findMany({
        where: { userId, recurringTemplateId: null },
        orderBy: { dueDate: "asc" },
    });
}

export async function getTasksByPriority(userId: string) {
    const tasks = await prisma.task.findMany({
        where: { userId, recurringTemplateId: null },
    });

    // In-memory sort: Start By Time (DueDate - EstimatedMinutes)
    tasks.sort((a, b) => {
        // Handle null dueDate (push to bottom)
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;

        const aEst = (a.estimatedMinutes ?? 0) * 60 * 1000;
        const bEst = (b.estimatedMinutes ?? 0) * 60 * 1000;

        const aStart = a.dueDate.getTime() - aEst;
        const bStart = b.dueDate.getTime() - bEst;

        if (aStart !== bStart) return aStart - bStart;

        // Secondary deterministic fallback
        return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return tasks;
}

export async function getTaskById(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
    });

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return task;
}

export async function updateTask(
    userId: string,
    taskId: string,
    data: UpdateTaskInput
) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
    });

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return prisma.task.update({
        where: { id: taskId },
        data: {
            ...(data.title !== undefined && { title: data.title }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.dueDate !== undefined && { dueDate: new Date(data.dueDate) }),
            ...(data.estimatedMinutes !== undefined && {
                estimatedMinutes: data.estimatedMinutes,
            }),
            ...(data.priority !== undefined && { priority: data.priority }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.reminderOffsetMinutes !== undefined && {
                reminderOffsetMinutes: data.reminderOffsetMinutes,
            }),
        },
    });
}

export async function deleteTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
    });

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return prisma.task.delete({ where: { id: taskId } });
}
```

### Reminder Job (`backend/src/jobs/reminder.job.ts`)
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

### Reminder Service (`backend/src/services/reminder.service.ts`)
```typescript
import { NotificationType, Task } from "@prisma/client";
import prisma from "../utils/prisma";
import * as telegramService from "./telegram.service";

// 2️⃣ Reminder Stage Configuration
const REMINDER_STAGES = [
    { key: "12h", offsetMs: 12 * 60 * 60 * 1000 },
    { key: "6h", offsetMs: 6 * 60 * 60 * 1000 },
    { key: "3h", offsetMs: 3 * 60 * 60 * 1000 },
    { key: "1h", offsetMs: 1 * 60 * 60 * 1000 }
];

// Tolerance window to prevent spam after downtime
const TOLERANCE_MS = 2 * 60 * 1000; // 2 minutes

export const checkAndTriggerReminders = async () => {
    const currentTime = new Date();
    // Use ISO string for logs
    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] Check started at ${currentTime.toISOString()}`);

    try {
        const tasks = await prisma.task.findMany({
            where: {
                status: "PENDING"
            }
        });

        // ------------------------------------------------------------------
        // EXECUTION LOOP
        // ------------------------------------------------------------------
        for (const task of tasks) {
            let notificationType: NotificationType | null = null;
            let message = "";
            let updateData: any = {};
            let stageKeyToAppend: string | null = null;

            // 🛡️ Guard 1 (Snooze Override)
            if (task.snoozedUntil) {
                if (task.snoozedUntil > currentTime) {
                    continue; // Task is strictly snoozed, ignore.
                }

                // Snooze Expired? Trigger Snooze Wakeup
                if (task.snoozedUntil <= currentTime) {
                    notificationType = currentTime > task.dueDate ? NotificationType.OVERDUE : NotificationType.REMINDER;
                    const prefix = notificationType === NotificationType.OVERDUE ? "Snoozed Overdue" : "Snoozed Reminder";
                    message = `${prefix}: Task "${task.title}" is ready!`;
                    updateData = { snoozedUntil: null, lastReminderSentAt: currentTime };
                    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [SNOOZE_WAKEUP] Task ${task.id}`);
                }
            }
            // 🛡️ Multi-Stage Logic (Only if NOT snoozed/wakeup-handled)
            else if (task.dueDate > currentTime) {
                // Normalize reminderStagesSent
                const sentStages: string[] = Array.isArray(task.reminderStagesSent)
                    ? (task.reminderStagesSent as string[])
                    : [];

                // Loop Stages
                for (const stage of REMINDER_STAGES) {
                    const stageTime = new Date(task.dueDate.getTime() - stage.offsetMs);

                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[DEBUG_SCHEDULER] Task ${task.id} Due: ${task.dueDate.toISOString()}`);
                        console.log(`[DEBUG_SCHEDULER] Stage ${stage.key} Time: ${stageTime.toISOString()}`);
                        console.log(`[DEBUG_SCHEDULER] Now: ${currentTime.toISOString()}`);
                    }

                    // 🛡️ Guard 2 (CreatedAt): No retroactive reminders
                    if (stageTime < task.createdAt) continue;

                    // 🛡️ Guard 3 (Tolerance): No spam after downtime
                    const timeDiff = currentTime.getTime() - stageTime.getTime();
                    const isDue = stageTime <= currentTime;
                    const isWithinTolerance = timeDiff <= TOLERANCE_MS;

                    if (isDue && isWithinTolerance) {
                        // Check if already sent
                        if (!sentStages.includes(stage.key)) {
                            // TRIGGER!
                            notificationType = NotificationType.REMINDER;
                            message = `Reminder: Task "${task.title}" is due in ${stage.key}`;
                            stageKeyToAppend = stage.key;
                            updateData = {
                                lastReminderSentAt: currentTime,
                                reminderStagesSent: [...sentStages, stage.key]
                            };
                            if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [STAGE_${stage.key}] Task ${task.id}`);
                            break;
                        }
                    }
                }
            }
            // 🛡️ Overdue Logic (Separate)
            else if (currentTime > task.dueDate) {
                // Condition: Overdue Not Already Sent
                const neverReminded = !task.lastReminderSentAt;
                const remindedBeforeDue = task.lastReminderSentAt && task.lastReminderSentAt < task.dueDate;

                if (neverReminded || remindedBeforeDue) {
                    notificationType = NotificationType.OVERDUE;
                    message = `Overdue: Task "${task.title}" is overdue!`;
                    updateData = { lastReminderSentAt: currentTime };
                    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [OVERDUE] Task ${task.id}`);
                }
            }

            // ------------------------------------------------------------------
            // TRANSACTION ALREADY
            // ------------------------------------------------------------------
            if (notificationType && message) {
                try {
                    await prisma.$transaction([
                        prisma.task.update({ where: { id: task.id }, data: updateData }),
                        prisma.notification.create({
                            data: {
                                userId: task.userId,
                                taskId: task.id,
                                type: notificationType,
                                message: message
                            }
                        })
                    ]);
                    if (process.env.NODE_ENV !== 'production') console.log(`[REMINDER_ENGINE] [SUCCESS] Notification sent for Task ${task.id}`);

                    // Telegram Notification (Fire & Forget, but logged)
                    try {
                        const user = await prisma.user.findUnique({
                            where: { id: task.userId },
                            select: { id: true, telegramChatId: true, email: true, password: true, createdAt: true, updatedAt: true }
                        });

                        if (user && user.telegramChatId) {
                            await telegramService.sendReminderNotification(task, user as any);
                        }
                    } catch (err) {
                        console.error("[REMINDER_ENGINE] [TELEGRAM_FAIL]", err);
                    }

                } catch (txError) {
                    console.error(`[REMINDER_ENGINE] [TX_FAIL] Task ${task.id}`, txError);
                }
            }
        }

    } catch (error) {
        console.error("[REMINDER_ENGINE] [CRITICAL_FAIL] Engine aborted", error);
    }
};
```

## 3. Backend: Notification Layer
### Telegram Service (`backend/src/services/telegram.service.ts`)
```typescript
import env from "../config/env";
import { Task, User } from "@prisma/client";

// Define strict types for the Telegram API responses/payloads if needed, 
// or use 'any' carefully where strict typing is overkill for external API calls 
// that we don't control, but we will try to be type-safe.

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const sendMessage = async (chatId: string, text: string, inlineKeyboard?: any) => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn("[TELEGRAM] Bot token missing. Message not sent.");
        return;
    }

    try {
        const body: any = {
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
        };

        if (inlineKeyboard) {
            body.reply_markup = inlineKeyboard;
        }

        const response = await fetch(`${BASE_URL}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await response.json() as any;

        if (!data.ok) {
            console.error("[TELEGRAM] Send failed:", data);
        }
    } catch (error) {
        console.error("[TELEGRAM] Network error during sendMessage:", error);
    }
};

export const sendReminderNotification = async (task: Task, user: User & { telegramChatId: string | null }) => {
    if (!user.telegramChatId) return;

    try {
        console.log("[DEBUG_TELEGRAM] RAW DB VALUE:", task.dueDate);
        console.log("[DEBUG_TELEGRAM] AS ISO:", new Date(task.dueDate).toISOString());
        console.log("[DEBUG_TELEGRAM] AS IST:", new Date(task.dueDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
        console.log("[DEBUG_TELEGRAM] SERVER DEFAULT:", new Date(task.dueDate).toLocaleString());

        const dueDateFormatted = new Date(task.dueDate).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour12: true,
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });

        const isOverdue = Date.now() > new Date(task.dueDate).getTime();
        const header = isOverdue ? "🚨 <b>OVERDUE</b>" : "🔔 <b>REMINDER</b>";

        // Truncate description if too long
        const description = task.description
            ? `\nDescription: <i>${task.description.length > 50 ? task.description.substring(0, 50) + "..." : task.description}</i>`
            : "";

        const message = `${header}\n\nTask: <b>${task.title}</b>${description}\nDue: ${dueDateFormatted}`;

        // Inline keyboard for Snooze
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "1h 💤", callback_data: `SNOOZE_1_${task.id}` },
                    { text: "3h 💤", callback_data: `SNOOZE_3_${task.id}` },
                ],
                [
                    { text: "6h 💤", callback_data: `SNOOZE_6_${task.id}` },
                    { text: "12h 💤", callback_data: `SNOOZE_12_${task.id}` },
                ]
            ]
        };

        await sendMessage(user.telegramChatId, message, inlineKeyboard);

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[TELEGRAM] Sent reminder for task ${task.id} to chat ${user.telegramChatId}`);
        }

    } catch (error) {
        console.error("[TELEGRAM] Failed to send reminder notification:", error);
    }
};
```

### Telegram Poller (`backend/src/services/telegram.poller.ts`)
```typescript
import env from "../config/env";
import prisma from "../utils/prisma";
import * as conversationService from "./conversation.service";
import * as navigationService from "./telegram.navigation";
import { sendMessage } from "./telegram.service";
import { Priority } from "@prisma/client";
import { parseTelegramDate } from "../utils/telegramDateParser";

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ... (Polling logic largely disabled, focus on handleMessage)

import * as linkService from "./telegram.link.service";

// Exported for Webhook Controller
export const handleMessage = async (message: any) => {
    console.log("🚨 TELEGRAM HANDLER FILE ACTIVE");
    try {
        // ... (Link/Start command logic omitted for brevity, focus on parsing)

        // CASE 1: /add command (Start New Session)
        if (text.startsWith("/add")) {
            // Cleanup old session if any
            if (session) await conversationService.deleteSession(chatId);

            const parsedDateResult = parseTelegramDate(text);

            if (!parsedDateResult) {
                await sendMessage(chatId, "❌ Could not detect a valid date.\nExample: /add Buy milk tomorrow 5pm");
                return;
            }

            const dueDate = parsedDateResult.date;
            
            // Clean up the title: remove "/add" and the date text
            let title = parsedDateResult.remainingText.replace("/add", "").trim();
            title = title.replace(/\s+/g, " ").trim();

            console.log("[DEBUG_TZ] Text:", text);
            console.log("[DEBUG_TZ] Final DueDate (ISO):", dueDate.toISOString());

            // ... (Validation logic)

            await conversationService.createSession(chatId, "awaiting_description", {
                title: title,
                dueDate: dueDate.toISOString()
            });

            await sendMessage(chatId, `📝 <b>Task:</b> ${title}\n📅 <b>Due:</b> ${dueDate.toLocaleString()}\n\nPlease describe this task (or type 'skip' to leave empty).`);
            return;
        }

        // CASE 2: Active Session (Final Creation Step)
        if (session) {
             // ... (Description Step omitted)

            // Step: Meta (Duration, Urgency)
            if (session.step === "awaiting_meta") {
                // ... (Parsing duration/urgency)

                // Create Task
                console.log("[DEBUG_TZ] Creating task with DueDate:", data.dueDate);
                await prisma.task.create({
                    data: {
                        userId: user.id,
                        title: data.title,
                        description: data.description,
                        dueDate: new Date(data.dueDate), // data.dueDate is ISO string from session
                        estimatedMinutes: duration,
                        priority: urgency,
                        status: "PENDING"
                    }
                });

                console.log("FINAL STORED UTC:", new Date(data.dueDate).toISOString());

                await conversationService.deleteSession(chatId);
                await sendMessage(chatId, "✅ <b>Task Created!</b>");
                return;
            }
        }

    } catch (e) {
        console.error("[TELEGRAM] Message handler error:", e);
    }
}
// ...
```

### Telegram Date Parser (`backend/src/utils/telegramDateParser.ts`)
```typescript
import * as chrono from "chrono-node";
import { fromZonedTime } from "date-fns-tz";

export function parseTelegramDate(text: string): { date: Date, remainingText: string } | null {
    const results = chrono.parse(text);
    if (!results.length) return null;

    const result = results[0];
    const parsedLocal = result.start.date(); // Date object interpreted in local (system or UTC if forced) context?
    const matchText = result.text;

    // Force interpretation as Asia/Kolkata time
    // fromZonedTime(date, zone) -> UTC Date
    // "17:00 Face Value" + "Asia/Kolkata" -> "11:30 UTC"
    const utcDate = fromZonedTime(parsedLocal, "Asia/Kolkata");

    console.log("🚨 TELEGRAM PARSER ACTIVE");
    console.log("Parsed Local:", parsedLocal);
    console.log("Converted UTC:", utcDate.toISOString());
    console.log("Match Text:", matchText);

    // Remove the matched text from the original text to get the remaining text
    // We replace only the first occurrence to be safe
    const remainingText = text.replace(matchText, "").trim();

    return {
        date: utcDate,
        remainingText: remainingText
    };
}
```

## 4. Frontend: UI Layer
### Task Creation Modal (`frontend/src/components/tasks/TaskModal.tsx`)
```typescript
import { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DateTimePicker from '../ui/DateTimePicker';
import api from '../../services/api';

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function TaskModal({ isOpen, onClose, onSuccess }: TaskModalProps) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        dueDate: '',
        estimatedMinutes: 30,
        priority: 'MEDIUM'
    });
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            console.log("[DEBUG_DASHBOARD_CREATE] Raw Input:", formData.dueDate);
            console.log("[DEBUG_DASHBOARD_CREATE] Sending ISO:", new Date(formData.dueDate).toISOString());

            await api.post('/tasks', {
                ...formData,
                dueDate: new Date(formData.dueDate).toISOString()
            });
            onSuccess();
            onClose();
            // Reset form
            setFormData({ title: '', description: '', dueDate: '', estimatedMinutes: 30, priority: 'MEDIUM' });
        } catch (error) {
            console.error('Failed to create task', error);
            alert('Failed to create task');
        } finally {
            setLoading(false);
        }
    };
    // ... (JSX omitted)
}
```

### Task Card (`frontend/src/components/tasks/TaskCard.tsx`)
```typescript
import { format } from 'date-fns';
import { CheckCircle, Circle, Trash2, Clock, AlertTriangle } from 'lucide-react';
import Button from '../ui/Button';

export interface Task {
    id: string;
    title: string;
    description?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    status: 'PENDING' | 'COMPLETED';
}

interface TaskCardProps {
    task: Task;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
}

export default function TaskCard({ task, onComplete, onDelete }: TaskCardProps) {
    const isCompleted = task.status === 'COMPLETED';

    // Debug Logging for first task only (to avoid spam)
    if (Math.random() < 0.05) { // Sample ~5% or remove check for full spam
        console.log("[DEBUG_DASHBOARD_RENDER] Received:", task.dueDate);
        console.log("[DEBUG_DASHBOARD_RENDER] Interpreted:", new Date(task.dueDate));
        console.log("[DEBUG_DASHBOARD_RENDER] Formatted:", format(new Date(task.dueDate), 'MMM d, h:mm a'));
    }
    
    // ... (JSX)
    // Display Logic:
    // <span>{format(new Date(task.dueDate), 'MMM d, h:mm a')}</span>
    // ...
}
```

### API Service (`frontend/src/services/api.ts`)
```typescript
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            console.warn("Unauthorized request - 401");
        }
        return Promise.reject(error);
    }
);

export default api;
```
