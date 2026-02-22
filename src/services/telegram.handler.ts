import prisma from "../utils/prisma";
import * as navigationService from "./telegram.navigation";
import * as linkService from "./telegram.link.service";
import { sendMessage } from "./telegram.service";
import { processMessage as aiProcessMessage } from "./ai-engine.service";

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ─── Message Handler (Exported for Webhook Controller) ───────────────────────

export const handleMessage = async (message: any) => {
    try {
        const text = message.text;
        const chatId = message.chat.id.toString();

        if (!text) return;

        // 1. LINK COMMAND (/link <code>) — Allow unlinked users
        if (text.startsWith("/link")) {
            const parts = text.split(" ");
            if (parts.length !== 2) {
                await sendMessage(chatId, "❌ Usage: /link <6-digit-code>\nGet your code from the dashboard.");
                return;
            }
            const code = parts[1].trim();
            const result = await linkService.linkTelegramAccount(code, chatId);

            if (result.success) {
                await sendMessage(chatId, result.message);
                await navigationService.sendMainMenu(chatId);
            } else {
                await sendMessage(chatId, result.message);
            }
            return;
        }

        // 2. START COMMAND (/start)
        if (text === "/start") {
            const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });
            if (user) {
                await navigationService.sendMainMenu(chatId);
            } else {
                await sendMessage(chatId, "👋 Welcome! Please link your account.\n\nType: <code>/link 123456</code>\n(Get the code from your web dashboard)");
            }
            return;
        }

        // 3. MENU COMMAND (/menu)
        if (text === "/menu") {
            const user = await prisma.user.findFirst({ where: { telegramChatId: chatId } });
            if (!user) {
                await sendMessage(chatId, "❌ Please link your account first.\nType <code>/link &lt;code&gt;</code>.");
                return;
            }
            await navigationService.sendMainMenu(chatId);
            return;
        }

        // 4. ALL OTHER TEXT → AI Engine
        await aiProcessMessage(chatId, text);

    } catch (e) {
        console.error("[TELEGRAM_HANDLER] Message handler error:", e);
    }
};

// ─── Callback Query Handler (Exported for Webhook Controller) ────────────────

export const handleCallbackQuery = async (callback: any) => {
    try {
        const data = callback.data;
        const chatId = callback.message.chat.id.toString();

        if (!data) return;

        // 1. SNOOZE Logic
        if (data.startsWith("SNOOZE_")) {
            const parts = data.split("_");
            if (parts.length !== 3) return;

            const hours = parseInt(parts[1]);
            const taskId = parts[2];

            if (isNaN(hours) || ![1, 3, 6, 12].includes(hours)) {
                console.warn("[TELEGRAM_HANDLER] Invalid snooze hours:", hours);
                return;
            }

            const snoozeMs = hours * 60 * 60 * 1000;
            const snoozedUntil = new Date(Date.now() + snoozeMs);
            const now = new Date();

            await prisma.task.update({
                where: { id: taskId },
                data: {
                    snoozedUntil: snoozedUntil,
                    lastReminderSentAt: now,
                },
            });

            await fetch(`${BASE_URL}/answerCallbackQuery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ callback_query_id: callback.id, text: `Snoozed for ${hours}h` }),
            });

            await fetch(`${BASE_URL}/editMessageText`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: callback.message.chat.id,
                    message_id: callback.message.message_id,
                    text: `✅ <b>Snoozed for ${hours} hours</b>\n\nTask: ${callback.message.text.split("\n")[2]?.replace("Task: ", "") || "Unknown"}\nResuming at: ${snoozedUntil.toLocaleTimeString()}`,
                    parse_mode: "HTML",
                }),
            });

            console.log(`[TELEGRAM_HANDLER] Task ${taskId} snoozed for ${hours}h by user`);
            return;
        }

        // Verify user for Navigation/Done
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
        console.error("[TELEGRAM_HANDLER] Error handling callback:", error);
    }
};
