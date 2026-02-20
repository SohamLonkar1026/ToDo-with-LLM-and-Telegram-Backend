# AI Task Engine — Phase 1 Hardening Report

**Date**: 2026-02-20  
**Build Status**: ✅ Zero TypeScript errors  
**Scope**: Stability & correctness hardening only — no feature expansion  

---

## Files Modified

| File | Changes Applied |
|---|---|
| `tool-executor.service.ts` | Strict timezone enforcement, UTC normalization, UTC storage logging |
| `ai-engine.service.ts` | Rate limiting, defensive Gemini output validation, medium confidence transparency |

## Files NOT Modified (Confirmed)

- `task.service.ts` ✅
- `reminder.service.ts` / `reminder.job.ts` ✅
- `telegram.handler.ts` ✅
- `telegram.service.ts` ✅
- `schema.prisma` ✅

---

## 1️⃣ Strict Timezone Enforcement — VERIFIED

### What Changed
Replaced `validateISODate()` with `validateAndNormalizeDate()` in `tool-executor.service.ts`.

### Verification

**ISO without offset is rejected:**
```typescript
// OFFSET_REGEX = /([+-]\d{2}:\d{2}|Z)$/
if (!OFFSET_REGEX.test(trimmed)) {
    return {
        valid: false,
        error: `${fieldName} "${trimmed}" does not include a timezone offset.`,
    };
}
```

**Non-IST offset is parsed as-is (not rewritten):**
```typescript
const utcDate: Date = parsed; // new Date() handles any valid offset correctly
const offsetMatch = trimmed.match(OFFSET_REGEX);
const providedOffset = offsetMatch ? offsetMatch[0] : null;

if (providedOffset !== "Z" && providedOffset !== IST_OFFSET) {
    console.warn(`[TOOL_EXECUTOR] Non-IST offset detected: "${providedOffset}". Parsing as-is, not reinterpreting.`);
}
// No offset rewriting — respects the actual timezone the user/Gemini specified
```

**UTC conversion before DB save:**
```typescript
const utcISO = dateCheck.utcDate!.toISOString();
console.log(`[TOOL_EXECUTOR_DB] create_task — saving UTC: ${utcISO}`);
const task = await taskService.createTask(userId, { dueDate: utcISO, ... });
```

**Future-date validation AFTER UTC conversion:**
```typescript
if (utcDate.getTime() < Date.now()) {
    return { valid: false, error: `... resolves to a time in the past.` };
}
```

---

## 2️⃣ Medium Confidence Transparency — VERIFIED

```typescript
const isMedium = confidenceCheck.confidence === "medium";
const mediumPrefix = isMedium
    ? `The tool was executed with MEDIUM confidence. In your response, 
       briefly mention what assumption you made.`
    : "";

// Injected into follow-up Gemini call
if (isMedium) {
    followUpContents.push({
        role: "user",
        parts: [{ text: mediumPrefix }],
    });
}
```

**Behavior:**
- `high` → execute, normal response
- `medium` → execute, Gemini prepends assumption ("Assuming you meant tomorrow at 5pm...")
- `low` → blocked, clarification asked

---

## 3️⃣ Rate Limiting — VERIFIED

```typescript
const RATE_LIMIT_MS = 2000;
const lastRequestMap = new Map<string, number>();

function isRateLimited(chatId: string): boolean {
    const now = Date.now();
    const lastRequest = lastRequestMap.get(chatId);
    if (lastRequest && (now - lastRequest) < RATE_LIMIT_MS) {
        return true;
    }
    lastRequestMap.set(chatId, now);

    // Cleanup stale entries to prevent memory leak
    if (lastRequestMap.size > 1000) {
        for (const [key, value] of lastRequestMap) {
            if (now - value > 60000) lastRequestMap.delete(key);
        }
    }
    return false;
}
```

**In processMessage (first check):**
```typescript
if (isRateLimited(chatId)) {
    await sendMessage(chatId, "⏳ Please wait a moment before sending another request.");
    return;
}
```

---

## 4️⃣ Defensive Gemini Output Validation — VERIFIED

```typescript
const ALLOWED_TOOLS = new Set(["create_task", "reschedule_task", "get_tasks"]);

const REQUIRED_FIELDS: Record<string, string[]> = {
    create_task: ["title", "due_date", "confidence"],
    reschedule_task: ["task_id", "new_due_date", "confidence"],
    get_tasks: ["confidence"],
};

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

function validateToolCall(toolName, args) {
    if (!ALLOWED_TOOLS.has(toolName))        → reject
    if (!args || typeof args !== "object")   → reject
    for (field of REQUIRED_FIELDS[toolName]) → reject if missing
    if (!VALID_CONFIDENCE.has(args.confidence)) → reject
}
```

**Enforced before any execution:**
```typescript
const validation = validateToolCall(toolName, toolArgs);
if (!validation.valid) {
    await sendMessage(chatId, "I couldn't safely process that request. Please try again.");
    return;
}
```

---

## 5️⃣ UTC Storage Logging — VERIFIED

```typescript
// create_task
console.log(`[TOOL_EXECUTOR_TZ] Original: "${trimmed}" | Offset: ${providedOffset} | UTC: ${utcDate.toISOString()}`);
console.log(`[TOOL_EXECUTOR_DB] create_task — saving UTC: ${utcISO}`);

// reschedule_task
console.log(`[TOOL_EXECUTOR_DB] reschedule_task — old UTC: ${task.dueDate.toISOString()} → new UTC: ${utcISO}`);
```

---

## 6️⃣ Phase Scope — CONFIRMED NOT EXPANDED

- ❌ No memory added
- ❌ No "that"/"it" resolution added
- ❌ No recurring logic added
- ❌ No `task.service.ts` modification
- ❌ No Prisma schema modification

---

## 7️⃣ Build & Functionality — VERIFIED

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Zero errors |
| Slash commands (/start, /menu, /link) | ✅ Routed in telegram.handler.ts |
| Natural language | ✅ Routed to ai-engine.service.ts |
| Snooze/Done/Nav callbacks | ✅ Preserved in telegram.handler.ts |
| Reminder cron | ✅ Untouched |
