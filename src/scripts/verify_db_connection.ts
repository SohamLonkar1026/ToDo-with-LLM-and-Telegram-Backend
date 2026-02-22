
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Attempting to connect to database...");
    try {
        await prisma.$connect();
        console.log("✅ Successfully connected to the database!");
        // Optional: Run a simple query
        const count = await prisma.user.count();
        console.log(`Current user count: ${count}`);
    } catch (error) {
        console.error("❌ Failed to connect:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
