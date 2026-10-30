import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const DEMO_USERS = [
  {
    id: 'user_1',
    name: 'Alex Diaz',
    email: 'admin@invoicehub.com',
    role: 'Super Admin',
    avatar: 'AD',
    department: 'Finance & Operations'
  },
  {
    id: 'user_2',
    name: 'Elena Rostova',
    email: 'finance@invoicehub.com',
    role: 'Billing Manager',
    avatar: 'ER',
    department: 'Accounting'
  }
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load persisted user session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('invoicehub_auth_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to parse stored auth user', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    // Simulate API network latency
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Simple authentication check
    // Allow demo credentials or any valid email with a password of length >= 6
    const matchedDemo = DEMO_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (matchedDemo && password === 'admin123') {
      setUser(matchedDemo);
      localStorage.setItem('invoicehub_auth_user', JSON.stringify(matchedDemo));
      setLoading(false);
      return { success: true };
    } else if (password.length >= 6 && email.includes('@')) {
      // Dynamic login support
      const nameFromEmail = email.split('@')[0];
      const dynamicUser = {
        id: `user_${Date.now()}`,
        name: nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1),
        email: email.trim(),
        role: 'Administrator',
        avatar: nameFromEmail.slice(0, 2).toUpperCase(),
        department: 'General Administration'
      };
      setUser(dynamicUser);
      localStorage.setItem('invoicehub_auth_user', JSON.stringify(dynamicUser));
      setLoading(false);
      return { success: true };
    } else {
      setLoading(false);
      return {
        success: false,
        error: 'Invalid email or password. Use admin@invoicehub.com / admin123'
      };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('invoicehub_auth_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        demoUsers: DEMO_USERS
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
