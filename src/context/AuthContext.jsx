import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiLogin, apiLogout, apiCheckSession, getCsrfToken } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` is ONLY for the initial session check on page load.
  const [loading, setLoading] = useState(true);

  // On mount: the Django backend (/api/me) is the single source of truth.
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      // Remove any leftover fake/demo session from older builds
      localStorage.removeItem('invoicehub_auth_user');

      getCsrfToken().catch(() => {});

      try {
        const liveUser = await apiCheckSession();
        if (isMounted) setUser(liveUser || null);
      } catch (err) {
        console.warn('Session verification failed:', err);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (username, password) => {
    // Do NOT toggle global `loading` here — App.jsx would unmount LoginPage
    // and the error message would be lost. LoginPage shows its own spinner.
    const result = await apiLogin(username, password);

    if (result.success) {
      setUser(result.user);
      return { success: true, user: result.user };
    }

    setUser(null);
    return {
      success: false,
      error: result.error || 'Authentication failed. Please check credentials.'
    };
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
