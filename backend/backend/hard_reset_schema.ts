
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔥 Starting HARD schema reset...');

    try {
        // Drop all known tables in correct order (or CASCADE)
        // Using raw SQL is safer for schema operations than deleteMany (which needs tables to exist)

        const tablenames = [
            'Notification',
            'Task',
            'RecurringTemplate',
            'ConversationSession',
            'User',
            '_prisma_migrations'
        ];

        for (const table of tablenames) {
            try {
                console.log(`Dropping table "${table}"...`);
                // Use quote for case sensitivity just in case
                await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
            } catch (e) {
                console.warn(`Failed to drop "${table}" (might not exist):`, e);
            }
        }

        // Also try dropping types if they exist
        try {
            await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "Priority";`);
            await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "Status";`);
            await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "NotificationType";`);
            await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "RecurrenceType";`);
        } catch (e) {
            console.log("Types might not need dropping or failed:", e);
        }

        console.log('✅ Remote schema wiped. Ready for init_fresh.');

    } catch (error) {
        console.error('❌ Error during hard reset:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
