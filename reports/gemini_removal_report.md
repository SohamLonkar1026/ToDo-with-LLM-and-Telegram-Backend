# Gemini / LLM Removal Report — Structured Analysis

**Date**: 2026-02-20  
**Scope**: All files in `b:\Ai-MOM\backend`  
**Method**: Full text search (gemini, @google, generative, GEMINI_API_KEY)  
**Action**: Analysis only — NO files modified

---

## Dependencies

| Package | Version | File |
|---|---|---|
| `@google/generative-ai` | `^0.24.1` | `package.json` (line 15) |

---

## Service Files

| File | Full Path | Purpose | Used By |
|---|---|---|---|
| `gemini.service.ts` | `src/services/gemini.service.ts` | Legacy — `generateGeminiResponse()` + `parseTaskFromText()`. JSON response mode, no tool-calling | `ai.routes.ts` only |
| `ai-engine.service.ts` | `src/services/ai-engine.service.ts` | **Primary** — Gemini function-calling engine. Tool definitions, system prompt, confidence gating, rate limiting | `telegram.handler.ts` |

---

## Controllers / Routes Using Gemini

| File | Full Path | How It Uses Gemini |
|---|---|---|
| `ai.routes.ts` | `src/routes/ai.routes.ts` | Imports `GoogleGenerativeAI` directly (direct test endpoint), imports `generateGeminiResponse` + `parseTaskFromText` from `gemini.service.ts` |
| `telegram.handler.ts` | `src/services/telegram.handler.ts` | Imports `processMessage` from `ai-engine.service.ts` (line 5). Calls it for all natural language messages (line 60) |
| `telegram.controller.ts` | `src/controllers/telegram.controller.ts` | Imports `handleMessage` from `telegram.handler.ts` — **indirect** dependency on Gemini |

---

## Environment Variables

| Variable | Used In | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `gemini.service.ts` (line 3, 7), `ai-engine.service.ts` (line 9, 13), `ai.routes.ts` (line 10), `.env` (line 8) | Authenticates with Google Generative AI API |

---

## Other References

| Category | Details |
|---|---|
| Middleware | None directly depends on Gemini |
| Prisma schema | No Gemini references |
| Reminder cron | No Gemini references |
| Snooze/navigation services | No Gemini references |
| Frontend | No Gemini references |

---

## Call Chain (Telegram → Gemini)

```
Telegram Webhook
  → telegram.controller.ts (telegramWebhook)
    → telegram.handler.ts (handleMessage)
      → ai-engine.service.ts (processMessage)  ← GEMINI BOUNDARY
        → GoogleGenerativeAI SDK
        → tool-executor.service.ts (no Gemini)
```

---

## Safe To Remove?

**Partial removal: YES. Full removal: CONDITIONAL.**

### Can Safely Remove (no breakage)

| File | Reason |
|---|---|
| `gemini.service.ts` | Only used by `ai.routes.ts`. Legacy endpoints `/api/ai/test` and `/api/ai/parse-task`. Not used by Telegram flow |
| Direct test endpoint in `ai.routes.ts` | Temporary diagnostic — can be removed |

### Cannot Remove Without Replacement

| File | Reason |
|---|---|
| `ai-engine.service.ts` | Core of Telegram AI flow. Removing it breaks `telegram.handler.ts` → webhook stops processing natural language |
| `@google/generative-ai` dependency | Used by `ai-engine.service.ts`. Removing it breaks the build |
| `GEMINI_API_KEY` env var | Required at boot — `ai-engine.service.ts` throws if missing |

### Impact on Webhook

- **Slash commands** (`/start`, `/menu`, `/link`): ✅ No Gemini dependency — will still work
- **Callbacks** (snooze, done, nav): ✅ No Gemini dependency — will still work
- **Natural language messages**: ❌ Breaks completely — routed to `processMessage()` which requires Gemini
- **Reminder cron**: ✅ No Gemini dependency — will still work

### Summary

```
Removing Gemini entirely = natural language task creation/rescheduling/listing stops working.
Slash commands, callbacks, reminders, and snooze all remain functional.
If replacing Gemini with another LLM, the swap point is ai-engine.service.ts (single file).
```
