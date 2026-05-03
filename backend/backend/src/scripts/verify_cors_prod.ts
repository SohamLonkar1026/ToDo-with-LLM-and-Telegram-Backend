
import axios from 'axios';

const TARGET_URL = 'https://todo-with-llm-and-telegram-backend-production.up.railway.app/api/auth/login';
const ORIGIN = 'https://aimom-black.vercel.app';

async function verifyCors() {
    console.log(`Checking CORS for: ${TARGET_URL}`);
    console.log(`Origin: ${ORIGIN}`);

    try {
        const response = await axios.options(TARGET_URL, {
            headers: {
                'Origin': ORIGIN,
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            },
            validateStatus: () => true // Don't throw on 4xx/5xx
        });

        console.log(`\nStatus: ${response.status} ${response.statusText}`);
        console.log('--- RESPONSE HEADERS ---');
        Object.keys(response.headers).forEach(key => {
            if (key.toLowerCase().includes('access-control')) {
                console.log(`${key}: ${response.headers[key]}`);
            }
        });
        console.log('------------------------');

        const allowOrigin = response.headers['access-control-allow-origin'];
        if (allowOrigin === ORIGIN) {
            console.log('✅ CORS Header Present & Correct!');
        } else {
            console.error('❌ CORS Header Missing or Incorrect');
            console.log(`Expected: ${ORIGIN}`);
            console.log(`Got: ${allowOrigin}`);
        }

    } catch (error: any) {
        console.error('❌ Request Failed:', error.message);
        if (error.response) {
            console.log('Response status:', error.response.status);
            console.log('Response headers:', error.response.headers);
        }
    }
}

verifyCors();
