import prisma from "../utils/prisma";
import { sendMessage } from "./telegram.service";
import { executeTool } from "./tool-executor.service";
import { formatInTimeZone } from "date-fns-tz";
import OpenAI from "openai";

// ─── OpenAI Init ─────────────────────────────────────────────────────────────

if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not defined in environment variables");
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ─── Rate Limiter (In-Memory) ────────────────────────────────────────────────

const RATE_LIMIT_MS = 2000; // 2 seconds between AI calls per chat
const lastRequestMap = new Map<string, number>();

function isRateLimited(chatId: string): boolean {
    const now = Date.now();
    const lastRequest = lastRequestMap.get(chatId);

    if (lastRequest && (now - lastRequest) < RATE_LIMIT_MS) {
        return true;
    }

    lastRequestMap.set(chatId, now);

    // Cleanup stale entries to prevent memory leak
    if (lastRequestMap.size > 1000) {
        for (const [key, value] of lastRequestMap) {
            if (now - value > 60000) {
                lastRequestMap.delete(key);
            }
        }
    }

    return false;
}

// ─── Tool Definitions (Data Only — No SDK Types) ────────────────────────────

// These definitions describe the available tools for function-calling.
// They will be re-used when OpenAI integration is implemented.

const TOOL_DEFINITIONS = [
    {
        name: "create_task",
        description:
            "Create a new task for the user. Call this when the user clearly wants to add a new task, reminder, or to-do item.",
        parameters: {
            type: "OBJECT",
            properties: {
                title: {
                    type: "STRING",
                    description:
                        "The task title. Extract the core action from the user's message.",
                },
                due_date: {
                    type: "STRING",
                    description:
                        "The due date in ISO 8601 format with timezone offset. Interpret user times as Asia/Kolkata (IST). Examples: '2026-02-20T17:00:00+05:30' for 5pm IST.",
                },
                confidence: {
                    type: "STRING",
                    description:
                        "Your confidence in interpreting this request. 'high' = intent and time are clear. 'medium' = minor inference required. 'low' = ambiguity exists.",
                    enum: ["high", "medium", "low"],
                },
                description: {
                    type: "STRING",
                    description: "Optional task description or additional details.",
                },
                priority: {
                    type: "STRING",
                    description: "Task priority level.",
                    enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
                },
                estimated_minutes: {
                    type: "NUMBER",
                    description: "Estimated time to complete in minutes.",
                },
            },
            required: ["title", "due_date", "confidence"],
        },
    },
    {
        name: "reschedule_task",
        description:
            "Reschedule an existing task to a new date/time. Call when the user wants to move, postpone, or reschedule a task.",
        parameters: {
            type: "OBJECT",
            properties: {
                task_id: {
                    type: "STRING",
                    description: "The ID of the task to reschedule.",
                },
                new_due_date: {
                    type: "STRING",
                    description:
                        "New due date in ISO 8601 format with timezone offset.",
                },
                confidence: {
                    type: "STRING",
                    description: "Confidence in interpretation.",
                    enum: ["high", "medium", "low"],
                },
            },
            required: ["task_id", "new_due_date", "confidence"],
        },
    },
    {
        name: "get_tasks",
        description:
            "Get the user's tasks. Call when the user wants to see, list, or check their tasks.",
        parameters: {
            type: "OBJECT",
            properties: {
                status: {
                    type: "STRING",
                    description: "Filter by status.",
                    enum: ["PENDING", "COMPLETED", "ALL"],
                },
                confidence: {
                    type: "STRING",
                    description: "Confidence in interpretation.",
                    enum: ["high", "medium", "low"],
                },
            },
            required: ["confidence"],
        },
    },
];

// ─── Defensive Tool Call Validator ───────────────────────────────────────────

const ALLOWED_TOOLS = new Set(["create_task", "reschedule_task", "get_tasks"]);

const REQUIRED_FIELDS: Record<string, string[]> = {
    create_task: ["title", "due_date", "confidence"],
    reschedule_task: ["task_id", "new_due_date", "confidence"],
    get_tasks: ["confidence"],
};

const ALLOWED_FIELDS: Record<string, string[]> = {
    create_task: ["title", "due_date", "confidence", "description", "priority", "estimated_minutes"],
    reschedule_task: ["task_id", "new_due_date", "confidence"],
    get_tasks: ["status", "confidence"],
};

function validateToolCall(
    toolName: string,
    args: any,
    confidence: string
): { valid: boolean; reason?: string } {
    // 1. Tool name check
    if (!ALLOWED_TOOLS.has(toolName)) {
        return { valid: false, reason: `Unknown tool: "${toolName}"` };
    }

    // 2. Arguments object check
    if (!args || typeof args !== "object") {
        return { valid: false, reason: "Arguments missing or not an object" };
    }

    // 3. Required fields check
    const required = REQUIRED_FIELDS[toolName] || [];
    for (const field of required) {
        if (!(field in args)) {
            return { valid: false, reason: `Missing required field: "${field}"` };
        }
    }

    // 4. Unexpected keys check
    const allowed = ALLOWED_FIELDS[toolName] || [];
    for (const key of Object.keys(args)) {
        if (!allowed.includes(key)) {
            return { valid: false, reason: `Unexpected field: "${key}"` };
        }
    }

    // 5. Confidence enum check
    if (!["high", "medium", "low"].includes(confidence)) {
        return { valid: false, reason: `Invalid confidence: "${confidence}"` };
    }

    return { valid: true };
}

// ─── Context Builder ────────────────────────────────────────────────────────

async function buildTaskContext(userId: string): Promise<string> {
    try {
        const tasks = await prisma.task.findMany({
            where: { userId, status: "PENDING" },
            orderBy: { dueDate: "asc" },
            take: 10,
            select: { id: true, title: true, dueDate: true, priority: true },
        });

        if (tasks.length === 0) return "User has no pending tasks.";

        const lines = tasks.map((t) => {
            const due = formatInTimeZone(
                t.dueDate,
                "Asia/Kolkata",
                "EEE, dd MMM yyyy hh:mm a"
            );
            return `- [${t.id}] "${t.title}" due ${due} (${t.priority})`;
        });

        return `User's pending tasks (${tasks.length}):\n${lines.join("\n")}`;
    } catch (error) {
        console.error("[AI_ENGINE] Failed to build task context:", error);
        return "Could not retrieve tasks.";
    }
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processMessage(chatId: string, userText: string): Promise<void> {
    try {
        // 0. Rate limiting
        if (isRateLimited(chatId)) {
            await sendMessage(chatId, "⏳ Please wait a moment before sending another request.");
            return;
        }

        // ──────────────────────────────────────────────────────────
        // 🔧 AI ENGINE DISABLED — Gemini removed, awaiting OpenAI
        // ──────────────────────────────────────────────────────────
        console.log(`[AI_ENGINE] Message received from chatId ${chatId}: "${userText.substring(0, 100)}" — AI DISABLED`);

        await sendMessage(
            chatId,
            "🔧 AI engine temporarily disabled for migration. Slash commands still work!\n\nUse /menu to manage tasks."
        );

        return;

        // NOTE: When OpenAI is integrated, the flow below will be restored:
        // 1. Look up user by chatId
        // 2. Build task context
        // 3. Send to LLM with tool definitions
        // 4. Validate function call output with validateToolCall()
        // 5. Execute tool via executeTool()
        // 6. Feed result back to LLM for natural language response
        // 7. Send final message to user

    } catch (error) {
        console.error("[AI_ENGINE] Unexpected error:", error);
        await sendMessage(chatId, "I couldn't process that request. Please try again.");
    }
}
