
import prisma from "../utils/prisma";

/**
 * Generates a unique 6-digit linking code for a user.
 * Ensures uniqueness by checking against existing active codes.
 * Sets expiry to 5 minutes from now.
 */

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

        try {
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Try updating user with new code (Overwrite if exists)
            // If code correlates to another user (unique constraint), this will throw
            await prisma.user.update({
                where: { id: userId },
                data: {
                    telegramLinkCode: code,
                    telegramLinkExpiresAt: expiresAt
                }
            });
            isUnique = true;
        } catch (error: any) {
            // Check for P2002 (Unique constraint failed)
            if (error.code === 'P2002') {
                console.warn(`[TELEGRAM LINK] Collision detected for code ${code}, retrying...`);
                continue; // Retry loop
            }
            throw error; // Other errors should bubble up
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
    const user = await prisma.user.findFirst({
        where: { telegramLinkCode: code }
    });

    if (!user) {
        return { success: false, message: "❌ Invalid or expired linking code." };
    }

    // 2. Check Expiry
    if (!user.telegramLinkExpiresAt || user.telegramLinkExpiresAt < new Date()) {
        // CLEANUP: specific expired code
        await prisma.user.update({
            where: { id: user.id },
            data: {
                telegramLinkCode: null,
                telegramLinkExpiresAt: null
            }
        });
        return { success: false, message: "❌ Invalid or expired linking code." };
    }

    // 3. Collision Check: Is this chatId already linked to ANY user?
    const existingLink = await prisma.user.findFirst({
        where: { telegramChatId: chatId }
    });

    // If linked to someone else, reject. 
    // If linked to self (re-linking), allow overwrite/update.
    if (existingLink && existingLink.id !== user.id) {
        return { success: false, message: "❌ This Telegram account is already linked to another user." };
    }

    // 4. Link Account (Overwrite safely)
    await prisma.user.update({
        where: { id: user.id },
        data: {
            telegramChatId: chatId,
            telegramLinkCode: null,     // clear code
            telegramLinkExpiresAt: null // clear expiry
        }
    });

    return { success: true, message: "✅ Telegram successfully linked to your account." };
};
