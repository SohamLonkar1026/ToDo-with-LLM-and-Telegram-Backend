
import prisma from "../utils/prisma";

export interface ConversationSessionData {
    title?: string;
    dueDate?: string; // ISO string or just string for now? Date object is safer. Let's store ISO string in JSON
    description?: string;
    // duration and urgency will be parsed at the end
}

export const createSession = async (chatId: string, step: string, partialData: ConversationSessionData) => {
    // Upsert to ensure one session per user
    return await prisma.conversationSession.upsert({
        where: { telegramChatId: chatId },
        update: {
            step: step,
            partialData: partialData as any,
            updatedAt: new Date()
        },
        create: {
            telegramChatId: chatId,
            step: step,
            partialData: partialData as any
        }
    });
};

export const getSession = async (chatId: string) => {
    return await prisma.conversationSession.findUnique({
        where: { telegramChatId: chatId }
    });
};

export const updateSession = async (chatId: string, step: string, partialDataToMerge: Partial<ConversationSessionData>) => {
    const session = await getSession(chatId);
    if (!session) return null;

    const currentData = session.partialData as ConversationSessionData;
    const newData = { ...currentData, ...partialDataToMerge };

    return await prisma.conversationSession.update({
        where: { telegramChatId: chatId },
        data: {
            step: step,
            partialData: newData as any
        }
    });
};

/**
 * Delete session (on completion or cancellation)
 */
export const deleteSession = async (chatId: string) => {
    try {
        await prisma.conversationSession.delete({
            where: { telegramChatId: chatId }
        });
    } catch (e) {
        // Ignore if already deleted
    }
};
