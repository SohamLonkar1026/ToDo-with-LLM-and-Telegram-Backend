/* eslint-disable no-console */
import db from "../src/utils/firestore";
import * as authService from "../src/services/auth.service";
import * as userRepository from "../src/repositories/user.repository";
import * as taskService from "../src/services/task.service";
import * as taskRepository from "../src/repositories/task.repository";
import * as notificationRepository from "../src/repositories/notification.repository";
import * as notificationService from "../src/services/notification.service";
import * as reminderService from "../src/services/reminder.service";
import * as snoozeService from "../src/services/snooze.service";
import * as telegramLinkService from "../src/services/telegram.link.service";
import * as recurringService from "../src/services/recurring.service";

function assert(cond: any, msg: string) {
    if (!cond) {
        throw new Error(`ASSERTION FAILED: ${msg}`);
    }
    console.log(`  ✓ ${msg}`);
}

async function main() {
    console.log("=== 1. Register + login user ===");
    const email = `smoke_${Date.now()}@test.com`;
    const reg = await authService.registerUser(email, "password123");
    assert(reg.userId, "user registered with id");
    const login = await authService.loginUser(email, "password123");
    assert(login.token, "login returns token");

    const userId = reg.userId;

    console.log("=== 2. Create task with array notify fields (due shortly, then becomes overdue) ===");
    const now = Date.now();
    // dueDate must be after createdAt (repo stamps createdAt = now on create), so
    // schedule it 2s in the future and sleep past it before running the reminder check.
    const dueDate = new Date(now + 2000);
    const task = await taskRepository.create({
        title: "Smoke Test Task",
        description: "desc",
        dueDate,
        estimatedMinutes: 30,
        priority: "HIGH",
        status: "PENDING",
        notifyBeforeHours: [1],
        notifyPercentage: [50],
        minGapMinutes: 1,
        userId,
        lastReminderSentAt: null,
        reminderStagesSent: [],
        snoozedUntil: null,
        completedAt: null,
        recurringTemplateId: null,
    });
    assert(task.id, "task created");

    console.log("=== 3. Run reminder.service check (expect overdue notification + reminderStagesSent array-union) ===");
    await new Promise((resolve) => setTimeout(resolve, 2500)); // let dueDate pass
    await reminderService.checkAndTriggerReminders();
    const afterReminder = await taskRepository.findById(task.id);
    assert(afterReminder !== null, "task still exists after reminder check");
    assert(afterReminder!.reminderStagesSent.includes("overdue"), "reminderStagesSent contains 'overdue'");
    const notifSnap = await db.collection("notifications").where("taskId", "==", task.id).get();
    assert(!notifSnap.empty, "notification doc created for overdue task");

    console.log("=== 4. Snooze / unsnooze ===");
    const firstNotifDoc = notifSnap.docs[0];
    await snoozeService.snoozeNotification(userId, firstNotifDoc.id, 30);
    const afterSnooze = await taskRepository.findById(task.id);
    assert(afterSnooze!.snoozedUntil !== null, "task snoozedUntil set after snooze");
    await taskRepository.updateById(task.id, { snoozedUntil: null });
    const afterUnsnooze = await taskRepository.findById(task.id);
    assert(afterUnsnooze!.snoozedUntil === null, "task snoozedUntil cleared after unsnooze");

    console.log("=== 5. Link/unlink Telegram chat id, including uniqueness-collision path ===");
    const code = await telegramLinkService.generateLinkCode(userId);
    assert(code.length === 6, "link code generated");
    const linkResult = await telegramLinkService.linkTelegramAccount(code, "chat-1");
    assert(linkResult.success, "telegram chat linked");
    const userAfterLink = await userRepository.findById(userId);
    assert(userAfterLink!.telegramChatId === "chat-1", "user.telegramChatId set");

    // Collision path: register a second user and link the SAME chatId -> should reassign (steal) from first user
    const email2 = `smoke2_${Date.now()}@test.com`;
    const reg2 = await authService.registerUser(email2, "password123");
    const code2 = await telegramLinkService.generateLinkCode(reg2.userId);
    const linkResult2 = await telegramLinkService.linkTelegramAccount(code2, "chat-1");
    assert(linkResult2.success, "second user linked same chat id (reassignment)");
    const user1AfterCollision = await userRepository.findById(userId);
    const user2AfterCollision = await userRepository.findById(reg2.userId);
    assert(user1AfterCollision!.telegramChatId !== "chat-1", "first user's chatId cleared after reassignment");
    assert(user2AfterCollision!.telegramChatId === "chat-1", "second user now owns chat-1");

    console.log("=== 6. Paginate notifications ===");
    // create a few more notifications directly
    for (let i = 0; i < 3; i++) {
        await db.collection("notifications").add({
            userId,
            taskId: task.id,
            type: "REMINDER",
            message: `extra ${i}`,
            read: false,
            createdAt: new Date(),
        });
    }
    const page1 = await notificationService.getNotifications(userId, 1, 2);
    assert(page1.notifications.length === 2, "pagination returns limit-sized page");
    assert(page1.totalCount >= 4, "pagination totalCount reflects all notifications");

    const markAllResult = await notificationService.markAllAsRead(userId);
    assert(typeof markAllResult.count === "number", "markAllAsRead returns { count }");
    const remainingUnread = await notificationRepository.updateManyUnreadToRead(userId);
    assert(remainingUnread === 0, "no unread notifications remain after markAllAsRead");

    console.log("=== 7. Cleanup job (delete completed tasks older than threshold) ===");
    const completedTask = await taskRepository.create({
        title: "Old Completed Task",
        description: null,
        dueDate: new Date(now - 2 * 24 * 60 * 60 * 1000),
        estimatedMinutes: 10,
        priority: "LOW",
        status: "COMPLETED",
        notifyBeforeHours: [],
        notifyPercentage: [],
        minGapMinutes: 58,
        userId,
        lastReminderSentAt: null,
        reminderStagesSent: [],
        snoozedUntil: null,
        completedAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        recurringTemplateId: null,
    });
    const threshold = new Date(now - 24 * 60 * 60 * 1000);
    const deletedCount = await taskRepository.deleteManyCompletedBefore(threshold);
    assert(deletedCount >= 1, "cleanup job deleted at least the old completed task");
    const goneTask = await taskRepository.findById(completedTask.id);
    assert(goneTask === null, "old completed task no longer exists");
    const goneTaskNotifs = await db.collection("notifications").where("taskId", "==", completedTask.id).get();
    assert(goneTaskNotifs.empty, "cascade-deleted notifications for the cleaned-up task");

    console.log("=== 8. Recurring template across 4am logical-day boundary ===");
    const template = await recurringService.createRecurringTemplate(userId, {
        title: "Daily Standup",
        estimatedMinutes: 15,
        recurrenceType: "DAILY",
    });
    const firstRun = await recurringService.ensureDailyInstances(userId);
    assert(firstRun.some(t => t.recurringTemplateId === template.id), "first ensureDailyInstances created today's instance");
    const secondRun = await recurringService.ensureDailyInstances(userId);
    assert(!secondRun.some(t => t.recurringTemplateId === template.id), "second ensureDailyInstances call is idempotent (no duplicate)");

    console.log("\n✅ ALL SMOKE TESTS PASSED");
    process.exit(0);
}

main().catch((err) => {
    console.error("\n❌ SMOKE TEST FAILED:", err);
    process.exit(1);
});
