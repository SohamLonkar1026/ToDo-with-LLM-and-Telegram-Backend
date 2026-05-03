
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting cleanup of duplicate telegramChatIds...');

    // 1. Find all users with a telegramChatId
    const usersWithChatId = await prisma.user.findMany({
        where: {
            telegramChatId: { not: null }
        },
        select: {
            id: true,
            email: true,
            telegramChatId: true
        }
    });

    const chatIdMap = new Map<string, string[]>();

    // 2. Group by chatId
    for (const user of usersWithChatId) {
        if (!user.telegramChatId) continue;

        if (!chatIdMap.has(user.telegramChatId)) {
            chatIdMap.set(user.telegramChatId, []);
        }
        chatIdMap.get(user.telegramChatId)?.push(user.id);
    }

    // 3. Nullify duplicates
    for (const [chatId, userIds] of chatIdMap.entries()) {
        if (userIds.length > 1) {
            console.log(`Found duplicate usage of chatId ${chatId} by users: ${userIds.join(', ')}`);

            // Keep the first one, nullify others (or nullify all if safer, but keeping one is usually better)
            // Let's nullify ALL duplicates to force re-linking and avoid ambiguity about who owns it.
            // Safety first.

            console.log(`Nullifying telegramChatId for users: ${userIds.join(', ')}`);
            await prisma.user.updateMany({
                where: {
                    id: { in: userIds }
                },
                data: {
                    telegramChatId: null
                }
            });
        }
    }

    console.log('Cleanup complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
