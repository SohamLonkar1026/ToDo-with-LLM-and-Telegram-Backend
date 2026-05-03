# Report: Add Health Endpoint for Render Keep-Alive

## Changes Made
- **`backend/src/app.ts`**: Added a new GET endpoint at `/health` that simply responds with `OK`.

## Why These Changes Were Made
Render's free tier automatically spins down web services after 15 minutes of inactivity. This `/health` endpoint was added specifically to be used with an external cron service (like cron-job.org) to ping the server every 5 minutes. This ensures the backend remains active and responsive at all times, preventing cold starts and ensuring scheduled jobs (like notifications) run reliably.
