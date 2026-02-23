
import { PrismaClient } from "@prisma/client";
import env from "../config/env";

const prisma = new PrismaClient();

async function main() {
    console.log("--- RUNTIME ENV VARS ---");
    console.log("JWT_SECRET:", env.JWT_SECRET);

    console.log("\n--- RECENT USERS ---");
    const users = await prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, createdAt: true }
    });
    console.log(JSON.stringify(users, null, 2));
}

main().finally(() => prisma.$disconnect());
