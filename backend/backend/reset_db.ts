
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Starting database cleanup...');

    // 1. Delete Child Tables (Foreign Keys first)
    // Notification depends on User and Task
    console.log('Deleting Notifications...');
    await prisma.notification.deleteMany({});

    // Tasks depend on User and RecurringTemplate
    console.log('Deleting Tasks...');
    await prisma.task.deleteMany({});

    // RecurringTemplate depends on User
    // (Tasks also depend on RecurringTemplate, so deleted Tasks first)
    console.log('Deleting RecurringTemplates...');
    await prisma.recurringTemplate.deleteMany({});

    // 2. Delete Independent Tables
    console.log('Deleting ConversationSessions...');
    await prisma.conversationSession.deleteMany({});

    // 3. Delete Parent Table (User)
    console.log('Deleting Users...');
    await prisma.user.deleteMany({});

    console.log('✅ Database cleared successfully.');
}

main()
    .catch((e) => {
        console.error('❌ Error clearing database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
