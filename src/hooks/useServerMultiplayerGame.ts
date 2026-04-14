// Updated multiplayer hook that uses Pusher-based sync
import { useState, useCallback, useRef, useEffect } from 'react';
import { getServerClient } from '../services/serverClient';
import { GameState, Card, Player } from '../game/gameState';
import * as rules from '../game/gameRules';
import { ServerMessage } from '@/types/server';

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
  const [isPendingMove, setIsPendingMove] = useState(false);
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'requesting' | 'waiting' | 'offer' | 'declined'>('idle');
  const [pendingRematchOpponent, setPendingRematchOpponent] = useState<string | null>(null);
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
          setIsPendingMove(false);
          
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
        const unsubscribeInvalid = client.on('invalid-move', (message: ServerMessage) => {
          // Only show toast if the invalid move was made by the local player
          if (message.playerId === config.localPlayerId) {
            setToastMsg(message.error || 'Invalid move');
            setIsPendingMove(false);
            clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
          }
        });

        // Listen for player joined
        const unsubscribeJoined = client.on('player-joined', (player: any) => {
          setToastMsg(`${player.name} joined!`);
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
        });

        // Listen for rematch request (ignore if from self)
        const unsubscribeRematchRequest = client.on('rematch-request', (data: { requesterId: number; requesterName: string }) => {
          // Ignore if the request is from ourselves
          if (data.requesterId === config.localPlayerId) {
            console.log('[useServerMultiplayerGame] Ignoring own rematch request');
            return;
          }
          console.log('[useServerMultiplayerGame] Rematch request from:', data.requesterName);
          setPendingRematchOpponent(data.requesterName);
          setRematchStatus('offer');
          setModal({
            title: 'Rematch Request',
            message: `${data.requesterName} wants a rematch! Do you accept?`,
          });
        });

        // Listen for rematch response (ignore if from self)
        const unsubscribeRematchResponse = client.on('rematch-response', async (data: { accepted: boolean; responderId: number; newGameId?: string }) => {
          // Ignore if the response is from ourselves
          if (data.responderId === config.localPlayerId) {
            console.log('[useServerMultiplayerGame] Ignoring own rematch response');
            return;
          }
          console.log('[useServerMultiplayerGame] Rematch response:', data);
          if (data.accepted && data.newGameId) {
            // Rematch accepted - disconnect from old game first, then navigate
            setRematchStatus('idle');
            setModal(null);
            try {
              await clientRef.current.disconnect();
            } catch (e) {
              console.log('[useServerMultiplayerGame] Disconnect error (ignoring):', e);
            }
            // Navigate with rematch flag to show syncing view
            setTimeout(() => {
              window.location.href = `/?gameId=${data.newGameId}&playerId=${config.localPlayerId}&rematch=true`;
            }, 100);
          } else {
            // Rematch declined - navigate to main menu
            setRematchStatus('idle');
            setModal(null);
            window.location.href = '/';
          }
        });

        // Listen for rematch cancelled (ignore if from self)
        const unsubscribeRematchCancelled = client.on('rematch-cancelled', (data: { playerId: number; playerName: string }) => {
          // Ignore if the cancellation is from ourselves
          if (data.playerId === config.localPlayerId) {
            console.log('[useServerMultiplayerGame] Ignoring own rematch cancellation');
            return;
          }
          console.log('[useServerMultiplayerGame] Rematch cancelled by:', data.playerName);
          setRematchStatus('idle');
          setPendingRematchOpponent(null);
          setToastMsg(`${data.playerName} cancelled the rematch request`);
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
        });

        // Cleanup
        return () => {
          unsubscribeState();
          unsubscribeInvalid();
          unsubscribeJoined();
          unsubscribeRematchRequest();
          unsubscribeRematchResponse();
          unsubscribeRematchCancelled();
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
        let isMovingToStack = false;

        // Optimistically update local state for immediate feedback
        setState(prevState => {
          if (!prevState) return prevState;
          const player = prevState.players.find(p => p.id === config.localPlayerId);
          if (!player || cardIndex < 0 || cardIndex >= player.hand.length) return prevState;
          
          const card = player.hand[cardIndex];
          
          if (!rules.isPlayable(prevState, card)) {
            console.warn('Optimistic update blocked: card not playable');
            return prevState;
          }
          
          const newState = { ...prevState, players: prevState.players.map(p => ({ ...p })) };
          const localPlayer = newState.players.find(p => p.id === config.localPlayerId)!;
          
          // Remove card from hand
          localPlayer.hand.splice(cardIndex, 1);
          newState.offset = localPlayer.hand.length > 0 ? newState.offset % localPlayer.hand.length : 0;
          
          // Logic to determine if this card creates or joins a stack
          if (newState.stack.length > 0) {
            newState.stack.push(card);
            isMovingToStack = true;
          } else if (card.value === 'joker') {
            const otherJokers = localPlayer.hand.filter(c => c.value === 'joker');
            if (otherJokers.length === 0) {
              newState.discard.push(card);
              isMovingToStack = false;
            } else {
              newState.stack.push(card);
              isMovingToStack = true;
            }
          } else if (card.value === 'jack') {
            newState.stack.push(card);
            isMovingToStack = true;
          } else {
            const sameValue = localPlayer.hand.filter(c => c.value === card.value);
            if (sameValue.length >= 1) {
              newState.stack.push(card);
              isMovingToStack = true;
            } else {
              newState.discard.push(card);
              isMovingToStack = false;
            }
          }
          
          return newState;
        });

        // CRITICAL: If the card was added to a stack, do NOT send a network request yet.
        // We only send the move when they click "Play Stack".
        if (isMovingToStack) {
          console.log('[Stacking] Card added to local stack, skipping network sync');
          return;
        }

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
        setToastMsg('Sync error - please try again');
      }
    },
    [state, config.gameId, config.localPlayerId],
  );

  const playStack = useCallback(async () => {
    if (!state || state.stack.length === 0) return;

    try {
      setIsPendingMove(true);
      
      // Determine if we need a wildSuit (if any card in stack is Jack or Joker)
      let wildSuit = state.wildSuit;
      if (!wildSuit && state.stack.some(c => c.value === 'jack' || c.value === 'joker')) {
        wildSuit = 'hearts'; // Default to hearts if not set
      }

      const move = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'playStack' as const,
        payload: { 
          cards: state.stack,
          wildSuit: wildSuit 
        },
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
      };

      await clientRef.current.sendMove(move);
    } catch (error) {
      setIsPendingMove(false);
      console.error('Failed to play stack:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to sync stack';
      setToastMsg(errorMsg);
    }
  }, [state, config.gameId, config.localPlayerId]);


  const undoStackCard = useCallback(async (stackIndex: number) => {
    if (!state) return;

    // LOCAL ONLY - No network request needed for undoing a local stack
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
  }, [state, config.localPlayerId]);



  const drawCard = useCallback(async () => {
    if (!state) return;

    try {
      setIsPendingMove(true);
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
      setIsPendingMove(false);
      console.error('Failed to send move:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to send move';
      setToastMsg(errorMsg);
    }
  }, [state, config.gameId, config.localPlayerId]);

  const callLastCard = useCallback(async () => {
    if (!state) return;

    try {
      setIsPendingMove(true);
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
      setIsPendingMove(false);
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
        credentials: 'include',
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

  const requestRematch = useCallback(async () => {
    if (rematchStatus !== 'idle') return;
    
    setRematchStatus('requesting');
    setModal({
      title: 'Rematch Requested',
      message: 'Waiting for opponent...',
    });
    
    try {
      await clientRef.current.requestRematch();
      setRematchStatus('waiting');
    } catch (error) {
      console.error('[useServerMultiplayerGame] Failed to request rematch:', error);
      setRematchStatus('idle');
      setModal(null);
      setToastMsg('Failed to send rematch request');
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
    }
  }, [rematchStatus]);

  const pendingRematchGameId = useRef<string | null>(null);

  const acceptRematch = useCallback(async () => {
    try {
      // Show loading immediately before server response
      setModal({
        title: 'Starting Rematch...',
        message: 'Connecting to new game...',
      });
      // Send accept request - server returns new game ID in response payload
      const response = await clientRef.current.respondRematch(true);
      if (response?.newGameId) {
        pendingRematchGameId.current = response.newGameId;
        // Direct navigate with the game ID
        setTimeout(() => {
          window.location.href = `/?gameId=${response.newGameId}&playerId=${config.localPlayerId}&rematch=true`;
        }, 500);
      } else {
        // Fallback: navigate to main which checks active sessions
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      }
    } catch (error) {
      console.error('[useServerMultiplayerGame] Failed to accept rematch:', error);
      setModal(null);
      setToastMsg('Failed to accept rematch');
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastMsg(null), 2000);
    }
  }, [config.localPlayerId]);

  const declineRematch = useCallback(async () => {
    try {
      await clientRef.current.respondRematch(false);
      setModal(null);
      setRematchStatus('idle');
      setPendingRematchOpponent(null);
    } catch (error) {
      console.error('[useServerMultiplayerGame] Failed to decline rematch:', error);
    }
  }, []);

  const cancelRematch = useCallback(async () => {
    if (rematchStatus !== 'waiting' && rematchStatus !== 'requesting') return;
    
    try {
      await clientRef.current.cancelRematch();
    } catch (error) {
      console.error('[useServerMultiplayerGame] Failed to cancel rematch:', error);
    }
    
    setRematchStatus('idle');
    setModal(null);
  }, [rematchStatus]);

  const is1v1 = state && state.players && state.players.length === 2;

  return {
    state,
    toastMsg,
    statusMsg,
    modal,
    setModal,
    isConnected,
    isPending: isPendingMove,
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
    is1v1,
    rematchStatus,
    pendingRematchOpponent,
    requestRematch,
    acceptRematch,
    declineRematch,
    cancelRematch,
  };
}
