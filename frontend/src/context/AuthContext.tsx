import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = configuredApiBase && configuredApiBase.length > 0 ? configuredApiBase.replace(/\/$/, '') : '/api';

const apiUrl = (path: string): string => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

interface User {
  id: number;
  email: string;
  fullName: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (fullName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Synchronize Axios authorization header
  const setAxiosHeader = (jwtToken: string | null) => {
    if (jwtToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${jwtToken}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      if (token) {
        setAxiosHeader(token);
        try {
          const response = await axios.get(apiUrl('/auth/me'));
          setUser({
            id: response.data.id,
            email: response.data.email,
            fullName: response.data.full_name,
          });
        } catch (error) {
          console.error('Failed to validate token on mount:', error);
          // Token expired or invalid
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
          setAxiosHeader(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(apiUrl('/auth/login'), { email, password });
      const jwtToken = response.data.access_token;
      
      localStorage.setItem('token', jwtToken);
      setToken(jwtToken);
      setAxiosHeader(jwtToken);

      // Fetch user profile info
      const meResponse = await axios.get(apiUrl('/auth/me'));
      setUser({
        id: meResponse.data.id,
        email: meResponse.data.email,
        fullName: meResponse.data.full_name,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      if (!error.response) {
        throw new Error('Unable to reach backend API. Check backend server and VITE_API_BASE_URL.');
      }
      throw new Error(error.response?.data?.detail || 'Login failed. Please check credentials.');
    }
  };

  const register = async (fullName: string, email: string, password: string) => {
    try {
      await axios.post(apiUrl('/auth/register'), {
        email,
        full_name: fullName,
        password,
      });
      // Automatically log in user after successful registration
      await login(email, password);
    } catch (error: any) {
      console.error('Registration error:', error);
      if (!error.response) {
        throw new Error('Unable to reach backend API. Check backend server and VITE_API_BASE_URL.');
      }
      throw new Error(error.response?.data?.detail || 'Registration failed.');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setAxiosHeader(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
