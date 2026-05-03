# Time Handling Audit: Analysis Report

Based on the raw code dump, here is the analysis of the timezone handling across the application stack.

## 1. Data Flow Analysis

### storage (PostgreSQL + Prisma)
- **Type:** `DateTime` (Timestamp with time zone).
- **Behavior:** Prisma automatically normalizes JS `Date` objects to UTC before storing in the database.
- **Verdict:** ✅ Consistent (UTC Source of Truth).

### Input A: Task Creation via Telegram (`telegram.poller.ts` -> `telegramDateParser.ts`)
- **Parsing:** Uses `chrono-node` to extract date/time.
- **Conversion:** Explicitly uses `fromZonedTime(parsedLocal, "Asia/Kolkata")`.
    - Example: "Tomorrow 10am" -> Parsed as "10:00" -> Converted to "04:30 UTC" (assuming +5:30 offset).
- **Result:** Task is stored in DB as UTC (04:30 Z).
- **Verdict:** ✅ Correct (Explicit IST -> UTC conversion).

### Input B: Task Creation via Dashboard (`TaskModal.tsx`)
- **Input:** `<DateTimePicker>` return generic date string (e.g., "2024-02-18T10:00").
- **Conversion:** `new Date(formData.dueDate).toISOString()`.
    - This relies on the **Browser's System Timezone**.
    - If User is in IST: `new Date("...T10:00")` -> "10:00 IST" -> "04:30 UTC".
    - If User is in UTC: `new Date("...T10:00")` -> "10:00 UTC".
- **Result:** Task is stored in DB as UTC.
- **Verdict:** ✅ Correct (Assuming user is in IST).

### Output A: Telegram Reminders (`telegram.service.ts`)
- **Formatting:** `new Date(task.dueDate).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ... })`.
- **Logic:**
    - Takes UTC (04:30 Z).
    - Converts to "Asia/Kolkata" (+5:30).
    - Output: "10:00 AM".
- **Verdict:** ✅ Correct (Explicit UTC -> IST conversion).

### Output B: Dashboard Display (`TaskCard.tsx`)
- **Formatting:** `format(new Date(task.dueDate), 'MMM d, h:mm a')`.
    - `date-fns` `format` uses the **Browser's Local Timezone**.
- **Logic:**
    - Takes UTC (04:30 Z).
    - Converts to Local (Browser).
    - If Browser is IST: Output "10:00 AM".
- **Verdict:** ✅ Correct (Matches User's context).

## 2. Scheduler Logic (`reminder.service.ts`)
- **Comparison:** `if (task.dueDate > currentTime)`.
    - `task.dueDate`: JS Date object (UTC epoch).
    - `currentTime`: `new Date()` (System/Server time, UTC epoch).
- **Logic:**
    - `stageTime` calculation is relative (subtracting MS).
    - All comparisons are done using timestamps (epoch milliseconds), which are timezone-independent.
- **Verdict:** ✅ Correct (Robust, independent of Server timezone setting).

## 3. Potential Mismatch Sources

1.  **Browser Timezone Incorrect:** If the user's computer is NOT set to IST, the Dashboard will create tasks in the wrong UTC offset (e.g., 10am local != 04:30 UTC) AND display them in the wrong local time.
2.  **Server Time Incorrect:** If the server clock (not timezone, but actual time) is drifting, notifications might be delayed/early. (Unlikely on Railway/Vercel).
3.  **Ambiguous Input:** If `TaskModal` sends a string *without* timezone info to `new Date()`, different browsers *might* interpret it differently (though ISO usually defaults to local).

## 4. Conclusion
The codebase enforces a **"UTC in Database, IST/Local in UI"** policy consistently.
-   **Telegram:** Hardcoded to IST (Input & Output).
-   **Dashboard:** Uses Browser Local Time (Input & Output).
-   **Scheduler:** Uses UTC (Absolute Time).

**If a mismatch exists:**
It is most likely due to the **Browser** being in a timezone other than `Asia/Kolkata`.

### Recommendation
If you need strict IST handling regardless of user location:
1.  **Frontend:** Force `date-fns-tz` with `Asia/Kolkata` for display.
2.  **Frontend Input:** Manually attach offset before sending to backend.
However, the current "Local Time" approach is standard best practice for web apps.
