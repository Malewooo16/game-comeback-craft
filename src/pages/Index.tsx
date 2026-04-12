import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LastCardGame from '../components/LastCardGame';
import { GameModeSelector, LocalLobby, MultiplayerLobby } from '../components/Lobby';
import { Leaderboard } from '../components/Leaderboard';
import { useAuth } from '../hooks/useAuth';
import { Loader2 } from 'lucide-react';

type GamePage = 'modeSelect' | 'localLobby' | 'multiplayerLobby' | 'game' | 'leaderboard';

interface GameStartConfig {
  mode: 'local' | 'multiplayer';
  cpuCount?: 1 | 2 | 3;
  gameId?: string;
  playerId?: number;
}

const Index = () => {
  const { code } = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<GamePage>('modeSelect');
  const [gameConfig, setGameConfig] = useState<GameStartConfig | null>(null);
  const [initialLobby, setInitialLobby] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Handle join link and auto-restore active session
  useEffect(() => {
    if (user && !loading) {
      console.log('[Index] User detected, checking for active sessions...', user.id);
      
      if (code) {
        console.log('[Index] Join code detected, going to MP lobby');
        setCurrentPage('multiplayerLobby');
      } else {
        setIsSyncing(true);
        // Check for active session
        fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/lobbies/me/active`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch active lobby');
          return res.json();
        })
        .then(lobby => {
          if (lobby) {
            console.log('[Index] Found session:', lobby.status, 'GameId:', lobby.gameId);
            if (lobby.status === 'active' && lobby.gameId) {
              const myPlayer = lobby.players.find((p: any) => p.id === user.id);
              if (myPlayer) {
                console.log('[Index] Auto-restoring active game:', lobby.gameId);
                setGameConfig({ mode: 'multiplayer', gameId: lobby.gameId, playerId: myPlayer.id });
                setCurrentPage('game');
              } else {
                console.warn('[Index] Active lobby found but user not in players list?');
              }
            } 
            // else if (lobby.status === 'waiting') {
            //   console.log('[Index] Found waiting lobby, pre-loading but staying on hub');
            //   setInitialLobby(lobby);
            // }
          } else {
            console.log('[Index] No active session found');
          }
        })
        .catch(err => console.error('[Index] Error checking active lobby:', err))
        .finally(() => {
          // Add a small delay for the "cool card animation" effect
          setTimeout(() => setIsSyncing(false), 800);
        });
      }
    } else if (!user && !loading && code) {
      console.log('[Index] Join code but no user, redirecting to login');
      navigate('/login');
    }
  }, [code, user, loading, navigate]);

  const handleModeSelect = (mode: 'local' | 'multiplayer' | 'leaderboard') => {
    if (mode === 'local') {
      setCurrentPage('localLobby');
    } else if (mode === 'multiplayer') {
      if (!user) {
        navigate('/login');
        return;
      }
      setCurrentPage('multiplayerLobby');
    } else {
      setCurrentPage('leaderboard');
    }
  };

  const handleLocalGameStart = (cpuCount: 1 | 2 | 3) => {
    setGameConfig({ mode: 'local', cpuCount });
    setCurrentPage('game');
  };

  const handleMultiplayerGameStart = (gameId: string, playerId: number) => {
    setGameConfig({ mode: 'multiplayer', gameId, playerId });
    setCurrentPage('game');
  };

  const handleBackToMode = () => {
    setCurrentPage('modeSelect');
    setGameConfig(null);
    setInitialLobby(null);
  };

  if (isSyncing) {
    return <CoolSyncingView />;
  }

  // Render appropriate page based on current state
  if (currentPage === 'modeSelect') {
    return <GameModeSelector onModeSelect={handleModeSelect} />;
  }

  if (currentPage === 'leaderboard') {
    return <Leaderboard onBack={handleBackToMode} />;
  }

  if (currentPage === 'localLobby') {
    return <LocalLobby onGameStart={handleLocalGameStart} />;
  }

  if (currentPage === 'multiplayerLobby') {
    return (
      <MultiplayerLobby
        joinCode={code || ''}
        initialLobby={initialLobby}
        onGameStart={handleMultiplayerGameStart}
        onBack={handleBackToMode}
      />
    );
  }

  if (currentPage === 'game' && gameConfig) {
    return (
      <LastCardGame
        config={gameConfig}
        onBackToMode={handleBackToMode}
      />
    );
  }

  return <CoolSyncingView message="Preparing arena..." />;
};

const CoolSyncingView = ({ message = "Syncing with table..." }: { message?: string }) => {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0f1a] text-white relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-gold/10 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        {/* Animated Cards */}
        <div className="flex gap-4 mb-12">
          {[0, 1, 2].map(i => (
            <div 
              key={i}
              className="w-16 h-24 rounded-xl border-2 border-gold/30 bg-gold/10 flex items-center justify-center text-2xl shadow-2xl animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1.2s' }}
            >
              <div className="text-gold/40">♠</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-gold" size={20} />
            <h2 className="text-xl font-display text-gold tracking-[4px] uppercase animate-pulse">{message}</h2>
          </div>
          <p className="text-white/20 text-[10px] font-black uppercase tracking-[2px]">Securing Connection</p>
        </div>
      </div>

      {/* Decorative vertical line */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-gold/40 to-transparent" />
    </div>
  );
};

export default Index;
