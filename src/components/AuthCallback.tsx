import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const AuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      // We need to fetch user info with this token
      const fetchUser = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
          });

          if (response.ok) {
            const data = await response.json();
            login(token, data.user);
            navigate('/');
          } else {
            navigate('/login');
          }
        } catch (err) {
          console.error('Auth callback failed:', err);
          navigate('/login');
        }
      };

      fetchUser();
    } else {
      navigate('/login');
    }
  }, [searchParams, login, navigate]);

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background">
      <div className="text-gold animate-pulse text-xl font-display">Authenticating...</div>
    </div>
  );
};
