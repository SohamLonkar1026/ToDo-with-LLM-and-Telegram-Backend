import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import env from "../config/env";

export interface AuthRequest extends Request {
    userId?: string;
}

interface JwtPayload {
    userId: string;
}

import prisma from "../utils/prisma";

export async function authMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

        // Verify user exists in DB
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true }
        });

        if (!user) {
            res.status(401).json({ success: false, message: "User no longer exists." });
            return;
        }

        req.userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, message: "Invalid or expired token." });
    }
}
