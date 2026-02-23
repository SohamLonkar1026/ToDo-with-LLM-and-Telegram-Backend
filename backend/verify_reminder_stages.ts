
import { PrismaClient, NotificationType } from "@prisma/client";
import { checkAndTriggerReminders } from "./src/services/reminder.service";

const prisma = new PrismaClient();

async function runTest() {
    console.log("🧪 STARTING MULTI-STAGE REMINDER VERIFICATION 🧪");

    // Cleanup previous test tasks
    await prisma.notification.deleteMany({ where: { task: { title: { startsWith: "TEST_STAGE_" } } } });
    await prisma.task.deleteMany({ where: { title: { startsWith: "TEST_STAGE_" } } });

    // Create a dummy user if not exists (using first found user)
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("❌ No user found to attach tasks to.");
        return;
    }
    const userId = user.id;

    const now = new Date();

    // --------------------------------------------------------------------------------
    // SCENARIO 1: Immediate Trigger (1h Stage)
    // Task Due: Now + 59 mins
    // Created: 2 hours ago
    // 1h Stage Time: (Now + 59m) - 60m = Now - 1m
    // Expectation: Trigger (Within 2m tolerance)
    // --------------------------------------------------------------------------------
    console.log("\n--- SCENARIO 1: Immediate Trigger (1h Stage) ---");
    const due1 = new Date(now.getTime() + 59 * 60000);
    const created1 = new Date(now.getTime() - 120 * 60000); // 2h ago

    await prisma.task.create({
        data: {
            title: "TEST_STAGE_1_IMMEDIATE",
            userId,
            dueDate: due1,
            estimatedMinutes: 30,
            status: "PENDING",
            createdAt: created1,
            reminderOffsetMinutes: 0, // Not used in new logic, but required
        }
    });

    // --------------------------------------------------------------------------------
    // SCENARIO 2: Skip Retroactive (Created Late) (12h Stage)
    // Task Due: Now + 8 hours
    // Created: 1 minute ago
    // 12h Stage Time: (Now + 8h) - 12h = Now - 4h
    // Expectation: SKIP (Stage Time < CreatedAt)
    // --------------------------------------------------------------------------------
    console.log("--- SCENARIO 2: Skip Retroactive (12h Stage) ---");
    const due2 = new Date(now.getTime() + 8 * 60 * 60000);
    const created2 = new Date(now.getTime() - 1 * 60000); // 1 min ago

    await prisma.task.create({
        data: {
            title: "TEST_STAGE_2_RETROACTIVE",
            userId,
            dueDate: due2,
            estimatedMinutes: 30,
            status: "PENDING",
            createdAt: created2,
        }
    });

    // --------------------------------------------------------------------------------
    // SCENARIO 3: Skip Old / Downtime (1h Stage)
    // Task Due: Now + 10 mins
    // Created: 5 hours ago
    // 1h Stage Time: (Now + 10m) - 60m = Now - 50m
    // Tolerance: 2 mins
    // Expectation: SKIP (Stage Time < Now - Tolerance)
    // --------------------------------------------------------------------------------
    console.log("--- SCENARIO 3: Skip Old/Downtime (1h Stage) ---");
    const due3 = new Date(now.getTime() + 10 * 60000);
    const created3 = new Date(now.getTime() - 300 * 60000); // 5h ago

    await prisma.task.create({
        data: {
            title: "TEST_STAGE_3_DOWNTIME",
            userId,
            dueDate: due3,
            estimatedMinutes: 30,
            status: "PENDING",
            createdAt: created3,
        }
    });

    // --------------------------------------------------------------------------------
    // SCENARIO 4: Future Wait (6h Stage)
    // Task Due: Now + 6h + 10m
    // Created: 10h ago
    // 6h Stage Time: (Now + 6h + 10m) - 6h = Now + 10m
    // Expectation: NO TRIGGER (Stage Time > Now)
    // --------------------------------------------------------------------------------
    console.log("--- SCENARIO 4: Future Wait (6h Stage) ---");
    const due4 = new Date(now.getTime() + 6 * 60 * 60000 + 10 * 60000);
    const created4 = new Date(now.getTime() - 600 * 60000); // 10h ago

    await prisma.task.create({
        data: {
            title: "TEST_STAGE_4_FUTURE",
            userId,
            dueDate: due4,
            estimatedMinutes: 30,
            status: "PENDING",
            createdAt: created4,
        }
    });

    // Run Engine
    console.log("\n🚀 RUNNING REMINDER ENGINE...");
    await checkAndTriggerReminders();
    console.log("✅ Engine cycle complete.\n");

    // Check Results
    const tasks = await prisma.task.findMany({
        where: { title: { startsWith: "TEST_STAGE_" } },
        include: { notifications: true }
    });

    for (const t of tasks) {
        console.log(`Task: ${t.title}`);
        console.log(`  SentStages: ${JSON.stringify(t.reminderStagesSent)}`);
        console.log(`  Notifications: ${t.notifications.length}`);
        t.notifications.forEach(n => console.log(`    - [${n.type}] ${n.message}`));

        // Assertions
        if (t.title.includes("IMMEDIATE")) {
            if (t.notifications.length === 1 && JSON.stringify(t.reminderStagesSent).includes("1h")) {
                console.log("  ✅ RESULT: PASS (Triggered 1h)");
            } else {
                console.error("  ❌ RESULT: FAIL (Expected 1h trigger)");
            }
        }
        else if (t.title.includes("RETROACTIVE")) {
            if (t.notifications.length === 0) {
                console.log("  ✅ RESULT: PASS (Skipped 12h retroactive)");
            } else {
                console.error("  ❌ RESULT: FAIL (Unexpected trigger)");
            }
        }
        else if (t.title.includes("DOWNTIME")) {
            if (t.notifications.length === 0) {
                console.log("  ✅ RESULT: PASS (Skipped Old Stage)");
            } else {
                console.error("  ❌ RESULT: FAIL (Did not skip old stage)");
            }
        }
        else if (t.title.includes("FUTURE")) {
            if (t.notifications.length === 0) {
                console.log("  ✅ RESULT: PASS (Waited for future)");
            } else {
                console.error("  ❌ RESULT: FAIL (Triggered early)");
            }
        }
        console.log("------------------------------------------------");
    }

    console.log("\n🧪 VERIFICATION COMPLETE 🧪");
}

runTest()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
