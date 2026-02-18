# Phase 5 Technical Report: Priority Order Implementation

**Date:** February 15, 2026
**Project:** AI-MOM Task Manager
**Phase:** 5 - Intelligent Priority View

---

## 1. Executive Summary

This phase implemented the **"Priority Order"** view, separating the intelligent task prioritization logic from the default dashboard. The new view sorts tasks based on their **Start By Time** (Due Date - Duration), ensuring users focus on tasks that need immediate attention, regardless of their due date.

---

## 2. Changed Files & Implementation Details

### 2.1 Backend: Service Layer
**File:** `backend/src/services/task.service.ts`

**Changes:**
- Reverted `getTasksByUser` to standard SQL sorting.
- Implemented `getTasksByPriority` with in-memory intelligent sorting.

```typescript
import prisma from "../utils/prisma";
import { Priority, Status } from "@prisma/client";

// ... [Interfaces and createTask unchanged] ...

export async function getTasksByUser(userId: string) {
    return prisma.task.findMany({
        where: { userId },
        orderBy: { dueDate: "asc" },
    });
}

export async function getTasksByPriority(userId: string) {
    const tasks = await prisma.task.findMany({
        where: { userId },
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

// ... [getTaskById, updateTask, deleteTask unchanged] ...
```

### 2.2 Backend: Controller Layer
**File:** `backend/src/controllers/task.controller.ts`

**Changes:**
- Added `getPriorityTasks` handler.

```typescript
// ... [Imports and other methods] ...

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
```

### 2.3 Backend: Routes
**File:** `backend/src/routes/task.routes.ts`

**Changes:**
- Registered `/priority` route.

```typescript
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createTask,
    getTasks,
    getPriorityTasks, // Imported
    getTask,
    updateTask,
    deleteTask,
} from "../controllers/task.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createTask);
router.get("/", getTasks);
router.get("/priority", getPriorityTasks); // New Route
router.get("/:id", getTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;
```

### 2.4 Frontend: Priority Page
**File:** `frontend/src/pages/Priority.tsx`

**Changes:**
- New component fetching from `/api/tasks/priority`.
- Uses a **Vertical List Layout** (`space-y-4`) instead of a grid.

```tsx
import { useState, useEffect } from 'react';
import api from '../services/api';
import TaskCard, { Task } from '../components/tasks/TaskCard';
import TaskModal from '../components/tasks/TaskModal';
import Button from '../components/ui/Button';

export default function Priority() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const fetchTasks = async () => {
        try {
            const response = await api.get('/tasks/priority');
            setTasks(response.data.data);
        } catch (error) {
            console.error('Failed to fetch priority tasks', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleComplete = async (id: string) => {
        // ... [Completion Logic] ...
    };

    const handleDelete = async (id: string) => {
        // ... [Deletion Logic] ...
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Priority Order</h2>
                    <p className="text-slate-400 text-sm">Tasks sorted by "Start By" time</p>
                </div>
            </div>

            {loading ? (
                <div className="text-center text-slate-400 py-12">Loading tasks...</div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700/50 border-dashed">
                    <p className="text-slate-400 mb-4">No tasks found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onComplete={handleComplete}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            <TaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchTasks}
            />
        </div>
    );
}
```

### 2.5 Frontend: Sidebar
**File:** `frontend/src/components/layout/Sidebar.tsx`

**Changes:**
- Added "Priority Order" navigation item.

```tsx
// ... [Imports] ...
import { LayoutDashboard, LogOut, SlidersHorizontal } from 'lucide-react';

// ... [Component Body] ...
                <NavLink
                    to="/priority"
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`
                    }
                >
                    <SlidersHorizontal className="w-5 h-5" />
                    <span className="font-medium">Priority Order</span>
                </NavLink>
// ...
```

### 2.6 Frontend: Routing
**File:** `frontend/src/App.tsx`

**Changes:**
- Registered `/priority` route.

```tsx
// ... [Imports] ...
import Priority from './pages/Priority';

// ... [Routes] ...
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/priority" element={<Priority />} />
                            <Route path="/notifications" element={<Notifications />} />
// ...
```

---

## 3. Verification

### 3.1 Test Case
**Scenario:**
- **Task A:** Due Tomorrow 5:00 PM, Duration: 60 mins. (Start By: 4:00 PM)
- **Task B:** Due Tomorrow 5:00 PM, Duration: 120 mins. (Start By: 3:00 PM)

### 3.2 Results
- **Dashboard View:** Shows tasks sorted by Due Date (Standard).
- **Priority View:** Shows **Task B** strictly above **Task A**, correctly identifying that Task B needs to be started earlier.

### 3.3 Visual verification
- The Priority View uses a vertical list layout, distinguishing it from the Dashboard grid.

---

**End of Report**
