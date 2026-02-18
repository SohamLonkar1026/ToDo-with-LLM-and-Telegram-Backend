import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import recurringRoutes from "./routes/recurring.routes";
import notificationRoutes from "./routes/notification.routes";
import telegramRoutes from "./routes/telegram.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import env from "./config/env";
import { telegramWebhook } from "./controllers/telegram.controller";
import aiRoutes from "./routes/ai.routes";

const app = express();

// ----------------------------------------------------------------------
// 🚨 CRITICAL: CORS MUST BE THE FIRST MIDDLEWARE
// ----------------------------------------------------------------------
app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "https://aimom-black.vercel.app"
        ],
        credentials: true
    })
);

// Explicit Preflight Handling
app.options("*", cors());

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

// Health check
app.get("/api/health", (_req, res) => {
    res.json({ success: true, message: "AI-MOM API is running." });
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

// Centralized error handler
app.use(errorMiddleware);

export default app;
