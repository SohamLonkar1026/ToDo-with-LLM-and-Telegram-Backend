import { GoogleGenerativeAI, FunctionCallingMode, SchemaType } from "@google/generative-ai";
import prisma from "../utils/prisma";
import { sendMessage } from "./telegram.service";
import { executeTool } from "./tool-executor.service";
import { formatInTimeZone } from "date-fns-tz";

// ─── Gemini Init ─────────────────────────────────────────────────────────────

if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

// ─── Allowed Tools & Required Fields ─────────────────────────────────────────

const ALLOWED_TOOLS = new Set(["create_task", "reschedule_task", "get_tasks"]);

const REQUIRED_FIELDS: Record<string, string[]> = {
    create_task: ["title", "due_date", "confidence"],
    reschedule_task: ["task_id", "new_due_date", "confidence"],
    get_tasks: ["confidence"],
};

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

// ─── Defensive Gemini Output Validator ───────────────────────────────────────

function validateToolCall(toolName: string, args: any): { valid: boolean; error?: string } {
    // 1. Tool name must be in allowed set
    if (!ALLOWED_TOOLS.has(toolName)) {
        return { valid: false, error: `Unknown tool: "${toolName}"` };
    }

    // 2. Arguments must exist and be an object
    if (!args || typeof args !== "object") {
        return { valid: false, error: `Missing or invalid arguments for ${toolName}` };
    }

    // 3. All required fields must be present
    const required = REQUIRED_FIELDS[toolName];
    for (const field of required) {
        if (args[field] === undefined || args[field] === null) {
            return { valid: false, error: `Missing required field "${field}" for ${toolName}` };
        }
    }

    // 4. Confidence must be valid enum
    if (!VALID_CONFIDENCE.has(args.confidence)) {
        return { valid: false, error: `Invalid confidence value: "${args.confidence}"` };
    }

    return { valid: true };
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

// Tool definitions use `as any` cast because the SDK's TypeScript types
// are overly strict for leaf schema properties. The Gemini API accepts this fine.
const TOOL_DEFINITIONS = [
    {
        name: "create_task",
        description: "Create a new task for the user. Call this when the user clearly wants to add a new task, reminder, or to-do item.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                title: {
                    type: SchemaType.STRING,
                    description: "The task title. Extract the core action from the user's message.",
                },
                due_date: {
                    type: SchemaType.STRING,
                    description: "The due date in ISO 8601 format with timezone offset. Interpret user times as Asia/Kolkata (IST). Examples: '2026-02-20T17:00:00+05:30' for 5pm IST.",
                },
                confidence: {
                    type: SchemaType.STRING,
                    description: "Your confidence in interpreting this request. 'high' = intent and time are clear. 'medium' = minor inference required. 'low' = ambiguity exists.",
                    enum: ["high", "medium", "low"],
                },
                description: {
                    type: SchemaType.STRING,
                    description: "Optional description or extra details about the task.",
                },
                priority: {
                    type: SchemaType.STRING,
                    description: "Task priority. Infer from context: 'urgent'/'important' = HIGH, default = MEDIUM.",
                    enum: ["LOW", "MEDIUM", "HIGH"],
                },
                estimated_minutes: {
                    type: SchemaType.INTEGER,
                    description: "Estimated time in minutes. Infer from context: 'quick' = 15, 'long' = 60. Default 30.",
                },
            },
            required: ["title", "due_date", "confidence"],
        },
    },
    {
        name: "reschedule_task",
        description: "Reschedule an existing task to a new date/time. Call this when the user explicitly wants to move, postpone, or change a task's due date. You MUST provide a valid task_id from the user's task list.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                task_id: {
                    type: SchemaType.STRING,
                    description: "The ID of the task to reschedule. Must be a valid task ID from the provided task context.",
                },
                new_due_date: {
                    type: SchemaType.STRING,
                    description: "The new due date in ISO 8601 format with timezone offset.",
                },
                confidence: {
                    type: SchemaType.STRING,
                    description: "Your confidence in interpreting this request.",
                    enum: ["high", "medium", "low"],
                },
            },
            required: ["task_id", "new_due_date", "confidence"],
        },
    },
    {
        name: "get_tasks",
        description: "Retrieve the user's tasks. Call this when the user asks about their pending, upcoming, today's, or specific-date tasks.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                date_filter: {
                    type: SchemaType.STRING,
                    description: "Optional date filter in YYYY-MM-DD format. Use for 'today', 'tomorrow', or specific dates.",
                },
                keyword: {
                    type: SchemaType.STRING,
                    description: "Optional keyword to filter tasks by title.",
                },
                confidence: {
                    type: SchemaType.STRING,
                    description: "Your confidence in interpreting this request.",
                    enum: ["high", "medium", "low"],
                },
            },
            required: ["confidence"],
        },
    },
] as any;

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(currentTimeISO: string): string {
    return `You are an AI Task Operations Assistant integrated into a Telegram-based task management system.

ROLE:
- Interpret user messages and call the appropriate tool to perform task operations.
- Ask for clarification if the request is ambiguous.
- Respond conversationally only when no task-related action is required.

RULES:
1. All time expressions are in Asia/Kolkata (IST) unless explicitly stated otherwise.
2. Return dates in ISO 8601 format with timezone offset (+05:30 for IST).
3. Only call a tool when intent is clear.
4. Always set confidence: "high" (clear intent+time), "medium" (minor inference), "low" (ambiguous).
5. If confidence would be "low", ask a clarification question instead of calling a tool.
6. Never fabricate a task_id. Only use task IDs from the provided context.
7. If multiple tasks match a description, ask which one the user means.
8. If user says "that", "it", or similar without clear context, ask for clarification.

TIME DEFAULTS:
- "morning" → 09:00 IST
- "afternoon" → 15:00 IST
- "evening" → 18:00 IST
- "tonight" → 21:00 IST
- "tomorrow" → next calendar day
- If only date provided, no time → default 09:00 IST
- If both date and time → use exact time

Current Time: ${currentTimeISO}

RESPONSE FORMAT:
- Keep responses concise and clear.
- Use Telegram-compatible HTML formatting: <b>bold</b>, <i>italic</i>, <code>code</code>.
- Do not use Markdown formatting.`;
}

