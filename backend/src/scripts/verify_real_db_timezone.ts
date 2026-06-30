
import { formatInTimeZone } from "date-fns-tz";
import db from "../utils/firestore";
import * as taskRepository from "../repositories/task.repository";

async function main() {
    console.log("---------------------------------------------------");
    console.log("🧪 LIVE DB TIMEZONE VERIFICATION");
    console.log("---------------------------------------------------");

    // 1. Define Test Data (5:00 PM IST = 11:30 UTC)
    const expectedUTC = "2026-02-18T11:30:00.000Z";

    console.log(`🔹 Creating Test Task`);
    console.log(`   Target: 5:00 PM IST`);
    console.log(`   Input Payload (UTC): ${expectedUTC}`);

    try {
        const firstUserSnap = await db.collection("users").limit(1).get();
        const userId = firstUserSnap.empty ? "fallback-uuid" : firstUserSnap.docs[0].id;

        // 2. Insert Task
        const task = await taskRepository.create({
            title: "Timezone Verification Task (Automated)",
            description: "Automated test task to verify UTC storage in Firestore",
            dueDate: new Date(expectedUTC),
            estimatedMinutes: 30,
            priority: "HIGH",
            status: "PENDING",
            notifyBeforeHours: [],
            notifyPercentage: [],
            minGapMinutes: 58,
            userId,
            lastReminderSentAt: null,
            reminderStagesSent: [],
            snoozedUntil: null,
            completedAt: null,
            recurringTemplateId: null,
        });

        console.log(`   ✅ Task Created! ID: ${task.id}`);

        // 3. Verify Storage (Raw)
        const storedDateISO = task.dueDate.toISOString();
        console.log(`\n🔹 Database Storage Check`);
        console.log(`   Stored Value (ISO): ${storedDateISO}`);

        if (storedDateISO === expectedUTC) {
            console.log(`   ✅ UTC Integrity Confirmed (+00 offset)`);
        } else {
            console.error(`   ❌ Mismatch! Stored: ${storedDateISO}`);
        }

        // 4. Verify Display Logic
        console.log(`\n🔹 Display Logic Check`);
        const formattedIST = formatInTimeZone(task.dueDate, "Asia/Kolkata", "MMM d, h:mm a");
        const expectedDisplay = "Feb 18, 5:00 PM";

        console.log(`   Formatted (IST): "${formattedIST}"`);
        console.log(`   Expected:        "${expectedDisplay}"`);

        if (formattedIST === expectedDisplay) {
            console.log(`   ✅ Display Logic Verified`);
        } else {
            console.error(`   ❌ Display Logic Failed`);
        }

    } catch (error) {
        console.error("❌ verification failed:", error);
    }
}

main();
