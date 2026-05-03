# Gemini / LLM Integration — Technical Audit Report

**Date**: 2026-02-19  
**Scope**: All files in `b:\Ai-MOM\backend\src` related to LLM / Gemini integration  
**Method**: File search, code inspection, dependency analysis  

---

## 1️⃣ File Inventory

| File | Path | Purpose | Status |
|---|---|---|---|
| `gemini.service.ts` | `src/services/gemini.service.ts` | Gemini SDK init, `generateGeminiResponse()`, `parseTaskFromText()` | **Used** (by `ai.routes.ts`) |
| `ai.routes.ts` | `src/routes/ai.routes.ts` | HTTP API: `POST /api/ai/test`, `POST /api/ai/parse-task` | **Used** (mounted in `app.ts`) |
| `telegramDateParser.ts` | `src/utils/telegramDateParser.ts` | chrono-node date parsing with IST→UTC conversion | **Orphaned** — was consumed by `telegram.poller.ts` which is now deleted |
| `conversation.service.ts` | `src/services/conversation.service.ts` | DB-backed session management (`ConversationSession` table) | **Orphaned** — was consumed by `telegram.poller.ts` which is now deleted |
| `telegram.controller.ts` | `src/controllers/telegram.controller.ts` | Webhook controller — imports `handleMessage`/`handleCallbackQuery` from deleted `telegram.poller.ts` | **Broken** — import target deleted |
| `telegram.service.ts` | `src/services/telegram.service.ts` | `sendMessage()`, `sendReminderNotification()` | **Used** (by reminder engine) |
| `telegram.navigation.ts` | `src/services/telegram.navigation.ts` | Menu/navigation handlers | **Partially orphaned** — was invoked by `telegram.poller.ts` |
| `telegram.link.service.ts` | `src/services/telegram.link.service.ts` | Telegram account linking | **Partially orphaned** — was invoked by `telegram.poller.ts` |

> [!CAUTION]
> `telegram.poller.ts` was deleted. This file contained `handleMessage` and `handleCallbackQuery` which are imported by `telegram.controller.ts`. **The build is currently broken.** The webhook route will fail at import time.

---

## 2️⃣ Gemini Configuration

```typescript
// gemini.service.ts
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
```

| Property | Value |
|---|---|
| SDK | `@google/generative-ai@^0.24.1` |
| Model | `gemini-1.5-flash` |
| Tool-calling mode | ❌ **Not enabled** |
| Streaming | ❌ **Not enabled** |
| API key loading | `process.env.GEMINI_API_KEY` — throws at module load if missing |
| Middleware | None |
| Response format | JSON mode for `parseTaskFromText` (`responseMimeType: "application/json"`), plain text for `generateGeminiResponse` |
| Singleton | ✅ Single model instance at module scope |

---

## 3️⃣ Tool Definitions

**No tools are defined.** The Gemini SDK supports function calling / tool use, but this project does not use it. 

- No `tools` array passed to `getGenerativeModel()` or `generateContent()`
- No `functionCallingMode` configuration
- No tool schemas of any kind
- No confidence field
- No validation layer

---

## 4️⃣ System Prompt

There is no persistent system prompt. The `parseTaskFromText` function uses an inline prompt per call:

```typescript
const prompt = `
    You are a smart task parser. Your goal is to extract task details 
    from the user's natural language input.
    
    Current Reference Time (ISO): ${referenceDate.toISOString()}
    User Input: "${text}"

    Rules:
    1. title: Extract the core task action.
    4. dueDate: Calculate the absolute ISO string (UTC) based on reference time.
       - IMPORTANT: Interpret all user times as Asia/Kolkata (IST).
       - Convert the resulting time to UTC (ending in Z).
       - If no time specified, default to 09:00 AM IST.
       - If "tomorrow", add 24 hours to date part.
       - If "evening", assume 18:00 IST. If "morning", assume 09:00 IST.
    3. priority: Infer from context. Default MEDIUM.
    4. estimatedMinutes: Infer from context. Default 30.
    5. description: Any extra details.

    Output strictly valid JSON.
    Schema: { title, dueDate, priority, estimatedMinutes, description }
`;
```

### Assessment

| Property | Status |
|---|---|
| Enforces structured output | ✅ Uses `responseMimeType: "application/json"` |
| Defines timezone rules | ✅ IST assumed |
| Defines UTC conversion | ✅ Explicit instruction |
| Handles ambiguity | ❌ No instructions for ambiguous input |
| Confidence field | ❌ Not requested |
| Error handling instructions | ❌ None — if Gemini returns bad JSON, `JSON.parse()` will throw |
| Rule numbering | ⚠️ Misnumbered (1, 4, 3, 4, 5) — cosmetic but sloppy |

---

## 5️⃣ Controller Integration

### Gemini ↔ Telegram Integration

**Does not exist.** There is zero connection between the Telegram webhook and Gemini.

- `telegram.controller.ts` calls `handleMessage` / `handleCallbackQuery` (from deleted `telegram.poller.ts`)
- Neither `handleMessage` nor `handleCallbackQuery` ever called Gemini
- The `/add` command used `chrono-node` (`telegramDateParser.ts`) for date extraction, not Gemini
- Gemini is only accessible via the HTTP API (`POST /api/ai/parse-task`)

### Gemini ↔ HTTP API Integration

```
POST /api/ai/parse-task
  → req.body.text → parseTaskFromText(text, referenceDate)
  → Gemini returns JSON → JSON.parse() → res.json({ task })
```

```
POST /api/ai/test
  → req.body.prompt → generateGeminiResponse(prompt)
  → Gemini returns text → res.json({ response })
```

### Error Handling

