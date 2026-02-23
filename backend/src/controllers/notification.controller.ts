import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import * as notificationService from "../services/notification.service";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getNotifications = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId!;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;

        const result = await notificationService.getNotifications(userId, page, limit);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

export const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId!;
        const { unread } = req.body; // Check if explicitly marking as unread
        const notification = await notificationService.markAsRead(userId, req.params.id as string, unread); // Pass unread status
        res.json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};
