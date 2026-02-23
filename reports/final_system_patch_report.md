# Final System Completion Patch + Deployment Fix — Report
**Date:** 2026-02-21
**Scope:** Backend task creation defaults, settings validation hardening, frontend save guard, Railway deployment fix, repo separation

---

## Summary of Changes

Applied the final integration patches to close system gaps:
1. **Task creation** now fetches user-level default reminder settings as fallbacks.
2. **Settings controller** now rejects oversized arrays beyond the allowlist length.
3. **Frontend** `handleSave` got a double-submit guard.
4. **Railway deployment** fixed by removing `railway.json` (which forced Docker mode).
5. **Repo separation**: frontend pushed to a dedicated `ToDo-with-LLM-and-Telegram-Frontend` repo.

---

## Per-File Breakdown

---

### 1. `backend/src/services/task.service.ts`

**What changed:** Added `notifyBeforeHours` and `notifyPercentage` to `CreateTaskInput`. Inside `createTask`, the function now fetches the user's default settings and uses them as fallbacks via nullish coalescing.

**Why:** Without this, newly created tasks would always default to empty arrays and `58` for `minGapMinutes`, ignoring user-configured defaults in the Settings page.

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
+    // Fetch user defaults to apply as fallbacks
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

### 2. `backend/src/controllers/settings.controller.ts`

**What changed:** Added oversized array rejection checks after the allowlist definitions. If the submitted arrays exceed the number of allowed values, the request is rejected with a 400.

**Why:** Without this, a malicious or buggy client could submit arrays longer than the allowlist (e.g., repeating valid values), bypassing the intent of the allowlist constraint.

**Diff:**
```diff
         // Value constraint validation
         const allowedHours = [1, 3, 6, 12, 24];
         const allowedPercent = [20, 40, 60, 80, 90];

+        // Reject oversized arrays
+        if (defaultNotifyBeforeHours.length > allowedHours.length) {
+            return res.status(400).json({
+                message: `Too many hour values. Maximum allowed: ${allowedHours.length}`,
+            });
+        }
+        if (defaultNotifyPercentage.length > allowedPercent.length) {
+            return res.status(400).json({
+                message: `Too many percentage values. Maximum allowed: ${allowedPercent.length}`,
+            });
+        }
+
         const invalidHours = defaultNotifyBeforeHours.filter(
```

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

### 3. `frontend/src/pages/Settings.tsx`

**What changed:** Added `if (saving) return;` as the first line inside `handleSave`.

**Why:** The save button is already `disabled={saving}`, but this explicit guard prevents double-submission even if the disabled state is bypassed (e.g., rapid clicks before React re-renders).

**Diff:**
```diff
     const handleSave = async () => {
+        if (saving) return; // Double-submit guard
         try {
             setSaving(true);
```

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

    // Fetch on mount
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

    // Auto-clear success message after 3 seconds
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

                        {/* Feedback messages */}
                        {error && (
                            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
                        )}
                        {success && (
                            <p className="text-sm font-medium text-green-600 dark:text-green-400">{success}</p>
                        )}

                        {/* Save button */}
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

### 4. `railway.json` (DELETED)

**What changed:** File deleted from repo root.

**Why:** The file contained `cd backend && npm install && npm run build` which caused Nixpacks to fall back to Docker mode, resulting in `npm: command not found`. With the backend repo now structured with `package.json` at root, Nixpacks auto-detects Node without any config overrides.

---

## Deployment & Repo Separation

| Repository | Branch | Latest Commit | Contents |
|---|---|---|---|
| `ToDo-with-LLM-and-Telegram-Backend` | `master` | `cd2346d` | Backend only (`package.json` at root) |
| `ToDo-with-LLM-and-Telegram-Frontend` | `main` | `3643c98` | Frontend only (Settings.tsx + guard) |

### Backend Repo Root Structure (confirmed clean)
```
prisma/
src/
.gitignore
package.json
package-lock.json
tsconfig.json
```

### Backend `package.json` Scripts (confirmed correct)
```json
{
  "build": "tsc",
  "start": "node dist/server.js"
}
```

---

## Verification

| Check | Result |
|---|---|
| `npm run build` (backend) | ✅ Exit code 0, zero TypeScript errors |
| No `Dockerfile` in backend repo | ✅ Confirmed |
| No `.dockerignore` in backend repo | ✅ Confirmed |
| No `railway.json` in backend repo | ✅ Confirmed (deleted) |
| No `frontend/` in backend repo | ✅ Confirmed |
| No `cd backend` in any scripts | ✅ Confirmed |
| Frontend pushed to separate repo | ✅ Confirmed (`3643c98` on `main`) |
