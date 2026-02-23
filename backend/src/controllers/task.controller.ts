import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as taskService from "../services/task.service";

export async function createTask(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { title, description, dueDate, estimatedMinutes, priority, minGapMinutes } = req.body;

        if (!title || !dueDate || estimatedMinutes === undefined) {
            res.status(400).json({
                success: false,
                message: "title, dueDate, and estimatedMinutes are required.",
            });
            return;
        }

        console.log("[DEBUG_API] Raw Body dueDate:", dueDate);
        console.log("[DEBUG_API] Parsed Date ISO:", new Date(dueDate).toISOString());

        const task = await taskService.createTask(req.userId!, {
            title,
            description,
            dueDate,
            estimatedMinutes,
            priority,
            minGapMinutes,
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

        if (tasks.length > 0) {
            console.log("[DEBUG_CORRUPTION] API GetTasks Sample:", tasks[0].dueDate);
            console.log("[DEBUG_CORRUPTION] API GetTasks ISO:", tasks[0].dueDate.toISOString());
        }

        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        next(error);
    }
}

export async function getPriorityTasks(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const tasks = await taskService.getTasksByPriority(req.userId!);
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
