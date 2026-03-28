const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const cols = await p.$queryRawUnsafe(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'Task' ORDER BY ordinal_position"
    );
    const names = cols.map(c => c.column_name);
    console.log('Task columns:', names);
    console.log('Has reminderOffsetMinutes:', names.includes('reminderOffsetMinutes'));
    console.log('Has notifyBeforeHours:', names.includes('notifyBeforeHours'));
    console.log('Has notifyPercentage:', names.includes('notifyPercentage'));
    console.log('Has minGapMinutes:', names.includes('minGapMinutes'));
    await p.$disconnect();
}

main();
