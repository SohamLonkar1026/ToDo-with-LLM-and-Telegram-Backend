import { formatInTimeZone } from "date-fns-tz";
import env from "../config/env";
import { Task, User } from "@prisma/client";

// ... (existing constants)

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const sendMessage = async (chatId: string, text: string, inlineKeyboard?: any) => {
    // ... (logic remains same)
    if (!process.env.TELEGRAM_BOT_TOKEN) {
        console.warn("[TELEGRAM] Bot token missing. Message not sent.");
        return;
    }

    try {
        const body: any = {
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
        };

        if (inlineKeyboard) {
            body.reply_markup = inlineKeyboard;
        }

        console.log("🔥 TELEGRAM FETCH EXECUTING", new Date().toISOString());
        console.trace("FETCH STACK TRACE");
        const response = await fetch(`${BASE_URL}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        console.log("🔥 TELEGRAM FETCH COMPLETED", new Date().toISOString());

        const data = await response.json() as any;

        if (!data.ok) {
            console.error("[TELEGRAM] Send failed:", data);
        }
    } catch (error) {
        console.error("[TELEGRAM] Network error during sendMessage:", error);
    }
};

export const sendReminderNotification = async (task: Task, user: User & { telegramChatId: string | null }) => {
    if (!user.telegramChatId) return;

    try {
        console.log("[DEBUG_TELEGRAM] RAW DB VALUE:", task.dueDate);
        console.log("[DEBUG_TELEGRAM] AS ISO:", new Date(task.dueDate).toISOString());

        const dueDateFormatted = formatInTimeZone(
            new Date(task.dueDate),
            "Asia/Kolkata",
            "MMM d, h:mm a"
        );
        console.log("[DEBUG_TELEGRAM] AS IST:", dueDateFormatted);

        const isOverdue = Date.now() > new Date(task.dueDate).getTime();
        const header = isOverdue ? "🚨 <b>OVERDUE</b>" : "🔔 <b>REMINDER</b>";

        // Truncate description if too long
        const description = task.description
            ? `\nDescription: <i>${task.description.length > 50 ? task.description.substring(0, 50) + "..." : task.description}</i>`
            : "";

        const message = `${header}\n\nTask: <b>${task.title}</b>${description}\nDue: ${dueDateFormatted}`;

        // Inline keyboard for Snooze
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    { text: "1h 💤", callback_data: `SNOOZE_1_${task.id}` },
                    { text: "3h 💤", callback_data: `SNOOZE_3_${task.id}` },
                ],
                [
                    { text: "6h 💤", callback_data: `SNOOZE_6_${task.id}` },
                    { text: "12h 💤", callback_data: `SNOOZE_12_${task.id}` },
                ]
            ]
        };

        await sendMessage(user.telegramChatId, message, inlineKeyboard);

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[TELEGRAM] Sent reminder for task ${task.id} to chat ${user.telegramChatId}`);
        }

    } catch (error) {
        console.error("[TELEGRAM] Failed to send reminder notification:", error);
    }
};
