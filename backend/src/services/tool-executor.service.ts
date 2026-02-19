import prisma from "../utils/prisma";
import { formatInTimeZone } from "date-fns-tz";
import { fromZonedTime } from "date-fns-tz";
import * as taskService from "./task.service";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolResult {
    success: boolean;
    message: string;
    data?: any;
}

// ─── Timezone Offset Regex ───────────────────────────────────────────────────

// Matches ISO 8601 strings WITH timezone offset: +05:30, -04:00, Z
const OFFSET_REGEX = /([+-]\d{2}:\d{2}|Z)$/;

// Matches the +05:30 IST offset specifically
const IST_OFFSET = "+05:30";

// ─── Strict ISO Date Validation & Normalization ──────────────────────────────

function validateAndNormalizeDate(dateStr: string, fieldName: string): { valid: boolean; utcDate?: Date; error?: string } {
    // 1. Must be a non-empty string
    if (!dateStr || typeof dateStr !== "string") {
        return { valid: false, error: `${fieldName} is missing or invalid.` };
    }

    const trimmed = dateStr.trim();

    // 2. Must include timezone offset
    if (!OFFSET_REGEX.test(trimmed)) {
        console.warn(`[TOOL_EXECUTOR] ${fieldName} missing offset: "${trimmed}"`);
        return {
            valid: false,
            error: `${fieldName} "${trimmed}" does not include a timezone offset. Please specify the time with a timezone (e.g., 2026-02-20T17:00:00+05:30).`,
        };
    }

    // 3. Must parse to a valid date
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
        return { valid: false, error: `${fieldName} "${trimmed}" is not a valid date.` };
    }

    // 4. Convert to UTC
    // Parse normally — new Date() handles any valid offset correctly.
    // Log a warning if non-IST offset is used, but do NOT rewrite it.
    const utcDate: Date = parsed;
    const offsetMatch = trimmed.match(OFFSET_REGEX);
    const providedOffset = offsetMatch ? offsetMatch[0] : null;

    if (providedOffset !== "Z" && providedOffset !== IST_OFFSET) {
        console.warn(`[TOOL_EXECUTOR] Non-IST offset detected: "${providedOffset}" in "${trimmed}". Parsing as-is, not reinterpreting.`);
    }

    // 5. Debug logging: original → normalized UTC
    console.log(`[TOOL_EXECUTOR_TZ] Original: "${trimmed}" | Offset: ${providedOffset} | UTC: ${utcDate.toISOString()}`);

    // 6. Future-date validation (AFTER normalization to UTC)
    if (utcDate.getTime() < Date.now()) {
        return { valid: false, error: `${fieldName} "${trimmed}" resolves to a time in the past.` };
    }

    return { valid: true, utcDate };
}

function formatIST(date: Date): string {
    return formatInTimeZone(date, "Asia/Kolkata", "MMM d, yyyy 'at' h:mm a");
}

// ─── Tool Executors ──────────────────────────────────────────────────────────

async function executeCreateTask(userId: string, args: any): Promise<ToolResult> {
    // Validate required fields
    if (!args.title || typeof args.title !== "string" || args.title.trim() === "") {
        return { success: false, message: "Task title is required." };
    }

    if (!args.due_date) {
        return { success: false, message: "Due date is required." };
    }

    // Strict timezone-aware date validation
    const dateCheck = validateAndNormalizeDate(args.due_date, "due_date");
    if (!dateCheck.valid) {
        return { success: false, message: `Invalid due date: ${dateCheck.error}` };
    }

    // Validate priority if provided
    const validPriorities = ["LOW", "MEDIUM", "HIGH"];
    const priority = args.priority && validPriorities.includes(args.priority.toUpperCase())
        ? args.priority.toUpperCase()
        : "MEDIUM";

    // Validate estimatedMinutes
    const estimatedMinutes = typeof args.estimated_minutes === "number" && args.estimated_minutes > 0
        ? args.estimated_minutes
        : 30;

    const utcISO = dateCheck.utcDate!.toISOString();

    try {
        // UTC logging before DB write
        console.log(`[TOOL_EXECUTOR_DB] create_task — saving UTC: ${utcISO}`);

        const task = await taskService.createTask(userId, {
            title: args.title.trim(),
            description: args.description || undefined,
            dueDate: utcISO,
            estimatedMinutes: estimatedMinutes,
            priority: priority,
        });

        const dueDateIST = formatIST(dateCheck.utcDate!);

        return {
            success: true,
            message: `Task "${task.title}" created successfully.\nDue: ${dueDateIST}\nPriority: ${priority}`,
            data: { taskId: task.id, title: task.title, dueDate: task.dueDate }
        };
    } catch (error) {
        console.error("[TOOL_EXECUTOR] create_task failed:", error);
        return { success: false, message: "Failed to create task. Please try again." };
    }
}

