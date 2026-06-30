
import db from "../utils/firestore";
import { fromDocs } from "../repositories/firestoreUtil";
import { User } from "../repositories/types";
import env from "../config/env";

async function main() {
    console.log("--- RUNTIME ENV VARS ---");
    console.log("JWT_SECRET:", env.JWT_SECRET);

    console.log("\n--- RECENT USERS ---");
    const snap = await db.collection("users").orderBy("createdAt", "desc").limit(5).get();
    const users = fromDocs<User>(snap).map((u) => ({ id: u.id, email: u.email, createdAt: u.createdAt }));
    console.log(JSON.stringify(users, null, 2));
}

main();
