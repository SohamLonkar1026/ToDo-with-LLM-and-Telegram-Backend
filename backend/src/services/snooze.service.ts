import * as notificationRepository from "../repositories/notification.repository";
import * as taskRepository from "../repositories/task.repository";

export const snoozeNotification = async (userId: string, notificationId: string, durationMinutes: number) => {
    // 1. Find the notification to get the taskId
    const notification = await notificationRepository.findByIdForUser(notificationId, userId);

    if (!notification) {
        throw new Error("Notification or Task not found.");
    }

    // 2. Mark notification as read
    await notificationRepository.update(notificationId, { read: true });

    // 3. Update Task with snoozedUntil
    const snoozeTime = new Date();
    snoozeTime.setMinutes(snoozeTime.getMinutes() + durationMinutes);

    await taskRepository.updateById(notification.taskId, { snoozedUntil: snoozeTime });

    return { message: `Snoozed for ${durationMinutes} minutes.` };
};
