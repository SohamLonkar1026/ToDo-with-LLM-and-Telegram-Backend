import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";

export async function register(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters.",
            });
            return;
        }

        const result = await authService.registerUser(email, password);

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

export async function login(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
            return;
        }

        const result = await authService.loginUser(email, password);

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}
