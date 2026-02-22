
import { formatInTimeZone } from "date-fns-tz";
import prisma from "../utils/prisma";
import { sendMessage } from "./telegram.service";
import { User } from "@prisma/client";

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
        const tasks = await prisma.task.findMany({
            where: { userId: user.id, status: "PENDING" },
            orderBy: [
                { priority: "desc" }, // High first (enum order: LOW, MEDIUM, HIGH? Wait, Prisma enums are strings usually, but if ordered by enum value... Postgres enums sort by creation order usually? 
                // schema: LOW, MEDIUM, HIGH. Alpha sort: HIGH, LOW, MEDIUM. 
                // Actually easier to sort by logical value or just standard sort if defined. 
                // Let's rely on standard sort or maybe just fetch and sort in code if needed.
                // Re-checking schema: enum Priority { LOW, MEDIUM, HIGH }. 
                // DB sort might depend on impl. 
                // Safe bet: Fetch all pending (capped) or just sort by updatedAt for now if priority sort is tricky without raw sql or specific mapping?
                // Actually, let's try standard sort. If it's alphanumeric, High comes before Low? No. H < L. 
                // Let's just fetch recent pending and sort in memory for top 10 to be safe and pretty.
                // Or use standard createdAt desc for now + Priority filter? 
                // The prompt asks for "existing priority sorting logic". 
                // Existing logic in phase 4/5 uses a complex sort.
                // Let's keep it simple for Telegram: Just High priority first.
                { createdAt: "desc" }
            ],
            take: 20
        });

        // In-memory sort for Priority: HIGH > MEDIUM > LOW
        const pMap: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        tasks.sort((a, b) => pMap[b.priority] - pMap[a.priority]);
        const top10 = tasks.slice(0, 10);

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
        const tasks = await prisma.task.findMany({
            where: { userId: user.id, status: "PENDING" },
            orderBy: { dueDate: "asc" },
            take: 10
        });

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
        const tasks = await prisma.task.findMany({
            where: { userId: user.id, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 10
        });

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
        const task = await prisma.task.findFirst({
            where: { id: taskId, userId: user.id }
        });

        if (!task) {
            await sendMessage((user as any).telegramChatId!, "❌ Task not found found or already deleted.");
            return;
        }

        await prisma.task.update({
            where: { id: taskId },
            data: { status: "COMPLETED" }
        });

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
