
import { formatInTimeZone } from "date-fns-tz";
import * as taskRepository from "../repositories/task.repository";
import { sendMessage } from "./telegram.service";
import { User } from "../repositories/types";

const BASE_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

export const sendMainMenu = async (chatId: string) => {
    const message = "👋 <b>Main Menu</b>\n\nWhat would you like to do?";
    const keyboard = {
        inline_keyboard: [
            [
                { text: "➕ Add Task", callback_data: "NAV_ADD" },
                { text: "✅ Mark Done", callback_data: "NAV_MARK_DONE" }
            ],
            [
                { text: "🔥 Priority View", callback_data: "NAV_PRIORITY" },
                { text: "📅 Due View", callback_data: "NAV_DUE" }
            ]
        ]
    };
    await sendMessage(chatId, message, keyboard);
};

export const handleNavigationCallback = async (callback: any, user: User) => {
    const data = callback.data as string;
    const chatId = callback.message.chat.id.toString();

    // Acknowledge callback to stop spinner
    await answerCallback(callback.id);

    if (data === "NAV_ADD") {
        await sendMessage(chatId, "📝 <b>Add Task</b>\n\nType <code>/add Title Date</code> to create a new task.\nExample: <code>/add Buy milk tomorrow 5pm</code>");
    }
    else if (data === "NAV_PRIORITY") {
        // Fetch top 10 tasks by Priority (High -> Low)
        const fetched = await taskRepository.findManyByUserStatus(user.id, "PENDING", 20);

        // In-memory sort: createdAt desc, then priority HIGH > MEDIUM > LOW
        fetched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const pMap: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        fetched.sort((a, b) => pMap[b.priority] - pMap[a.priority]);
        const top10 = fetched.slice(0, 10);

        if (top10.length === 0) {
            await sendMessage(chatId, "🎉 <b>No pending tasks!</b>");
            return;
        }

        let msg = "🔥 <b>High Priority Tasks</b>\n\n";
        top10.forEach((t, i) => {
            const icon = t.priority === "HIGH" ? "🔴" : t.priority === "MEDIUM" ? "🟡" : "🟢";
            msg += `${i + 1}. ${icon} <b>${t.title}</b>\n   Due: ${formatInTimeZone(t.dueDate, "Asia/Kolkata", "MMM d")}\n`;
        });
        await sendMessage(chatId, msg);
    }
    else if (data === "NAV_DUE") {
        // Fetch top 10 by Due Date Ascending
        const fetched = await taskRepository.findManyByUserStatus(user.id, "PENDING");
        fetched.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
        const tasks = fetched.slice(0, 10);

        if (tasks.length === 0) {
            await sendMessage(chatId, "🎉 <b>No pending tasks!</b>");
            return;
        }

        let msg = "📅 <b>Upcoming Deadlines</b>\n\n";
        tasks.forEach((t, i) => {
            const isOverdue = new Date() > t.dueDate;
            const icon = isOverdue ? "🚨" : "🕒";
            msg += `${i + 1}. ${icon} <b>${t.title}</b>\n   ${formatInTimeZone(t.dueDate, "Asia/Kolkata", "MMM d, h:mm a")}\n`;
        });
        await sendMessage(chatId, msg);
    }
    else if (data === "NAV_MARK_DONE") {
        // List tasks as buttons
        const fetched = await taskRepository.findManyByUserStatus(user.id, "PENDING");
        fetched.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const tasks = fetched.slice(0, 10);

        if (tasks.length === 0) {
            await sendMessage(chatId, "🎉 <b>No tasks to complete!</b>");
            return;
        }

        const keyboard = {
            inline_keyboard: tasks.map(t => ([
                { text: `✅ ${t.title}`, callback_data: `DONE_${t.id}` }
            ]))
        };

        await sendMessage(chatId, "👉 <b>Tap to complete a task:</b>", keyboard);
    }
};

export const handleDoneCallback = async (callback: any, user: User) => {
    const data = callback.data as string;
    const taskId = data.replace("DONE_", "");

    // Acknowledge
    await answerCallback(callback.id, "Marking as done...");

    try {
        // Verify ownership and update
        const task = await taskRepository.findByIdForUser(taskId, user.id);

        if (!task) {
            await sendMessage((user as any).telegramChatId!, "❌ Task not found found or already deleted.");
            return;
        }

        await taskRepository.updateById(taskId, { status: "COMPLETED" });

        // Edit the message or send confirmation
        // Editing the original message (the list) might be tricky if we want to remove just one button.
        // Simplest UX: Sending a confirmation message. 
        // Or edit the specific button? Telegram doesn't support editing just one button easily without re-sending keyboard.
        // Let's just send confirmation.

        await sendMessage(user.telegramChatId!, `✅ Completed: <b>${task.title}</b>`);

        // Optionally show menu again
        // await sendMainMenu(user.telegramChatId!);

    } catch (error) {
        console.error("[TELEGRAM] Done handler error:", error);
    }
};

const answerCallback = async (callbackId: string, text?: string) => {
    try {
        const body: any = { callback_query_id: callbackId };
        if (text) body.text = text;

        await fetch(`${BASE_URL}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    } catch (e) {
        // Ignore
    }
};
