import env from "../config/env";
import prisma from "../utils/prisma";
import * as chrono from "chrono-node";
import * as conversationService from "./conversation.service";
import * as navigationService from "./telegram.navigation";
import { sendMessage } from "./telegram.service";
import { Priority } from "@prisma/client";

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

let lastUpdateId = 0;
let pollingInterval: NodeJS.Timeout | null = null;
let isPolling = false;

export const initializeTelegramPoller = () => {
    console.log("[TELEGRAM] Polling disabled for webhook migration.");
    // if (!process.env.TELEGRAM_BOT_TOKEN) {
    //     console.warn("[TELEGRAM] Bot token missing. Poller disabled.");
    //     return;
    // }

    // if (pollingInterval) {
    //     console.warn("[TELEGRAM] Poller already running.");
    //     return;
    // }

    //Start polling loop
    // console.log("[BOOT] Telegram poller initialized");
    // pollingInterval = setInterval(poll, 3000);
};

const poll = async () => {
    // Polling logic disabled
    if (isPolling) return;

    // isPolling = true;

    // try {
    //     const offset = lastUpdateId + 1;
    //     const response = await fetch(`${BASE_URL}/getUpdates?offset=${offset}&timeout=1`);

    //     if (!response.ok) {
    //         if (process.env.NODE_ENV !== 'production') console.warn(`[TELEGRAM] Poll failed: ${response.statusText}`);
    //         isPolling = false;
    //         return;
    //     }

    //     const data = await response.json() as any;

    //     if (data.ok && data.result.length > 0) {
    //         for (const update of data.result) {
    //             if (update.update_id > lastUpdateId) {
    //                 lastUpdateId = update.update_id;
    //             }

    //             if (update.callback_query) {
    //                 await handleCallbackQuery(update.callback_query);
    //             } else if (update.message) {
    //                 await handleMessage(update.message);
    //             }
    //         }
    //     }
    // } catch (error) {
    //     console.error("[TELEGRAM] Polling error:", error);
    // } finally {
    //     isPolling = false;
    // }
};

import * as linkService from "./telegram.link.service";

// Exported for Webhook Controller
export const handleMessage = async (message: any) => {
    try {
        const text = message.text;
        const chatId = message.chat.id.toString();

        if (!text) return;

        // 1. LINK COMMAND (/link <code>) - Allow unlinked users
        if (text.startsWith("/link")) {
            const parts = text.split(" ");
            if (parts.length !== 2) {
                await sendMessage(chatId, "❌ usage: /link <6-digit-code>\nGet your code from the dashboard.");
                return;
            }
            const code = parts[1].trim();
            const result = await linkService.linkTelegramAccount(code, chatId);

            if (result.success) {
                await sendMessage(chatId, result.message);
                // Optionally show menu immediately
                await navigationService.sendMainMenu(chatId);
            } else {
                await sendMessage(chatId, result.message);
            }
            return;
        }

        // 2. START COMMAND (/start) - Allow checks
        if (text === "/start") {
            const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });
            if (user) {
                await navigationService.sendMainMenu(chatId);
            } else {
                await sendMessage(chatId, "👋 Welcome! Please link your account.\n\nType: `/link 123456`\n(Get the code from your web dashboard)");
            }
            return;
        }

        // 3. SECURITY GUARD - Reject unlinked users
        // This is the gatekeeper. No logic below this line runs for unlinked users.
        const user = await prisma.user.findFirst({
            where: { telegramChatId: chatId }
        });

        if (!user) {
            await sendMessage(chatId, "❌ Please link your account first using the dashboard.\nType `/link <code>`.");
            return;
        }

        // 4. NORMAL FLOW (User is linked and verified)

        // MENU COMMAND
        if (text === "/menu") {
            await navigationService.sendMainMenu(chatId);
            return;
        }

        // 2. Check Session
        const session = await conversationService.getSession(chatId);

        // CASE 1: /add command (Start New Session)
        if (text.startsWith("/add")) {
            // Cleanup old session if any
            if (session) await conversationService.deleteSession(chatId);

            // Fix: Interpret all inputs as IST (UTC+05:30)
            const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
            const nowIST = new Date(Date.now() + IST_OFFSET_MS);

            // Pass nowIST as reference so "tomorrow" means "tomorrow in IST"
            const results = chrono.parse(text, nowIST);

            if (results.length === 0) {
                await sendMessage(chatId, "❌ Could not detect a valid date.\nExample: /add Buy milk tomorrow 5pm");
                return;
            }

            const dateResult = results[0];

            // The parsed date 'looks' like IST (e.g., 5 PM) but is stored as UTC (17:00 Z) 
            // We must shift it back to get the real UTC instant (11:30 Z)
            // UNLESS the user explicitly specified a timezone (handle simpler case first)
            const parsedFaceValue = dateResult.start.date();
            const dueDate = new Date(parsedFaceValue.getTime() - IST_OFFSET_MS);

            // Safety: Ensure future date?
            if (dueDate < new Date()) {
                await sendMessage(chatId, "❌ Date must be in the future.");
                return;
            }

            // Remove command and date text
            const fullText = text.replace("/add", "");
            const dateText = dateResult.text;

            let title = fullText.replace(dateText, "").trim();
            title = title.replace(/\s+/g, " ").trim();

            if (!title) {
                await sendMessage(chatId, "❌ Please provide a task title.\nExample: /add Buy milk tomorrow");
                return;
            }

            await conversationService.createSession(chatId, "awaiting_description", {
                title: title,
                dueDate: dueDate.toISOString()
            });

            await sendMessage(chatId, `📝 <b>Task:</b> ${title}\n📅 <b>Due:</b> ${dueDate.toLocaleString()}\n\nPlease describe this task (or type 'skip' to leave empty).`);
            return;
        }

        // CASE 2: Active Session
        if (session) {
            const data = session.partialData as any;

            // Step: Description
            if (session.step === "awaiting_description") {
                const description = text.toLowerCase() === 'skip' ? "" : text;

                await conversationService.updateSession(chatId, "awaiting_meta", { description });

                await sendMessage(chatId, "⏱ Enter <b>duration (min)</b> and <b>urgency</b> (low/medium/high) separated by comma.\nExample: <code>30, high</code>");
                return;
            }

            // Step: Meta (Duration, Urgency)
            if (session.step === "awaiting_meta") {
                const parts = text.split(",").map((p: string) => p.trim());

                if (parts.length !== 2) {
                    await sendMessage(chatId, "❌ Invalid format. Please enter 'Duration, Urgency'.\nExample: 30, high");
                    return;
                }

                const duration = parseInt(parts[0]);
                const urgencyRaw = parts[1].toLowerCase();

                if (isNaN(duration) || duration <= 0) {
                    await sendMessage(chatId, "❌ Duration must be a positive number.");
                    return;
                }

                if (!['low', 'medium', 'high'].includes(urgencyRaw)) {
                    await sendMessage(chatId, "❌ Urgency must be low, medium, or high.");
                    return;
                }

                const urgency = urgencyRaw.toUpperCase() as Priority;

                // Create Task
                await prisma.task.create({
                    data: {
                        userId: user.id,
                        title: data.title,
                        description: data.description,
                        dueDate: new Date(data.dueDate),
                        estimatedMinutes: duration,
                        priority: urgency,
                        status: "PENDING"
                    }
                });

                await conversationService.deleteSession(chatId);
                await sendMessage(chatId, "✅ <b>Task Created!</b>");
                return;
            }
        }

    } catch (e) {
        console.error("[TELEGRAM] Message handler error:", e);
    }
}

