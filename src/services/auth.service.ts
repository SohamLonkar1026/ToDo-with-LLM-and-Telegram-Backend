import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../utils/prisma";
import env from "../config/env";

const SALT_ROUNDS = 10;

export async function registerUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (existingUser) {
        throw { status: 409, message: "User with this email already exists." };
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
        data: { email: normalizedEmail, password: hashedPassword },
    });

    const token = generateToken(user.id);

    return { userId: user.id, email: user.email, token };
}

export async function loginUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        throw { status: 401, message: "Invalid email or password." };
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
        throw { status: 401, message: "Invalid email or password." };
    }

    const token = generateToken(user.id);

    return { userId: user.id, email: user.email, token };
}

function generateToken(userId: string): string {
    return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "7d" });
}