// ─── Task Context Builder ────────────────────────────────────────────────────

async function buildTaskContext(userId: string): Promise<string> {
    const tasks = await prisma.task.findMany({
        where: {
            userId: userId,
            status: "PENDING",
        },
        select: {
            id: true,
            title: true,
            dueDate: true,
        },
        orderBy: { dueDate: "asc" },
        take: 20,
    });

    if (tasks.length === 0) {
        return "User has no pending tasks.";
    }

    const taskLines = tasks.map(t => {
        const dueDateIST = formatInTimeZone(new Date(t.dueDate), "Asia/Kolkata", "yyyy-MM-dd HH:mm");
        return `- ID: ${t.id} | Title: "${t.title}" | Due: ${dueDateIST} IST`;
    });

    return `User's pending tasks (${tasks.length}):\n${taskLines.join("\n")}`;
}

// ─── Confidence Gating ───────────────────────────────────────────────────────

function checkConfidence(args: any): { allowed: boolean; confidence: string } {
    const confidence = args?.confidence || "low";

    if (confidence === "low") {
        return { allowed: false, confidence };
    }

    // high and medium are allowed to execute
    return { allowed: true, confidence };
}

// ─── Main Processor ──────────────────────────────────────────────────────────

export async function processMessage(chatId: string, userText: string): Promise<void> {
    try {
        // 0. Rate limiting
        if (isRateLimited(chatId)) {
            await sendMessage(chatId, "⏳ Please wait a moment before sending another request.");
            return;
        }

        // 1. Look up user
        const user = await prisma.user.findFirst({
            where: { telegramChatId: chatId },
        });

        if (!user) {
            await sendMessage(chatId, "❌ Please link your account first.\nType <code>/link &lt;code&gt;</code> to get started.");
            return;
        }

        // 2. Build context
        const currentTime = new Date();
        const currentTimeIST = formatInTimeZone(currentTime, "Asia/Kolkata", "yyyy-MM-dd'T'HH:mm:ssXXX");
        const systemPrompt = buildSystemPrompt(currentTimeIST);
        const taskContext = await buildTaskContext(user.id);

        // 3. Create model with tool-calling
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: TOOL_DEFINITIONS }],
            toolConfig: {
                functionCallingConfig: {
                    mode: FunctionCallingMode.AUTO,
                },
            },
        });

        // 4. Send message to Gemini
        const userContent = `${taskContext}\n\nUser message: "${userText}"`;

        console.log(`[AI_ENGINE] Processing message from chatId ${chatId}: "${userText.substring(0, 100)}"`);

        let result;
        try {
            result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: userContent }] }],
            });
        } catch (geminiError) {
            console.error("[AI_ENGINE] Gemini API error:", geminiError);
            await sendMessage(chatId, "I couldn't process that request. Please try again.");
            return;
        }

        const response = result.response;

        // 5. Check for function call
        const candidate = response.candidates?.[0];
        if (!candidate) {
            console.error("[AI_ENGINE] No candidates in Gemini response");
            await sendMessage(chatId, "I couldn't process that request. Please try again.");
            return;
        }

        const parts = candidate.content?.parts;
        if (!parts || parts.length === 0) {
            console.error("[AI_ENGINE] No parts in Gemini response");
            await sendMessage(chatId, "I couldn't process that request. Please try again.");
            return;
        }

        // Check if any part has a function call
        const functionCallPart = parts.find(p => p.functionCall);

        if (functionCallPart && functionCallPart.functionCall) {
            const fc = functionCallPart.functionCall;
            const toolName = fc.name;
            const toolArgs = fc.args as any;

            console.log(`[AI_ENGINE] Function call: ${toolName}`, JSON.stringify(toolArgs));

            // 5a. Defensive validation of Gemini output
            const validation = validateToolCall(toolName, toolArgs);
            if (!validation.valid) {
                console.error(`[AI_ENGINE] Tool call validation FAILED: ${validation.error}`);
                await sendMessage(chatId, "I couldn't safely process that request. Please try again.");
                return;
            }

            // 6. Confidence gating
            const confidenceCheck = checkConfidence(toolArgs);

            if (!confidenceCheck.allowed) {
                // Low confidence — ask Gemini to generate a clarification question
                console.log(`[AI_ENGINE] Confidence LOW — blocking execution for ${toolName}`);

                try {
                    const clarificationResult = await model.generateContent({
                        contents: [
                            { role: "user", parts: [{ text: userContent }] },
                            { role: "model", parts: [{ functionCall: fc }] },
                            {
                                role: "user",
                                parts: [{
                                    text: `Your confidence for this action is LOW. Do NOT execute the tool. Instead, ask the user a clarification question to better understand their intent. Be specific about what is ambiguous.`
                                }]
                            },
                        ],
                    });

                    const clarificationText = clarificationResult.response.text();
                    await sendMessage(chatId, clarificationText || "Could you please clarify your request?");
                } catch (clarifyError) {
                    console.error("[AI_ENGINE] Clarification generation failed:", clarifyError);
                    await sendMessage(chatId, "Could you please clarify your request? I'm not sure what you'd like me to do.");
                }
                return;
            }

            // 7. Execute tool
            const toolResult = await executeTool(toolName, user.id, toolArgs);

            // 8. Feed result back to Gemini for final response
            // For MEDIUM confidence, instruct Gemini to prepend assumption transparency
            const isMedium = confidenceCheck.confidence === "medium";
            const mediumPrefix = isMedium
                ? `The tool was executed with MEDIUM confidence. In your response, briefly mention what assumption you made. For example: "Assuming you meant tomorrow at 5pm, I've scheduled the task." Be transparent about the inference.`
                : "";

            try {
                const followUpContents: any[] = [
                    { role: "user", parts: [{ text: userContent }] },
                    { role: "model", parts: [{ functionCall: fc }] },
                    {
                        role: "function",
                        parts: [{
                            functionResponse: {
                                name: toolName,
                                response: {
                                    success: toolResult.success,
                                    message: toolResult.message,
                                },
                            },
                        }],
                    },
                ];

                // Inject medium-confidence transparency instruction
                if (isMedium) {
                    followUpContents.push({
                        role: "user",
                        parts: [{ text: mediumPrefix }],
                    });
                }

                const followUpResult = await model.generateContent({
                    contents: followUpContents,
                });

                const finalText = followUpResult.response.text();
                await sendMessage(chatId, finalText || toolResult.message);
            } catch (followUpError) {
                // If Gemini fails on follow-up, send the raw tool result
                console.error("[AI_ENGINE] Follow-up generation failed:", followUpError);
                await sendMessage(chatId, toolResult.message);
            }

        } else {
            // No function call — plain text response
            const textResponse = response.text();

            if (textResponse) {
                await sendMessage(chatId, textResponse);
            } else {
                await sendMessage(chatId, "I'm not sure how to help with that. Try asking about your tasks or creating a new one.");
            }
        }

    } catch (error) {
        console.error("[AI_ENGINE] Unexpected error:", error);
        await sendMessage(chatId, "I couldn't process that request. Please try again.");
    }
}
