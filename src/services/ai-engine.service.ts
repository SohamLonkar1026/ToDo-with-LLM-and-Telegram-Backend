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

// ─── Conversation History (In-Memory) ────────────────────────────────────────

const MAX_HISTORY = 10; // last N messages per chat
const conversationHistory = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

function addToHistory(chatId: string, role: "user" | "assistant", content: string): void {
    if (!conversationHistory.has(chatId)) {
        conversationHistory.set(chatId, []);
    }
    const history = conversationHistory.get(chatId)!;
    history.push({ role, content });
    // Keep only last N messages
    if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
    }
}

function getHistory(chatId: string): Array<{ role: "user" | "assistant"; content: string }> {
    return conversationHistory.get(chatId) || [];
}

// ─── Pending Clarifications (In-Memory) ──────────────────────────────────────

const CLARIFICATION_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

const pendingClarifications = new Map<
    string,
    {
        toolName: string;
        args: any;
        userId: string;
        createdAt: number;
    }
>();

function buildHumanReadableAction(toolName: string, args: any): string {
    switch (toolName) {
        case "create_task":
            return `create a task titled \"${args.title}\"${args.due_date ? " with the specified due date" : ""}`;
        case "complete_task":
            return `mark the task as completed`;
        case "reschedule_task":
            return `reschedule task to the new date`;
        case "get_tasks":
            return `show your tasks`;
        default:
            return `perform this action`;
    }
}

// ─── Tool Definitions (Data Only — No SDK Types) ────────────────────────────

// These definitions describe the available tools for function-calling.
// They will be re-used when OpenAI integration is implemented.

