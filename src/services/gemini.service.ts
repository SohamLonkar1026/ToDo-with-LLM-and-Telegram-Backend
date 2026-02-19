import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
});

/**
 * Generates text response from Google Gemini AI
 * @param prompt The user prompt
 * @returns The generated text
 * @throws Error if generation fails
 */
export async function generateGeminiResponse(prompt: string): Promise<string> {
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to generate Gemini response");
    }
}

/**
 * Parses natural language text into a structured task object
 * @param text The user's input text
 * @param referenceDate The current date/time to resolve relative references (e.g. "tomorrow")
 * @returns Parsed task object
 */
export async function parseTaskFromText(text: string, referenceDate: Date = new Date()): Promise<any> {
    try {
        const prompt = `
            You are a smart task parser. Your goal is to extract task details from the user's natural language input.
            
            Current Reference Time (ISO): ${referenceDate.toISOString()}
            User Input: "${text}"

            Rules:
            1. **title**: Extract the core task action. Remove time/date words if they are used for scheduling.
            4. **dueDate**: Calculate the absolute ISO string (UTC) based on the reference time.
               - **IMPORTANT**: Interpret all user times as **Asia/Kolkata (IST)** unless specified otherwise.
               - Convert the resulting time to UTC (ending in Z).
               - If no time is specified, default to 09:00 AM IST of that day.
               - If "tomorrow", add 24 hours to the date part.
               - If "evening", assume 18:00 IST (6 PM).
               - If "morning", assume 09:00 IST (9 AM).
            3. **priority**: Infer from context words like "urgent", "important" -> HIGH. Default to MEDIUM.
            4. **estimatedMinutes**: Infer from words like "quick" (15), "long" (60). Default to 30 if unspecified.
            5. **description**: Any extra details not fitting into title.

            Output strictly valid JSON with no markdown formatting.
            Schema:
            {
                "title": string,
                "dueDate": string (ISO 8601),
                "priority": "LOW" | "MEDIUM" | "HIGH",
                "estimatedMinutes": number,
                "description": string
            }
        `;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const responseText = result.response.text();
        return JSON.parse(responseText);

    } catch (error) {
        console.error("Gemini Task Parse Error:", error);
        throw new Error("Failed to parse task from text");
    }
}
