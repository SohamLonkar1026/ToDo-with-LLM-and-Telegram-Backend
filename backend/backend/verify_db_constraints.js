
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    console.log('--- START VERIFICATION ---');
    try {
        await client.connect();

        // 1. Check User Table Existence
        const resCount = await client.query('SELECT count(*) FROM "User"');
        console.log(`User Table Count: ${resCount.rows[0].count}`);

        // 2. Dump Indexes
        const resIndexes = await client.query(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'User'
        `);

        console.log('--- USER INDEXES JSON ---');
        console.log(JSON.stringify(resIndexes.rows, null, 2));
        console.log('--- END JSON ---');

    } catch (error) {
        console.error('ERROR:', error);
    } finally {
        await client.end();
    }
}

main();
