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
  const lastActionIdRef = useRef<string | null>(null);
  const serverVersionRef = useRef<number>(0);
  const clientVersionRef = useRef<number>(0);
  const lastProcessedServerVersion = useRef<number>(-1);
  
  // Animation triggers - consumed when shown
  const [animTriggers, setAnimTriggers] = useState<{
    stackPlayed?: boolean;
    cardPlayed?: boolean;
    turnChange?: boolean;
    penaltyApplied?: boolean;
  }>({});
  
  // Track previous state to detect new animations needed
  const prevStateRef = useRef<GameState | null>(null);
  
  // Stack tracking - cards added locally but not yet sent to server
  interface LocalStackCard {
    card: Card;
    actionId: string;
    timestamp: number;
    wildSuit?: string;
  }
  const localStackRef = useRef<LocalStackCard[]>([]);
  
  // Optimistic Updates state
  interface PendingMove {
    type: 'play' | 'draw' | 'callLastCard' | 'playStack' | 'undoStack';
    payload: any;
    actionId: string;
    timestamp: number;
    sequence: number;
  }
  const pendingMovesRef = useRef<PendingMove[]>([]);

  const applyMoveToState = useCallback((state: GameState, move: PendingMove, playerId: number): GameState => {
    // Deep clone state to avoid mutations
    const newState = JSON.parse(JSON.stringify(state)) as GameState;
    const playerIndex = newState.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return newState;

    let result: any;
    switch (move.type) {
      case 'play': {
        const player = newState.players[playerIndex];
        const card = player.hand[move.payload.cardIndex];
        if (!card) return newState;

        // Only stack if you have 2+ cards of same value (single cards go to discard)
        // Exception: can always add to existing stack
        const sameValue = player.hand.filter(c => c.value === card.value).length;
        const isStacking = newState.stack.length > 0 || card.value === 'jack' || 
          (card.value === 'joker' && player.hand.filter(c => c.value === 'joker').length > 1) || 
          sameValue > 1;

        if (isStacking && newState.stack.length > 0) {
          // Adding to existing stack
          newState.stack.push(card);
          player.hand.splice(move.payload.cardIndex, 1);
          return newState;
        } else if (isStacking) {
          // Creating new stack (2+ same value or jack/joker)
          newState.stack.push(card);
          player.hand.splice(move.payload.cardIndex, 1);
          return newState;
        } else {
          // Direct play to discard - advance turn
          player.hand.splice(move.payload.cardIndex, 1);
          newState.discard.push(card);
          newState.turnIndex = rules.computeNextTurnIndex(newState);
          return newState;
        }
      }
      case 'draw':
        result = rules.drawCard(newState, playerIndex);
        if (result.success) {
          const nextState = { ...result.state };
          nextState.turnIndex = rules.computeNextTurnIndex(nextState);
          return nextState;
        }
        return result.state;
      case 'playStack':
        result = rules.playStack(newState, playerIndex, move.payload.wildSuit);
        if (result.success) {
          const nextState = { ...result.state };
          nextState.turnIndex = rules.computeNextTurnIndex(nextState);
          return nextState;
        }
        return result.state;
      case 'callLastCard':
        result = rules.callLastCard(newState, playerIndex);
        return result.state;
      case 'undoStack':
        result = rules.undoStackCard(newState, playerIndex, move.payload.stackIndex);
        return result.state;
      default:
        return newState;
    }
  }, []);

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
          console.log('State update from Pusher', { 
            over: updatedState.over, 
            lastActionId: updatedState.lastActionId,
            serverVersion: updatedState.version,
            pendingCount: pendingMovesRef.current.length
          });
          
          // STALE UPDATE DETECTION - Ignore old versions
          if (updatedState.version !== undefined) {
            if (updatedState.version <= lastProcessedServerVersion.current) {
              console.log(`[Reconcile] Stale update ignored: server v${updatedState.version} <= processed v${lastProcessedServerVersion.current}`);
              return;
            }
            lastProcessedServerVersion.current = updatedState.version;
          }
          
          // RECONCILIATION LOGIC
          if (updatedState.lastActionId) {
            // Find the index of the move confirmed by the server
            const confirmedIdx = pendingMovesRef.current.findIndex(m => m.actionId === updatedState.lastActionId);
            
            if (confirmedIdx !== -1) {
              // Remove confirmed move and all moves before it
              console.log(`[Reconcile] Server confirmed move: ${updatedState.lastActionId}. Clearing ${confirmedIdx + 1} pending moves.`);
              pendingMovesRef.current = pendingMovesRef.current.slice(confirmedIdx + 1);
            } else {
              // Server state might already include some moves - clear all pending since server has authoritative state
              console.log('[Reconcile] Server state has lastActionId but not in pending - clearing all pending');
              pendingMovesRef.current = [];
            }
          }

          // Apply any remaining pending moves to the server state
          // Skip playStack since server already handled it
          let reconciledState = updatedState;
          const pendingNonStackMoves = pendingMovesRef.current.filter(m => m.type !== 'playStack');
          
          if (pendingNonStackMoves.length > 0) {
            console.log(`[Reconcile] Re-applying ${pendingNonStackMoves.length} pending moves to server state`);
            pendingNonStackMoves.forEach(move => {
              console.log(`[Reconcile] Re-applying move: ${move.type} ${move.actionId}`);
              reconciledState = applyMoveToState(reconciledState, move, config.localPlayerId);
            });
          } else {
            console.log('[Reconcile] No pending moves to re-apply (or playStack skipped)');
          }

          setState(prevState => {
            // If we were in a "Game Over" state and the new state is NOT over,
            // it means a new round or rematch has started. Reset UI states.
            if (prevState?.over && !reconciledState.over) {
              console.log('[State] Game over -> not over, resetting UI');
              setRematchStatus('idle');
              setModal(null);
              setPendingRematchOpponent(null);
            }

            // Detect animation triggers
            const triggers: typeof animTriggers = {};
            if (prevState) {
              // Stack played - server stack went from non-empty to empty
              if (prevState.stack.length > 0 && reconciledState.stack.length === 0) {
                triggers.stackPlayed = true;
              }
              // Card played - check if any player's hand changed unexpectedly
              if (prevState.turnIndex !== reconciledState.turnIndex) {
                triggers.turnChange = true;
              }
              // Penalty changed
              if (prevState.pending !== reconciledState.pending) {
                triggers.penaltyApplied = true;
              }
            }
            if (Object.keys(triggers).length > 0) {
              setAnimTriggers(triggers);
            }

            return reconciledState;
          });
          
          setIsPendingMove(pendingMovesRef.current.length > 0);
          
          if (updatedState.lastActionMessage && updatedState.lastActionId !== lastActionIdRef.current) {
            lastActionIdRef.current = updatedState.lastActionId || null;
            setToastMsg(updatedState.lastActionMessage);
            clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToastMsg(null), 1500);
          }

          // Handle game over state
          if (updatedState.over) {
            console.log('[State] Game is over, checking modal state');
            
            // Determine winner from state
            let winner = updatedState.players.find(p => p.hand.length === 0 && !p.victoryDrawPending && !p.isEliminated);
            if (!winner) {
              const activePlayers = updatedState.players.filter(p => !p.isEliminated);
              if (activePlayers.length === 1) {
                winner = activePlayers[0];
              }
            }
            
            const newTitle = winner?.id === config.localPlayerId ? 'You Win!' : (winner?.name || 'Someone') + ' Wins!';
            console.log('[State] Winner:', winner?.name, 'Local player:', config.localPlayerId, 'Title:', newTitle);
            
            // ALWAYS set the modal when game is over, unless there's already a game over modal
            // This ensures both winner and loser see the modal
            setModal(prevModal => {
              // If already showing a game over modal, keep it
              if (prevModal && prevModal.title.match(/You Win!|Wins!|Game Over|Rematch/)) {
                console.log('[State] Keeping existing modal:', prevModal.title);
                return prevModal;
              }
              
              // Also preserve other important modals (like Rules)
              if (prevModal && prevModal.title === '📖 Rules') {
                return prevModal;
              }
              
              console.log('[State] Setting new game over modal:', newTitle);
              return {
                title: newTitle,
                message: winner?.id === config.localPlayerId 
                  ? 'Congratulations! You won the game!' 
                  : `${winner?.name || 'Someone'} won the game. Better luck next time!`,
              };
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

  // syncRequest must be defined before other move functions that use it
  const syncRequest = useCallback(async () => {
    try {
      const syncedState = await clientRef.current.syncRequest();
      setState(syncedState);
    } catch (error) {
      console.error('Failed to request sync:', error);
      setToastMsg('Failed to sync with server');
    }
  }, []);

  const playCard = useCallback(
    async (cardIndex: number) => {
      if (!state) return;

      try {
        const actionId = `play-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const player = state.players.find(p => p.id === config.localPlayerId);
        const card = player?.hand[cardIndex];
        const sequence = moveSequence.current++;
        
        // Determine if this will be a stacking move BEFORE applying
        // Only stack if you have 2+ cards of same value (single cards go to discard)
        const sameValue = player?.hand.filter(c => c.value === card?.value).length ?? 0;
        const isStacking = state.stack.length > 0 || card?.value === 'jack' || 
          (card?.value === 'joker' && player?.hand.filter(c => c.value === 'joker').length > 1) || 
          sameValue > 1;

        const move: PendingMove = { 
          type: 'play', 
          payload: { cardIndex }, 
          actionId,
          timestamp: Date.now(),
          sequence,
        };

        // Apply the move optimistically
        setState(prevState => {
          if (!prevState) return prevState;
          
          const newState = applyMoveToState(prevState, move, config.localPlayerId);
          const wasStacking = newState.stack.length > prevState.stack.length;
          
          if (wasStacking) {
            // Track stacking card locally - will be sent when playStack is called
            console.log('[Stacking] Card added to local stack');
          } else {
            // Non-stacking: add to pending moves queue for reconciliation
            pendingMovesRef.current.push(move);
          }
          
          return newState;
        });

        // Only send to server if NOT stacking
        if (!isStacking) {
          setIsPendingMove(true);
          
          const networkMove = {
            gameId: config.gameId,
            playerId: config.localPlayerId,
            moveType: 'play' as const,
            payload: { cardIndex },
            timestamp: Date.now(),
            clientSequence: sequence,
            actionId,
          };

          await clientRef.current.sendMove(networkMove);
          console.log('[PlayCard] Move sent, waiting for server sync');
        } else {
          console.log('[PlayCard] Stacking move - will send with stack');
        }
      } catch (error) {
        console.error('Failed to send move:', error);
        setToastMsg('Sync error - please try again');
        syncRequest();
      }
    },
    [state, config.gameId, config.localPlayerId, applyMoveToState, syncRequest],
  );

  const playStack = useCallback(async () => {
    if (!state || state.stack.length === 0) return;

    console.log('[PlayStack] Attempting to play stack', { 
      stackLength: state.stack.length, 
      stack: state.stack.map(c => c.id),
      wildSuit: state.wildSuit 
    });

    try {
      const actionId = `playStack-${Date.now()}`;
      const sequence = moveSequence.current++;
      
      // Determine if we need a wildSuit (if any card in stack is Jack or Joker)
      let wildSuit = state.wildSuit;
      if (!wildSuit && state.stack.some(c => c.value === 'jack' || c.value === 'joker')) {
        wildSuit = 'hearts'; // Default to hearts if not set
      }

      const move: PendingMove = { 
        type: 'playStack', 
        payload: { wildSuit }, 
        actionId,
        timestamp: Date.now(),
        sequence,
      };

      // Optimistically update local state
      setState(prevState => {
        if (!prevState) return prevState;
        const newState = applyMoveToState(prevState, move, config.localPlayerId);
        pendingMovesRef.current.push(move);
        return newState;
      });

      setIsPendingMove(true);

      const networkMove = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'playStack' as const,
        payload: { 
          cards: state.stack.map(c => ({ suit: c.suit, value: c.value, id: c.id })),
          wildSuit: wildSuit 
        },
        timestamp: Date.now(),
        clientSequence: sequence,
        actionId,
      };

      console.log('[PlayStack] FINAL payload being sent:', JSON.stringify(networkMove.payload));
      console.log('[PlayStack] state.stack at send time:', JSON.stringify(state.stack.map(c => c.id)));
      await clientRef.current.sendMove(networkMove);
      console.log('[PlayStack] Success');
    } catch (error: any) {
      console.error('[PlayStack] Failed:', error.message);
      setToastMsg(error.message || 'Failed to sync stack');
      syncRequest();
    }
  }, [state, config.gameId, config.localPlayerId, applyMoveToState, syncRequest]);


  const undoStackCard = useCallback(async (stackIndex: number) => {
    if (!state) return;

    try {
      const actionId = `undo-${Date.now()}`;
      const sequence = moveSequence.current++;
      const move: PendingMove = { 
        type: 'undoStack', 
        payload: { stackIndex }, 
        actionId,
        timestamp: Date.now(),
        sequence,
      };

      // Optimistically update local state
      setState(prevState => {
        if (!prevState) return prevState;
        const newState = applyMoveToState(prevState, move, config.localPlayerId);
        pendingMovesRef.current.push(move);
        return newState;
      });

      setIsPendingMove(true);

      const networkMove = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'undoStack' as const,
        payload: { stackIndex },
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
        actionId,
      };

      await clientRef.current.sendMove(networkMove);
    } catch (error) {
      console.error('Failed to undo stack card:', error);
      syncRequest();
    }
  }, [state, config.gameId, config.localPlayerId, applyMoveToState, syncRequest]);



  const drawCard = useCallback(async () => {
    if (!state) return;

    try {
      const actionId = `draw-${Date.now()}`;
      const sequence = moveSequence.current++;
      const move: PendingMove = { 
        type: 'draw', 
        payload: {}, 
        actionId,
        timestamp: Date.now(),
        sequence,
      };

      // Optimistically update local state
      setState(prevState => {
        if (!prevState) return prevState;
        const newState = applyMoveToState(prevState, move, config.localPlayerId);
        pendingMovesRef.current.push(move);
        return newState;
      });

      setIsPendingMove(true);
      
      const networkMove = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'draw' as const,
        payload: {},
        timestamp: Date.now(),
        clientSequence: sequence,
        actionId,
      };

      await clientRef.current.sendMove(networkMove);
    } catch (error) {
      console.error('Failed to send move:', error);
      setToastMsg('Failed to draw card');
      syncRequest();
    }
  }, [state, config.gameId, config.localPlayerId, applyMoveToState, syncRequest]);

  const callLastCard = useCallback(async () => {
    if (!state) return;

    try {
      const actionId = `call-${Date.now()}`;
      const sequence = moveSequence.current++;
      const move: PendingMove = { 
        type: 'callLastCard', 
        payload: {}, 
        actionId,
        timestamp: Date.now(),
        sequence,
      };

      // Optimistically update local state
      setState(prevState => {
        if (!prevState) return prevState;
        const newState = applyMoveToState(prevState, move, config.localPlayerId);
        pendingMovesRef.current.push(move);
        return newState;
      });

      setIsPendingMove(true);
      
      const networkMove = {
        gameId: config.gameId,
        playerId: config.localPlayerId,
        moveType: 'callLastCard' as const,
        payload: {},
        timestamp: Date.now(),
        clientSequence: moveSequence.current++,
        actionId,
      };

      await clientRef.current.sendMove(networkMove);
    } catch (error) {
      console.error('Failed to send move:', error);
      setToastMsg('Failed to call Last Card');
      syncRequest();
    }
  }, [state, config.gameId, config.localPlayerId, applyMoveToState, syncRequest]);

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

  const consumeAnimTrigger = useCallback(() => {
    setAnimTriggers({});
  }, []);

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
    animTriggers,
  };
}
