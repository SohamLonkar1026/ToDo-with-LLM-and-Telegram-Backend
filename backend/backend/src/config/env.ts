import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
    PORT: number;
    DATABASE_URL: string;
    JWT_SECRET: string;
    NODE_ENV: string;
    FRONTEND_URL: string;
    TELEGRAM_BOT_TOKEN?: string;
}

function loadEnv(): EnvConfig {
    const { PORT, DATABASE_URL, JWT_SECRET, NODE_ENV, FRONTEND_URL } = process.env;

    if (!DATABASE_URL) {
        throw new Error("DATABASE_URL is not defined in environment variables.");
    }

    if (!JWT_SECRET) {
        throw new Error("JWT_SECRET is not defined in environment variables.");
    }

    return {
        PORT: parseInt(PORT || "4000", 10),
        DATABASE_URL,
        JWT_SECRET,
        NODE_ENV: NODE_ENV || "development",
        FRONTEND_URL: FRONTEND_URL || "*",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN
    };
}

const env = loadEnv();

export default env;
