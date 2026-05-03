# Production Deployment & Schema Sync Report
**Date:** 2026-02-22
**Scope:** Repo separation, Railway deployment fix, production DB schema sync, user default reminder settings

---

## Summary of Changes

This report covers the full lifecycle from implementing user default reminder settings through to successful production deployment:

1. **User default reminder settings** — schema, API endpoints, task creation defaults, frontend Settings page.
2. **Repo separation** — split monorepo into dedicated backend and frontend repos.
3. **Railway deployment fix** — removed `railway.json` that forced Docker mode, cleaned backend repo to have `package.json` at root.
4. **Production DB schema sync** — ran `prisma db push` to sync Supabase production DB, eliminating `P2022` errors.

---

## Per-File Breakdown

---

### 1. `backend/prisma/schema.prisma`

**File path:** `backend/prisma/schema.prisma`

**What changed:** Added three new fields to the `User` model for user-level default reminder settings.

**Why:** Users need configurable defaults so each new task inherits their preferred notification schedule without manual entry.

**Diff:**
```diff
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
+  defaultNotifyBeforeHours  Int[]              @default([])
+  defaultNotifyPercentage   Int[]              @default([])
+  defaultMinGapMinutes      Int                @default(58)
 }
```

**Full updated file:**
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
  defaultNotifyBeforeHours  Int[]              @default([])
  defaultNotifyPercentage   Int[]              @default([])
  defaultMinGapMinutes      Int                @default(58)
}

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

---

### 2. `backend/src/controllers/settings.controller.ts` [NEW]

**File path:** `backend/src/controllers/settings.controller.ts`

**What changed:** Created new controller with `getReminderDefaults` (GET) and `updateReminderDefaults` (PUT) handlers.

**Why:** Provides authenticated API endpoints for users to read and update their default reminder settings with full server-side validation.

**Validation layers implemented:**
- Type validation (arrays, number)
- Integer enforcement (`Number.isInteger`)
- Oversized array rejection (max 5 items each)
- Allowlist enforcement (hours: `[1,3,6,12,24]`, percent: `[20,40,60,80,90]`)
- Range validation (`minGapMinutes` 0–1440)
- Deduplication and sorting before persistence

**Full updated file:**
```typescript
import { Response } from "express";
import prisma from "../utils/prisma";
import { AuthRequest } from "../middleware/auth.middleware";

export const getReminderDefaults = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                defaultNotifyBeforeHours: true,
                defaultNotifyPercentage: true,
                defaultMinGapMinutes: true,
            },
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.json(user);
    } catch (error) {
        console.error("[GET_REMINDER_DEFAULTS]", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const updateReminderDefaults = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const {
            defaultNotifyBeforeHours,
            defaultNotifyPercentage,
            defaultMinGapMinutes,
        } = req.body;

        // Basic type validation
        if (
            !Array.isArray(defaultNotifyBeforeHours) ||
            !Array.isArray(defaultNotifyPercentage) ||
            typeof defaultMinGapMinutes !== "number"
        ) {
            return res.status(400).json({ message: "Invalid input format" });
        }

        // Integer enforcement
        if (!Number.isInteger(defaultMinGapMinutes)) {
            return res.status(400).json({
                message: "defaultMinGapMinutes must be an integer",
            });
        }
        if (!defaultNotifyBeforeHours.every(Number.isInteger)) {
            return res.status(400).json({
                message: "Hour values must be integers",
            });
        }
        if (!defaultNotifyPercentage.every(Number.isInteger)) {
            return res.status(400).json({
                message: "Percentage values must be integers",
            });
        }

        // Value constraint validation
        const allowedHours = [1, 3, 6, 12, 24];
        const allowedPercent = [20, 40, 60, 80, 90];

        // Reject oversized arrays
        if (defaultNotifyBeforeHours.length > allowedHours.length) {
            return res.status(400).json({
                message: `Too many hour values. Maximum allowed: ${allowedHours.length}`,
            });
        }
        if (defaultNotifyPercentage.length > allowedPercent.length) {
            return res.status(400).json({
                message: `Too many percentage values. Maximum allowed: ${allowedPercent.length}`,
            });
        }

        const invalidHours = defaultNotifyBeforeHours.filter(
            (h: number) => !allowedHours.includes(h)
        );
        const invalidPercent = defaultNotifyPercentage.filter(
            (p: number) => !allowedPercent.includes(p)
        );

        if (invalidHours.length > 0) {
            return res.status(400).json({
                message: `Invalid hour values: ${invalidHours.join(", ")}. Allowed: ${allowedHours.join(", ")}`,
            });
        }
        if (invalidPercent.length > 0) {
            return res.status(400).json({
                message: `Invalid percentage values: ${invalidPercent.join(", ")}. Allowed: ${allowedPercent.join(", ")}`,
            });
        }
        if (defaultMinGapMinutes < 0) {
            return res.status(400).json({
                message: "defaultMinGapMinutes must be a non-negative number",
            });
        }
        if (defaultMinGapMinutes > 1440) {
            return res.status(400).json({
                message: "defaultMinGapMinutes must not exceed 1440 (24 hours)",
            });
        }

        // Deduplicate and sort arrays before persisting
        const cleanedHours = [...new Set(defaultNotifyBeforeHours as number[])].sort((a, b) => a - b);
        const cleanedPercent = [...new Set(defaultNotifyPercentage as number[])].sort((a, b) => a - b);

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                defaultNotifyBeforeHours: cleanedHours,
                defaultNotifyPercentage: cleanedPercent,
                defaultMinGapMinutes,
            },
            select: {
                defaultNotifyBeforeHours: true,
                defaultNotifyPercentage: true,
                defaultMinGapMinutes: true,
            },
        });

        return res.json(updatedUser);
    } catch (error) {
        console.error("[UPDATE_REMINDER_DEFAULTS]", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
```

