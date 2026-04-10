import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import LastCardGame from '../components/LastCardGame';
import { GameModeSelector, LocalLobby, MultiplayerLobby } from '../components/Lobby';
import { Leaderboard } from '../components/Leaderboard';
import { useAuth } from '../hooks/useAuth';

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

  // Handle join link on mount
  useEffect(() => {
    if (code) {
      if (!user && !loading) {
        navigate('/login');
        return;
      }
      setCurrentPage('multiplayerLobby');
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
  };

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

  return <div>Loading...</div>;
};

export default Index;
