import { Router } from "express";
import { authMiddleware as authenticate } from "../middleware/auth.middleware";
import * as notificationController from "../controllers/notification.controller";
import * as snoozeController from "../controllers/snooze.controller";

const router = Router();

router.get("/", authenticate, notificationController.getNotifications);
router.put("/:id/read", authenticate, notificationController.markAsRead);
router.post("/:id/snooze", authenticate, snoozeController.snoozeNotification);

export default router;
