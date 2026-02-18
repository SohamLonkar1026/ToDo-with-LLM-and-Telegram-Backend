# Phase 4A – Task Sorting Audit

## 1. Where are tasks fetched?

Tasks are fetched via the `GET /api/tasks` route.

- **Route File**: [`backend/src/routes/task.routes.ts`](file:///b:/Ai-MOM/backend/src/routes/task.routes.ts)
- **Controller**: `getTasks` in [`backend/src/controllers/task.controller.ts`](file:///b:/Ai-MOM/backend/src/controllers/task.controller.ts)
- **Service Function**: `getTasksByUser` in [`backend/src/services/task.service.ts`](file:///b:/Ai-MOM/backend/src/services/task.service.ts)

## 2. How are tasks currently sorted?

Sorting is performed **exclusively in the backend** using Prisma's `orderBy` clause. There is no client-side sorting logic in the dashboard.

## 3. Backend Sorting Logic

The sorting happens in the `getTasksByUser` function within `backend/src/services/task.service.ts`.

**Code Snippet:**
```typescript
export async function getTasksByUser(userId: string) {
    return prisma.task.findMany({
        where: { userId },
        orderBy: { dueDate: "asc" }, // <--- Sorting Logic
    });
}
```

## 4. Frontend Logic

The frontend simply renders the tasks in the order received from the API.

**File**: [`frontend/src/pages/Dashboard.tsx`](file:///b:/Ai-MOM/frontend/src/pages/Dashboard.tsx)

**Code Snippet:**
```typescript
    const fetchTasks = async () => {
        try {
            const response = await api.get('/tasks');
            setTasks(response.data.data); // <--- Sets state directly, preserving API order
        } catch (error) {
            console.error('Failed to fetch tasks', error);
        } finally {
            setLoading(false);
        }
    };
```

## 5. Confirmation of Fields

- **estimatedMinutes**:
    - **Database**: Confirmed as `Int` in [`backend/prisma/schema.prisma`](file:///b:/Ai-MOM/backend/prisma/schema.prisma).
    - **API Response**: Since `findMany` selects all fields by default, `estimatedMinutes` is included in the response.

## Conclusion

The current system sorts tasks strictly by **Due Date (Ascending)**. To implement intelligent prioritization, we will need to modify the `orderBy` logic in `backend/src/services/task.service.ts` or implement a more complex sorting algorithm (possibly in memory if it requires weighted scoring) before returning the results.
