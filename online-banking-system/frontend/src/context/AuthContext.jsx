import { createContext, useContext, useState, useCallback } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('obs_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('obs_token'));

  // Step 1: password -> OTP. Returns the dev OTP (no live SMS/email gateway).
  const login = useCallback(async (username, password) => {
    return authApi.login(username, password);
  }, []);

  // Step 2: OTP -> session.
  const verifyOtp = useCallback(async (username, otp) => {
    const data = await authApi.verifyOtp(username, otp);
    localStorage.setItem('obs_token', data.token);
    localStorage.setItem('obs_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the server call fails, clear the local session.
    }
    localStorage.removeItem('obs_token');
    localStorage.removeItem('obs_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = { user, token, isAuthenticated: !!token, isAdmin: user?.role === 'admin', login, verifyOtp, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
