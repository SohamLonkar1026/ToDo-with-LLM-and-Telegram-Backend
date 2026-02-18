# Phase 6 Technical Report: Daily Recurring System

**Date:** February 16, 2026
**Project:** AI-MOM Task Manager
**Phase:** 6 - Daily Recurring System

---

## 1. Executive Summary

Phase 6 introduces a robust **Daily Recurring System** designed to handle repetitive tasks separately from standard one-off tasks. This system operates on a **4 AM "Logical Day" Boundary**, ensuring late-night work counts towards the previous day. Key features include lazy instance generation, strict separation from the main dashboard, and a dedicated UI for daily routines.

## 2. Database Schema Changes (`schema.prisma`)

**New Model**: `RecurringTemplate`
- Defines the blueprint for recurring tasks.
- Supports `DAILY`, `MONTHLY`, `YEARLY` recurrence.

**Modified Model**: `Task`
- Added optional relation `recurringTemplateId` to link instances back to their template.

```prisma
model Task {
  // ... existing fields ...
  recurringTemplateId   String?
  recurringTemplate     RecurringTemplate? @relation(fields: [recurringTemplateId], references: [id])
}

model RecurringTemplate {
  id               String   @id @default(uuid())
  userId           String
  title            String
  estimatedMinutes Int?
  recurrenceType   RecurrenceType
  active           Boolean  @default(true)
  createdAt        DateTime @default(now())

  user             User     @relation(fields: [userId], references: [id])
  tasks            Task[]
}

enum RecurrenceType {
  DAILY
  MONTHLY
  YEARLY
}
```

---

## 3. Backend Implementation

### 3.1 Logical Day & Lazy Generation (`recurring.service.ts`)

**Key Logic**: `getLogicalDayStart()`
Calculates the start of the current "logical day" (4:00 AM). If the current time is before 4 AM, it considers the start to be 4 AM of the previous calendar day.

**Lazy Generation**: `ensureDailyInstances(userId)`
Checks active templates. If an instance for the current logical period (e.g., today starting at 4 AM) does not exist, it creates one.

```typescript
export function getLogicalDayStart(): Date {
    const now = new Date();
    const currentHour = getHours(now);
    let referenceDate = now;
    if (currentHour < 4) {
        referenceDate = subDays(now, 1);
    }
    return setHours(startOfDay(referenceDate), 4);
}

// ... ensureDailyInstances implementation ...
```

### 3.2 Task Filtering (`task.service.ts`)

Modified standard task fetchers to **exclude** recurring instances, ensuring dashboard purity.

```typescript
export async function getTasksByUser(userId: string) {
    return prisma.task.findMany({
        where: { userId, recurringTemplateId: null }, // Filter added
        orderBy: { dueDate: "asc" },
    });
}
```

### 3.3 Routes & Controllers
- **`GET /api/tasks/daily`**: Triggers lazy generation and returns tasks for the current logical day.
- **`POST /api/recurring`**: Creates a new recurring template.

---

## 4. Frontend Implementation

### 4.1 Daily Tasks Page (`DailyTasks.tsx`)
A dedicated view for managing daily routines. It fetches data from the new `/daily` endpoint and displays it using the standard `TaskCard` component. Completed tasks remain visible to show progress.

### 4.2 Navigation (`Sidebar.tsx`)
Added a **"Daily Tasks"** link with the `CalendarClock` icon to the main navigation sidebar.

---

## 5. Verification Results

A verification script (`verify_phase6.ps1`) was executed to confirm:
1.  **Lazy Generation**: A daily instance is automatically created when accessing the daily view.
2.  **Dashboard Isolation**: The recurring instance does **NOT** appear on the main dashboard.
3.  **4 AM Logic**: (Verified manually via system time adjustment) Tasks created before 4 AM are correctly attributed to the previous day's instance list.

---

**End of Report**
