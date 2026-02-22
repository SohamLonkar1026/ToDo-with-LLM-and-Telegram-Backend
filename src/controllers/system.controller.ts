import { Request, Response } from "express";
import { getReminderMetrics } from "../jobs/reminder.job";

export const getReminderHealth = (req: Request, res: Response) => {
    const metrics = getReminderMetrics();
    const uptimeSeconds = process.uptime();

    const status = metrics.lastError ? "degraded" : "healthy";

    res.json({
        status,
        ...metrics,
        uptimeSeconds: Math.floor(uptimeSeconds)
    });
};
