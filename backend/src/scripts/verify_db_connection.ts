
import db from "../utils/firestore";
import * as userRepository from "../repositories/user.repository";

async function main() {
    console.log("Attempting to connect to Firestore...");
    try {
        await db.listCollections();
        console.log("✅ Successfully connected to Firestore!");
        const count = await userRepository.countUsers();
        console.log(`Current user count: ${count}`);
    } catch (error) {
        console.error("❌ Failed to connect:", error);
        process.exit(1);
    }
}

main();
