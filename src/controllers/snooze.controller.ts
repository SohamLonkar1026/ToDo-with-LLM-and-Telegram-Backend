import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as snoozeService from "../services/snooze.service";

export const snoozeNotification = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { durationMinutes } = req.body;
        const userId = req.userId!;

        if (!durationMinutes || typeof durationMinutes !== 'number') {
            res.status(400).json({ success: false, message: "Invalid duration." });
            return;
        }

        const result = await snoozeService.snoozeNotification(userId, id, durationMinutes);

        res.json({ success: true, ...result });

    } catch (error: any) {
        if (error.message === "Notification or Task not found.") {
            res.status(404).json({ success: false, message: error.message });
        } else {
            next(error);
        }
    }
};
