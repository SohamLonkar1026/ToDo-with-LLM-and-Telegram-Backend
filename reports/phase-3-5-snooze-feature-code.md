# Phase 3.5 - Snooze Feature Implementation Code

## 1. Backend: Reminder Service
`src/services/reminder.service.ts`

```typescript
import { NotificationType } from "@prisma/client";
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

            // 0. Snooze Check (Prioritized)
            if (task.snoozedUntil) {
                if (currentTime >= task.snoozedUntil) {
                    // Determine type based on due date
                    const type = currentTime > task.dueDate ? NotificationType.OVERDUE : NotificationType.REMINDER;
                    const messagePrefix = type === NotificationType.OVERDUE ? "Snoozed Overdue" : "Snoozed Reminder";

                    console.log(`${messagePrefix}: Task "${task.title}" wakeup`);

                    // 1. Clear snooze
                    // 2. Update lastReminderSentAt so standard logic doesn't immediately re-fire (if applicable, though snoozedUntil being null usually hands off to standard logic)
                    // Actually, if we just clear snoozedUntil, the standard logic below might fire if conditions are met.
                    // But we just sent a notification. We should update lastReminderSentAt to NOW.

                    await prisma.task.update({
                        where: { id: task.id },
                        data: {
                            snoozedUntil: null,
                            lastReminderSentAt: currentTime
                        }
                    });

                    // Persist Notification
                    await prisma.notification.create({
                        data: {
                            userId: task.userId,
                            taskId: task.id,
                            type: type,
                            message: `${messagePrefix}: Task "${task.title}" is ready!`
                        }
                    });
                }
                // If snoozed but not yet time, skip everything else for this task
                continue;
            }

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

                    await prisma.notification.create({
                        data: {
                            userId: task.userId,
                            taskId: task.id,
                            type: NotificationType.OVERDUE,
                            message: `Overdue: Task "${task.title}" is overdue!`
                        }
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

                    // Persist Notification
                    await prisma.notification.create({
                        data: {
                            userId: task.userId,
                            taskId: task.id,
                            type: NotificationType.REMINDER,
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

## 2. Backend: Notification Service
`src/services/notification.service.ts`

```typescript
import prisma from "../utils/prisma";

export const getNotifications = async (userId: string) => {
    return prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
};

export const markAsRead = async (userId: string, notificationId: string, unread: boolean = false) => {
    return prisma.notification.update({
        where: { id: notificationId, userId },
        data: { read: !unread },
    });
};
```

## 3. Backend: Notification Routes
`src/routes/notification.routes.ts`

```typescript
import { Router } from "express";
import { authMiddleware as authenticate } from "../middleware/auth.middleware";
import * as notificationController from "../controllers/notification.controller";
import * as snoozeController from "../controllers/snooze.controller";

const router = Router();

router.get("/", authenticate, notificationController.getNotifications);
router.put("/:id/read", authenticate, notificationController.markAsRead);
router.post("/:id/snooze", authenticate, snoozeController.snoozeNotification);

export default router;
```

## 4. Frontend: Notifications Page
`src/pages/Notifications.tsx`

```tsx
import { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import { useNotifications } from '../context/NotificationContext';
import api from '../services/api';

export default function Notifications() {
    const { notifications, loading, markAsRead, refreshNotifications, setNotifications } = useNotifications(); // Added setNotifications

    useEffect(() => {
        refreshNotifications();
    }, []);

    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

    const toggleDropdown = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenDropdownId(openDropdownId === id ? null : id);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setOpenDropdownId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const snooze = async (id: string, minutes: number) => {
        try {
            await api.post(`/notifications/${id}/snooze`, { durationMinutes: minutes });
            setNotifications(prev => prev.filter(n => n.id !== id)); // Remove from list as it's snoozed/read
        } catch (error) {
            console.error('Failed to snooze', error);
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-400">Loading notifications...</p>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-8">Notifications</h1>

            {notifications.length === 0 ? (
                <Card className="text-center py-12">
                    <p className="text-slate-400 text-lg">No notifications yet.</p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {notifications.map((notification) => (
                        <div
                            key={notification.id}
                            className={`group relative p-4 rounded-xl border transition-all ${notification.read
                                ? 'bg-slate-900 border-slate-800 opacity-60'
                                : 'bg-slate-800 border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-900/10'
                                }`}
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"> {/* Modified this div */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className={`px-2 py-1 text-xs font-bold rounded-md uppercase tracking-wider ${notification.type === 'OVERDUE'
                                            ? 'bg-red-500/10 text-red-400'
                                            : 'bg-blue-500/10 text-blue-400'
                                            }`}>
                                            {notification.type}
                                        </span>
                                        <span className="text-slate-500 text-xs">
                                            {new Date(notification.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className={`text-sm ${notification.read ? 'text-slate-400' : 'text-slate-200 font-medium'}`}>
                                        {notification.message}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Mark as Read/Unread Button */}
                                    <button
                                        onClick={() => markAsRead(notification.id)}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors border ${notification.read
                                                ? 'text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700'
                                                : 'text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border-slate-600'
                                            }`}
                                    >
                                        {notification.read ? 'Mark as Unread' : 'Mark as Read'}
                                    </button>

                                    {/* Snooze Dropdown */}
                                    <div className="relative">
                                        <button
                                            onClick={(e) => toggleDropdown(notification.id, e)}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors border flex items-center gap-1 ${openDropdownId === notification.id
                                                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                                    : 'text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20'
                                                }`}
                                        >
                                            Remind Again
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-3 h-3 transition-transform ${openDropdownId === notification.id ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
                                        </button>

                                        {openDropdownId === notification.id && (
                                            <div className="absolute right-0 top-full mt-1 w-32 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <button onClick={() => snooze(notification.id, 10)} className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white">10 Mins</button>
                                                <button onClick={() => snooze(notification.id, 30)} className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white">30 Mins</button>
                                                <button onClick={() => snooze(notification.id, 60)} className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white">1 Hour</button>
                                                <button onClick={() => snooze(notification.id, 360)} className="block w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white">6 Hours</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```
