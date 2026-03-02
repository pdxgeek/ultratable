import { createAuthClient } from "better-auth/react";

// Use native Better Auth client to automatically handle CSRF, Cookies, and Origins correctly!
// We use window.location.origin to ensure it constructs a valid `new URL()` internally
// while still letting Vite proxy the /api/auth traffic transparently!
export const authClient = createAuthClient({
    baseURL: window.location.origin + "/api/auth"
});
