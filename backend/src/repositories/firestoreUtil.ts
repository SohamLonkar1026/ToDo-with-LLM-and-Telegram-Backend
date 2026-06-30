/**
 * Admin SDK auto-converts JS `Date` -> Firestore `Timestamp` on writes, but
 * reads always come back as `Timestamp` and must be converted back manually.
 */
export function fromDoc<T>(
    snapshot: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot
): T {
    const data = snapshot.data() || {};
    const out: Record<string, any> = { id: snapshot.id };
    for (const [key, value] of Object.entries(data)) {
        out[key] = value && typeof (value as any).toDate === "function" ? (value as any).toDate() : value;
    }
    return out as T;
}

export function fromDocs<T>(snapshot: FirebaseFirestore.QuerySnapshot): T[] {
    return snapshot.docs.map((d) => fromDoc<T>(d));
}