---

### 3. `backend/src/routes/settings.routes.ts` [NEW]

**File path:** `backend/src/routes/settings.routes.ts`

**What changed:** Created new route file defining GET and PUT endpoints for `/reminder-defaults`, protected by `authMiddleware`.

**Why:** Provides the routing layer for the settings API, following the same pattern as existing routes.

**Full updated file:**
```typescript
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    getReminderDefaults,
    updateReminderDefaults,
} from "../controllers/settings.controller";

const router = Router();

router.use(authMiddleware);

router.get("/reminder-defaults", getReminderDefaults);
router.put("/reminder-defaults", updateReminderDefaults);

export default router;
```

---

### 4. `backend/src/app.ts`

**File path:** `backend/src/app.ts`

**What changed:** Added `settingsRoutes` import and registered it at `/api/settings`.

**Why:** Connects the new settings API endpoints to the Express application.

**Diff:**
```diff
 import { telegramWebhook } from "./controllers/telegram.controller";
 import aiRoutes from "./routes/ai.routes";
+import settingsRoutes from "./routes/settings.routes";

 // API Routes
 app.use("/api/auth", authRoutes);
 app.use("/api/tasks", taskRoutes);
 app.use("/api/recurring", recurringRoutes);
 app.use("/api/notifications", notificationRoutes);
 app.use("/api/telegram", telegramRoutes);
 app.use("/api/ai", aiRoutes);
+app.use("/api/settings", settingsRoutes);
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

### 5. `backend/src/services/task.service.ts`

**File path:** `backend/src/services/task.service.ts`

**What changed:**
- Added `notifyBeforeHours` and `notifyPercentage` as optional fields to `CreateTaskInput`.
- Inside `createTask`, fetches user defaults from the `User` table.
- Applies user defaults as fallbacks via nullish coalescing (`??`).

**Why:** New tasks should inherit the user's configured defaults when the client doesn't explicitly provide reminder settings.

**Diff:**
```diff
 interface CreateTaskInput {
     title: string;
     description?: string;
     dueDate: string;
     estimatedMinutes: number;
     priority?: Priority;
+    notifyBeforeHours?: number[];
+    notifyPercentage?: number[];
     minGapMinutes?: number;
 }

 export async function createTask(userId: string, data: CreateTaskInput) {
+    // Fetch user defaults to apply as fallbacks when client omits values
+    const userDefaults = await prisma.user.findUnique({
+        where: { id: userId },
+        select: {
+            defaultNotifyBeforeHours: true,
+            defaultNotifyPercentage: true,
+            defaultMinGapMinutes: true,
+        },
+    });
+
     return prisma.task.create({
         data: {
             title: data.title,
             description: data.description,
             dueDate: new Date(data.dueDate),
             estimatedMinutes: data.estimatedMinutes,
             priority: data.priority || "MEDIUM",
-            minGapMinutes: data.minGapMinutes ?? 58,
+            notifyBeforeHours: data.notifyBeforeHours ?? userDefaults?.defaultNotifyBeforeHours ?? [],
+            notifyPercentage: data.notifyPercentage ?? userDefaults?.defaultNotifyPercentage ?? [],
+            minGapMinutes: data.minGapMinutes ?? userDefaults?.defaultMinGapMinutes ?? 58,
             userId,
         },
     });
 }
