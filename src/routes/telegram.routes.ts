
import { Router } from 'express';
import * as telegramController from '../controllers/telegram.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// POST /api/telegram/link/generate
router.post('/link/generate', authMiddleware, telegramController.generateLink);

export default router;
