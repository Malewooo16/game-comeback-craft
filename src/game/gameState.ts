// Pure game state and type definitions
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export const VALUES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;

export type Suit = typeof SUITS[number] | 'red' | 'black';
export type Value = typeof VALUES[number] | 'joker';

export interface Card {
  suit: Suit;
  value: Value;
  id: string;
}

export interface Player {
  id: number;
  name: string;
  hand: Card[];
  lastCalled: boolean;
  victoryDrawPending: boolean;
  victoryWild?: boolean;
  isLocal: boolean; // true = human or controlled locally, false = remote
  isEliminated?: boolean;
  points?: number;
}

export interface GameState {
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
  gameId?: string;
  lastActionMessage?: string;
  lastActionPlayerId?: number;
}

export interface GameMoveResult {
  state: GameState;
  moveType: 'play' | 'draw' | 'callLastCard' | 'undoStack' | 'playStack';
  success: boolean;
  message: string;
  winner?: Player;
}

export type GameEvent =
  | { type: 'toast'; message: string }
  | { type: 'status'; message: string }
  | { type: 'modal'; title: string; message: string }
  | { type: 'animate_card'; card: Card; from: 'hand' | 'cpu'; playerId?: number }
  | { type: 'animate_stack'; cards: Card[] };

// CDN for card images
export const CDN = 'https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/png/';

export function cardUrl(card: Card): string {
  return CDN + card.id + '.png';
}

export const CPU_NAMES = ['Lucky Lucy', 'Card Shark', 'The Joker'];

// Player factory functions
export function createPlayer(
  id: number,
  name: string,
  isLocal: boolean,
): Player {
  return {
    id,
    name,
    hand: [],
    lastCalled: false,
    victoryDrawPending: false,
    victoryWild: false,
    isLocal,
  };
}

export function createLocalCP(id: number): Player {
  return createPlayer(id, CPU_NAMES[id - 1] || `CPU ${id}`, false);
}

// Initial state factory
export function createInitialState(gameMode: 'local' | 'multiplayer' = 'local', players?: Player[]): GameState {
  return {
    deck: [],
    discard: [],
    players: players || [],
    turnIndex: 0,
    dir: 1,
    pending: 0,
    offset: 0,
    over: false,
    jokerPrev: null,
    jokerOnTop: false,
    jokerWild: false,
    wildSuit: null,
    stack: [],
    oppStack: [],
    gameMode,
  };
}
