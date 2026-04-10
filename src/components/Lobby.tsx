import React, { useState, useEffect } from 'react';
import { createLobby, joinLobby, ServerLobby } from '../services/lobbyClient';
import { useAuth } from '../hooks/useAuth';
import { getPusherService } from '../services/pusherService';
import { Loader2, Trophy, Settings, User, LogOut, Swords, Users, PlayCircle, Hash } from 'lucide-react';

interface GameModeSelectorProps {
  onModeSelect: (mode: 'local' | 'multiplayer' | 'leaderboard') => void;
}

interface UserStats {
  wins: number;
  losses: number;
  totalGames: number;
}

export const GameModeSelector: React.FC<GameModeSelectorProps> = ({ onModeSelect }) => {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (user) {
      setLoadingStats(true);
      fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/stats/${user.id}`)
        .then(res => res.json())
        .then(data => setStats(data))
        .catch(err => console.error('Error fetching stats:', err))
        .finally(() => setLoadingStats(false));
    }
  }, [user]);

  return (
    <div className="w-screen h-screen flex bg-[#0a0f1a] overflow-hidden text-white font-sans">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse delay-700" />
        
        {/* Floating Cards Decorations */}
        <div className="absolute top-20 left-[15%] w-16 h-24 border-2 border-white/10 rounded-lg rotate-12 animate-bounce" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-40 right-[25%] w-16 h-24 border-2 border-white/10 rounded-lg -rotate-12 animate-bounce" style={{ animationDuration: '6s' }} />
        <div className="absolute top-[40%] right-[10%] w-16 h-24 border-2 border-white/10 rounded-lg rotate-45 animate-pulse" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-8">
        <div className="text-center mb-16 space-y-4">
          <div className="inline-block px-4 py-1.5 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-bold tracking-[4px] uppercase mb-4 animate-in fade-in slide-in-from-top-4 duration-1000">
            Welcome to
          </div>
          <h1 className="font-display text-8xl text-gold mb-2 tracking-tighter drop-shadow-[0_0_25px_rgba(255,215,0,0.3)] animate-in fade-in zoom-in-95 duration-1000">
            Last Card
          </h1>
          <p className="text-white/40 text-lg font-light tracking-wide max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            The ultimate strategy card game. Outsmart your opponents and be the first to play your last card.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500">
          {/* Local Mode */}
          <button
            onClick={() => onModeSelect('local')}
            className="group relative overflow-hidden p-8 rounded-3xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-gold/50 transition-all duration-500 text-center flex flex-col items-center shadow-2xl hover:-translate-y-2"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-20 h-20 mb-6 rounded-2xl bg-blue-500/20 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-500 border border-blue-500/30">
              🎮
            </div>
            <h2 className="font-display text-2xl text-white mb-2 group-hover:text-gold transition-colors">Local Play</h2>
            <p className="text-white/40 text-sm mb-6">Sharpen your skills against advanced CPU players.</p>
            <div className="mt-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-400">
              <PlayCircle size={14} />
              Instant Start
            </div>
          </button>

          {/* Multiplayer Mode */}
          <button
            onClick={() => onModeSelect('multiplayer')}
            className="group relative overflow-hidden p-8 rounded-3xl border border-gold/40 bg-gold/5 hover:bg-gold/10 hover:border-gold transition-all duration-500 text-center flex flex-col items-center shadow-2xl hover:-translate-y-2 scale-105"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-20 h-20 mb-6 rounded-2xl bg-gold/20 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-500 border border-gold/40">
              👥
            </div>
            <h2 className="font-display text-2xl text-gold mb-2">Multiplayer</h2>
            <p className="text-white/40 text-sm mb-6">Battle friends or players worldwide in real-time.</p>
            <div className="mt-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gold">
              <Users size={14} />
              Real-time Battle
            </div>
            <div className="absolute top-4 right-4 px-2 py-0.5 rounded-md bg-gold text-primary-foreground text-[8px] font-black uppercase tracking-tighter">
              Hot
            </div>
          </button>

          {/* Leaderboard */}
          <button
            onClick={() => onModeSelect('leaderboard')}
            className="group relative overflow-hidden p-8 rounded-3xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-purple-500/50 transition-all duration-500 text-center flex flex-col items-center shadow-2xl hover:-translate-y-2"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-20 h-20 mb-6 rounded-2xl bg-purple-500/20 flex items-center justify-center text-4xl group-hover:scale-110 transition-transform duration-500 border border-purple-500/30">
              🏆
            </div>
            <h2 className="font-display text-2xl text-white mb-2 group-hover:text-purple-400 transition-colors">Hall of Fame</h2>
            <p className="text-white/40 text-sm mb-6">View top rankings and global statistics.</p>
            <div className="mt-auto flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">
              <Trophy size={14} />
              Rankings
            </div>
          </button>
        </div>
      </div>

      {/* Right Sidebar - User Profile & Stats */}
      <aside className="w-80 border-l border-white/10 bg-black/20 backdrop-blur-xl flex flex-col p-8 z-20">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-display text-lg text-white/60 tracking-widest uppercase">Profile</h3>
          <button className="text-white/20 hover:text-white transition-colors" aria-label="Settings">
            <Settings size={18} />
          </button>
        </div>

        {user ? (
          <div className="space-y-8 flex-1">
            {/* User Info */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4 group">
                <div className="absolute inset-0 bg-gold rounded-full blur-md opacity-20 group-hover:opacity-40 transition-opacity" />
                <div className="w-24 h-24 rounded-full border-2 border-gold/50 p-1 relative z-10">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gold/10 flex items-center justify-center text-gold text-3xl font-display">
                      {user.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 border-4 border-[#0a0f1a] rounded-full" />
              </div>
              <h4 className="font-display text-xl text-white">{user.name}</h4>
              <p className="text-white/30 text-xs tracking-widest uppercase mt-1">Veteran Player</p>
            </div>

            {/* Stats Preview */}
            <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
              <div className="flex items-center gap-2 text-gold/60 text-[10px] font-bold uppercase tracking-[2px] mb-4">
                <Trophy size={12} />
                Quick Stats
              </div>
              
              {loadingStats ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="animate-spin text-white/20" />
                </div>
              ) : stats ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-white/20 text-[9px] uppercase font-bold tracking-widest">Wins</p>
                    <p className="text-2xl font-display text-emerald-400">{stats.wins}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-white/20 text-[9px] uppercase font-bold tracking-widest">Losses</p>
                    <p className="text-2xl font-display text-red-400">{stats.losses}</p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-white/5 mt-2 flex justify-between items-center">
                    <p className="text-white/20 text-[9px] uppercase font-bold tracking-widest">Total Games</p>
                    <p className="text-sm font-display text-white">{stats.totalGames}</p>
                  </div>
                  <div className="col-span-2">
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                      <div 
                        className="h-full bg-gold" 
                        style={{ width: `${stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0}%` }} 
                      />
                    </div>
                    <div className="flex justify-between text-[8px] uppercase tracking-tighter font-bold mt-1 text-white/20">
                      <span>Win Rate</span>
                      <span>{stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-white/20 text-xs italic text-center py-4">No games played yet</p>
              )}
            </div>

            {/* Social / Activity */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white/30 text-[10px] font-bold uppercase tracking-[2px]">
                <Hash size={12} />
                Recent Matches
              </div>
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group">
                    <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center text-xs text-white/20 font-bold">
                      #{1230 + i}
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-white/60 font-bold">Multiplayer Match</p>
                      <p className="text-[8px] text-white/20 uppercase tracking-widest">2 hours ago</p>
                    </div>
                    <div className="text-[10px] font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      +12 XP
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full mt-auto flex items-center justify-center gap-2 py-4 rounded-xl border border-white/10 text-white/40 hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/5 transition-all group"
            >
              <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-widest">Logout Session</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center text-white/10">
              <User size={40} />
            </div>
            <div className="space-y-2">
              <p className="text-white/60 text-sm font-bold">Guest Account</p>
              <p className="text-white/20 text-[10px] leading-relaxed">Login to track your wins, earn ranks, and compete on the leaderboard.</p>
            </div>
            <button
              onClick={() => onModeSelect('multiplayer')}
              className="px-6 py-2 rounded-lg bg-gold text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
            >
              Sign In Now
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};

interface LocalLobbyProps {
  onGameStart: (cpuCount: 1 | 2 | 3) => void;
}

export const LocalLobby: React.FC<LocalLobbyProps> = ({ onGameStart }) => {
  const [cpuCount, setCpuCount] = useState<1 | 2 | 3>(1);

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0f1a] overflow-hidden text-white font-sans">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="inline-block px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-bold tracking-[4px] uppercase mb-4">
          Training Mode
        </div>
        <h1 className="font-display text-5xl text-gold mb-2 tracking-tight">Setup Local Game</h1>
        <p className="text-white/40 text-sm">Choose the number of CPU opponents you want to face.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-[32px] p-10 w-full max-w-md shadow-2xl backdrop-blur-md relative overflow-hidden animate-in fade-in zoom-in-95 duration-700">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
        
        <div className="mb-12">
          <label className="text-white/20 text-[10px] font-bold block mb-8 text-center uppercase tracking-[4px]">
            Difficulty & Players
          </label>
          <div className="flex gap-6 justify-center">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setCpuCount(n as 1 | 2 | 3)}
                className={`relative w-20 h-20 rounded-2xl font-display text-3xl transition-all duration-500 ${
                  cpuCount === n
                    ? 'bg-blue-600 text-white shadow-[0_0_25px_rgba(37,99,235,0.4)] scale-110 border-2 border-blue-400'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {n}
                <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-tighter opacity-40">
                  CPUs
                </span>
              </button>
            ))}
          </div>
          <p className="text-white/20 text-[10px] mt-10 text-center italic tracking-wider">
            Match will consist of <span className="text-blue-400 font-bold">{cpuCount + 1} players</span> total.
          </p>
        </div>

        <button
          onClick={() => onGameStart(cpuCount)}
          className="group w-full relative overflow-hidden bg-white text-[#0a0f1a] font-display text-xl px-8 py-5 rounded-2xl uppercase tracking-widest shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
        >
          <PlayCircle size={22} />
          Launch Game
        </button>
        
        <button 
          onClick={() => window.location.reload()} 
          className="w-full mt-6 text-white/20 hover:text-white/40 text-[10px] font-bold uppercase tracking-widest transition-colors"
        >
          Cancel & Return
        </button>
      </div>
    </div>
  );
};

