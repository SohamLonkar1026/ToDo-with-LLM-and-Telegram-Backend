# Taskora CORS Error Fix

## Files Changed
- `backend/src/app.ts`
- `src/app.ts`

## What was changed
Added the origin `https://taskora.sohamlonkar.com` to the list of allowed CORS origins in the Express application configuration.

## Why
The frontend at `https://taskora.sohamlonkar.com` was experiencing Cross-Origin Resource Sharing (CORS) errors (specifically `No 'Access-Control-Allow-Origin' header is present on the requested resource`) when trying to make XMLHttpRequests to the backend authentication endpoints (`/api/auth/login` and `/api/auth/register`) hosted on Render (`https://taskora-bgsr.onrender.com`). Adding the frontend domain to the CORS whitelist resolves these preflight failures.
