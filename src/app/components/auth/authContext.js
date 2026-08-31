// src/app/components/auth/authContext.js
// Lightweight context so existing components (e.g. the Sidebar) can read the
// signed-in user + open the profile modal without prop-drilling through page.js.
"use client";

import { createContext, useContext } from "react";

export const AuthUserContext = createContext(null);

// Returns { user, setUser, openProfile, logout } when authenticated, else null.
export function useAuthUser() {
  return useContext(AuthUserContext);
}
