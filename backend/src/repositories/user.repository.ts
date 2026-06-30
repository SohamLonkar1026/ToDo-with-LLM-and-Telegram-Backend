import db from "../utils/firestore";
import { fromDoc } from "./firestoreUtil";
import { User } from "./types";

const usersCol = db.collection("users");
const emailIndexCol = db.collection("userEmailIndex");
const chatIndexCol = db.collection("telegramChatIndex");
const linkCodeIndexCol = db.collection("telegramLinkCodeIndex");

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export async function findById(id: string): Promise<User | null> {
    const snap = await usersCol.doc(id).get();
    return snap.exists ? fromDoc<User>(snap) : null;
}

export async function findByEmail(email: string): Promise<User | null> {
    const indexSnap = await emailIndexCol.doc(normalizeEmail(email)).get();
    if (!indexSnap.exists) return null;
    const { userId } = indexSnap.data() as { userId: string };
    return findById(userId);
}

export async function createUser(data: {
    email: string;
    password: string;
    defaultNotifyBeforeHours?: number[];
    defaultNotifyPercentage?: number[];
    defaultMinGapMinutes?: number;
}): Promise<User> {
    const normalizedEmail = normalizeEmail(data.email);
    const userRef = usersCol.doc();
    const now = new Date();

    try {
        await db.runTransaction(async (tx) => {
            const emailIndexRef = emailIndexCol.doc(normalizedEmail);
            const existing = await tx.get(emailIndexRef);
            if (existing.exists) {
                const err: any = new Error("Email already in use.");
                err.status = 409;
                throw err;
            }
            tx.create(emailIndexRef, { userId: userRef.id });
            tx.create(userRef, {
                email: data.email,
                password: data.password,
                createdAt: now,
                updatedAt: now,
                telegramChatId: null,
                telegramLinkCode: null,
                telegramLinkExpiresAt: null,
                defaultNotifyBeforeHours: data.defaultNotifyBeforeHours ?? [],
                defaultNotifyPercentage: data.defaultNotifyPercentage ?? [],
                defaultMinGapMinutes: data.defaultMinGapMinutes ?? 58,
            });
        });
    } catch (err: any) {
        if (err.status === 409) throw err;
        throw err;
    }

    return (await findById(userRef.id)) as User;
}

export async function updateUser(id: string, data: Partial<Omit<User, "id" | "email">>): Promise<User | null> {
    await usersCol.doc(id).update({ ...data, updatedAt: new Date() });
    return findById(id);
}

export async function findByTelegramChatId(chatId: string): Promise<User | null> {
    const indexSnap = await chatIndexCol.doc(chatId).get();
    if (!indexSnap.exists) return null;
    const { userId } = indexSnap.data() as { userId: string };
    return findById(userId);
}

export async function findByTelegramLinkCode(code: string): Promise<User | null> {
    const indexSnap = await linkCodeIndexCol.doc(code).get();
    if (!indexSnap.exists) return null;
    const { userId } = indexSnap.data() as { userId: string };
    return findById(userId);
}

/**
 * Replicates the Prisma P2002-retry loop: a `.create()` (not `.set()`) on the
 * index doc fails atomically inside the transaction if the code is taken.
 */
export async function setTelegramLinkCode(userId: string, code: string, expiresAt: Date): Promise<boolean> {
    const userRef = usersCol.doc(userId);
    try {
        await db.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const userData = userSnap.data() as any;

            const codeIndexRef = linkCodeIndexCol.doc(code);
            const codeIndexSnap = await tx.get(codeIndexRef);
            if (codeIndexSnap.exists) {
                const err: any = new Error("Code collision");
                err.code = "COLLISION";
                throw err;
            }

            if (userData?.telegramLinkCode) {
                tx.delete(linkCodeIndexCol.doc(userData.telegramLinkCode));
            }

            tx.create(codeIndexRef, { userId, expiresAt });
            tx.update(userRef, { telegramLinkCode: code, telegramLinkExpiresAt: expiresAt, updatedAt: new Date() });
        });
        return true;
    } catch (err: any) {
        if (err.code === "COLLISION") return false;
        throw err;
    }
}

export async function clearTelegramLinkCode(userId: string): Promise<void> {
    const userRef = usersCol.doc(userId);
    await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const userData = userSnap.data() as any;
        if (userData?.telegramLinkCode) {
            tx.delete(linkCodeIndexCol.doc(userData.telegramLinkCode));
        }
        tx.update(userRef, { telegramLinkCode: null, telegramLinkExpiresAt: null, updatedAt: new Date() });
    });
}

/**
 * Clears any existing chatId link from other users, then links chatId to userId,
 * and clears the user's pending link code. Mirrors linkTelegramAccount's
 * updateMany-then-update sequence as a single transaction.
 */
export async function linkTelegramChat(userId: string, chatId: string): Promise<void> {
    const userRef = usersCol.doc(userId);
    const chatIndexRef = chatIndexCol.doc(chatId);

    await db.runTransaction(async (tx) => {
        const existingChatIndexSnap = await tx.get(chatIndexRef);
        const userSnap = await tx.get(userRef);
        const userData = userSnap.data() as any;

        if (existingChatIndexSnap.exists) {
            const { userId: previousUserId } = existingChatIndexSnap.data() as { userId: string };
            if (previousUserId !== userId) {
                tx.update(usersCol.doc(previousUserId), { telegramChatId: null, updatedAt: new Date() });
            }
        }

        if (userData?.telegramLinkCode) {
            tx.delete(linkCodeIndexCol.doc(userData.telegramLinkCode));
        }

        tx.set(chatIndexRef, { userId });
        tx.update(userRef, {
            telegramChatId: chatId,
            telegramLinkCode: null,
            telegramLinkExpiresAt: null,
            updatedAt: new Date(),
        });
    });
}

export async function countUsers(): Promise<number> {
    const snap = await usersCol.count().get();
    return snap.data().count;
}
