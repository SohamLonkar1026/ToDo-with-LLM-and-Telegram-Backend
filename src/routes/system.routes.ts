import { Router } from "express";
import { getReminderHealth } from "../controllers/system.controller";

const router = Router();

// Generic System Health
router.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

router.get("/reminder-health", getReminderHealth);

export default router;
