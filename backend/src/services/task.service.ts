import * as taskRepository from "../repositories/task.repository";
import * as userRepository from "../repositories/user.repository";
import { Priority, Status } from "../repositories/types";

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
    const user = await userRepository.findById(userId);

    return taskRepository.create({
        title: data.title,
        description: data.description ?? null,
        dueDate: new Date(data.dueDate),
        estimatedMinutes: data.estimatedMinutes,
        priority: data.priority || "MEDIUM",
        status: "PENDING",
        notifyBeforeHours: data.notifyBeforeHours ?? user?.defaultNotifyBeforeHours ?? [],
        notifyPercentage: data.notifyPercentage ?? user?.defaultNotifyPercentage ?? [],
        minGapMinutes: data.minGapMinutes ?? user?.defaultMinGapMinutes ?? 58,
        userId,
        lastReminderSentAt: null,
        reminderStagesSent: [],
        snoozedUntil: null,
        completedAt: null,
        recurringTemplateId: null,
    });
}

export async function getTasksByUser(userId: string) {
    return taskRepository.findManyByUserExcludingRecurring(userId);
}

export async function getTasksByPriority(userId: string) {
    const tasks = await taskRepository.findManyByUserExcludingRecurringUnsorted(userId);

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
    const task = await taskRepository.findByIdForUser(taskId, userId);

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
    const task = await taskRepository.findByIdForUser(taskId, userId);

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return taskRepository.updateById(taskId, {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dueDate !== undefined && { dueDate: new Date(data.dueDate) }),
        ...(data.estimatedMinutes !== undefined && {
            estimatedMinutes: data.estimatedMinutes,
        }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.status !== undefined && {
            status: data.status,
            completedAt: data.status === "COMPLETED"
                ? (task.status === "COMPLETED" ? task.completedAt : new Date())
                : null
        }),
        ...(data.minGapMinutes !== undefined && {
            minGapMinutes: data.minGapMinutes,
        }),
    });
}

export async function deleteTask(userId: string, taskId: string) {
    const task = await taskRepository.findByIdForUser(taskId, userId);

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    await taskRepository.deleteById(taskId);
    return task;
}
