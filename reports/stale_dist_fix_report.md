# Stale Dist Build Fix Report
**Date:** 2026-02-22
**Scope:** Remove stale debug scripts referencing `reminderOffsetMinutes` to fix Railway production crash (P2022)

---

## Summary of Changes

Production Railway deployment was crashing with `P2022: The column Task.reminderOffsetMinutes does not exist` because stale debug/test scripts at the repo root were being compiled by `tsc` into `dist/`. Even though `prisma/schema.prisma` and all core source files were correct, these debug scripts contained hardcoded references to the old `reminderOffsetMinutes` column.

**Root cause:** 3 debug scripts (`reproduce_task_failure.js`, `verify_prod.js`, `verify_reminder_stages.ts`) referenced `reminderOffsetMinutes`. When `tsc` compiled the project, these ended up in `dist/`, and the reminder cron job picked up the stale compiled code.

**Fix:** Deleted all 20 debug/test scripts and log files from the repo, confirmed zero `reminderOffsetMinutes` references remain, and pushed a clean commit to trigger a fresh Railway build.

---

## Investigation Results

| Check | Result |
|---|---|
| `dist/` tracked in Git? | ❌ Not tracked (`.gitignore` has `dist`) |
| `.gitignore` correct? | ✅ Contains `node_modules`, `.env`, `dist`, `build` |
| `package.json` scripts correct? | ✅ `build: tsc`, `start: node dist/server.js` |
| `reminderOffsetMinutes` in schema? | ❌ Not present |
| `reminderOffsetMinutes` in source `src/`? | ❌ Not present |
| `reminderOffsetMinutes` in root scripts? | ⚠️ **Found in 3 files** |

### Files containing `reminderOffsetMinutes`

```
reproduce_task_failure.js:52:   reminderOffsetMinutes: 15
verify_prod.js:10:              console.log('Has reminderOffsetMinutes:', ...)
verify_reminder_stages.ts:43:   reminderOffsetMinutes: 0
```

---

## Per-File Breakdown

### Files Deleted (20 total)

#### Debug/Test Scripts (12 files)

| # | File | Why deleted |
|---|---|---|
| 1 | `reproduce_task_failure.js` | ⚠️ Contains `reminderOffsetMinutes` reference |
| 2 | `verify_prod.js` | ⚠️ Contains `reminderOffsetMinutes` reference |
| 3 | `verify_reminder_stages.ts` | ⚠️ Contains `reminderOffsetMinutes` reference |
| 4 | `reproduce_telegram_auth.js` | Debug script, not production code |
| 5 | `verify_db_constraints.js` | Debug script, not production code |
| 6 | `verify_db_constraints.ts` | Debug script, not production code |
| 7 | `verify_user_columns.js` | Debug script, not production code |
| 8 | `verify_telegram_e2e.ts` | Debug script, not production code |
| 9 | `test-db.ts` | Debug script, not production code |
| 10 | `hard_reset_schema.ts` | Debug script, not production code |
| 11 | `reset_db.ts` | Debug script, not production code |
| 12 | `cleanup_telegram_duplicates.ts` | Debug script, not production code |

#### Log/Output Files (8 files)

| # | File | Why deleted |
|---|---|---|
| 13 | `audit_results.json` | Debug output |
| 14 | `build_error.log` | Build log artifact |
| 15 | `build_log.txt` | Build log artifact |
| 16 | `check_build.bat` | Debug batch file |
| 17 | `e2e_output.txt` | Test output |
| 18 | `mig_log.txt` | Migration log artifact |
| 19 | `test_output.txt` | Test output |
| 20 | `tsc_error.log` | Build log artifact |

---

## Clean Repo Structure After Fix

```
./
├── prisma/
│   ├── migrations/
│   │   ├── 0001_baseline/
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   └── schema.prisma
├── scripts/
│   ├── test_reminders.ts
│   └── test_reminders_simple.ts
├── src/
│   ├── config/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── notification.controller.ts
│   │   ├── recurring.controller.ts
│   │   ├── settings.controller.ts
│   │   ├── task.controller.ts
│   │   └── telegram.controller.ts
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── utils/
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
```

---

## Git Commit

```
Commit:  092b4ea
Branch:  master
Message: fix: remove stale debug scripts referencing reminderOffsetMinutes - force fresh tsc build
Repo:    ToDo-with-LLM-and-Telegram-Backend
```

---

## Verification

| Check | Result |
|---|---|
| `git grep reminderOffsetMinutes -- "*.ts" "*.js"` | ✅ Zero matches |
| `dist/` in `.gitignore` | ✅ Present |
| `dist/` tracked in Git | ❌ Not tracked |
| `package.json` build script | ✅ `tsc` |
| `package.json` start script | ✅ `node dist/server.js` |
| Push to `master` | ✅ `092b4ea` |

### Expected Railway Behavior After This Push

1. Railway detects push to `master`
2. Nixpacks auto-detects Node.js
3. Runs `npm install`
4. Runs `npm run build` → `tsc` compiles only clean source files
5. Fresh `dist/` contains zero `reminderOffsetMinutes` references
6. `npm start` → `node dist/server.js` → clean boot
7. Reminder cron no longer throws P2022
8. Telegram link works, tasks load, container stops restarting

### Previous Verification (from `prisma db push`)

```
Production DB Task columns:
  'id', 'title', 'description', 'dueDate',
  'estimatedMinutes', 'priority', 'status',
  'notifyBeforeHours', 'notifyPercentage', 'minGapMinutes',
  'userId', 'createdAt', 'updatedAt',
  'lastReminderSentAt', 'reminderStagesSent',
  'snoozedUntil', 'recurringTemplateId'

Has reminderOffsetMinutes: false ✅
Has notifyBeforeHours:     true  ✅
Has notifyPercentage:      true  ✅
Has minGapMinutes:         true  ✅
```
