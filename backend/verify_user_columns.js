
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    console.log('--- USER TABLE COLUMNS ---');
    try {
        await client.connect();

        const resColumns = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'User'
            ORDER BY ordinal_position;
        `);
        console.log('COLUMNS:', resColumns.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));

        console.log('--- USER TABLE CONSTRAINTS ---');
        const resConstraints = await client.query(`
             SELECT
                tc.constraint_name,
                tc.constraint_type,
                kcu.column_name
            FROM
                information_schema.table_constraints tc
            JOIN
                information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE
                tc.table_name = 'User'
        `);
        console.log(JSON.stringify(resConstraints.rows, null, 2));

    } catch (error) {
        console.error('ERROR:', error);
    } finally {
        await client.end();
    }
}

main();