export interface MultiplayerLobbyProps {
  joinCode?: string;
  onGameStart: (gameId: string, playerId: number) => void;
  onBack: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  joinCode: urlJoinCode,
  onGameStart,
  onBack,
}) => {
  const [lobby, setLobby] = useState<ServerLobby | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState(urlJoinCode || '');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const pusher = getPusherService();

  useEffect(() => {
    if (lobby) {
      const channel = pusher.subscribe(`lobby-${lobby.id}`);
      channel.bind('lobby-update', (updatedLobby: ServerLobby) => {
        setLobby(updatedLobby);
        if (updatedLobby.status === 'active' && updatedLobby.gameId) {
          const myPlayerId = updatedLobby.players.find(p => p.id === user?.id)?.id;
          if (myPlayerId !== undefined) {
            onGameStart(updatedLobby.gameId, myPlayerId);
          }
        }
      });

      return () => {
        pusher.unsubscribe(`lobby-${lobby.id}`);
      };
    }
  }, [lobby?.id, user?.id, onGameStart, pusher]);

  const handleCreateGame = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('You must be logged in to create a room. Please login first.');
        setLoading(false);
        return;
      }
      const newLobby = await createLobby(maxPlayers);
      setLobby(newLobby);
    } catch (err) {
      console.error('Create lobby error:', err);
      // Check for 401 specifically
      if (err instanceof Error && err.message.includes('401')) {
        setError('Session expired. Please logout and login again.');
        localStorage.removeItem('token');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create lobby');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async () => {
    if (!joinCodeInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('You must be logged in to join a room. Please login first.');
        setLoading(false);
        return;
      }
      const joinedLobby = await joinLobby(joinCodeInput);
      setLobby(joinedLobby);
    } catch (err) {
      console.error('Join lobby error:', err);
      // Check for 401 specifically
      if (err instanceof Error && err.message.includes('401')) {
        setError('Session expired. Please logout and login again.');
        localStorage.removeItem('token');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to join lobby');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReady = async () => {
    if (!lobby || !user) return;
    const myPlayer = lobby.players.find(p => p.id === user.id);
    if (!myPlayer) return;
    
    const token = localStorage.getItem('token');
    if (!token) {
      setError('You must be logged in');
      return;
    }
    
    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/lobbies/${lobby.id}/ready`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isReady: !myPlayer.isReady })
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expired. Please logout and login again.');
          localStorage.removeItem('token');
        } else {
          throw new Error('Failed to update ready state');
        }
      }
    } catch (err) {
      setError('Failed to update ready state');
    }
  };

  const handleStartGame = async () => {
    if (!lobby) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('You must be logged in');
        setLoading(false);
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/lobbies/${lobby.id}/start`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expired. Please logout and login again.');
          localStorage.removeItem('token');
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Failed to start game');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game');
    } finally {
      setLoading(false);
    }
  };

  if (!lobby) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0f1a] overflow-hidden text-white font-sans">
        {/* Background Animated Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
          <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-gold/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-gold/10 rounded-full blur-[120px] animate-pulse delay-700" />
        </div>

        <div className="w-full max-w-xl px-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="text-center mb-10">
            <h2 className="font-display text-5xl text-gold mb-3 tracking-tight">Multiplayer</h2>
            <p className="text-white/40 text-sm tracking-wider">Enter the arena. Choose to host a new match or join a friend's room.</p>
          </div>
          
          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-xs flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-bold">!</div>
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Host Section */}
            <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-md relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
              <label className="text-gold/40 text-[9px] font-black block mb-8 uppercase tracking-[4px]">Create Room</label>
              
              <div className="flex gap-3 justify-center mb-8">
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n as 2 | 3 | 4)}
                    className={`w-12 h-12 rounded-xl font-display text-xl transition-all duration-300 ${
                      maxPlayers === n
                        ? 'bg-gold text-[#0a0f1a] scale-110 shadow-[0_0_20px_rgba(255,215,0,0.3)]'
                        : 'bg-white/5 text-white/30 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              
              <button
                onClick={handleCreateGame}
                disabled={loading}
                className="w-full bg-gold text-[#0a0f1a] font-display text-sm py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Swords size={18} />}
                Host Match
              </button>
            </div>

            {/* Join Section */}
            <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 backdrop-blur-md relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
              <label className="text-blue-400/40 text-[9px] font-black block mb-8 uppercase tracking-[4px]">Join Room</label>
              
              <input
                type="text"
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="CODE"
                maxLength={6}
                className="w-full px-4 py-4 mb-8 rounded-xl bg-black/40 border border-white/10 text-white placeholder-white/10 text-center font-mono text-2xl tracking-[0.3em] focus:border-blue-500/50 outline-none transition-colors"
              />
              
              <button
                onClick={handleJoinGame}
                disabled={loading}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-display text-sm py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <Users size={18} />}
                Join Game
              </button>
            </div>
          </div>

          <button
            onClick={onBack}
            className="mt-12 w-full text-white/20 hover:text-white/60 text-[10px] font-black uppercase tracking-[4px] transition-colors flex items-center justify-center gap-2"
          >
            ← Back to Main Hub
          </button>
        </div>
      </div>
    );
  }

  // Lobby room view
  const myPlayer = lobby.players.find(p => p.id === user?.id);
  const isHost = lobby.hostId === user?.id;
  const canStart = lobby.players.length >= 2 && lobby.players.every(p => p.isReady);
  const shareLink = `${window.location.origin}/join/${lobby.joinCode}`;

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0f1a] overflow-hidden text-white font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-gold/10 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-[40px] p-10 backdrop-blur-xl shadow-2xl relative animate-in fade-in zoom-in-95 duration-700">
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="bg-gold text-[#0a0f1a] px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[3px] shadow-xl">Room Active</div>
          <h2 className="text-4xl text-white font-mono mt-4 tracking-[0.4em] drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{lobby.joinCode}</h2>
        </div>

        <div className="mt-12 mb-10">
          <div className="flex justify-between items-end mb-6">
            <h3 className="text-white font-display text-2xl">Crew</h3>
            <span className="text-white/20 text-xs font-mono font-bold">{lobby.players.length} / {lobby.maxPlayers}</span>
          </div>
          
          <div className="space-y-4">
            {lobby.players.map(player => (
              <div key={player.id} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 group transition-all hover:bg-white/10">
                <div className={`w-3 h-3 rounded-full ${player.isReady ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]' : 'bg-white/10 animate-pulse'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${player.id === user?.id ? 'text-gold' : 'text-white/80'}`}>
                      {player.name}
                    </span>
                    {player.id === lobby.hostId && (
                      <div className="px-1.5 py-0.5 rounded bg-gold/20 text-gold text-[7px] font-black uppercase tracking-tighter">Host</div>
                    )}
                  </div>
                </div>
                <div className={`text-[9px] font-black uppercase tracking-widest ${player.isReady ? 'text-emerald-400' : 'text-white/20'}`}>
                  {player.isReady ? 'Ready' : 'Waiting'}
                </div>
              </div>
            ))}
            
            {/* Empty slots */}
            {Array.from({ length: lobby.maxPlayers - lobby.players.length }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 bg-black/20 p-4 rounded-2xl border border-white/5 border-dashed opacity-40">
                <div className="w-3 h-3 rounded-full bg-white/5" />
                <span className="flex-1 text-[10px] text-white/20 font-bold uppercase tracking-widest italic">Requesting entry...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Share Link */}
        <div className="mb-10 p-5 rounded-3xl bg-black/40 border border-white/5">
          <p className="text-white/20 text-[8px] font-black uppercase tracking-[3px] mb-3">Invite Channel</p>
          <div className="flex gap-2">
            <input
              title='Invite link'
              type="text"
              value={shareLink}
              readOnly
              className="flex-1 px-4 py-3 text-[10px] rounded-xl bg-white/5 border border-white/10 text-white/40 outline-none font-mono"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareLink);
                // In a real app, I'd trigger a toast here
              }}
              className="px-5 py-3 rounded-xl bg-gold/20 hover:bg-gold/30 text-gold text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button
            onClick={handleToggleReady}
            className={`w-full py-5 rounded-2xl font-display text-lg tracking-widest uppercase transition-all shadow-xl ${
              myPlayer?.isReady 
                ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20' 
                : 'bg-emerald-500 text-[#0a0f1a] shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-95'
            }`}
          >
            {myPlayer?.isReady ? 'Stand Down' : 'Ready Up'}
          </button>

          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={!canStart || loading}
              className="w-full bg-gold text-[#0a0f1a] disabled:opacity-20 disabled:grayscale font-display text-lg py-5 rounded-2xl shadow-[0_0_30px_rgba(255,215,0,0.2)] uppercase tracking-widest hover:scale-[1.02] transition-all active:scale-95"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" /> : 'Launch Match'}
            </button>
          )}

          <button
            onClick={async () => {
              const token = localStorage.getItem('token');
              if (!token) return;
              try {
                const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/lobbies/${lobby.id}/leave`, {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (response.status === 401) {
                  localStorage.removeItem('token');
                }
                setLobby(null);
              } catch (err) {
                setLobby(null);
              }
            }}
            className="w-full text-white/20 hover:text-white/40 text-[9px] font-black uppercase tracking-[4px] pt-4 transition-colors"
          >
            Abandon Room
          </button>
        </div>
      </div>
    </div>
  );
};
