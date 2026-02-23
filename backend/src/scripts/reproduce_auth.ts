
import axios from 'axios';

const API_URL = 'http://localhost:4001/api/auth';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'password123';

async function testAuth() {
    console.log("1. Testing Registration...");
    try {
        const regRes = await axios.post(`${API_URL}/register`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            username: `user_${Date.now()}`
        });
        console.log('✅ Register Status:', regRes.status);
        console.log('✅ Register Data:', regRes.data);
    } catch (error: any) {
        console.error('❌ Register Failed:', error.response?.status, error.response?.data || error.message);
    }

    console.log("\n2. Testing Login...");
    try {
        const loginRes = await axios.post(`${API_URL}/login`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        console.log('✅ Login Status:', loginRes.status);
        console.log('✅ Login Data:', loginRes.data);
    } catch (error: any) {
        console.error('❌ Login Failed:', error.response?.status, error.response?.data || error.message);
    }

    console.log("\n3. Testing Duplicate Register...");
    try {
        await axios.post(`${API_URL}/register`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            username: `duplicate_user`
        });
        console.error('❌ Duplicate Register Should Have Failed but Succeeded');
    } catch (error: any) {
        if (error.response?.data?.error?.includes("Unique constraint")) {
            console.log('✅ Duplicate Register Failed Correctly (Unique Constraint)');
        } else {
            console.log('⚠️ Duplicate Register Failed with:', error.response?.status, error.response?.data || error.message);
        }
    }
}

testAuth();
