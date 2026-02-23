# Gemini SDK Integration Plan

## Goal
Integrate Google Gemini SDK into the Node.js/Express backend to enable AI-powered features.

## User Review Required
> [!IMPORTANT]
> **API Key:** You must provide a valid `GEMINI_API_KEY` in the `backend/.env` file. Do not commit this file.

## Proposed Changes

### Backend Dependencies
- **Install:** `@google/generative-ai`
- **Verify:** `dotenv` (Confirmed in `src/config/env.ts`)

### Configuration
#### [MODIFY] [backend/.env](file:///b:/Ai-MOM/backend/.env)
- Add `GEMINI_API_KEY=...` (No quotes, no trailing spaces)

### Service Layer
#### [NEW] [backend/src/services/gemini.service.ts](file:///b:/Ai-MOM/backend/src/services/gemini.service.ts)
- Initialize `GoogleGenerativeAI` client.
- **Validation:** strict check for `process.env.GEMINI_API_KEY`. Throw error if missing.
- **Model:** Use `gemini-1.5-flash`.
- Export `generateGeminiResponse(prompt: string)` function.
- Implement robust error handling (log error, throw generic message to caller).

### API Layer
#### [NEW] [backend/src/routes/ai.routes.ts](file:///b:/Ai-MOM/backend/src/routes/ai.routes.ts)
- Create `POST /test` endpoint.
- **Validation:** Check if `req.body.prompt` exists. Return 400 if missing.
- Returns `{ success: true, response: string }`.

## Timezone Standardization (Asia/Kolkata)

### Goal
Enforce mutually consistent timezone handling.
- **Storage/Logic:** UTC (Strict)
- **Display:** Asia/Kolkata (Strict, via `date-fns-tz`)

### Changes

#### [MODIFY] [TaskCard.tsx](file:///b:/Ai-MOM/frontend/src/components/tasks/TaskCard.tsx)
- Replace `format` (local) with `formatInTimeZone` (Asia/Kolkata).

#### [MODIFY] [telegram.service.ts](file:///b:/Ai-MOM/backend/src/services/telegram.service.ts)
- Replace `toLocaleString` with `formatInTimeZone` (Asia/Kolkata).

#### [MODIFY] [reminder.service.ts](file:///b:/Ai-MOM/backend/src/services/reminder.service.ts)
- Verify `Date.now()` vs `dueDate.getTime()` (UTC) logic.

#### [MODIFY] [TaskModal.tsx](file:///b:/Ai-MOM/frontend/src/components/tasks/TaskModal.tsx)
- Ensure generic inputs are converted to ISO properly.

---

#### [MODIFY] [backend/src/app.ts](file:///b:/Ai-MOM/backend/src/app.ts)
- Import `aiRoutes`.
- Register `app.use("/api/ai", aiRoutes)`. (Consistent with existing `/api/...` routes)

## Verification Plan

### Automated Tests
- Run `npm run dev` to ensure no TypeScript errors.

## Smart Task Parsing Implementation Plan

### Goal
Implement an AI-powered endpoint that converts natural language input (e.g., "Remind me to call John tomorrow at 5pm") into a structured JSON task object.

### Proposed Changes

#### Service Layer
#### [MODIFY] [backend/src/services/gemini.service.ts](file:///b:/Ai-MOM/backend/src/services/gemini.service.ts)
- Add `parseTaskFromText(text: string, referenceDate: Date)` function.
- **Prompt Engineering:**
    - Use a system instruction to force JSON output.
    - Fields: `title`, `description` (optional), `dueDate` (ISO string), `priority` (low, medium, high), `estimatedMinutes` (number).
    - Handle relative dates ("tomorrow", "next Monday") using `referenceDate`.
- **Validation:** Attempt to parse JSON response. Throw error if invalid.

#### API Layer
#### [NEW] [backend/src/routes/ai.routes.ts](file:///b:/Ai-MOM/backend/src/routes/ai.routes.ts)
- Add `POST /parse-task` endpoint.
- Context:
    - Accepts `{ text: string, currentTime?: string }`.
    - If `currentTime` is missing, default to server time (UTC).
    - Calls service.
    - Returns `{ success: true, task: ParsedTask }`.

## Verification Plan

### Manual Verification
- **Test Command:**
    ```bash
    Invoke-RestMethod -Uri "http://localhost:4001/api/ai/parse-task" -Method Post -ContentType "application/json" -Body '{"text": "Buy milk tomorrow 5pm priority high"}'
    ```
- **Expected Output:**
    ```json
    {
      "success": true,
      "task": {
        "title": "Buy milk",
        "dueDate": "2026-02-19T11:30:00.000Z", // Assuming input was IST 5pm
        "priority": "HIGH",
        "estimatedMinutes": 30
      }
    }
    ```
