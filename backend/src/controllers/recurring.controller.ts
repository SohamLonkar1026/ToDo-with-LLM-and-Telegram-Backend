import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as recurringService from "../services/recurring.service";

export async function getDailyTasks(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const tasks = await recurringService.getDailyTasks(req.userId!);
        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        next(error);
    }
}

export async function createRecurring(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        if (process.env.NODE_ENV !== 'production') {
            console.log("Incoming body:", req.body);
            console.log("User ID:", req.userId);
        }

        const { title, estimatedMinutes, recurrenceType } = req.body;

        if (!title || !recurrenceType) {
            res.status(400).json({ success: false, message: "Title and recurrenceType are required" });
            return;
        }

        const template = await recurringService.createRecurringTemplate(req.userId!, {
            title,
            estimatedMinutes,
            recurrenceType
        });

        if (process.env.NODE_ENV !== 'production') {
            console.log("Template created:", template);
        }
        res.status(201).json({ success: true, data: template });
    } catch (error: any) {
        console.error("=== RECURRING CREATE ERROR ===");
        console.error(error);
        console.error("Error message:", error?.message);
        console.error("Error code:", error?.code);
        console.error("Error meta:", error?.meta);
        res.status(500).json({
            success: false,
            message: error?.message || "Unknown error"
        });
    }
}
