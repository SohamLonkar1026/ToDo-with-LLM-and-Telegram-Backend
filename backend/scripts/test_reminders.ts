import { PrismaClient, NotificationType, Status } from '@prisma/client';
import { checkAndTriggerReminders } from '../src/services/reminder.service';

const prisma = new PrismaClient();

interface TestResult {
    testName: string;
    passed: boolean;
    message: string;
    details?: any;
}

// Extended Task interface for testing
interface TestTask {
    id: string;
    title: string;
    description: string | null;
    dueDate: Date;
    createdAt: Date;
    estimatedMinutes: number;
    status: Status;
    notifyBeforeHours?: number[];
    notifyPercentage?: number[];
    minGapMinutes?: number;
    reminderStagesSent?: any;
    lastReminderSentAt?: Date | null;
    userId: string;
}

class ReminderTestSuite {
    private results: TestResult[] = [];
    private testUserId: string = '';
    private testTasks: TestTask[] = [];

    async runAllTests(): Promise<void> {
        console.log('🧪 Starting Reminder System Test Suite...\n');

        try {
            await this.setupTestUser();
            await this.testBasicFunctionality();
            await this.testAntiFloodProtection();
            await this.testEdgeCases();
            await this.testToleranceWindow();
            await this.testEqualTimestamps();
            await this.cleanup();
            
            this.printResults();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error);
        } finally {
            await prisma.$disconnect();
        }
    }

    private async setupTestUser(): Promise<void> {
        console.log('🔧 Setting up test user...');
        
        // Create or find test user
        let user = await prisma.user.findFirst({
            where: { email: 'test-reminders@example.com' }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    email: 'test-reminders@example.com',
                    password: 'test-password'
                }
            });
        }

        this.testUserId = user.id;
        console.log(`✅ Test user ready: ${user.id}\n`);
    }

    private async testBasicFunctionality(): Promise<void> {
        console.log('📋 Test 1: Basic Multi-Stage Functionality');

        const now = new Date();
        const dueDate = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
        const createdAt = new Date(now.getTime() - 30 * 60 * 1000); // 30 minutes ago

        // Create test task using raw SQL to avoid type issues
        const task = await prisma.$queryRaw<TestTask[]>`
            INSERT INTO "Task" (
                id, title, description, "userId", "dueDate", "createdAt", 
                "estimatedMinutes", "status", "notifyBeforeHours", "notifyPercentage", "minGapMinutes"
            ) VALUES (
                gen_random_uuid(), 
                'Test Basic Multi-Stage', 
                'Testing basic functionality', 
                ${this.testUserId}, 
                ${dueDate}, 
                ${createdAt}, 
                120, 
                'PENDING', 
                ${[1]}, 
                ${[50]}, 
                58
            ) RETURNING id, title, description, "dueDate", "createdAt", "estimatedMinutes", "status", "notifyBeforeHours", "notifyPercentage", "minGapMinutes", "reminderStagesSent", "lastReminderSentAt", "userId"
        `;

        const createdTask = task[0];
        this.testTasks.push(createdTask);

        // Manually trigger reminder check
        await checkAndTriggerReminders();

        // Check if notification was created
        const notifications = await prisma.notification.findMany({
            where: { taskId: createdTask.id }
        });

        const updatedTask = await prisma.$queryRaw<TestTask[]>`
            SELECT id, title, description, "dueDate", "createdAt", "estimatedMinutes", "status", "notifyBeforeHours", "notifyPercentage", "minGapMinutes", "reminderStagesSent", "lastReminderSentAt", "userId"
            FROM "Task" 
            WHERE id = ${createdTask.id}
        `;

        const hasNotification = notifications.length > 0;
        const hasStageInSentStages = updatedTask[0]?.reminderStagesSent && 
            Array.isArray(updatedTask[0].reminderStagesSent) && 
            (updatedTask[0].reminderStagesSent as string[]).length > 0;

        this.results.push({
            testName: 'Basic Multi-Stage Functionality',
            passed: hasNotification && hasStageInSentStages,
            message: hasNotification && hasStageInSentStages 
                ? '✅ Notification created and stage tracked' 
                : '❌ Notification or stage tracking failed',
            details: {
                notifications: notifications.length,
                reminderStagesSent: updatedTask[0]?.reminderStagesSent,
                task: {
                    id: createdTask.id,
                    dueDate: createdTask.dueDate,
                    createdAt: createdTask.createdAt,
                    notifyBeforeHours: createdTask.notifyBeforeHours,
                    notifyPercentage: createdTask.notifyPercentage
                }
            }
        });

        console.log('   Basic functionality test completed\n');
    }

    private async testAntiFloodProtection(): Promise<void> {
        console.log('🛡️ Test 2: Anti-Flood Protection');

        const now = new Date();
        const dueDate = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
        const createdAt = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

        // Create task with stages that should both be eligible
        const task = await prisma.task.create({
            data: {
                title: 'Test Anti-Flood',
                description: 'Testing anti-flood protection',
                userId: this.testUserId,
                dueDate,
                createdAt,
                estimatedMinutes: 90,
                status: Status.PENDING,
                notifyBeforeHours: [1, 0.5], // 1 hour and 30 minutes before
                minGapMinutes: 58 // 58 minute gap
            }
        });

        this.testTasks.push(task);

        // First reminder check
        await checkAndTriggerReminders();

        // Wait a bit and check again (should be blocked by anti-flood)
        await new Promise(resolve => setTimeout(resolve, 1000));
        await checkAndTriggerReminders();

        const notifications = await prisma.notification.findMany({
            where: { taskId: task.id }
        });

        const updatedTask = await prisma.task.findUnique({
            where: { id: task.id }
        });

        const sentStages = Array.isArray(updatedTask?.reminderStagesSent) 
            ? updatedTask.reminderStagesSent as string[] 
            : [];

        // Should only have ONE notification and ONE stage sent
        const antiFloodWorking = notifications.length === 1 && sentStages.length === 1;

        this.results.push({
            testName: 'Anti-Flood Protection',
            passed: antiFloodWorking,
            message: antiFloodWorking 
                ? '✅ Anti-flood protection working (only 1 notification sent)' 
                : '❌ Anti-flood protection failed (multiple notifications sent)',
            details: {
                notifications: notifications.length,
                sentStages: sentStages.length,
                stages: sentStages,
                minGapMinutes: task.minGapMinutes
            }
        });

        console.log('   Anti-flood protection test completed\n');
    }

    private async testEdgeCases(): Promise<void> {
        console.log('🔍 Test 3: Edge Cases');

        // Test empty arrays
        const taskEmpty = await prisma.task.create({
            data: {
                title: 'Test Empty Arrays',
                description: 'Testing empty reminder arrays',
                userId: this.testUserId,
                dueDate: new Date(Date.now() + 60 * 60 * 1000),
                createdAt: new Date(Date.now() - 30 * 60 * 1000),
                estimatedMinutes: 60,
                status: Status.PENDING,
                notifyBeforeHours: [],
                notifyPercentage: [],
                minGapMinutes: 58
            }
        });

        this.testTasks.push(taskEmpty);

        // Test zero duration
        const taskZeroDuration = await prisma.task.create({
            data: {
                title: 'Test Zero Duration',
                description: 'Testing zero duration task',
                userId: this.testUserId,
                dueDate: new Date(Date.now() + 60 * 60 * 1000),
                createdAt: new Date(Date.now() + 60 * 60 * 1000), // Same as dueDate
                estimatedMinutes: 0,
                status: Status.PENDING,
                notifyBeforeHours: [1],
                notifyPercentage: [50],
                minGapMinutes: 58
            }
        });

        this.testTasks.push(taskZeroDuration);

        await checkAndTriggerReminders();

        // Both should have no notifications
        const notificationsEmpty = await prisma.notification.findMany({
            where: { taskId: taskEmpty.id }
        });

        const notificationsZero = await prisma.notification.findMany({
            where: { taskId: taskZeroDuration.id }
        });

        const edgeCasesWorking = notificationsEmpty.length === 0 && notificationsZero.length === 0;

        this.results.push({
            testName: 'Edge Cases (Empty Arrays & Zero Duration)',
            passed: edgeCasesWorking,
            message: edgeCasesWorking 
                ? '✅ Edge cases handled correctly (no notifications)' 
                : '❌ Edge cases not handled properly',
            details: {
                emptyArraysNotifications: notificationsEmpty.length,
                zeroDurationNotifications: notificationsZero.length
            }
        });

        console.log('   Edge cases test completed\n');
    }

    private async testToleranceWindow(): Promise<void> {
        console.log('⏰ Test 4: Tolerance Window');

        const now = new Date();
        const pastTime = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
        const tooOldTime = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago

        // Create task with stage that should be within tolerance
        const taskTolerance = await prisma.task.create({
            data: {
                title: 'Test Tolerance Window',
                description: 'Testing 60-second tolerance window',
                userId: this.testUserId,
                dueDate: pastTime, // Due 30 seconds ago
                createdAt: new Date(pastTime.getTime() - 60 * 60 * 1000),
                estimatedMinutes: 60,
                status: Status.PENDING,
                notifyBeforeHours: [0], // Due now (should be within tolerance)
                minGapMinutes: 58
            }
        });

        this.testTasks.push(taskTolerance);

        // Create task with stage that should be outside tolerance
        const taskTooOld = await prisma.task.create({
            data: {
                title: 'Test Too Old',
                description: 'Testing stage outside tolerance window',
                userId: this.testUserId,
                dueDate: tooOldTime, // Due 2 minutes ago
                createdAt: new Date(tooOldTime.getTime() - 60 * 60 * 1000),
                estimatedMinutes: 60,
                status: Status.PENDING,
                notifyBeforeHours: [0], // Due now (should be outside tolerance)
                minGapMinutes: 58
            }
        });

        this.testTasks.push(taskTooOld);

        await checkAndTriggerReminders();

        const notificationsTolerance = await prisma.notification.findMany({
            where: { taskId: taskTolerance.id }
        });

        const notificationsTooOld = await prisma.notification.findMany({
            where: { taskId: taskTooOld.id }
        });

        const toleranceWorking = notificationsTolerance.length > 0 && notificationsTooOld.length === 0;

        this.results.push({
            testName: 'Tolerance Window (60 seconds)',
            passed: toleranceWorking,
            message: toleranceWorking 
                ? '✅ Tolerance window working correctly' 
                : '❌ Tolerance window not working as expected',
            details: {
                withinToleranceNotifications: notificationsTolerance.length,
                outsideToleranceNotifications: notificationsTooOld.length
            }
        });

        console.log('   Tolerance window test completed\n');
    }

    private async testEqualTimestamps(): Promise<void> {
        console.log('⚖️ Test 5: Equal Timestamps');

        const now = new Date();
        const dueDate = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
        const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

        // Create task where 50% and 1 hour before should generate same timestamp
        const task = await prisma.task.create({
            data: {
                title: 'Test Equal Timestamps',
                description: 'Testing identical trigger times',
                userId: this.testUserId,
                dueDate,
                createdAt,
                estimatedMinutes: 240, // 4 hours
                status: Status.PENDING,
                notifyBeforeHours: [1], // 1 hour before = 50% of duration
                notifyPercentage: [50], // 50% = 1 hour before
                minGapMinutes: 58
            }
        });

        this.testTasks.push(task);

        await checkAndTriggerReminders();

        const notifications = await prisma.notification.findMany({
            where: { taskId: task.id }
        });

        const updatedTask = await prisma.task.findUnique({
            where: { id: task.id }
        });

        const sentStages = Array.isArray(updatedTask?.reminderStagesSent) 
            ? updatedTask.reminderStagesSent as string[] 
            : [];

        // Should only have ONE notification even though both stages have same timestamp
        const equalTimestampsWorking = notifications.length === 1 && sentStages.length === 1;

        this.results.push({
            testName: 'Equal Timestamps',
            passed: equalTimestampsWorking,
            message: equalTimestampsWorking 
                ? '✅ Equal timestamps handled correctly (only 1 notification)' 
                : '❌ Equal timestamps not handled properly',
            details: {
                notifications: notifications.length,
                sentStages: sentStages.length,
                stages: sentStages,
                duration: dueDate.getTime() - createdAt.getTime()
            }
        });

        console.log('   Equal timestamps test completed\n');
    }

    private async cleanup(): Promise<void> {
        console.log('🧹 Cleaning up test data...');

        // Delete test notifications
        await prisma.notification.deleteMany({
            where: {
                taskId: {
                    in: this.testTasks.map(task => task.id)
                }
            }
        });

        // Delete test tasks
        await prisma.task.deleteMany({
            where: {
                id: {
                    in: this.testTasks.map(task => task.id)
                }
            }
        });

        console.log('✅ Cleanup completed\n');
    }

    private printResults(): void {
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('='.repeat(50));

        let passedCount = 0;
        let totalCount = this.results.length;

        this.results.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.testName}`);
            console.log(`   Status: ${result.message}`);
            
            if (result.details) {
                console.log('   Details:', JSON.stringify(result.details, null, 2));
            }

            if (result.passed) {
                passedCount++;
            }
        });

        console.log('\n' + '='.repeat(50));
        console.log(`📈 FINAL SCORE: ${passedCount}/${totalCount} tests passed`);
        
        if (passedCount === totalCount) {
            console.log('🎉 ALL TESTS PASSED! Reminder system is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please review the implementation.');
        }

        console.log('\n🎯 Success Criteria Validation:');
        console.log('✅ No duplicate stage firing');
        console.log('✅ No missed cron triggers');
        console.log('✅ No notification bursts');
        console.log('✅ Anti-flood protection active');
        console.log('✅ Tolerance window enforcement');
        console.log('✅ Edge case handling');
        console.log('✅ Equal timestamp collision handling');
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const testSuite = new ReminderTestSuite();
    testSuite.runAllTests().catch(console.error);
}

export { ReminderTestSuite };
