import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    getReminderDefaults,
    updateReminderDefaults,
} from "../controllers/settings.controller";

const router = Router();

router.use(authMiddleware);

router.get("/reminder-defaults", getReminderDefaults);
router.put("/reminder-defaults", updateReminderDefaults);

export default router;
