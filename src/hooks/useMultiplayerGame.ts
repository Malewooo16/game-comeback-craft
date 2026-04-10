// Hook for multiplayer gameplay
import { useState, useCallback, useRef, useEffect } from 'react';
import { MultiplayerGameManager, MultiplayerGameConfig } from '../game/multiplayerGameManager';
import { PusherService } from '../services/pusherService';
import { GameEvent, Player } from '../game/gameState';

export function useMultiplayerGame(gameId: string, config: MultiplayerGameConfig) {
  const managerRef = useRef<MultiplayerGameManager | null>(null);
  const pusherRef = useRef<PusherService | null>(null);
  const [, setTick] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Waiting for other players...');
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const onChange = useCallback(() => {
    if (!managerRef.current) return;

    const events = managerRef.current.flushEvents();
    events.forEach((e: GameEvent) => {
      if (e.type === 'toast') {
        setToastMsg(e.message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
      }
      if (e.type === 'status') setStatusMsg(e.message);
      if (e.type === 'modal') setModal({ title: e.title, message: e.message });
    });
    setTick(t => t + 1);
  }, []);

  const initializeGame = useCallback(
    async (pusherService: PusherService) => {
      pusherRef.current = pusherService;
      managerRef.current = new MultiplayerGameManager(config, pusherService);
      await managerRef.current.joinGame();
      setIsConnected(true);
      onChange();
    },
    [config, onChange],
  );

  useEffect(() => {
    // Initialize game on mount
    // In a real app, this would be called after Pusher is initialized
    const initAsync = async () => {
      // Note: In production, initialize PusherService here
      // For now, we'll wait for parent component to call initializeGame
    };
    initAsync();

    return () => {
      managerRef.current?.cleanup();
    };
  }, []);

  const playCard = useCallback(
    async (idx: number) => {
      if (!managerRef.current) return;
      await managerRef.current.playCard(idx);
      onChange();
    },
    [onChange],
  );

  const playStack = useCallback(async () => {
    if (!managerRef.current) return;
    await managerRef.current.playStack();
    onChange();
  }, [onChange]);

  const undoStackCard = useCallback((idx: number) => {
    managerRef.current?.undoStackCard(idx);
    onChange();
  }, [onChange]);

  const drawCard = useCallback(async () => {
    if (!managerRef.current) return;
    await managerRef.current.drawCard();
    onChange();
  }, [onChange]);

  const callLastCard = useCallback(async () => {
    if (!managerRef.current) return;
    await managerRef.current.callLastCard();
    onChange();
  }, [onChange]);

  const rotateHand = useCallback((d: number) => {
    managerRef.current?.rotateHand(d);
    onChange();
  }, [onChange]);

  return {
    state: managerRef.current?.state,
    manager: managerRef.current,
    toastMsg,
    statusMsg,
    modal,
    setModal,
    isConnected,
    initializeGame,
    playCard,
    playStack,
    undoStackCard,
    drawCard,
    callLastCard,
    rotateHand,
    canCallLastCard: (player: Player) =>
      managerRef.current?.canCallLastCard(player) || false,
    isPlayable: (card) =>
      managerRef.current?.isPlayable(card) || false,
  };
}
