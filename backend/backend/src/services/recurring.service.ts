import prisma from "../utils/prisma";
import { RecurrenceType, Task } from "@prisma/client";
import { startOfDay, subDays, addDays, startOfMonth, startOfYear, setHours, getHours } from "date-fns";

/**
 * Returns the start of the current "logical day" (4:00 AM).
 * If it's before 4 AM, it returns 4 AM of the previous day.
 */
export function getLogicalDayStart(): Date {
    const now = new Date();
    const currentHour = getHours(now);

    let referenceDate = now;
    if (currentHour < 4) {
        referenceDate = subDays(now, 1);
    }

    // Set to 4:00:00.000 AM
    const logicalStart = setHours(startOfDay(referenceDate), 4);
    return logicalStart;
}

export async function createRecurringTemplate(userId: string, data: {
    title: string;
    estimatedMinutes?: number;
    recurrenceType: RecurrenceType;
}) {
    return prisma.recurringTemplate.create({
        data: {
            userId,
            title: data.title,
            estimatedMinutes: data.estimatedMinutes,
            recurrenceType: data.recurrenceType,
            active: true
        }
    });
}

export async function ensureDailyInstances(userId: string) {
    const templates = await prisma.recurringTemplate.findMany({
        where: { userId, active: true }
    });

    const logicalStart = getLogicalDayStart();
    const createdTasks: Task[] = [];

    for (const template of templates) {
        let shouldCreate = false;
        let rangeStart = logicalStart;

        // Define the range for checking existing tasks based on recurrence type
        if (template.recurrenceType === "DAILY") {
            // Check if instance exists since logical day start
            rangeStart = logicalStart;
        } else if (template.recurrenceType === "MONTHLY") {
            // Check if instance exists since start of month (respecting 4 AM boundary logic if needed, 
            // but usually monthly is just "is there one this month?")
            // Let's stick to simple: is there one created this month?
            rangeStart = startOfMonth(new Date());
            // If today is < 4AM on the 1st, we might be in previous month logically? 
            // For simplicity, let's stick to calendar month for creation check, 
            // OR strictly follow logical day. 
            // Valid requirement: "If today is first of month after 4 AM"
            // Let's use the logical start to determine "current month"
            rangeStart = startOfMonth(logicalStart);
        } else if (template.recurrenceType === "YEARLY") {
            rangeStart = startOfYear(logicalStart);
        }

        // Check for existing instance
        const existing = await prisma.task.findFirst({
            where: {
                recurringTemplateId: template.id,
                createdAt: {
                    gte: rangeStart
                }
            }
        });

        if (!existing) {
            // Create new instance
            // Due Date: For Daily, it's the logical day. 
            // Requirement says: "create with dueDate = logicalDayStart + 1 day at 4 AM" ?? 
            // Wait, "dueDate = logicalDayStart + 1 day at 4 AM" implies it's due at the END of the logical day (which is 4 AM next day).
            // Yes, a daily task for "Today" is due by "Tomorrow 4 AM".

            const dueDate = addDays(logicalStart, 1);

            const newTask = await prisma.task.create({
                data: {
                    userId,
                    title: template.title,
                    estimatedMinutes: template.estimatedMinutes ?? 0,
                    dueDate: dueDate,
                    recurringTemplateId: template.id,
                    status: "PENDING",
                    priority: "MEDIUM" // Default
                }
            });
            createdTasks.push(newTask);
        }
    }

    return createdTasks;
}

export async function getDailyTasks(userId: string) {
    // 1. Ensure instances exist
    await ensureDailyInstances(userId);

    const logicalStart = getLogicalDayStart();
    // 2. Fetch tasks linked to templates created for the current logical day
    // Actually, we want to show tasks that "belong" to today. 
    // This includes tasks created >= logicalStart && < logicalEnd
    // But what if a task was created yesterday but not finished? 
    // Requirement says: "Return only instances belonging to current logical period."
    // And "Daily Recurring Tasks... operate on a logical day".
    // Usually daily tasks are one-offs for that day. 
    // Let's fetch all tasks with recurringTemplateId that were created >= logicalStart.
    // Or just fetch the latest instance?
    // Let's go with: created >= logicalStart.

    return prisma.task.findMany({
        where: {
            userId,
            recurringTemplateId: { not: null },
            createdAt: {
                gte: logicalStart
            }
        },
        orderBy: { createdAt: 'asc' }
    });
}