- `generateGeminiResponse`: catches error, logs, throws `new Error("Failed to generate Gemini response")`
- `parseTaskFromText`: catches error, logs, throws `new Error("Failed to parse task from text")`
- `ai.routes.ts`: catches thrown errors, returns `500` with generic message
- **No Gemini-specific error handling** (rate limits, token limits, safety blocks not handled)

---

## 6️⃣ Memory Implementation

**Not implemented.** 

- No conversation history is passed to Gemini
- Each call is stateless — single prompt in, single response out
- No `last_referenced_task_id` tracking
- The `ConversationSession` table was used for the rigid `/add` multi-step flow, not for AI memory
- No chat context aggregation

---

## 7️⃣ Time Handling Logic

Two separate time handling paths exist:

### Path A: chrono-node (Telegram `/add` command — now deleted)

```
User text → chrono.parse() → parsedLocal → fromZonedTime(parsedLocal, "Asia/Kolkata") → UTC
```

- Uses `chrono-node@^2.9.0` for NLP date extraction
- Assumes IST ✅
- Converts to UTC before DB save ✅
- Logs parsed vs converted values ✅

### Path B: Gemini (HTTP API `parse-task`)

```
User text → Gemini prompt → Gemini returns ISO string → JSON.parse() → returned to caller
```

- IST assumption written in prompt ✅
- Conversion to UTC is **requested via prompt** but not validated
- No server-side verification that the returned date is actually UTC
- **If Gemini hallucinates a wrong timezone offset, it goes to DB unchecked** ❌

---

## 8️⃣ Execution Flow

### Task Creation (current — via HTTP API only)

```
Frontend → POST /api/ai/parse-task { text } 
  → gemini.service.parseTaskFromText()
  → Gemini returns { title, dueDate, priority, estimatedMinutes, description }
  → Returned to frontend as JSON
  → Frontend calls POST /api/tasks to actually create the task
```

> [!IMPORTANT]
> Gemini does NOT create tasks. It only parses text into structured data. The frontend must make a separate API call to create the task.

### Task Rescheduling

**Not implemented** in any Gemini-connected flow.

### Forwarded Meeting Message Handling

**Not implemented.** No detection or parsing logic for Zoom/Google Meet/Teams messages exists.

---

## 9️⃣ Validation & Safety

| Check | Status |
|---|---|
| JSON schema validation | ❌ None — raw `JSON.parse()` on Gemini output |
| Tool argument validation | ❌ N/A — no tools defined |
| Ambiguity handling | ❌ Not implemented |
| Type checking on parsed fields | ❌ `parseTaskFromText` returns `Promise<any>` |
| Rate limit protection | ❌ No Gemini rate limiting |
| Input sanitization | ❌ User text is injected directly into prompt |
| Token budget tracking | ❌ Not implemented |
| Safety filter handling | ❌ Not implemented — safety blocks will surface as generic errors |

---

## 🔟 Known Issues

### Architectural Weaknesses

1. **Gemini is completely disconnected from Telegram.** The AI engine only exists as an HTTP API — users cannot interact with it via the bot.
2. **`telegram.poller.ts` was deleted** which breaks the webhook controller import. The Telegram bot is non-functional.
3. **Two-call task creation** — Gemini parses, frontend creates. No atomic operation.
4. **No system prompt architecture** — inline prompt mixed with data makes iteration difficult.

### Potential Bugs

1. **Unvalidated Gemini JSON output** — `JSON.parse()` will throw if Gemini returns non-JSON despite `responseMimeType`
2. **`parseTaskFromText` returns `any`** — no TypeScript safety on the parsed result
3. **Prompt rule numbering** is wrong (1, 4, 3, 4, 5) — may confuse the model

### Missing Validations

1. No validation that `dueDate` from Gemini is actually in the future
2. No validation that `priority` is one of `LOW | MEDIUM | HIGH`
3. No validation that `estimatedMinutes` is a positive integer
4. No fallback if Gemini returns `null` or empty fields

### Token Inefficiencies

1. Full prompt is sent on every call (no caching, no system instruction reuse)
2. No `systemInstruction` parameter used (supported by SDK) — would save tokens on repeated calls
3. Model `gemini-1.5-flash` is appropriate for cost, but could use `cachedContent` for the system prompt

### Design Inconsistencies

1. `telegramDateParser.ts` uses chrono-node for date parsing, while `gemini.service.ts` asks Gemini to parse dates — two competing date resolution strategies
2. `generateGeminiResponse` (generic text) and `parseTaskFromText` (JSON mode) are in the same service but serve completely different purposes
3. No separation between AI configuration and AI execution logic

---

## 📌 Overall Maturity Assessment

### Score: 2 / 10

### Justification

| Dimension | Rating | Notes |
|---|---|---|
| Functionality | 1/10 | Gemini is only accessible via a test HTTP endpoint. Zero integration with Telegram bot. |
| Tool-calling | 0/10 | Not implemented despite SDK support |
| Memory | 0/10 | Completely stateless |
| Validation | 1/10 | Only `responseMimeType: "application/json"` — no post-parse validation |
| Error handling | 2/10 | Basic try/catch exists but no Gemini-specific handling |
| Architecture | 2/10 | Inline prompts, `any` types, no separation of concerns |
| Production readiness | 1/10 | Broken imports, orphaned files, no rate limiting |
| Time handling | 4/10 | IST→UTC logic exists in two places but Gemini path is unverified |

The current Gemini integration is a **proof-of-concept stub**. It demonstrates that Gemini can parse task text into JSON, but it is not connected to the Telegram bot, has no tool-calling, no memory, no validation, and is currently broken due to the deletion of `telegram.poller.ts`. A complete rebuild of the AI layer is required for Phase 1 of the conversational engine.
