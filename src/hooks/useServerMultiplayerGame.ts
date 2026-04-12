// Updated multiplayer hook that uses Pusher-based sync
import { useState, useCallback, useRef, useEffect } from 'react';
import { getServerClient } from '../services/serverClient';
import { GameState, Card, Player } from '../game/gameState';
import * as rules from '../game/gameRules';

export interface ServerMultiplayerGameConfig {
  gameId: string;
  localPlayerId: number;
  players: Player[];
}

export function useServerMultiplayerGame(config: ServerMultiplayerGameConfig) {
  const clientRef = useRef(getServerClient());
  const [state, setState] = useState<GameState | null>(null);
  const [, setTick] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('Connecting to server...');
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const moveSequence = useRef(0);

  const onChange = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  // Initialize Pusher connection
  useEffect(() => {
    const initPusher = async () => {
      try {
        const client = clientRef.current;
        const initialState = await client.joinGame(config.gameId, config.localPlayerId);
        setState(initialState);
        setIsConnected(true);
        
        // Only update status if players exist
        if (initialState.players && initialState.players.length > initialState.turnIndex) {
          setStatusMsg(`${initialState.players[initialState.turnIndex].name}'s turn`);
        } else {
          setStatusMsg('Waiting for game to start...');
        }

        // Listen for game state updates via Pusher
        const unsubscribeState = client.on('game-state', (updatedState: GameState) => {
          console.log('State update from Pusher');
          setState(updatedState);
          
          if (updatedState.lastActionMessage) {
            setToastMsg(updatedState.lastActionMessage);
            clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToastMsg(null), 1000);
          }

          if (updatedState.over) {
            // Priority 1: Check who was marked as winner by engine or has empty hand
            let winner = updatedState.players.find(p => p.hand.length === 0 && !p.victoryDrawPending && !p.isEliminated);
            
            // Priority 2: In abandonment/elimination, search for the last standing player
            if (!winner) {
              const activePlayers = updatedState.players.filter(p => !p.isEliminated);
              if (activePlayers.length === 1) {
                winner = activePlayers[0];
              }
            }
            
            setModal({
              title: winner?.id === config.localPlayerId ? 'You Win!' : (winner?.name || 'Someone') + ' Wins!',
              message: 'Game over!',
            });
            setStatusMsg('Game Over');
          } else if (updatedState.players && updatedState.players.length > updatedState.turnIndex) {
            const currentPlayer = updatedState.players[updatedState.turnIndex];
            setStatusMsg(`${currentPlayer.name}'s turn`);
            
            if (currentPlayer.id === config.localPlayerId && currentPlayer.victoryDrawPending) {
              setToastMsg('Victory Draw! Draw one card to confirm win.');
            }
          }
          onChange();
        });

        // Listen for invalid moves
        const unsubscribeInvalid = client.on('invalid-move', (error: string) => {
          setToastMsg(error);
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
        });

        // Listen for player joined
        const unsubscribeJoined = client.on('player-joined', (player: any) => {
          setToastMsg(`${player.name} joined!`);
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
        });

        // Cleanup
        return () => {
          unsubscribeState();
          unsubscribeInvalid();
          unsubscribeJoined();
        };
      } catch (error) {
        console.error('Failed to connect:', error);
        setStatusMsg('Failed to connect to server');
        setIsConnected(false);
      }
    };

    initPusher();

    return () => {
      clientRef.current?.disconnect();
    };
  }, [config.gameId, config.localPlayerId, onChange]);

  const playCard = useCallback(
    async (cardIndex: number) => {
      if (!state) return;

      try {
        // Optimistically update local state for immediate feedback
        setState(prevState => {
          if (!prevState) return prevState;
          const player = prevState.players.find(p => p.id === config.localPlayerId);
          if (!player || cardIndex < 0 || cardIndex >= player.hand.length) return prevState;
          
          const card = player.hand[cardIndex];
          const newState = { ...prevState, players: prevState.players.map(p => ({ ...p })) };
          const localPlayer = newState.players.find(p => p.id === config.localPlayerId)!;
          
          // Remove card from hand
          localPlayer.hand.splice(cardIndex, 1);
          newState.offset = localPlayer.hand.length > 0 ? newState.offset % localPlayer.hand.length : 0;
          
          // Add to stack or discard
          // SKIP JOKER PART - Keep original logic for jokers at top
          if (card.value === 'joker') {
            const otherJokers = localPlayer.hand.filter(c => c.value === 'joker');
            if (otherJokers.length === 0) {
              newState.discard.push(card);
            } else {
              newState.stack.push(card);
            }
          } else if (newState.stack.length > 0) {
            // Add to existing stack
            newState.stack.push(card);
          } else if (card.value === 'jack') {
            // For jacks, always create stack (to allow bridging)
            newState.stack.push(card);
          } else {
            // For other cards: only create stack if player has more of same value
            const sameValue = localPlayer.hand.filter(c => c.value === card.value);
            if (sameValue.length >= 1) {
              newState.stack.push(card);
            } else {
              newState.discard.push(card);
            }
          }
          
          return newState;
        });

        const move = {
          gameId: config.gameId,
          playerId: config.localPlayerId,
          moveType: 'play' as const,
          payload: { cardIndex },
          timestamp: Date.now(),
          clientSequence: moveSequence.current++,
        };

        await clientRef.current.sendMove(move);
      } catch (error) {
        console.error('Failed to send move:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to send move';
        setToastMsg(errorMsg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
      }
    },
    [state, config.gameId, config.localPlayerId],
  );

  const playStack = useCallback(async () => {
    if (!state) return;

    try {
      const move = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'playStack' as const,
        payload: {},
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
      };

      await clientRef.current.sendMove(move);
    } catch (error) {
      console.error('Failed to send move:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to send move';
      setToastMsg(errorMsg);
    }
  }, [state, config.gameId, config.localPlayerId]);

  const undoStackCard = useCallback(async (stackIndex: number) => {
    if (!state) return;

    try {
      // Optimistically update local state
      setState(prevState => {
        if (!prevState || stackIndex < 0 || stackIndex >= prevState.stack.length) return prevState;
        const newState = { ...prevState, players: prevState.players.map(p => ({ ...p })) };
        const card = newState.stack.splice(stackIndex, 1)[0];
        const player = newState.players.find(p => p.id === config.localPlayerId);
        if (player) {
          player.hand.push(card);
        }
        return newState;
      });

      const move = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'undoStack' as const,
        payload: { stackIndex },
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
      };

      await clientRef.current.sendMove(move);
    } catch (error) {
      console.error('Failed to send move:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to send move';
      setToastMsg(errorMsg);
    }
  }, [state, config.gameId, config.localPlayerId]);

  const drawCard = useCallback(async () => {
    if (!state) return;

    try {
      const move = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'draw' as const,
        payload: {},
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
      };

      await clientRef.current.sendMove(move);
    } catch (error) {
      console.error('Failed to send move:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to send move';
      setToastMsg(errorMsg);
    }
  }, [state, config.gameId, config.localPlayerId]);

  const callLastCard = useCallback(async () => {
    if (!state) return;

    try {
      const move = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'callLastCard' as const,
        payload: {},
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
      };

      await clientRef.current.sendMove(move);
    } catch (error) {
      console.error('Failed to send move:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to send move';
      setToastMsg(errorMsg);
    }
  }, [state, config.gameId, config.localPlayerId]);

  const rotateHand = useCallback((d: number) => {
    setState(prevState => {
      if (!prevState) return prevState;
      const newState = { ...prevState };
      const player = newState.players.find(p => p.id === config.localPlayerId);
      if (player) {
        const n = player.hand.length;
        if (n > 0) {
          newState.offset = ((newState.offset + d) + n) % n;
        }
      }
      return newState;
    });
  }, [config.localPlayerId]);

  const canCallLastCard = useCallback((player: Player) => {
    return rules.canCallLastCard(player);
  }, []);

  const isPlayable = useCallback((card: Card) => {
    if (!state) return false;
    return rules.isPlayable(state, card);
  }, [state]);

  const getLocalPlayerIndex = useCallback((players: any[], playerId: number) => {
    return players.findIndex(p => p.id === playerId);
  }, []);

  const syncRequest = useCallback(async () => {
    try {
      const syncedState = await clientRef.current.syncRequest();
      setState(syncedState);
    } catch (error) {
      console.error('Failed to request sync:', error);
      setToastMsg('Failed to sync with server');
    }
  }, []);

  const leaveGame = useCallback(async () => {
    console.log('[useServerMultiplayerGame] leaveGame called');
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('[useServerMultiplayerGame] No token found for leaveGame');
        return;
      }
      
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/games/${config.gameId}/leave`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ playerId: config.localPlayerId }),
      });
      
      console.log('[useServerMultiplayerGame] leaveGame response:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[useServerMultiplayerGame] leaveGame failed:', errorData);
      }
    } catch (error) {
      console.error('[useServerMultiplayerGame] Failed to leave game on server:', error);
    }
  }, [config.gameId, config.localPlayerId]);

  return {
    state,
    toastMsg,
    statusMsg,
    modal,
    setModal,
    isConnected,
    playCard,
    playStack,
    undoStackCard,
    drawCard,
    callLastCard,
    rotateHand,
    canCallLastCard,
    isPlayable,
    syncRequest,
    leaveGame,
  };
}
