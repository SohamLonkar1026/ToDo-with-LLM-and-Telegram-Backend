
import db from "../utils/firestore";
import { fromDocs } from "../repositories/firestoreUtil";
import { User } from "../repositories/types";

async function main() {
    console.log("🔍 Checking Users in DB...");
    const snap = await db.collection("users").get();
    const users = fromDocs<User>(snap).map((u) => ({ id: u.id, email: u.email }));
    console.table(users);
}

main().catch((e) => console.error(e));
