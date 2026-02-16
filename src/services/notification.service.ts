import prisma from "../utils/prisma";

export const getNotifications = async (userId: string, page: number = 1, limit: number = 20) => {
    const skip = (page - 1) * limit;

    const [notifications, totalCount] = await prisma.$transaction([
        prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit
        }),
        prisma.notification.count({ where: { userId } })
    ]);

    return {
        notifications,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
    };
};

export const markAsRead = async (userId: string, notificationId: string, unread: boolean = false) => {
    return prisma.notification.update({
        where: { id: notificationId, userId },
        data: { read: !unread },
    });
};
