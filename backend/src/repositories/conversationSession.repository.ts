import db from "../utils/firestore";
import { fromDoc } from "./firestoreUtil";
import { ConversationSession } from "./types";

const sessionsCol = db.collection("conversationSessions");

export async function upsert(chatId: string, step: string, partialData: Record<string, any>): Promise<ConversationSession> {
    const ref = sessionsCol.doc(chatId);
    const now = new Date();
    const existing = await ref.get();

    await ref.set(
        {
            telegramChatId: chatId,
            step,
            partialData,
            updatedAt: now,
            ...(existing.exists ? {} : { createdAt: now }),
        },
        { merge: true }
    );

    const snap = await ref.get();
    return fromDoc<ConversationSession>(snap);
}

export async function get(chatId: string): Promise<ConversationSession | null> {
    const snap = await sessionsCol.doc(chatId).get();
    return snap.exists ? fromDoc<ConversationSession>(snap) : null;
}

export async function update(chatId: string, step: string, partialData: Record<string, any>): Promise<ConversationSession | null> {
    const ref = sessionsCol.doc(chatId);
    const existing = await ref.get();
    if (!existing.exists) return null;

    await ref.update({ step, partialData, updatedAt: new Date() });
    const snap = await ref.get();
    return fromDoc<ConversationSession>(snap);
}

export async function deleteSession(chatId: string): Promise<void> {
    await sessionsCol.doc(chatId).delete();
}
