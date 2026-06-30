import express from "express";
import cors from "cors";
import helmet from "helmet";
import Razorpay from "razorpay";
import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import recurringRoutes from "./routes/recurring.routes";
import notificationRoutes from "./routes/notification.routes";
import telegramRoutes from "./routes/telegram.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import env from "./config/env";
import { telegramWebhook } from "./controllers/telegram.controller";
import * as userRepository from "./repositories/user.repository";
import aiRoutes from "./routes/ai.routes";
import settingsRoutes from "./routes/settings.routes";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID as string,
    key_secret: process.env.RAZORPAY_KEY_SECRET as string,
});

const app = express();

console.log("🔥 DEPLOY VERSION: CORS FIX ACTIVE 🔥");

// ----------------------------------------------------------------------
// 🚨 CRITICAL: CORS MUST BE THE FIRST MIDDLEWARE
// ----------------------------------------------------------------------
const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://aimom-black.vercel.app",
    "https://taskora-solo.vercel.app",
    "https://taskora.sohamlonkar.com",
    env.FRONTEND_URL
];

const corsOptions: cors.CorsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
};

app.use(cors(corsOptions));

// Explicit Preflight Handling
app.options("*", cors(corsOptions));

// ----------------------------------------------------------------------
// Security & Body Parsing
// ----------------------------------------------------------------------
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Request Logger (Dev only)
if (env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[HTTP] ${req.method} ${req.url}`);
        next();
    });
}

// ----------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------

// Root health check (Railway default)
app.get("/", (_req, res) => {
    res.status(200).send("OK");
});

// Auto-ping health check for cron-job.org
app.get('/health', (req, res) => {
    res.send('OK');
});

// Health check with Database Ping
app.get("/api/health", async (_req, res) => {
    try {
        // Microscopic query to verify Firestore connectivity
        await userRepository.countUsers();
        res.json({
            success: true, 
            message: "Taskora API & Database are live.",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Database connection failed." });
    }
});

// Webhook
app.post("/api/telegram/webhook", telegramWebhook);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/settings", settingsRoutes);

// Razorpay — Create Order
app.post("/create-order", async (req, res) => {
    try {
        const options = {
            amount: 30000, // ₹300 in paise
            currency: "INR",
            receipt: "telegram_lifetime_" + Date.now(),
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Order creation failed" });
    }
});

// Centralized error handler
app.use(errorMiddleware);

export default app;
