import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateGeminiResponse, parseTaskFromText } from "../services/gemini.service";

const router = express.Router();

// GET /api/ai/ai-direct-test — TEMPORARY: Isolate model behavior
router.get("/ai-direct-test", async (req, res) => {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash"
        });

        const result = await model.generateContent("Say hello.");
        const text = result.response.text();

        res.json({ success: true, text });
    } catch (err: any) {
        console.error("DIRECT AI ERROR:", err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// POST /api/ai/test
router.post("/test", async (req, res) => {
    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                message: "Prompt is required",
            });
        }

        const aiResponse = await generateGeminiResponse(prompt);

        res.json({
            success: true,
            response: aiResponse,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Gemini request failed",
        });
    }
});


// POST /api/ai/parse-task

router.post("/parse-task", async (req, res) => {
    try {
        const { text, currentTime } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                message: "Text is required",
            });
        }

        const referenceDate = currentTime ? new Date(currentTime) : new Date();
        const task = await parseTaskFromText(text, referenceDate);

        res.json({
            success: true,
            task: task,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to parse task",
        });
    }
});

export default router;
