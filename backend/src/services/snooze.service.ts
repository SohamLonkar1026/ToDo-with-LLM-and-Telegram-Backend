import prisma from "../utils/prisma";

export const snoozeNotification = async (userId: string, notificationId: string, durationMinutes: number) => {
    // 1. Find the notification to get the taskId
    const notification = await prisma.notification.findFirst({
        where: { id: notificationId, userId },
        include: { task: true }
    });

    if (!notification || !notification.task) {
        throw new Error("Notification or Task not found.");
    }

    // 2. Mark notification as read
    await prisma.notification.update({
        where: { id: notificationId },
        data: { read: true }
    });

    // 3. Update Task with snoozedUntil
    const snoozeTime = new Date();
    snoozeTime.setMinutes(snoozeTime.getMinutes() + durationMinutes);

    await prisma.task.update({
        where: { id: notification.taskId },
        data: { snoozedUntil: snoozeTime }
    });

    return { message: `Snoozed for ${durationMinutes} minutes.` };
};
