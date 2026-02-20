# OpenAI Function Calling — Activation Report

**Date**: 2026-02-20  
**Commit**: `eab2e9f`  
**Build**: ✅ Zero TypeScript errors  

---

## What Was Implemented

### System Prompt
- IST timezone rules + current time injection
- Confidence definitions (high/medium/low)
- Telegram HTML formatting instructions
- Clarification behavior for ambiguous requests

### Tool Schema Normalization
- `lowercaseTypes()` recursively converts `"OBJECT"` → `"object"`, `"STRING"` → `"string"`, `"NUMBER"` → `"number"`
- `openAITools` computed once at module load

### processMessage() Flow

| Step | Action |
|---|---|
| 0 | Rate limit check (2s per chat) |
| 1 | User lookup by `chatId` |
| 2 | Build context (system prompt + pending tasks) |
| 3 | `openai.chat.completions.create()` — `gpt-4o`, `tool_choice: "auto"`, `temp: 0.2` |
| 4 | No tool call → send conversational response |
| 5 | Extract tool call (type guard for `"function"`) |
| 6 | Parse args, validate with `validateToolCall()` |
| 7 | Confidence gating: low→clarify, medium/high→execute |
| 8 | `executeTool(toolName, userId, args)` |
| 9 | Follow-up OpenAI call to generate NL confirmation |

### Safety Measures Preserved
- Rate limiter with stale entry cleanup
- `validateToolCall()` — tool name, required fields, allowed fields, confidence enum
- Low confidence → OpenAI generates clarification question instead of executing
- Medium confidence → OpenAI prepends assumption transparency in response
- Try/catch around every OpenAI call with fallback messages

---

## What Changed vs. Previous Gemini Engine

| Aspect | Gemini | OpenAI |
|---|---|---|
| SDK | `@google/generative-ai` | `openai` |
| Model | `gemini-2.0-flash` | `gpt-4o` |
| Tool calling | `FunctionCallingMode.AUTO` | `tool_choice: "auto"` |
| Schema types | `SchemaType.OBJECT` | `"object"` (lowercase) |
| Response format | `functionCall` part | `tool_calls[0].function` |
| Follow-up | `generateContent()` with function response | `chat.completions.create()` with tool role |

---

## ⚠️ Railway Requirements

1. Add `OPENAI_API_KEY` in Railway dashboard
2. Remove old `GEMINI_API_KEY` if still present

## Test After Deploy

Send to Telegram: `"add task buy groceries tomorrow at 5pm"`

Expected: Task created + confirmation message from GPT-4o.
