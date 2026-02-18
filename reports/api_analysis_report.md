# API & Configuration Analysis Report

## 1. Frontend Analysis (Project: `frontend`)

### API Base URL Definition
- **File:** `src/services/api.ts`
- **Logic:** Uses `import.meta.env.VITE_API_URL` with a fallback to localhost.
```typescript
// src/services/api.ts
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});
```

### Environment Variables
- **File:** `.env`
- **Current Value:**
```properties
VITE_API_URL=http://localhost:4001/api
```
*(Note: In production (Vercel), this variable must be set in the Vercel project settings to your Railway URL).*

### API Usage Pattern
The frontend typically makes requests using relative paths appended to the base URL.
- **Login Request** (`src/pages/Login.tsx`):
  ```typescript
  const response = await api.post('/auth/login', { email, password });
  ```
- **Register Request** (`src/pages/Register.tsx`):
  ```typescript
  const response = await api.post('/auth/register', { email, password });
  ```

### Missing Endpoint
The user query mentioned `/backend-api/conversation/init`.
- **Finding:** No reference to `conversation/init` was found in the frontend source code.
- **Closest Match:** `/api/telegram/link/generate` (found in `TelegramLinkModal.tsx`).

---

## 2. Backend Analysis (Project: `backend`)

### Route Structure
All routes are prefixed with `/api` in `src/app.ts`.

- **Auth Routes** (`/api/auth`):
  - `POST /register` -> `authController.register`
  - `POST /login` -> `authController.login`

- **Telegram Routes** (`/api/telegram`):
  - `POST /link/generate` -> `telegramController.generateLink`

### Missing Endpoint Confirmation
- **Finding:** There is **no route** defined for `conversation/init` in the backend codebase.
- **Hypothesis:** This endpoint might be intended for the Telegram bot webhook or polling logic (handled in `services/telegram.poller.ts`), but it is not exposed as a public HTTP API endpoint.

### CORS Configuration
- **File:** `src/app.ts`
- **Logic:** Dynamically allows origins based on `NODE_ENV`.
```typescript
// src/app.ts
const allowedOrigins = env.NODE_ENV === 'production'
    ? [env.FRONTEND_URL]
    : ['http://localhost:5173'];

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);
```

### Critical Configuration Keys
- **PORT:** Defaults to `4000` (overridden by `PORT` env var).
- **FRONTEND_URL:** Must be set in Railway to your Vercel URL (e.g., `https://your-app.vercel.app`) to allow CORS in production.
