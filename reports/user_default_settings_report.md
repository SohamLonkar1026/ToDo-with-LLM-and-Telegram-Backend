# User Default Reminder Settings — Full Implementation Report
**Date:** 2026-02-21  
**Project:** Ai-MOM Backend + Frontend  
**Build Status:** ✅ Passing  

---

## 1. Objective

Implement user-level default reminder configuration so that:
- Users can persist their preferred notification settings via a Settings page
- New tasks automatically inherit user defaults when no explicit values are provided
- All inputs are validated server-side with strict type/value/size constraints

---

## 2. Phase 1 — Database Schema

### 2.1 New Fields Added to `User` Model

| Field | Type | Default | Purpose |
|---|---|---|---|
| `defaultNotifyBeforeHours` | `Int[]` | `[]` | Hours before due date to send reminders |
| `defaultNotifyPercentage` | `Int[]` | `[]` | % of task time elapsed to trigger reminders |
| `defaultMinGapMinutes` | `Int` | `58` | Minimum gap between consecutive reminders |

### 2.2 Prisma Schema (`backend/prisma/schema.prisma`)

```prisma
model User {
  id                        String              @id @default(cuid())
  email                     String              @unique
  password                  String
  createdAt                 DateTime            @default(now())
  updatedAt                 DateTime            @updatedAt
  notifications             Notification[]
  recurringTemplates        RecurringTemplate[]
  tasks                     Task[]
  telegramChatId            String?             @unique
  telegramLinkCode          String?             @unique
  telegramLinkExpiresAt     DateTime?
  defaultNotifyBeforeHours  Int[]               @default([])
  defaultNotifyPercentage   Int[]               @default([])
  defaultMinGapMinutes      Int                 @default(58)
}
```

### 2.3 Migration

Consolidated all migrations into a single clean baseline:

```
prisma/migrations/
├── migration_lock.toml
└── 0001_baseline/
    └── migration.sql   (131 lines, full schema snapshot)
```

**Migration status:** `Database schema is up to date!` (1 migration applied)

---

## 3. Phase 2 — API Endpoints

### 3.1 Settings Controller (`backend/src/controllers/settings.controller.ts`)

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

### 3.2 Settings Routes (`backend/src/routes/settings.routes.ts`)

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

### 3.3 App Registration (`backend/src/app.ts`)

```typescript
import settingsRoutes from "./routes/settings.routes";
// ... registered alongside other routes:
app.use("/api/settings", settingsRoutes);
```

---

## 4. Final System Completion Patch

### 4.1 User Defaults Applied During Task Creation (`backend/src/services/task.service.ts`)

When a new task is created, the service now fetches the user's default reminder settings and applies them as fallbacks. If the client sends explicit values, those are respected.

```typescript
export async function createTask(userId: string, data: CreateTaskInput) {
    // Fetch user defaults to apply as fallbacks
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
```

### 4.2 Double-Submit Guard (`frontend/src/pages/Settings.tsx`)

```typescript
const handleSave = async () => {
    if (saving) return; // Double-submit guard
    try {
        setSaving(true);
        // ...
```

### 4.3 Validation Summary (Backend Controller)

| Check | Layer | Status |
|---|---|---|
| Type check (`Array.isArray`, `typeof`) | Basic | ✅ |
| Integer enforcement (`Number.isInteger`) | Strict | ✅ |
| Allowlist validation (hours/percent) | Constraint | ✅ |
| Oversized array rejection | Size limit | ✅ |
| Range bounds (0–1440 for gap) | Range | ✅ |
| Deduplication + sorting | Sanitization | ✅ |

---

## 5. Bug Fix — `reminderOffsetMinutes` Regression

A pre-existing build regression was discovered and fixed:

| File | Before | After |
|---|---|---|
| `task.service.ts` | `reminderOffsetMinutes` | `minGapMinutes` |
| `task.controller.ts` | `reminderOffsetMinutes` | `minGapMinutes` |

---

## 6. Complete File Inventory

| File | Action |
|---|---|
| `backend/prisma/schema.prisma` | MODIFIED — added 3 User fields |
| `backend/prisma/migrations/0001_baseline/migration.sql` | NEW — full schema baseline |
| `backend/prisma/migrations/migration_lock.toml` | NEW — migration lock |
| `backend/src/controllers/settings.controller.ts` | NEW — GET/PUT handlers with validation |
| `backend/src/routes/settings.routes.ts` | NEW — route definitions |
| `backend/src/app.ts` | MODIFIED — registered settings routes |
| `backend/src/services/task.service.ts` | MODIFIED — user defaults fallback + field rename |
| `backend/src/controllers/task.controller.ts` | MODIFIED — field rename |
| `frontend/src/pages/Settings.tsx` | MODIFIED — double-submit guard |

---

## 7. Build Verification

```
> ai-mom-backend@1.0.0 build
> tsc

Exit code: 0
```

✅ Zero TypeScript errors. All patches compile cleanly.
