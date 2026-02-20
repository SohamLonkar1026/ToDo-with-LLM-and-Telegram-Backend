import express from "express";

const router = express.Router();

// AI routes placeholder — Gemini removed, awaiting OpenAI integration
router.get("/status", (_req, res) => {
    res.json({
        success: true,
        engine: "disabled",
        message: "AI engine temporarily disabled for migration.",
    });
});

export default router;
