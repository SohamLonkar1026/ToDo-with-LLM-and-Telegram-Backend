import * as notificationRepository from "../repositories/notification.repository";

export const getNotifications = async (userId: string, page: number = 1, limit: number = 20) => {
    const { notifications, totalCount } = await notificationRepository.findPaginatedByUser(userId, page, limit);

    return {
        notifications,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
    };
};

export const markAsRead = async (userId: string, notificationId: string, unread: boolean = false) => {
    const notification = await notificationRepository.findByIdForUser(notificationId, userId);
    if (!notification) {
        throw { status: 404, message: "Notification not found." };
    }
    return notificationRepository.update(notificationId, { read: !unread });
};

export const markAllAsRead = async (userId: string) => {
    const count = await notificationRepository.updateManyUnreadToRead(userId);
    return { count };
};
