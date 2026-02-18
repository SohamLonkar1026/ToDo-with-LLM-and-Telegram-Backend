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

const app = express();

// Security Middleware
app.use(helmet());

// Request Logger (Dev only)
if (env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[HTTP] ${req.method} ${req.url}`);
        next();
    });
}

// CORS
const allowedOrigins = env.NODE_ENV === 'production'
    ? [env.FRONTEND_URL]
    : ['http://localhost:5173'];

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Health check
app.get("/api/health", (_req, res) => {
    res.json({ success: true, message: "AI-MOM API is running." });
});

// Webhook Route (Before other routes if specific parsing needed, but standard JSON body parser is fine here)
import { telegramWebhook } from "./controllers/telegram.controller";
app.post("/api/telegram/webhook", telegramWebhook);

import aiRoutes from "./routes/ai.routes";

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/recurring", recurringRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/ai", aiRoutes);

// Centralized error handler
app.use(errorMiddleware);

export default app;
