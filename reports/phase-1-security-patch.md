# Phase 1 Security Patch Audit Report

**Date:** 2026-02-15
**Status:** ✅ Applied & Verified

---

## 1. Modified Files

### `src/services/auth.service.ts`
**Change:** Added email normalization (`toLowerCase().trim()`) for registration and login.

```typescript
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";
import env from "../config/env";

const SALT_ROUNDS = 10;

export async function registerUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
        throw { status: 409, message: "User with this email already exists." };
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
        data: { email: normalizedEmail, password: hashedPassword },
    });

    const token = generateToken(user.id);

    return { userId: user.id, email: user.email, token };
}

export async function loginUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        throw { status: 401, message: "Invalid email or password." };
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
        throw { status: 401, message: "Invalid email or password." };
    }

    const token = generateToken(user.id);

    return { userId: user.id, email: user.email, token };
}

function generateToken(userId: string): string {
    return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "7d" });
}
```

### `src/services/task.service.ts`
**Change:** Replaced simple ID checks with secure `findFirst({ where: { id, userId } })` to strictly enforce ownership at query level.

```typescript
import prisma from "../utils/prisma";
import { Priority, Status } from "@prisma/client";

interface CreateTaskInput {
    title: string;
    description?: string;
    dueDate: string;
    estimatedMinutes: number;
    priority?: Priority;
    reminderOffsetMinutes?: number;
}

interface UpdateTaskInput {
    title?: string;
    description?: string;
    dueDate?: string;
    estimatedMinutes?: number;
    priority?: Priority;
    status?: Status;
    reminderOffsetMinutes?: number;
}

export async function createTask(userId: string, data: CreateTaskInput) {
    return prisma.task.create({
        data: {
            title: data.title,
            description: data.description,
            dueDate: new Date(data.dueDate),
            estimatedMinutes: data.estimatedMinutes,
            priority: data.priority || "MEDIUM",
            reminderOffsetMinutes: data.reminderOffsetMinutes ?? 60,
            userId,
        },
    });
}

export async function getTasksByUser(userId: string) {
    return prisma.task.findMany({
        where: { userId },
        orderBy: { dueDate: "asc" },
    });
}

export async function getTaskById(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
    });

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return task;
}

export async function updateTask(
    userId: string,
    taskId: string,
    data: UpdateTaskInput
) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
    });

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return prisma.task.update({
        where: { id: taskId },
        data: {
            ...(data.title !== undefined && { title: data.title }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.dueDate !== undefined && { dueDate: new Date(data.dueDate) }),
            ...(data.estimatedMinutes !== undefined && {
                estimatedMinutes: data.estimatedMinutes,
            }),
            ...(data.priority !== undefined && { priority: data.priority }),
            ...(data.status !== undefined && { status: data.status }),
            ...(data.reminderOffsetMinutes !== undefined && {
                reminderOffsetMinutes: data.reminderOffsetMinutes,
            }),
        },
    });
}

export async function deleteTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, userId },
    });

    if (!task) {
        throw { status: 404, message: "Task not found." };
    }

    return prisma.task.delete({ where: { id: taskId } });
}
```

### `src/app.ts`
**Change:** Included `cors` logic with `FRONTEND_URL` support.

```typescript
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

// CORS
app.use(
    cors({
        origin: process.env.FRONTEND_URL || "*",
        credentials: true,
    })
);

// Body parsing
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
    res.json({ success: true, message: "AI-MOM API is running." });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);

// Centralized error handler
app.use(errorMiddleware);

export default app;
```

### `.env.example`
**Change:** added `FRONTEND_URL`.

```bash
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
JWT_SECRET=your-secret-key-here
FRONTEND_URL=http://localhost:3000
```

---

## 2. Validation Results

- **Build Check:** ✅ Passed (`npm run build` exited with code 0).
- **TypeScript Compilation:** ✅ Clean (No errors found).
- **Dependencies:** `cors` and `@types/cors` installed.

The backend is now patched with normalized auth, strict ownership queries, and CORS support.
