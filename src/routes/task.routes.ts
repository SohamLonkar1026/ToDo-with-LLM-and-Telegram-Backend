import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createTask,
    getTasks,
    getPriorityTasks,
    getTask,
    updateTask,
    deleteTask,
} from "../controllers/task.controller";
import { getDailyTasks } from "../controllers/recurring.controller";

const router = Router();

router.use(authMiddleware);

router.post("/", createTask);
router.get("/", getTasks);
router.get("/priority", getPriorityTasks);
router.get("/daily", getDailyTasks);
router.get("/:id", getTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

export default router;
