
import * as userRepository from "../repositories/user.repository";

/**
 * Generates a unique 6-digit linking code for a user.
 * Ensures uniqueness by checking against existing active codes.
 * Sets expiry to 5 minutes from now.
 */
export const generateLinkCode = async (userId: string): Promise<string> => {
    let code = "";
    let isUnique = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    // Loop until we generate a unique code and successfully update the user
    while (!isUnique && attempts < MAX_ATTEMPTS) {
        attempts++;
        // Generate 6-digit code (000000 - 999999)
        code = Math.floor(100000 + Math.random() * 900000).toString();

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Try claiming the code (fails atomically if another user already holds it)
        const claimed = await userRepository.setTelegramLinkCode(userId, code, expiresAt);
        if (claimed) {
            isUnique = true;
        } else {
            console.warn(`[TELEGRAM LINK] Collision detected for code ${code}, retrying...`);
        }
    }

    if (!isUnique) {
        throw new Error("Failed to generate unique linking code after multiple attempts.");
    }

    return code;
};

/**
 * Links a Telegram account to a user using the 6-digit code.
 * Validates expiration and collision with other accounts.
 */
export const linkTelegramAccount = async (code: string, chatId: string): Promise<{ success: boolean; message: string }> => {
    // 1. Find user by code
    const user = await userRepository.findByTelegramLinkCode(code);

    if (!user) {
        return { success: false, message: "❌ Invalid or expired linking code." };
    }

    // 2. Check Expiry
    if (!user.telegramLinkExpiresAt || user.telegramLinkExpiresAt < new Date()) {
        // CLEANUP: specific expired code
        await userRepository.clearTelegramLinkCode(user.id);
        return { success: false, message: "❌ Invalid or expired linking code." };
    }

    // 3. Link Account (also clears any existing link for this chatId, allowing clean re-linking)
    await userRepository.linkTelegramChat(user.id, chatId);

    return { success: true, message: "✅ Telegram account successfully linked." };
};
