import db from "../utils/firestore";
import { fromDoc, fromDocs } from "./firestoreUtil";
import { Notification } from "./types";

const notificationsCol = db.collection("notifications");

export async function findById(id: string): Promise<Notification | null> {
    const snap = await notificationsCol.doc(id).get();
    return snap.exists ? fromDoc<Notification>(snap) : null;
}

export async function findByIdForUser(id: string, userId: string): Promise<Notification | null> {
    const n = await findById(id);
    return n && n.userId === userId ? n : null;
}

export async function update(id: string, data: Partial<Omit<Notification, "id" | "userId" | "createdAt">>): Promise<Notification | null> {
    await notificationsCol.doc(id).update(data);
    return findById(id);
}

export async function updateManyUnreadToRead(userId: string): Promise<number> {
    const snap = await notificationsCol.where("userId", "==", userId).where("read", "==", false).get();
    if (snap.empty) return 0;
    const batch = db.batch();
    for (const doc of snap.docs) {
        batch.update(doc.ref, { read: true });
    }
    await batch.commit();
    return snap.size;
}

export async function findPaginatedByUser(
    userId: string,
    page: number,
    limit: number
): Promise<{ notifications: Notification[]; totalCount: number }> {
    const baseQuery = notificationsCol.where("userId", "==", userId);
    const skip = (page - 1) * limit;

    const [countSnap, pageSnap] = await Promise.all([
        baseQuery.count().get(),
        baseQuery
            .orderBy("createdAt", "desc")
            .offset(skip)
            .limit(limit)
            .get(),
    ]);

    return {
        notifications: fromDocs<Notification>(pageSnap),
        totalCount: countSnap.data().count,
    };
}

export async function deleteAllForTask(taskId: string): Promise<void> {
    const snap = await notificationsCol.where("taskId", "==", taskId).get();
    if (snap.empty) return;
    const batch = db.batch();
    for (const doc of snap.docs) {
        batch.delete(doc.ref);
    }
    await batch.commit();
}
