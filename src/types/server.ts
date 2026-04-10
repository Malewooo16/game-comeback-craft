// Shared types between client and server
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'red' | 'black';
export type Value =
  | 'ace'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'jack'
  | 'queen'
  | 'king'
  | 'joker';

export interface Card {
  suit: Suit;
  value: Value;
  id: string;
}

export interface Player {
  id: number;
  name: string;
  isLocal: boolean;
  hand: Card[];
  lastCalled: boolean;
  victoryDrawPending: boolean;
  victoryWild?: boolean;
}

export interface GameState {
  gameId: string;
  deck: Card[];
  discard: Card[];
  players: Player[];
  turnIndex: number;
  dir: number;
  pending: number;
  offset: number;
  over: boolean;
  jokerPrev: Card | null;
  jokerOnTop: boolean;
  jokerWild: boolean;
  wildSuit: string | null;
  stack: Card[];
  oppStack: Card[];
  gameMode: 'local' | 'multiplayer';
  createdAt: number;
  updatedAt: number;
}

export interface GameMove {
  gameId: string;
  playerId: number;
  moveType: 'play' | 'draw' | 'callLastCard' | 'undoStack' | 'playStack' | 'rotateHand';
  payload: unknown;
  timestamp: number;
  clientSequence: number;
}

export interface GameMoveResponse {
  success: boolean;
  message: string;
  state?: GameState;
  error?: string;
}

export interface ServerMessage {
  type:
    | 'game-state'
    | 'move-applied'
    | 'invalid-move'
    | 'game-over'
    | 'player-joined'
    | 'player-left'
    | 'error'
    | 'heartbeat';
  gameId?: string;
  playerId?: number;
  data?: unknown;
  error?: string;
}

export interface ClientMessage {
  type: 'join-game' | 'make-move' | 'sync-request' | 'heartbeat';
  gameId?: string;
  playerId?: number;
  move?: GameMove;
}