async function executeRescheduleTask(userId: string, args: any): Promise<ToolResult> {
    // Validate required fields
    if (!args.task_id || typeof args.task_id !== "string") {
        return { success: false, message: "Task ID is required for rescheduling." };
    }

    if (!args.new_due_date) {
        return { success: false, message: "New due date is required." };
    }

    // Strict timezone-aware date validation
    const dateCheck = validateAndNormalizeDate(args.new_due_date, "new_due_date");
    if (!dateCheck.valid) {
        return { success: false, message: `Invalid new due date: ${dateCheck.error}` };
    }

    const utcISO = dateCheck.utcDate!.toISOString();

    // Verify task exists and belongs to user
    try {
        const task = await taskService.getTaskById(userId, args.task_id);

        // UTC logging before DB write
        console.log(`[TOOL_EXECUTOR_DB] reschedule_task — old UTC: ${task.dueDate.toISOString()} → new UTC: ${utcISO}`);

        const updatedTask = await taskService.updateTask(userId, args.task_id, {
            dueDate: utcISO,
        });

        const newDateIST = formatIST(dateCheck.utcDate!);

        return {
            success: true,
            message: `Task "${task.title}" rescheduled to ${newDateIST}.`,
            data: { taskId: updatedTask.id, title: updatedTask.title, newDueDate: updatedTask.dueDate }
        };
    } catch (error: any) {
        if (error?.status === 404) {
            return { success: false, message: "Task not found. Please check the task ID." };
        }
        console.error("[TOOL_EXECUTOR] reschedule_task failed:", error);
        return { success: false, message: "Failed to reschedule task. Please try again." };
    }
}

async function executeGetTasks(userId: string, args: any): Promise<ToolResult> {
    try {
        let tasks = await taskService.getTasksByUser(userId);

        // Filter to PENDING only
        tasks = tasks.filter(t => t.status === "PENDING");

        // Apply date filter if provided
        if (args.date_filter && typeof args.date_filter === "string") {
            const filterDate = new Date(args.date_filter);
            if (!isNaN(filterDate.getTime())) {
                tasks = tasks.filter(t => {
                    const taskDate = new Date(t.dueDate);
                    return (
                        taskDate.getFullYear() === filterDate.getFullYear() &&
                        taskDate.getMonth() === filterDate.getMonth() &&
                        taskDate.getDate() === filterDate.getDate()
                    );
                });
            }
        }

        // Apply keyword filter if provided
        if (args.keyword && typeof args.keyword === "string") {
            const kw = args.keyword.toLowerCase();
            tasks = tasks.filter(t => t.title.toLowerCase().includes(kw));
        }

        if (tasks.length === 0) {
            return { success: true, message: "No pending tasks found matching your criteria." };
        }

        // Format task list
        const taskLines = tasks.slice(0, 20).map((t, i) => {
            const dueDateIST = formatIST(new Date(t.dueDate));
            const isOverdue = new Date(t.dueDate).getTime() < Date.now();
            const overdueTag = isOverdue ? " ⚠️ OVERDUE" : "";
            return `${i + 1}. <b>${t.title}</b>\n   Due: ${dueDateIST}${overdueTag}`;
        });

        const summary = tasks.length > 20
            ? `\n\n...and ${tasks.length - 20} more tasks.`
            : "";

        return {
            success: true,
            message: `📋 <b>Your Tasks (${tasks.length})</b>\n\n${taskLines.join("\n\n")}${summary}`,
            data: { count: tasks.length }
        };
    } catch (error) {
        console.error("[TOOL_EXECUTOR] get_tasks failed:", error);
        return { success: false, message: "Failed to retrieve tasks. Please try again." };
    }
}

// ─── Public Executor ─────────────────────────────────────────────────────────

const TOOL_MAP: Record<string, (userId: string, args: any) => Promise<ToolResult>> = {
    create_task: executeCreateTask,
    reschedule_task: executeRescheduleTask,
    get_tasks: executeGetTasks,
};

export async function executeTool(toolName: string, userId: string, args: any): Promise<ToolResult> {
    const executor = TOOL_MAP[toolName];
    if (!executor) {
        console.error(`[TOOL_EXECUTOR] Unknown tool: ${toolName}`);
        return { success: false, message: `Unknown operation: ${toolName}` };
    }

    console.log(`[TOOL_EXECUTOR] Executing ${toolName} for user ${userId}`, JSON.stringify(args));
    const result = await executor(userId, args);
    console.log(`[TOOL_EXECUTOR] Result: ${result.success ? "SUCCESS" : "FAIL"} — ${result.message.substring(0, 100)}`);

    return result;
}
