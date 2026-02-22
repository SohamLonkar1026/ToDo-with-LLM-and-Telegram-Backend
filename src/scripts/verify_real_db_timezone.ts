
import { PrismaClient } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

const prisma = new PrismaClient();

async function main() {
    console.log("---------------------------------------------------");
    console.log("🧪 LIVE DB TIMEZONE VERIFICATION");
    console.log("---------------------------------------------------");

    // 1. Define Test Data (5:00 PM IST = 11:30 UTC)
    const targetIST = "2026-02-18 17:00:00";
    const expectedUTC = "2026-02-18T11:30:00.000Z";

    console.log(`🔹 Creating Test Task`);
    console.log(`   Target: 5:00 PM IST`);
    console.log(`   Input Payload (UTC): ${expectedUTC}`);

    try {
        // 2. Insert Task
        const task = await prisma.task.create({
            data: {
                title: "Timezone Verification Task (Automated)",
                dueDate: new Date(expectedUTC),
                estimatedMinutes: 30,
                priority: "HIGH",
                userId: (await prisma.user.findFirst())?.id || "fallback-uuid", // Use first user
                description: "Automated test task to verify UTC storage through Supavisor"
            }
        });

        console.log(`   ✅ Task Created! ID: ${task.id}`);

        // 3. Verify Storage (Raw)
        // Prisma returns JS Date object which is UTC-based
        const storedDateISO = task.dueDate.toISOString();
        console.log(`\n🔹 Database Storage Check`);
        console.log(`   Stored Value (ISO): ${storedDateISO}`);

        if (storedDateISO === expectedUTC) {
            console.log(`   ✅ UTC Integrity Confirmed (+00 offset)`);
        } else {
            console.error(`   ❌ Mismatch! Stored: ${storedDateISO}`);
            // Logic to check if it's just a millisecond difference? 
            // Postgres sometimes truncates or adds precision. 
            // expected: .000Z. Stored might be .000Z or just Z if 000.
            // Let's rely on strict equality first.
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
    } finally {
        await prisma.$disconnect();
    }
}

main();
