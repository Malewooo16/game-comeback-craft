// Hook for local gameplay
import { useState, useCallback, useRef, useEffect } from 'react';
import { LocalGameManager, LocalGameConfig } from '../game/localGameManager';
import { GameEvent, GameState } from '../game/gameState';
import { useAuth } from './useAuth';

export function useLocalGame(cpuCount: 1 | 2 | 3 = 1) {
  const managerRef = useRef<LocalGameManager | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Your turn — play a card or draw');
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const { user } = useAuth();

  const recordGameResult = useCallback(async (winnerId: number, players: any[]) => {
    if (!user) return;

    try {
      const playersData = players.map(p => ({
        id: p.isLocal ? user.id : p.id + 1000, // Dummy ID for CPU
        name: p.name,
        isWinner: p.id === winnerId
      }));

      await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/stats/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          winnerId: winnerId === 0 ? user.id : winnerId + 1000,
          playersData,
          roomId: `local-${Date.now()}`
        })
      });
    } catch (err) {
      console.error('Failed to record local game result:', err);
    }
  }, [user]);

  const onChange = useCallback(() => {
    if (!managerRef.current) return;
    
    // Force re-render by updating gameState
    setGameState(managerRef.current.state);

    const events = managerRef.current.flushEvents();
    events.forEach((e: GameEvent) => {
      if (e.type === 'toast') {
        setToastMsg(e.message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
      }
      if (e.type === 'status') setStatusMsg(e.message);
      if (e.type === 'modal') {
        setModal({ title: e.title, message: e.message });
        
        // If game is over, record result
        if (e.message === 'Game over!') {
          const winnerId = managerRef.current!.state.turnIndex; // In localGameManager, turnIndex is the winner when over
          recordGameResult(winnerId, managerRef.current!.state.players);
        }
      }
    });
  }, [recordGameResult]);

  const initializeGame = useCallback(
    (config: LocalGameConfig) => {
      console.log('[useLocalGame] Initializing game with config:', config);
      const configWithCallback = config as any;
      configWithCallback.onChangeCallback = onChange;
      managerRef.current = new LocalGameManager(config);
      managerRef.current.initializeGame(configWithCallback);
      onChange();
    },
    [onChange],
  );

  const startNewGame = useCallback(
    (numCPUs?: 1 | 2 | 3) => {
      const cpuCountToUse = numCPUs ?? cpuCount;
      console.log('[useLocalGame] Starting new game with', cpuCountToUse, 'CPUs');
      setModal(null);
      initializeGame({ humanPlayerCount: 1, cpuPlayerCount: cpuCountToUse });
    },
    [initializeGame, cpuCount],
  );

  useEffect(() => {
    startNewGame(cpuCount);
    return () => managerRef.current?.clearTimeouts();
  }, [startNewGame, cpuCount]);

  const playCard = useCallback(
    (idx: number) => {
      managerRef.current?.playCard(idx);
      onChange();
    },
    [onChange],
  );

  const playStack = useCallback(() => {
    managerRef.current?.playStack();
    onChange();
  }, [onChange]);

  const undoStackCard = useCallback(
    (idx: number) => {
      managerRef.current?.undoStackCard(idx);
      onChange();
    },
    [onChange],
  );

  const drawCard = useCallback(() => {
    managerRef.current?.drawCard();
    onChange();
  }, [onChange]);

  const callLastCard = useCallback(() => {
    managerRef.current?.callLastCard();
    onChange();
  }, [onChange]);

  const rotateHand = useCallback(
    (d: number) => {
      managerRef.current?.rotateHand(d);
      onChange();
    },
    [onChange],
  );

  const newGame = useCallback(() => {
    startNewGame();
  }, [startNewGame]);

  return {
    state: gameState,
    manager: managerRef.current,
    toastMsg,
    statusMsg,
    modal,
    setModal,
    newGame,
    playCard,
    playStack,
    undoStackCard,
    drawCard,
    callLastCard,
    rotateHand,
    canCallLastCard: (player) => managerRef.current?.canCallLastCard(player) || false,
    isPlayable: (card) => managerRef.current?.isPlayable(card) || false,
  };
}