const TOOL_DEFINITIONS = [
    {
        name: "create_task",
        description:
            "Create a new task. IMPORTANT: Extract a very short, concise title (3-5 words). Put all additional context/details into the description field.",
        parameters: {
            type: "OBJECT",
            properties: {
                title: {
                    type: "STRING",
                    description:
                        "Short, concise title. Action + Object only (e.g., 'Meet Utkarsh', 'Buy Groceries'). Do NOT include full sentence.",
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
                    description: "Context, details, or original user message minus the title.",
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
    {
        name: "complete_task",
        description:
            "Mark an existing task as completed/done. Call when the user says they finished, completed, or did a task.",
        parameters: {
            type: "OBJECT",
            properties: {
                task_id: {
                    type: "STRING",
                    description: "The ID of the task to mark as completed. Match from the task context.",
                },
                confidence: {
                    type: "STRING",
                    description: "Confidence in interpretation.",
                    enum: ["high", "medium", "low"],
                },
            },
            required: ["task_id", "confidence"],
        },
    },
];

// ─── Defensive Tool Call Validator ───────────────────────────────────────────

const ALLOWED_TOOLS = new Set(["create_task", "reschedule_task", "get_tasks", "complete_task"]);

const REQUIRED_FIELDS: Record<string, string[]> = {
    create_task: ["title", "due_date", "confidence"],
    reschedule_task: ["task_id", "new_due_date", "confidence"],
    get_tasks: ["confidence"],
    complete_task: ["task_id", "confidence"],
};

const ALLOWED_FIELDS: Record<string, string[]> = {
    create_task: ["title", "due_date", "confidence", "description", "priority", "estimated_minutes"],
    reschedule_task: ["task_id", "new_due_date", "confidence"],
    get_tasks: ["status", "confidence"],
    complete_task: ["task_id", "confidence"],
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

// ─── System Prompt Builder ──────────────────────────────────────────────────

function buildSystemPrompt(currentTimeISO: string): string {
    return `You are an AI Task Operations Assistant integrated into a Telegram-based task management system.

ROLE:
- Interpret user messages and call the appropriate tool to perform task operations.
- Ask for clarification if the request is ambiguous.
- Respond conversationally only when no task-related action is required.
- **CRITICAL**: When creating tasks, keep the 'title' extremely short and concise (3-5 words max). Put all other details into 'description'.

RULES:
1. All time expressions are in Asia/Kolkata (IST) unless explicitly stated otherwise.
2. Return dates in ISO 8601 format with timezone offset (+05:30 for IST).
3. Only call a tool when intent is clear.
4. Always set confidence: "high" (clear intent+time), "medium" (minor inference), "low" (ambiguous).
5. If confidence would be "low", ask a clarification question instead of calling a tool.
6. For "medium" confidence calls, prepend your response with an explanation of what you assumed. Example: "Assuming you meant tomorrow at 5:00 PM, I've scheduled the task."
7. When rescheduling, match user's description to a task ID from context.

EXAMPLES:
- User: "Remind me to go meet Utkarsh tomorrow regarding the form"
  -> Tool: create_task(title="Meet Utkarsh", description="Regarding the form", due_date="...")
- User: "Buy milk and eggs from the store"
  -> Tool: create_task(title="Buy milk and eggs", description="From the store", due_date="...")

Current Time: ${currentTimeISO}

RESPONSE FORMAT:
- Keep responses concise and clear.
- Use Telegram-compatible HTML formatting: <b>bold</b>, <i>italic</i>, <code>code</code>.
- Do not use Markdown formatting.`;
}

// ─── Normalize Tool Definitions for OpenAI ──────────────────────────────────

function lowercaseTypes(obj: any): any {
    if (Array.isArray(obj)) return obj.map(lowercaseTypes);
    if (obj && typeof obj === "object") {
        const out: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (key === "type" && typeof value === "string") {
                out[key] = value.toLowerCase();
            } else {
                out[key] = lowercaseTypes(value);
            }
        }
        return out;
    }
    return obj;
}

const openAITools = TOOL_DEFINITIONS.map((tool) => ({
    type: "function" as const,
    function: {
        name: tool.name,
        description: tool.description,
        parameters: lowercaseTypes(tool.parameters),
    },
}));

// ─── Main Processor ──────────────────────────────────────────────────────────

// ─── Main Processor ──────────────────────────────────────────────────────────

async function sendAndTrackMessage(chatId: string, text: string) {
    addToHistory(chatId, "assistant", text);
    try {
        await sendMessage(chatId, text);
    } catch (error) {
        console.error(`[AI_ENGINE] Failed to send message to ${chatId}:`, error);
    }
}

export async function processMessage(chatId: string, userText: string): Promise<void> {
    try {
        // 0. Check for pending clarification (yes/no response)
        const pending = pendingClarifications.get(chatId);
        if (pending) {
            // Expire stale clarifications
            if (Date.now() - pending.createdAt > CLARIFICATION_EXPIRY_MS) {
                pendingClarifications.delete(chatId);
            } else {
                // Add user response to history
                addToHistory(chatId, "user", userText);

                const text = userText.toLowerCase().trim();
                const YES_WORDS = ["yes", "ya", "haan", "ok", "sure", "yep", "yeah", "y"];
                const NO_WORDS = ["no", "cancel", "nahi", "nope", "n"];

                if (YES_WORDS.includes(text)) {
                    const result = await executeTool(pending.toolName, pending.userId, pending.args);
                    pendingClarifications.delete(chatId);

                    if (!result.success) {
                        await sendAndTrackMessage(chatId, `❌ ${result.message}`);
                        return;
                    }

                    switch (pending.toolName) {
                        case "create_task":
                            await sendAndTrackMessage(
                                chatId,
                                `✅ <b>Task Created</b>\n\n` +
                                `📌 Title: ${result.data?.title || pending.args.title}\n` +
                                `🗓 Due: ${result.data?.dueDateFormatted || "N/A"}\n` +
                                `⚡ Priority: ${result.data?.priority || "MEDIUM"}`
                            );
                            break;
                        case "reschedule_task":
                            await sendAndTrackMessage(
                                chatId,
                                `🔄 <b>Task Rescheduled</b>\n\n` +
                                `📌 ${result.data?.title || "Task"}\n` +
                                `🗓 New Due: ${result.data?.dueDateFormatted || "N/A"}`
                            );
                            break;
                        case "complete_task":
                            await sendAndTrackMessage(
                                chatId,
                                `✅ <b>Task Completed</b>\n\n` +
                                `📌 "${result.data?.title || "Task"}" marked as done.`
                            );
                            break;
                        default:
                            await sendAndTrackMessage(chatId, result.message);
                    }
                    return;
                }

                if (NO_WORDS.includes(text)) {
                    pendingClarifications.delete(chatId);
                    await sendAndTrackMessage(chatId, "❌ Cancelled.");
                    return;
                }

                // Not yes/no — clear pending and process as new message
                pendingClarifications.delete(chatId);
            }
        }

        // 0b. Rate limiting
        if (isRateLimited(chatId)) {
            await sendMessage(chatId, "⏳ Please wait a moment before sending another request.");
            return;
        }

        // 1. Look up user
        const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });
        if (!user) {
            await sendMessage(chatId, "❌ Please link your account first.\nType <code>/link &lt;code&gt;</code>.");
            return;
        }

        // 2. Add to history & Build context
        addToHistory(chatId, "user", userText);

        const currentTimeISO = formatInTimeZone(new Date(), "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX");
        const systemPrompt = buildSystemPrompt(currentTimeISO);
        const taskContext = await buildTaskContext(user.id);
        const history = getHistory(chatId);

        // 3. Call OpenAI
        console.log(`[AI_ENGINE] Processing message from chatId ${chatId}: "${userText.substring(0, 100)}"`);

        let response;
        try {
            response = await openai.chat.completions.create({
                model: "gpt-4.1",
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: `Current Task Context:\n${taskContext}`,
                    },
                    ...history, // Inject conversation history
                ],
                tools: openAITools,
                tool_choice: "auto",
                temperature: 0.2,
            });
        } catch (aiError) {
            console.error("[AI_ENGINE] OpenAI API error:", aiError);
            await sendAndTrackMessage(chatId, "I couldn't process that request. Please try again.");
            return;
        }

        const message = response.choices[0]?.message;
        if (!message) {
            console.error("[AI_ENGINE] No message in OpenAI response");
            await sendAndTrackMessage(chatId, "I couldn't process that request. Please try again.");
            return;
        }

        // 4. No tool call — conversational response
        if (!message.tool_calls || message.tool_calls.length === 0) {
            const textResponse = message.content || "I'm not sure how to help with that. Try describing a task to create.";
            await sendAndTrackMessage(chatId, textResponse);
            return;
        }

        // 5. Extract tool call
        const toolCall = message.tool_calls[0];

        if (toolCall.type !== "function") {
            console.warn(`[AI_ENGINE] Unsupported tool call type: ${toolCall.type}`);
            await sendAndTrackMessage(chatId, "I couldn't process that request. Please try again.");
            return;
        }

        const toolName = toolCall.function.name;
        let args: any;

        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
            console.error("[AI_ENGINE] Failed to parse tool arguments:", toolCall.function.arguments);
            await sendAndTrackMessage(chatId, "I couldn't safely process that request. Please try again.");
            return;
        }

        console.log(`[AI_ENGINE] Function call: ${toolName}`, JSON.stringify(args));

        // 6. Defensive validation
        const confidence = args.confidence || "low";
        const validation = validateToolCall(toolName, args, confidence);

        if (!validation.valid) {
            console.warn(`[AI_ENGINE] Validation failed: ${validation.reason}`);
            await sendAndTrackMessage(chatId, "I couldn't safely process that request. Please try again.");
            return;
        }

        // 7. Confidence gating
        if (confidence === "low") {
            // Low confidence — do NOT execute, ask for clarification
            await sendAndTrackMessage(chatId, "Could you please clarify what you'd like to do? Try being more specific with the task and time.");
            return;
        }

        if (confidence === "medium") {
            // Medium confidence — store pending, ask for confirmation
            const action = buildHumanReadableAction(toolName, args);
            pendingClarifications.set(chatId, {
                toolName,
                args,
                userId: user.id,
                createdAt: Date.now(),
            });

            await sendAndTrackMessage(
                chatId,
                `🤔 Just to confirm — should I <b>${action}</b>?\n\nReply <b>Yes</b> or <b>No</b>.`
            );
            return;
        }

        // 8. Execute tool
        const result = await executeTool(toolName, user.id, args);

        // 9. Deterministic confirmation — no second AI call
        if (!result.success) {
            await sendAndTrackMessage(chatId, `❌ ${result.message}`);
            return;
        }

        switch (toolName) {
            case "create_task":
                await sendAndTrackMessage(
                    chatId,
                    `✅ <b>Task Created</b>\n\n` +
                    `📌 Title: ${result.data?.title || args.title}\n` +
                    `🗓 Due: ${result.data?.dueDateFormatted || "N/A"}\n` +
                    `⚡ Priority: ${result.data?.priority || "MEDIUM"}`
                );
                break;

            case "reschedule_task":
                await sendAndTrackMessage(
                    chatId,
                    `🔄 <b>Task Rescheduled</b>\n\n` +
                    `📌 ${result.data?.title || "Task"}\n` +
                    `🗓 New Due: ${result.data?.dueDateFormatted || "N/A"}`
                );
                break;

            case "complete_task":
                await sendAndTrackMessage(
                    chatId,
                    `✅ <b>Task Completed</b>\n\n` +
                    `📌 "${result.data?.title || "Task"}" marked as done.`
                );
                break;

            case "get_tasks":
                // get_tasks already returns fully formatted HTML in result.message
                await sendAndTrackMessage(chatId, result.message);
                break;

            default:
                await sendAndTrackMessage(chatId, result.message);
        }

    } catch (error) {
        console.error("[AI_ENGINE] Unexpected error:", error);
        await sendMessage(chatId, "I couldn't process that request. Please try again.");
    }
}

