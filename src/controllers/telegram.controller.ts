import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as linkService from '../services/telegram.link.service';
import { handleMessage, handleCallbackQuery } from "../services/telegram.poller";

export const generateLink = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const code = await linkService.generateLinkCode(userId);
        res.json({ success: true, code });
    } catch (error) {
        console.error("[TELEGRAM LINK] Error generating code:", error);
        res.status(500).json({ success: false, error: "Failed to generate link code" });
    }
};

export const telegramWebhook = async (req: Request, res: Response) => {
    try {
        console.log("🚨 TELEGRAM WEBHOOK CONTROLLER ACTIVE");
        const update = req.body;

        if (update.message) {
            await handleMessage(update.message);
        }

        if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error("[TELEGRAM WEBHOOK ERROR]", error);
        return res.sendStatus(200); // Always return 200 to prevent Telegram retries
    }
};
