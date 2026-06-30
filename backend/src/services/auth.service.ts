import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as userRepository from "../repositories/user.repository";
import env from "../config/env";

const SALT_ROUNDS = 10;

export async function registerUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await userRepository.findByEmail(normalizedEmail);

    if (existingUser) {
        throw { status: 409, message: "User with this email already exists." };
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    let user;
    try {
        user = await userRepository.createUser({ email: normalizedEmail, password: hashedPassword });
    } catch (err: any) {
        if (err.status === 409) {
            throw { status: 409, message: "User with this email already exists." };
        }
        throw err;
    }

    const token = generateToken(user.id);

    return { userId: user.id, email: user.email, token };
}

export async function loginUser(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);

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
