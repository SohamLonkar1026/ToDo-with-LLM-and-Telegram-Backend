# Auth Interceptor Modification Report

## Problem
The application was configured to automatically delete the authentication token from `localStorage` whenever any API request returned a `401 Unauthorized` status.
- **Issue:** Temporary network glitches, server cold starts, or specific endpoint failures could cause the user to be logged out unexpectedly.
- **Impact:** Poor user experience during transient errors.

## Solution
Modified the axios response interceptor in `src/services/api.ts` to log a warning instead of deleting the token.

### Changes Implemented
- **File:** `src/services/api.ts`
- **Action:** Commented out `localStorage.removeItem('token')` inside the 401 error handler.
- **New Behavior:** 
  - On 401: A warning is logged to the console (`Unauthorized request - 401`).
  - The error is rejected and passed back to the calling component.
  - The session remains active unless the user explicitly logs out or the login endpoint itself fails.

### Code Diff
```typescript
// src/services/api.ts

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // OLD BEHAVIOR:
            // localStorage.removeItem('token');
            // window.location.href = '/login';

            // NEW BEHAVIOR:
            console.warn("Unauthorized request - 401");
            // Do NOT automatically remove token. Let the UI handle it or user explicitly logout.
        }
        return Promise.reject(error);
    }
);
```

## Verification
- **Scenario:** An API call returns 401.
- **Result:** 
  - Token remains in `localStorage`.
  - User stays on the current page (unless the page logic specifically redirects on error).
  - User can retry the action without re-logging in.

## Recommended Future Improvement
Currently, the app relies on client-side token existence (`isAuthenticated: !!token`).
For better security and reliability, consider implementing server-side token validation on app load:
1.  **Frontend**: Call `/api/auth/me` on startup if a token exists.
2.  **Backend**: Validate the token and return user details.
3.  **Logic**: If validation fails, clear the token and redirect to login; otherwise, hydrate user state.

This ensures that expired or revoked tokens are detected early.
