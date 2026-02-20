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
