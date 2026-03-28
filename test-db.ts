import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

async function testConnection() {
    const prisma = new PrismaClient();
    try {
        console.log('Attempting to connect to the database...');
        await prisma.$connect();
        console.log('Successfully connected to the database!');

        const userColumns = await prisma.$queryRaw<any[]>`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'User'
      ORDER BY column_name
    `;

        const migrations = await prisma.$queryRaw<any[]>`
      SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC
    `;

        const results = {
            userColumns,
            migrations
        };

        fs.writeFileSync('audit_results.json', JSON.stringify(results, null, 2));
        console.log('Results written to audit_results.json');

    } catch (error) {
        console.error('Failed to connect to the database:');
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

testConnection();
