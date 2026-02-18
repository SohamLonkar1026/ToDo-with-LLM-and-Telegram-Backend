# Phase 1 Technical Audit Report — AI-MOM Backend

**Date:** 2026-02-15
**Version:** 1.0.0
**Scope:** Backend Core Foundation

---

## 1. Backend Project Structure

Recursive file list of `b:\Ai-MOM\backend`:

```
backend/
├── .env.example
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── app.ts
    ├── server.ts
    ├── config/
    │   └── env.ts
    ├── controllers/
    │   ├── auth.controller.ts
    │   └── task.controller.ts
    ├── middleware/
    │   ├── auth.middleware.ts
    │   └── error.middleware.ts
    ├── routes/
    │   ├── auth.routes.ts
    │   └── task.routes.ts
    ├── services/
    │   ├── auth.service.ts
    │   └── task.service.ts
    └── utils/
        └── prisma.ts
```

---

## 2. Database Schema (`prisma/schema.prisma`)

Defines `User` and `Task` models, Enums (`Priority`, `Status`), and relations.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Priority {
  LOW
  MEDIUM
  HIGH
}

enum Status {
  PENDING
  COMPLETED
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  tasks     Task[]
}

model Task {
  id                    String   @id @default(uuid())
  title                 String
  description           String?
  dueDate               DateTime
  estimatedMinutes      Int
  priority              Priority @default(MEDIUM)
  status                Status   @default(PENDING)
  reminderOffsetMinutes Int      @default(60)
  userId                String
  user                  User     @relation(fields: [userId], references: [id])
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([userId])
}
```

---

## 3. Authentication Implementation

### Login & Register Controller (`src/controllers/auth.controller.ts`)

Implements strict validation and delegates to service.

```typescript
import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";

export async function register(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters.",
            });
            return;
        }

        const result = await authService.registerUser(email, password);

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function login(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
            return;
        }

        const result = await authService.loginUser(email, password);

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}
```

### Password Hashing & JWT (`src/services/auth.service.ts`)

Demonstrates `bcrypt` hashing and `jsonwebtoken` signing (7d expiry).

```typescript
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";
import env from "../config/env";

const SALT_ROUNDS = 10;

export async function registerUser(email: string, password: string) {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
        throw { status: 409, message: "User with this email already exists." };
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
        data: { email, password: hashedPassword },
    });

    const token = generateToken(user.id);

    return { userId: user.id, email: user.email, token };
}

export async function loginUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });

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

### JWT Middleware (`src/middleware/auth.middleware.ts`)

Protects routes by verifying `Authorization: Bearer <token>`.

```typescript
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import env from "../config/env";

export interface AuthRequest extends Request {
    userId?: string;
}

interface JwtPayload {
    userId: string;
}

export function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, message: "Invalid or expired token." });
    }
}
```

---

## 4. Task Management & Security

### Task Controller (`src/controllers/task.controller.ts`)

Handles CRUD. Ensures `taskId` is strictly validated. Delegates to service.

```typescript
import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as taskService from "../services/task.service";

export async function createTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { title, description, dueDate, estimatedMinutes, priority, reminderOffsetMinutes } = req.body;

        if (!title || !dueDate || estimatedMinutes === undefined) {
            res.status(400).json({
                success: false,
                message: "title, dueDate, and estimatedMinutes are required.",
            });
            return;
        }

        const task = await taskService.createTask(req.userId!, {
            title,
            description,
            dueDate,
            estimatedMinutes,
            priority,
            reminderOffsetMinutes,
        });

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
}

export async function getTasks(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const tasks = await taskService.getTasksByUser(req.userId!);
        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        next(error);
    }
}

export async function getTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { id } = req.params;
        if (typeof id !== "string") {
            res.status(400).json({ success: false, message: "Invalid Task ID." });
            return;
        }
        const task = await taskService.getTaskById(req.userId!, id);
        res.status(200).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
}

export async function updateTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { id } = req.params;
        if (typeof id !== "string") {
            res.status(400).json({ success: false, message: "Invalid Task ID." });
            return;
        }
        const task = await taskService.updateTask(
            req.userId!,
            id,
            req.body
        );
        res.status(200).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
}

export async function deleteTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { id } = req.params;
        if (typeof id !== "string") {
            res.status(400).json({ success: false, message: "Invalid Task ID." });
            return;
        }
        await taskService.deleteTask(req.userId!, id);
        res.status(200).json({ success: true, message: "Task deleted." });
    } catch (error) {
        next(error);
    }
}
```

### Cross-User Access Prevention (`src/services/task.service.ts`)

Logic enforces that a user can only query/edit tasks they own (`task.userId === userId`).

```typescript
export async function getTaskById(userId: string, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task || task.userId !== userId) {
    throw { status: 404, message: "Task not found." };
  }

  return task;
}
```

### Protected Routes (`src/routes/task.routes.ts`)

Usage of `authMiddleware`.

```typescript
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createTask,
    getTasks,
    getTask,
    updateTask,
    deleteTask,
} from "../controllers/task.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createTask);
router.get("/", getTasks);
router.get("/:id", getTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;
```

---

## 5. Core Application & Error Handling

### App Entry (`src/app.ts`)

Connects middleware, routes, and error handler.

```typescript
import express from "express";
import authRoutes from "./routes/auth.routes";
import taskRoutes from "./routes/task.routes";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

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

### Server (`src/server.ts`)

```typescript
import app from "./app";
import env from "./config/env";

const PORT = env.PORT;

app.listen(PORT, () => {
    console.log(`🚀 AI-MOM API running on http://localhost:${PORT}`);
    console.log(`📋 Environment: ${env.NODE_ENV}`);
});
```

### Error Middleware (`src/middleware/error.middleware.ts`)

Centralized handling. Returns strict JSON. Hides stack in production.

```typescript
import { Request, Response, NextFunction } from "express";
import env from "../config/env";

interface AppError {
    status?: number;
    message?: string;
    stack?: string;
}

export function errorMiddleware(
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const status = err.status || 500;
    const message = err.message || "Internal server error.";

    const response: Record<string, unknown> = {
        success: false,
        message,
    };

    if (env.NODE_ENV === "development" && err.stack) {
        response.stack = err.stack;
    }

    res.status(status).json(response);
}
```

### Error Handling Verification
**Wrapper Usage:** ❌ No async error handling wrapper (e.g., `express-async-errors`) is used.
**Implementation:** All controller methods manually use `try { ... } catch (error) { next(error); }` blocks to pass errors to the centralized middleware.

---
**Audit Status:** PASS
