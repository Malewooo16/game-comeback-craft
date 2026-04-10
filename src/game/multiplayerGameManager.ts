// Multiplayer game manager - syncs state via Pusher, no artificial delays
import {
  GameState,
  GameEvent,
  createInitialState,
  Card,
  Player,
  createPlayer,
} from './gameState';
import * as rules from './gameRules';
import { buildDeck } from './gameRules';

export interface MultiplayerGameConfig {
  gameId: string;
  localPlayerId: number;
  players: Player[];
}

export interface MoveEvent {
  gameId: string;
  playerId: number;
  timestamp: number;
  moveType: 'play' | 'draw' | 'callLastCard' | 'undoStack' | 'playStack' | 'rotateHand';
  payload: unknown;
  stateHash: string;
}

export interface PusherService {
  broadcastMove(event: MoveEvent): Promise<void>;
  onRemoteMove(callback: (event: MoveEvent) => void): () => void;
  syncGameState(state: GameState): Promise<void>;
  joinGameChannel(gameId: string): Promise<void>;
  leaveGame(gameId: string): void;
}

export class MultiplayerGameManager {
  state: GameState;
  gameId: string;
  localPlayerId: number;
  pusher: PusherService;
  private events: GameEvent[] = [];
  private unsubscribePusher?: () => void;

  constructor(config: MultiplayerGameConfig, pusher: PusherService) {
    this.gameId = config.gameId;
    this.localPlayerId = config.localPlayerId;
    this.pusher = pusher;

    this.state = createInitialState('multiplayer', config.players);
    this.state.gameId = config.gameId;
    this.state.deck = buildDeck();

    // Deal 7 cards
    for (let i = 0; i < 7; i++) {
      config.players.forEach(p => {
        if (this.state.deck.length > 0) {
          p.hand.push(this.state.deck.pop()!);
        }
      });
    }

    let initialCard: Card;
    do {
      initialCard = this.state.deck.pop()!;
    } while (['joker', '2', '7', '8', 'jack'].includes(initialCard.value));
    this.state.discard.push(initialCard);

    // Randomly pick starting player
    this.state.turnIndex = Math.floor(Math.random() * config.players.length);
  }

  /**
   * Initialize Pusher connection and listen for remote moves
   */
  async joinGame() {
    await this.pusher.joinGameChannel(this.gameId);
    this.unsubscribePusher = this.pusher.onRemoteMove(event => this.handleRemoteMove(event));
    this.emitStatus(`${this.state.players[this.state.turnIndex].name}'s turn`);
  }

  /**
   * Play card (optimistic update, then broadcast)
   */
  async playCard(cardIndex: number): Promise<GameState> {
    const result = rules.playCard(this.state, this.localPlayerId, cardIndex);
    this.state = result.state;

    if (result.success) {
      const move: MoveEvent = {
        gameId: this.gameId,
        playerId: this.localPlayerId,
        timestamp: Date.now(),
        moveType: 'play',
        payload: { cardIndex },
        stateHash: this.hashState(this.state),
      };
      await this.pusher.broadcastMove(move);

      if (result.winner) {
        this.emitModal(
          this.localPlayerId === result.winner.id ? 'You Win!' : result.winner.name + ' Wins!',
          'Game over!',
        );
      }
    } else {
      this.emitToast(result.message);
    }

    return this.state;
  }

  /**
   * Play stack
   */
  async playStack(): Promise<GameState> {
    const result = rules.playStack(this.state, this.localPlayerId);
    this.state = result.state;

    if (result.success) {
      const move: MoveEvent = {
        gameId: this.gameId,
        playerId: this.localPlayerId,
        timestamp: Date.now(),
        moveType: 'playStack',
        payload: {},
        stateHash: this.hashState(this.state),
      };
      await this.pusher.broadcastMove(move);

      if (result.winner) {
        this.emitModal(
          this.localPlayerId === result.winner.id ? 'You Win!' : result.winner.name + ' Wins!',
          'Game over!',
        );
      }
    }

    return this.state;
  }

  /**
   * Undo stack card
   */
  undoStackCard(stackIndex: number): GameState {
    const result = rules.undoStackCard(this.state, stackIndex);
    this.state = result.state;
    return this.state;
  }

