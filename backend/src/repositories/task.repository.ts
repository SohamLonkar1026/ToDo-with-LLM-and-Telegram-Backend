import { FieldValue } from "firebase-admin/firestore";
import db from "../utils/firestore";
import { fromDoc, fromDocs } from "./firestoreUtil";
import { Task, Notification } from "./types";
import * as notificationRepository from "./notification.repository";

const tasksCol = db.collection("tasks");

export async function create(data: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    const now = new Date();
    const ref = await tasksCol.add({ ...data, createdAt: now, updatedAt: now });
    const snap = await ref.get();
    return fromDoc<Task>(snap);
}

export async function findById(id: string): Promise<Task | null> {
    const snap = await tasksCol.doc(id).get();
    return snap.exists ? fromDoc<Task>(snap) : null;
}

export async function findByIdForUser(id: string, userId: string): Promise<Task | null> {
    const task = await findById(id);
    return task && task.userId === userId ? task : null;
}

export async function findManyByUserExcludingRecurring(userId: string): Promise<Task[]> {
    const snap = await tasksCol
        .where("userId", "==", userId)
        .where("recurringTemplateId", "==", null)
        .orderBy("dueDate", "asc")
        .get();
    return fromDocs<Task>(snap);
}

export async function findManyByUserExcludingRecurringUnsorted(userId: string): Promise<Task[]> {
    const snap = await tasksCol
        .where("userId", "==", userId)
        .where("recurringTemplateId", "==", null)
        .get();
    return fromDocs<Task>(snap);
}

export async function updateById(id: string, data: Partial<Omit<Task, "id" | "userId" | "createdAt">>): Promise<Task | null> {
    await tasksCol.doc(id).update({ ...data, updatedAt: new Date() });
    return findById(id);
}

export async function deleteById(id: string): Promise<void> {
    await notificationRepository.deleteAllForTask(id);
    await tasksCol.doc(id).delete();
}

/**
 * Firestore has no native OR across an equality+null check, so this runs as
 * two separate queries (snoozedUntil==null, snoozedUntil<=now) merged/deduped.
 */
export async function findPendingEligibleForReminder(now: Date): Promise<Task[]> {
    const [noSnoozeSnap, expiredSnoozeSnap] = await Promise.all([
        tasksCol.where("status", "==", "PENDING").where("snoozedUntil", "==", null).get(),
        tasksCol.where("status", "==", "PENDING").where("snoozedUntil", "<=", now).get(),
    ]);

    const byId = new Map<string, Task>();
    for (const t of fromDocs<Task>(noSnoozeSnap)) byId.set(t.id, t);
    for (const t of fromDocs<Task>(expiredSnoozeSnap)) byId.set(t.id, t);
    return Array.from(byId.values());
}

/**
 * Replicates the atomic overdue guard: `updateMany` with
 * `NOT { reminderStagesSent: { has: "overdue" } }`, returning whether this
 * call claimed the update (mirrors `claimed.count === 1`).
 */
export async function claimOverdueStage(id: string, now: Date): Promise<boolean> {
    const ref = tasksCol.doc(id);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const data = snap.data() as any;
        if (data.status !== "PENDING") return false;
        if (Array.isArray(data.reminderStagesSent) && data.reminderStagesSent.includes("overdue")) return false;

        tx.update(ref, {
            lastReminderSentAt: now,
            reminderStagesSent: FieldValue.arrayUnion("overdue"),
            updatedAt: now,
        });
        return true;
    });
}

/**
 * Mirrors prisma.$transaction([task.update, notification.create]) for sending
 * a reminder stage.
 */
export async function sendStageTransaction(
    taskId: string,
    stage: string,
    now: Date,
    notification: Omit<Notification, "id" | "createdAt">
): Promise<void> {
    const taskRef = tasksCol.doc(taskId);
    const notificationRef = db.collection("notifications").doc();

    await db.runTransaction(async (tx) => {
        tx.update(taskRef, {
            lastReminderSentAt: now,
            reminderStagesSent: FieldValue.arrayUnion(stage),
            updatedAt: now,
        });
        tx.create(notificationRef, { ...notification, createdAt: now });
    });
}

export async function findFirstByRecurringTemplateSince(recurringTemplateId: string, since: Date): Promise<Task | null> {
    const snap = await tasksCol
        .where("recurringTemplateId", "==", recurringTemplateId)
        .where("createdAt", ">=", since)
        .limit(1)
        .get();
    return snap.empty ? null : fromDoc<Task>(snap.docs[0]);
}

export async function findManyByUserRecurringSince(userId: string, since: Date): Promise<Task[]> {
    const snap = await tasksCol
        .where("userId", "==", userId)
        .where("recurringTemplateId", "!=", null)
        .where("createdAt", ">=", since)
        .orderBy("recurringTemplateId")
        .orderBy("createdAt", "asc")
        .get();
    return fromDocs<Task>(snap);
}

export async function findManyByUserStatus(userId: string, status: string, limit?: number): Promise<Task[]> {
    let query = tasksCol.where("userId", "==", userId).where("status", "==", status) as FirebaseFirestore.Query;
    if (limit) query = query.limit(limit);
    const snap = await query.get();
    return fromDocs<Task>(snap);
}

export async function deleteManyCompletedBefore(threshold: Date): Promise<number> {
    const snap = await tasksCol
        .where("status", "==", "COMPLETED")
        .where("completedAt", "<=", threshold)
        .where("completedAt", "!=", null)
        .get();

    const batch = db.batch();
    for (const doc of snap.docs) {
        batch.delete(doc.ref);
    }
    if (!snap.empty) await batch.commit();

    for (const doc of snap.docs) {
        await notificationRepository.deleteAllForTask(doc.id);
    }

    return snap.size;
}
