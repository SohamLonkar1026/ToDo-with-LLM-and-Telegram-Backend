import db from "../utils/firestore";
import { fromDoc, fromDocs } from "./firestoreUtil";
import { RecurringTemplate } from "./types";

const templatesCol = db.collection("recurringTemplates");

export async function create(data: Omit<RecurringTemplate, "id" | "createdAt">): Promise<RecurringTemplate> {
    const ref = await templatesCol.add({ ...data, createdAt: new Date() });
    const snap = await ref.get();
    return fromDoc<RecurringTemplate>(snap);
}

export async function findById(id: string): Promise<RecurringTemplate | null> {
    const snap = await templatesCol.doc(id).get();
    return snap.exists ? fromDoc<RecurringTemplate>(snap) : null;
}

export async function findActiveByUser(userId: string): Promise<RecurringTemplate[]> {
    const snap = await templatesCol.where("userId", "==", userId).where("active", "==", true).get();
    return fromDocs<RecurringTemplate>(snap);
}
