import express from "express";
import { generateGeminiResponse, parseTaskFromText } from "../services/gemini.service";

const router = express.Router();

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
