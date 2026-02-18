
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const API_URL = 'http://localhost:4001/api';

async function run() {
    try {
        // 1. Register a new user to get a valid token
        const email = `telegram_debug_${Date.now()}@test.com`;
        const password = 'password123';

        console.log(`\n--- REGISTERING: ${email} ---`);
        await axios.post(`${API_URL}/auth/register`, { email, password });
        console.log('✅ Registration successful');

        // 2. Login
        console.log('\n--- LOGGING IN ---');
        const loginRes = await axios.post(`${API_URL}/auth/login`, { email, password });
        const token = loginRes.data.data.token;
        console.log('✅ Login successful. Token obtained.');

        // 3. Call Generate Link
        console.log('\n--- CALLING /api/telegram/link/generate ---');
        try {
            const linkRes = await axios.post(
                `${API_URL}/telegram/link/generate`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            console.log('✅ Link Generated:', linkRes.data);
        } catch (error) {
            console.error('❌ Link Generation Failed:');
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.error(error.message);
            }
        }

    } catch (error) {
        console.error('❌ Setup Failed:', error.message);
    }
}

run();