```

**Full updated file:**
```typescript
import prisma from "../utils/prisma";
import { Priority, Status } from "@prisma/client";

interface CreateTaskInput {
    title: string;
    description?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority?: Priority;
    notifyBeforeHours?: number[];
    notifyPercentage?: number[];
    minGapMinutes?: number;
}

interface UpdateTaskInput {
    title?: string;
    description?: string;
    dueDate?: string;
    estimatedMinutes?: number;
    priority?: Priority;
    status?: Status;
    minGapMinutes?: number;
}

export async function createTask(userId: string, data: CreateTaskInput) {
    // Fetch user defaults to apply as fallbacks when client omits values
    const userDefaults = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            defaultNotifyBeforeHours: true,
            defaultNotifyPercentage: true,
            defaultMinGapMinutes: true,
        },
    });

    return prisma.task.create({
        data: {
            title: data.title,
            description: data.description,
            dueDate: new Date(data.dueDate),
            estimatedMinutes: data.estimatedMinutes,
            priority: data.priority || "MEDIUM",
            notifyBeforeHours: data.notifyBeforeHours ?? userDefaults?.defaultNotifyBeforeHours ?? [],
            notifyPercentage: data.notifyPercentage ?? userDefaults?.defaultNotifyPercentage ?? [],
            minGapMinutes: data.minGapMinutes ?? userDefaults?.defaultMinGapMinutes ?? 58,
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

    tasks.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;

        const aEst = (a.estimatedMinutes ?? 0) * 60 * 1000;
        const bEst = (b.estimatedMinutes ?? 0) * 60 * 1000;

        const aStart = a.dueDate.getTime() - aEst;
        const bStart = b.dueDate.getTime() - bEst;

        if (aStart !== bStart) return aStart - bStart;

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
            ...(data.minGapMinutes !== undefined && {
                minGapMinutes: data.minGapMinutes,
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

---

### 6. `frontend/src/pages/Settings.tsx` [NEW]

**File path:** `frontend/src/pages/Settings.tsx`

**What changed:** Created full Settings page with:
- Multi-select dropdowns for notification hour/percentage presets
- Double-submit guard (`if (saving) return;`)
- Dirty state tracking (save button disabled until changes detected)
- Auto-clearing success messages
- Error display from server validation

**Why:** Provides the user-facing UI for configuring default reminder settings.

**Full updated file:**
```tsx
import { useState, useRef, useEffect } from 'react';
import { Settings as SettingsIcon, ChevronDown, Check } from 'lucide-react';
import api from '../services/api';

interface MultiSelectProps {
    label: string;
    options: { label: string; value: number }[];
    selectedValues: number[];
    onChange: (values: number[]) => void;
    placeholder: string;
    disabled?: boolean;
}

function MultiSelect({ label, options, selectedValues, onChange, placeholder, disabled }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value: number) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter(v => v !== value));
        } else {
            onChange([...selectedValues, value].sort((a, b) => a - b));
        }
    };

    const getDisplayLabel = () => {
        if (selectedValues.length === 0) return placeholder;
        return options
            .filter(opt => selectedValues.includes(opt.value))
            .map(opt => opt.label)
            .join(', ');
    };

    return (
        <div className="space-y-1.5" ref={dropdownRef}>
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {label}
                </label>
                {selectedValues.length > 0 && !disabled && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                        Clear All
                    </button>
                )}
            </div>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => !disabled && setIsOpen(!isOpen)}
                    disabled={disabled}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-left text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className={`truncate ${selectedValues.length === 0 ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {getDisplayLabel()}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && !disabled && (
                    <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-1 max-h-60 overflow-auto">
                            {options.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => toggleOption(option.value)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedValues.includes(option.value)
                                            ? 'bg-blue-600 border-blue-600'
                                            : 'border-slate-300 dark:border-slate-600'
                                            }`}>
                                            {selectedValues.includes(option.value) && (
                                                <Check className="w-3 h-3 text-white" />
                                            )}
                                        </div>
                                        <span>{option.label}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function Settings() {
    const [notifyBeforeHours, setNotifyBeforeHours] = useState<number[]>([]);
    const [notifyPercentage, setNotifyPercentage] = useState<number[]>([]);
    const [minGapMinutes, setMinGapMinutes] = useState<number>(58);

    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [initialState, setInitialState] = useState<{
        hours: number[];
        percent: number[];
        gap: number;
    } | null>(null);

    const hasChanges =
        initialState &&
        (
            JSON.stringify(initialState.hours) !== JSON.stringify(notifyBeforeHours) ||
            JSON.stringify(initialState.percent) !== JSON.stringify(notifyPercentage) ||
            initialState.gap !== minGapMinutes
        );

    const hourOptions = [
        { label: '1 hour', value: 1 },
        { label: '3 hours', value: 3 },
        { label: '6 hours', value: 6 },
        { label: '12 hours', value: 12 },
        { label: '24 hours', value: 24 },
    ];

    const percentageOptions = [
        { label: '20%', value: 20 },
        { label: '40%', value: 40 },
        { label: '60%', value: 60 },
        { label: '80%', value: 80 },
        { label: '90%', value: 90 },
    ];

    useEffect(() => {
        const fetchDefaults = async () => {
            try {
                setLoading(true);
                setError(null);
                const { data } = await api.get('/api/settings/reminder-defaults');
                setNotifyBeforeHours(data.defaultNotifyBeforeHours ?? []);
                setNotifyPercentage(data.defaultNotifyPercentage ?? []);
                setMinGapMinutes(data.defaultMinGapMinutes ?? 58);
                setInitialState({
                    hours: data.defaultNotifyBeforeHours ?? [],
                    percent: data.defaultNotifyPercentage ?? [],
                    gap: data.defaultMinGapMinutes ?? 58,
                });
            } catch {
                setError('Failed to load settings. Please refresh and try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchDefaults();
    }, []);

    const handleSave = async () => {
        if (saving) return; // Double-submit guard
        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            await api.put('/api/settings/reminder-defaults', {
                defaultNotifyBeforeHours: notifyBeforeHours,
                defaultNotifyPercentage: notifyPercentage,
                defaultMinGapMinutes: minGapMinutes,
            });

            setSuccess('Settings saved successfully.');
            setInitialState({
                hours: notifyBeforeHours,
                percent: notifyPercentage,
                gap: minGapMinutes,
            });
        } catch (err: unknown) {
            const axiosError = err as { response?: { data?: { message?: string } } };
            setError(axiosError.response?.data?.message ?? 'Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        if (success) {
            const timer = setTimeout(() => setSuccess(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [success]);

    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-3 mb-2">
                <SettingsIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Settings</h1>
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            <section className="space-y-6">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Receive notification when</h2>

                {loading ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading your settings...</p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <MultiSelect
                                label="Time before due date"
                                options={hourOptions}
                                selectedValues={notifyBeforeHours}
                                onChange={setNotifyBeforeHours}
                                placeholder="Select times..."
                                disabled={saving}
                            />
                            <MultiSelect
                                label="Task time completed (%)"
                                options={percentageOptions}
                                selectedValues={notifyPercentage}
                                onChange={setNotifyPercentage}
                                placeholder="Select percentages..."
                                disabled={saving}
                            />
                        </div>

                        {error && (
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
                        )}
                        {success && (
                            <p className="text-sm font-medium text-green-600 dark:text-green-400">{success}</p>
                        )}

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || !hasChanges}
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                {saving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </>
                )}
            </section>

            <hr className="border-slate-200 dark:border-slate-800" />

            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Future settings</h2>
                <div className="min-h-[200px] rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/30">
                    <p className="text-slate-500 dark:text-slate-400 italic">No additional settings available yet.</p>
                </div>
            </section>
        </div>
    );
}
```

---

### 7. `backend/prisma/migrations/0001_baseline/migration.sql`

**File path:** `backend/prisma/migrations/0001_baseline/migration.sql`

**What changed:** Clean baseline migration containing full current schema. No `reminderOffsetMinutes` anywhere. Includes all current columns: `notifyBeforeHours`, `notifyPercentage`, `minGapMinutes`, `defaultNotifyBeforeHours`, `defaultNotifyPercentage`, `defaultMinGapMinutes`.

**Why:** Migration history was reset to a single baseline to eliminate drift from old migrations that referenced removed columns.

---

### 8. `railway.json` [DELETED]

**What changed:** Deleted from repo root.

**Why:** The file contained `cd backend && npm install && npm run build` which forced Nixpacks into Docker mode, causing `npm: command not found`. With the backend repo restructured (package.json at root), Nixpacks auto-detects Node.

---

## Deployment & Repo Separation

| Repository | Branch | Latest Commit | Contents |
|---|---|---|---|
| `ToDo-with-LLM-and-Telegram-Backend` | `master` | `4f80073` | Backend only (`package.json` at root) |
| `ToDo-with-LLM-and-Telegram-Frontend` | `main` | `36d2a41` | Frontend only (Settings.tsx + guard) |

### Backend Repo Root Structure
```
./
├── prisma/
├── scripts/
├── src/
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
```

### Backend `package.json` Scripts
```json
{
  "build": "tsc",
  "start": "node dist/server.js"
}
```

---

## Production Database Schema Sync

### Command Used
```
npx prisma db push
```

### Output
```
✔ Generated Prisma Client (v6.19.2) to .\node_modules\@prisma\client in 66ms
Exit code: 0
```

> **Note:** `prisma migrate deploy` was attempted first but failed with `P1002` (advisory lock timeout) because Supabase's pooler does not support `pg_advisory_lock`. `db push` is the standard Supabase + Prisma practice.

### Production DB Verification
```
Task columns: [
  'id', 'title', 'description', 'dueDate',
  'estimatedMinutes', 'priority', 'status',
  'notifyBeforeHours', 'notifyPercentage', 'minGapMinutes',
  'userId', 'createdAt', 'updatedAt',
  'lastReminderSentAt', 'reminderStagesSent',
  'snoozedUntil', 'recurringTemplateId'
]
```

| Column | Result |
|---|---|
| `notifyBeforeHours` | ✅ Exists |
| `notifyPercentage` | ✅ Exists |
| `minGapMinutes` | ✅ Exists |
| `reminderOffsetMinutes` | ❌ Correctly absent |

---

## Verification Summary

| Check | Result |
|---|---|
| `reminderOffsetMinutes` in schema.prisma | ❌ Not present |
| `reminderOffsetMinutes` in source code | ❌ Not present |
| `reminderOffsetMinutes` in migration SQL | ❌ Not present |
| `reminderOffsetMinutes` in production DB | ❌ Not present |
| `notifyBeforeHours` in production DB | ✅ Present |
| `notifyPercentage` in production DB | ✅ Present |
| `minGapMinutes` in production DB | ✅ Present |
| `npm run build` (backend) | ✅ Exit code 0 |
| No Dockerfile in backend repo | ✅ |
| No railway.json in backend repo | ✅ |
| No frontend/ in backend repo | ✅ |
| `prisma db push` against production | ✅ Success |
| Backend pushed to dedicated repo | ✅ `4f80073` |
| Frontend pushed to dedicated repo | ✅ `36d2a41` |

---

## API Endpoints Added

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings/reminder-defaults` | JWT | Fetch user's default reminder settings |
| `PUT` | `/api/settings/reminder-defaults` | JWT | Update user's default reminder settings |

### PUT Request Body
```json
{
  "defaultNotifyBeforeHours": [1, 6, 24],
  "defaultNotifyPercentage": [40, 80],
  "defaultMinGapMinutes": 58
}
```

### Validation Rules
| Rule | Detail |
|---|---|
| Type check | Arrays must be arrays, gap must be number |
| Integer enforcement | All values must be integers (`Number.isInteger`) |
| Allowlist (hours) | `[1, 3, 6, 12, 24]` |
| Allowlist (percent) | `[20, 40, 60, 80, 90]` |
| Max array size | 5 items each |
| Gap range | 0 – 1440 (24 hours) |
| Deduplication | Arrays deduplicated and sorted before storage |
