"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Organization {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; organizationName: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api
        .getMe()
        .then((data) => {
          setUser(data.user);
          setOrganization(data.organization);
        })
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.login(email, password);
    api.setToken(data.token);
    setUser(data.user);
    setOrganization(data.organization);
  }, []);

  const register = useCallback(
    async (data: { email: string; password: string; name: string; organizationName: string }) => {
      const result = await api.register(data);
      api.setToken(result.token);
      setUser(result.user);
      setOrganization(result.organization);
    },
    []
  );

  const logout = useCallback(() => {
    api.setToken(null);
    setUser(null);
    setOrganization(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, organization, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
