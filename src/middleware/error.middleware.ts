import { Request, Response, NextFunction } from "express";
import env from "../config/env";

interface AppError {
    status?: number;
    message?: string;
    stack?: string;
}

export function errorMiddleware(
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const status = err.status || 500;
    const message = err.message || "Internal server error.";

    const response: Record<string, unknown> = {
        success: false,
        message: status === 500 && env.NODE_ENV === 'production' ? 'Internal server error' : message,
    };

    if (env.NODE_ENV !== "production" && err.stack) {
        response.stack = err.stack;
    }

    res.status(status).json(response);
}