// Exported for Webhook Controller
export const handleCallbackQuery = async (callback: any) => {
    try {
        const data = callback.data;
        const chatId = callback.message.chat.id.toString();

        if (!data) return;

        // 1. SNOOZE Logic (Existing)
        if (data.startsWith("SNOOZE_")) {
            // data format: SNOOZE_<hours>_<taskId>
            const parts = data.split("_");
            if (parts.length !== 3) return;

            const hours = parseInt(parts[1]);
            const taskId = parts[2];

            if (isNaN(hours) || ![1, 3, 6, 12].includes(hours)) {
                console.warn("[TELEGRAM] Invalid snooze hours:", hours);
                return;
            }

            const snoozeMs = hours * 60 * 60 * 1000;
            const snoozedUntil = new Date(Date.now() + snoozeMs);
            const now = new Date();

            await prisma.task.update({
                where: { id: taskId },
                data: {
                    snoozedUntil: snoozedUntil,
                    lastReminderSentAt: now
                }
            });

            await fetch(`${BASE_URL}/answerCallbackQuery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: callback.id, text: `Snoozed for ${hours}h` })
            });

            await fetch(`${BASE_URL}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: callback.message.chat.id,
                    message_id: callback.message.message_id,
                    text: `✅ <b>Snoozed for ${hours} hours</b>\n\nTask: ${callback.message.text.split('\n')[2]?.replace('Task: ', '') || 'Unknown'}\nResuming at: ${snoozedUntil.toLocaleTimeString()}`,
                    parse_mode: "HTML"
                })
            });

            console.log(`[TELEGRAM] Task ${taskId} snoozed for ${hours}h by user`);
            return;
        }

        // Verify User for Navigation/Done
        const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });
        if (!user) return;

        // 2. MARK DONE Logic
        if (data.startsWith("DONE_")) {
            await navigationService.handleDoneCallback(callback, user);
            return;
        }

        // 3. NAVIGATION Logic
        if (data.startsWith("NAV_")) {
            await navigationService.handleNavigationCallback(callback, user);
            return;
        }

    } catch (error) {
        console.error("[TELEGRAM] Error handling callback:", error);
    }
};

export const stopTelegramPoller = () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log("[SHUTDOWN] Telegram poller stopped");
    }
};
