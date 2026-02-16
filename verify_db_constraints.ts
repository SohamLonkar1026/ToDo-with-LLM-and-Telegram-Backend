
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '.env') });

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    console.log('🔍 Verifying Database Constraints using node-postgres...\n');

    const dbUrl = process.env.DATABASE_URL || '';
    console.log(`Connection String: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);

    try {
        await client.connect();

        // Force search path
        await client.query("SET search_path TO public;");

        // Query 1: List All Tables
        console.log('--- TABLES IN DB ---');
        const resTables = await client.query(`
            SELECT schemaname, tablename 
            FROM pg_catalog.pg_tables 
            WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';
        `);
        console.table(resTables.rows);

        // Query 2: Information Schema (ALL UNIQUE CONSTRAINTS)
        console.log('--- ALL UNIQUE CONSTRAINTS (Limit 50) ---');
        const resConstraints = await client.query(`
            SELECT
                tc.constraint_name,
                tc.table_name,
                kcu.column_name
            FROM
                information_schema.table_constraints tc
            JOIN
                information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE
                tc.constraint_type = 'UNIQUE'
                AND tc.table_schema = 'public'
            LIMIT 50
        `);
        console.table(resConstraints.rows);

        // Query 2: PG Indexes (ALL UNIQUE)
        console.log('\n--- ALL UNIQUE INDEXES (Limit 50) ---');
        const resIndexes = await client.query(`
            SELECT
                tablename,
                indexname,
                indexdef
            FROM
                pg_indexes
            WHERE
                schemaname = 'public'
                AND indexdef LIKE '%UNIQUE%'
            LIMIT 50
        `);
        console.table(resIndexes.rows);

    } catch (error) {
        console.error('❌ Error executing queries:', error);
    } finally {
        await client.end();
    }
}

main();