  /**
   * Draw card
   */
  async drawCard(): Promise<GameState> {
    const result = rules.drawCard(this.state, this.localPlayerId);
    this.state = result.state;

    if (result.success) {
      const move: MoveEvent = {
        gameId: this.gameId,
        playerId: this.localPlayerId,
        timestamp: Date.now(),
        moveType: 'draw',
        payload: {},
        stateHash: this.hashState(this.state),
      };
      await this.pusher.broadcastMove(move);
    } else {
      this.emitToast(result.message);
    }

    return this.state;
  }

  /**
   * Call last card
   */
  async callLastCard(): Promise<GameState> {
    const result = rules.callLastCard(this.state, this.localPlayerId);
    this.state = result.state;

    if (result.success) {
      const move: MoveEvent = {
        gameId: this.gameId,
        playerId: this.localPlayerId,
        timestamp: Date.now(),
        moveType: 'callLastCard',
        payload: {},
        stateHash: this.hashState(this.state),
      };
      await this.pusher.broadcastMove(move);
    }

    return this.state;
  }

  /**
   * Rotate hand (local-only, no broadcast)
   */
  rotateHand(direction: number): GameState {
    const player = this.state.players[this.localPlayerId];
    const n = player.hand.length;
    if (!n) return this.state;
    this.state.offset = ((this.state.offset + direction) + n) % n;
    return this.state;
  }

  /**
   * Handle incoming move from remote player
   */
  private handleRemoteMove(event: MoveEvent) {
    // Validate state consistency
    if (!this.validateMoveConsistency(event)) {
      this.emitToast('State mismatch detected, requesting full sync...');
      // In production, trigger full state resync from server
      return;
    }

    // Apply move based on type
    switch (event.moveType) {
      case 'play': {
        const payload = event.payload as { cardIndex: number };
        const result = rules.playCard(this.state, event.playerId, payload.cardIndex);
        this.state = result.state;
        this.emitToast(`${this.state.players[event.playerId].name} played a card`);
        break;
      }
      case 'draw': {
        const result = rules.drawCard(this.state, event.playerId);
        this.state = result.state;
        this.emitToast(`${this.state.players[event.playerId].name} drew a card`);
        break;
      }
      case 'playStack': {
        const result = rules.playStack(this.state, event.playerId);
        this.state = result.state;
        this.emitToast(`${this.state.players[event.playerId].name} played stack`);
        break;
      }
      case 'callLastCard': {
        const result = rules.callLastCard(this.state, event.playerId);
        this.state = result.state;
        this.emitToast(`${this.state.players[event.playerId].name}: Last Card!`);
        break;
      }
      case 'undoStack': {
        const payload = event.payload as { stackIndex: number };
        rules.undoStackCard(this.state, payload.stackIndex);
        this.emitToast('Card removed from stack');
        break;
      }
    }

    // Update turn display
    this.emitStatus(`${this.state.players[this.state.turnIndex].name}'s turn`);
  }

  /**
   * Validate move consistency with current state
   */
  private validateMoveConsistency(event: MoveEvent): boolean {
    // For now, simple check - in production use merkle tree or full state hash
    return true; // TODO: implement proper validation
  }

  /**
   * Generate simple hash of game state for consistency checks
   */
  private hashState(state: GameState): string {
    const data = JSON.stringify({
      turnIndex: state.turnIndex,
      pending: state.pending,
      discardCount: state.discard.length,
      deckCount: state.deck.length,
      playersHandCount: state.players.map(p => p.hand.length),
    });
    return btoa(data); // Simple base64 encoding for demo
  }

  /**
   * Check if can call last card
   */
  canCallLastCard(player: Player): boolean {
    return rules.canCallLastCard(player);
  }

  /**
   * Check if card is playable
   */
  isPlayable(card: Card): boolean {
    return rules.isPlayable(this.state, card);
  }

  // Event emission
  private emit(event: GameEvent) {
    this.events.push(event);
  }

  private emitToast(message: string) {
    this.emit({ type: 'toast', message });
  }

  private emitStatus(message: string) {
    this.emit({ type: 'status', message });
  }

  private emitModal(title: string, message: string) {
    this.emit({ type: 'modal', title, message });
  }

  flushEvents(): GameEvent[] {
    const e = [...this.events];
    this.events = [];
    return e;
  }

  cleanup() {
    this.unsubscribePusher?.();
    this.pusher.leaveGame(this.gameId);
  }
}
