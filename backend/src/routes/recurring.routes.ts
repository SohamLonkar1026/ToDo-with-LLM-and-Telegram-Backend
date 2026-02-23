import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { createRecurring } from "../controllers/recurring.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createRecurring);

export default router;
