# Prisma Singleton Implementation Report

## Objective
Resolve the **"prepared statement already exists"** error and prevent database connection exhaustion in serverless/development environments (Railway/Vercel).

## The Problem
In standard Node.js apps, `const prisma = new PrismaClient()` works fine. However, in environments with **hot reloading** (dev) or **cold starts** (serverless), this line runs multiple times, creating multiple isolated instances of the Prisma engine.
- **Result:** Each instance tries to prepare the same SQL statements, causing Postgres to throw the "prepared statement already exists" collision error.

## The Solution: Global Singleton Pattern
We implemented a robust singleton pattern that attaches the Prisma instance to the global node object. This ensures that even if the module is re-imported, the *existing* connection is reused.

### Modified File: `src/utils/prisma.ts`

**Previous Code (Problematic):**
```typescript
const prisma = new PrismaClient({ ... });
export default prisma;
```

**New Code (Singleton):**
```typescript
import { PrismaClient } from '@prisma/client';

// 1. Attach to global scope
const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 2. Reuse existing instance OR create new one
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error'], // Clean logs for production
  });

// 3. Save to global in non-production environments
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
```

## Impact & Verification
- **Connections:** Guarantees exactly **one** active Prisma Client instance per container/process.
- **Error Fix:** Eliminates the prepared statement collision by reusing the engine that owns the statements.
- **Performance:** Reduces overhead by avoiding repeated connection handshakes on hot reloads.
- **Usage:** No changes needed in other files; they still import from `@/utils/prisma` as before.

## Next Steps
- **Monitor:** Check Railway logs after deployment to confirm clean startup without prepared statement errors.
