import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
    PORT: number;
    JWT_SECRET: string;
    NODE_ENV: string;
    FRONTEND_URL: string;
    TELEGRAM_BOT_TOKEN?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_CLIENT_EMAIL?: string;
    FIREBASE_PRIVATE_KEY?: string;
    FIRESTORE_EMULATOR_HOST?: string;
}

function loadEnv(): EnvConfig {
    const { PORT, JWT_SECRET, NODE_ENV, FRONTEND_URL, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIRESTORE_EMULATOR_HOST } = process.env;

    if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined in environment variables.");
    }

    if (!FIRESTORE_EMULATOR_HOST && (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY)) {
        throw new Error("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are not defined in environment variables.");
    }

    return {
        PORT: parseInt(PORT || "4000", 10),
        JWT_SECRET,
        NODE_ENV: NODE_ENV || "development",
        FRONTEND_URL: FRONTEND_URL || "*",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY,
        FIRESTORE_EMULATOR_HOST
    };
}

const env = loadEnv();

export default env;
