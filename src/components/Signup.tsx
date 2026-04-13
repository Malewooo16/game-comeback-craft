import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, UserPlus } from 'lucide-react';

export const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Signup failed');
      }

      const { token, user } = await response.json();
      login(token, user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/auth/google`;
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center"
      style={{
        background: 'radial-gradient(ellipse 80% 70% at 50% 50%, hsl(var(--felt)) 0%, hsl(var(--felt-dark)) 60%, hsl(160 70% 4%) 100%)',
      }}>
      <div className="w-full max-w-lg px-6 z-10">
        <div className="bg-gradient-to-br from-[#1a2a4a] to-[#0d1f3c] border border-gold/30 rounded-2xl p-7 shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
          <div className="text-center mb-5">
            <h1 className="font-display text-3xl text-gold-light mb-2 tracking-tight">Create Account</h1>
            <p className="text-foreground/40 text-xs font-bold uppercase tracking-[3px]">Join the Last Card ranks</p>
          </div>
          
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/20 border border-destructive/40 text-destructive-200 text-xs flex items-center gap-2">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name and Email in same row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-gold/60 text-[10px] font-bold uppercase tracking-[2px] ml-1">Username</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-gold/20 text-foreground placeholder-foreground/20 focus:border-gold/50 outline-none transition-colors"
                  required
                  placeholder="Commander"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-gold/60 text-[10px] font-bold uppercase tracking-[2px] ml-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-black/40 border border-gold/20 text-foreground placeholder-foreground/20 focus:border-gold/50 outline-none transition-colors"
                  required
                  placeholder="you@email.com"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-gold/60 text-[10px] font-bold uppercase tracking-[2px] ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-black/40 border border-gold/20 text-foreground placeholder-foreground/20 focus:border-gold/50 outline-none transition-colors"
                required
                placeholder="••••••••"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-gold to-gold-light text-primary-foreground font-display text-sm py-3 rounded-xl hover:scale-[1.01] active:scale-95 transition-all shadow-lg shadow-gold/20 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <><UserPlus size={18} /> Register</>}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-gold/10" />
            <span className="text-gold/30 text-[9px] font-bold tracking-widest uppercase">Or</span>
            <div className="flex-1 border-t border-gold/10" />
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-gold/10 hover:bg-gold/20 text-gold font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-gold/20"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-xs uppercase tracking-wider">Continue with Google</span>
          </button>

          <p className="mt-5 text-center">
            <span className="text-foreground/40 text-[10px] font-bold uppercase tracking-widest">Already have account? </span>
            <Link to="/login" className="text-gold text-[10px] font-bold uppercase tracking-widest hover:underline ml-1">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
