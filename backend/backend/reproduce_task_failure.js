
const axios = require('axios');
const dotenv = require('dotenv'); // Add dotenv

dotenv.config(); // Load env vars

const API_URL = 'http://localhost:4001/api';

async function run() {
    try {
        // 1. Register
        const email = `test_task_${Date.now()}@test.com`;
        const password = 'password123';

        console.log(`\n--- REGISTERING: ${email} ---`);
        try {
            await axios.post(`${API_URL}/auth/register`, { email, password });
            console.log('✅ Registration successful');
        } catch (e) {
            console.log('⚠️ Registration failed (maybe exists):', e.response?.data || e.message);
        }

        // 2. Login
        console.log('\n--- LOGGING IN ---');
        const loginRes = await axios.post(`${API_URL}/auth/login`, { email, password });
        const token = loginRes.data.data.token;
        console.log('✅ Login successful. Token obtained.');

        // 2a. DELETE USER to simulate "db reset" while token is valid
        console.log('\n--- DELETING USER (Simulating DB Reset) ---');
        // We need a way to delete the user. Since we don't have an endpoint, 
        // we might fail here if we relying only on API. 
        // But wait, we can just use a made-up User ID if the token was just signed? 
        // No, we need a signed token. 

        // Actually, let's just use the `verify_task_failure.js` to connect to DB and delete the user
        const { Client } = require('pg');
        const client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
        await client.query(`DELETE FROM "User" WHERE email = '${email}'`);
        await client.end();
        console.log('✅ User deleted from DB.');

        // 3. Create Task (Should Fail)
        console.log('\n--- CREATING TASK (With Stale Token) ---');
        const taskPayload = {
            title: "Debug Task Stale",
            description: "This should fail",
            dueDate: new Date().toISOString(),
            estimatedMinutes: 30,
            priority: "HIGH",
            reminderOffsetMinutes: 15
        };
        console.log('Payload:', taskPayload);

        const taskRes = await axios.post(`${API_URL}/tasks`, taskPayload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('❌ UNEXPECTED SUCCESS:', taskRes.data);

    } catch (error) {
        console.log('\n--- EXPECTED FAILURE CAUGHT ---');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

run();
