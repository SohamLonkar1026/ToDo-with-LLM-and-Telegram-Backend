
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as linkService from '../services/telegram.link.service';

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
