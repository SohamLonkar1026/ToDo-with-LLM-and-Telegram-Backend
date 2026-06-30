import { Response } from "express";
import * as userRepository from "../repositories/user.repository";
import { AuthRequest } from "../middleware/auth.middleware";

export const getReminderDefaults = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        const user = await userRepository.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.json({
            defaultNotifyBeforeHours: user.defaultNotifyBeforeHours,
            defaultNotifyPercentage: user.defaultNotifyPercentage,
            defaultMinGapMinutes: user.defaultMinGapMinutes,
        });
    } catch (error) {
        console.error("[GET_REMINDER_DEFAULTS]", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const updateReminderDefaults = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const {
            defaultNotifyBeforeHours,
            defaultNotifyPercentage,
            defaultMinGapMinutes,
        } = req.body;

        // Basic type validation
        if (
            !Array.isArray(defaultNotifyBeforeHours) ||
            !Array.isArray(defaultNotifyPercentage) ||
            typeof defaultMinGapMinutes !== "number"
        ) {
            return res.status(400).json({ message: "Invalid input format" });
        }

        // Integer enforcement
        if (!Number.isInteger(defaultMinGapMinutes)) {
            return res.status(400).json({
                message: "defaultMinGapMinutes must be an integer",
            });
        }
        if (!defaultNotifyBeforeHours.every(Number.isInteger)) {
            return res.status(400).json({
                message: "Hour values must be integers",
            });
        }
        if (!defaultNotifyPercentage.every(Number.isInteger)) {
            return res.status(400).json({
                message: "Percentage values must be integers",
            });
        }

        // Value constraint validation
        const allowedHours = [1, 3, 6, 12, 24];
        const allowedPercent = [20, 40, 60, 80, 90];

        // Reject oversized arrays
        if (defaultNotifyBeforeHours.length > allowedHours.length) {
            return res.status(400).json({
                message: `Too many hour values. Maximum allowed: ${allowedHours.length}`,
            });
        }
        if (defaultNotifyPercentage.length > allowedPercent.length) {
            return res.status(400).json({
                message: `Too many percentage values. Maximum allowed: ${allowedPercent.length}`,
            });
        }

        const invalidHours = defaultNotifyBeforeHours.filter(
            (h: number) => !allowedHours.includes(h)
        );
        const invalidPercent = defaultNotifyPercentage.filter(
            (p: number) => !allowedPercent.includes(p)
        );

        if (invalidHours.length > 0) {
            return res.status(400).json({
                message: `Invalid hour values: ${invalidHours.join(", ")}. Allowed: ${allowedHours.join(", ")}`,
            });
        }
        if (invalidPercent.length > 0) {
            return res.status(400).json({
                message: `Invalid percentage values: ${invalidPercent.join(", ")}. Allowed: ${allowedPercent.join(", ")}`,
            });
        }
        if (defaultMinGapMinutes < 0) {
            return res.status(400).json({
                message: "defaultMinGapMinutes must be a non-negative number",
            });
        }
        if (defaultMinGapMinutes > 1440) {
            return res.status(400).json({
                message: "defaultMinGapMinutes must not exceed 1440 (24 hours)",
            });
        }

        // Deduplicate and sort arrays before persisting
        const cleanedHours = [...new Set(defaultNotifyBeforeHours as number[])].sort((a, b) => a - b);
        const cleanedPercent = [...new Set(defaultNotifyPercentage as number[])].sort((a, b) => a - b);

        const updatedUser = await userRepository.updateUser(userId, {
            defaultNotifyBeforeHours: cleanedHours,
            defaultNotifyPercentage: cleanedPercent,
            defaultMinGapMinutes,
        });

        return res.json({
            defaultNotifyBeforeHours: updatedUser?.defaultNotifyBeforeHours,
            defaultNotifyPercentage: updatedUser?.defaultNotifyPercentage,
            defaultMinGapMinutes: updatedUser?.defaultMinGapMinutes,
        });
    } catch (error) {
        console.error("[UPDATE_REMINDER_DEFAULTS]", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
