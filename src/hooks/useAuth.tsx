import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const refreshAccessToken = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Cookies are sent automatically with this
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        setToken(data.token);
        if (data.user) setUser(data.user);
        return true;
      } else {
        // Refresh token might be expired or missing
        clearAuth();
        return false;
      }
    } catch (err) {
      console.error('Token refresh failed:', err);
      return false;
    }
  };

  const clearAuth = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    const fetchUser = async () => {
      // If we have no token, try to refresh immediately (we might have a cookie)
      if (!token) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          setLoading(false);
        }
        // If refreshed, the next effect run will handle fetchUser with the new token
        return;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else if (response.status === 401) {
          const success = await refreshAccessToken();
          if (!success) clearAuth();
        } else {
          clearAuth();
        }
      } catch (err) {
        console.error('Auth check failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [token]);

  // Set up auto-refresh timer (every 10 minutes)
  useEffect(() => {
    if (!token) return;
    
    const interval = setInterval(() => {
      refreshAccessToken();
    }, 10 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = async () => {
    try {
      await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch (e) {
      console.warn('Logout notification failed', e);
    }
    clearAuth();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      login, 
      logout,
      refreshAccessToken 
    }}>
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
