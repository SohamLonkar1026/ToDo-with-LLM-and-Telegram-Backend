import * as recurringTemplateRepository from "../repositories/recurringTemplate.repository";
import * as taskRepository from "../repositories/task.repository";
import { RecurrenceType, Task } from "../repositories/types";
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
    return recurringTemplateRepository.create({
        userId,
        title: data.title,
        estimatedMinutes: data.estimatedMinutes ?? null,
        recurrenceType: data.recurrenceType,
        active: true,
    });
}

export async function ensureDailyInstances(userId: string) {
    const templates = await recurringTemplateRepository.findActiveByUser(userId);

    const logicalStart = getLogicalDayStart();
    const createdTasks: Task[] = [];

    for (const template of templates) {
        let rangeStart = logicalStart;

        // Define the range for checking existing tasks based on recurrence type
        if (template.recurrenceType === "DAILY") {
            // Check if instance exists since logical day start
            rangeStart = logicalStart;
        } else if (template.recurrenceType === "MONTHLY") {
            rangeStart = startOfMonth(logicalStart);
        } else if (template.recurrenceType === "YEARLY") {
            rangeStart = startOfYear(logicalStart);
        }

        // Check for existing instance
        const existing = await taskRepository.findFirstByRecurringTemplateSince(template.id, rangeStart);

        if (!existing) {
            // Due Date: For Daily, it's the logical day.
            // A daily task for "Today" is due by "Tomorrow 4 AM".
            const dueDate = addDays(logicalStart, 1);

            const newTask = await taskRepository.create({
                title: template.title,
                description: null,
                estimatedMinutes: template.estimatedMinutes ?? 0,
                dueDate,
                recurringTemplateId: template.id,
                status: "PENDING",
                priority: "MEDIUM",
                notifyBeforeHours: [],
                notifyPercentage: [],
                minGapMinutes: 58,
                userId,
                lastReminderSentAt: null,
                reminderStagesSent: [],
                snoozedUntil: null,
                completedAt: null,
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
    return taskRepository.findManyByUserRecurringSince(userId, logicalStart);
}
