// Local game manager - handles CPU players and artificial delays for local mode
import {
  GameState,
  GameEvent,
  createPlayer,
  createLocalCP,
  createInitialState,
  Card,
  Player,
} from './gameState';
import * as rules from './gameRules';
import { buildDeck } from './gameRules';
import { isSpecial } from './cpuAI';

export interface LocalGameConfig {
  humanPlayerCount?: 1;
  cpuPlayerCount: 1 | 2 | 3;
  cpuDelay?: number; // milliseconds (default 1500)
}

function calculatePoints(hand: Card[]): number {
  return hand.reduce((sum, card) => {
    switch (card.value) {
      case 'joker': return sum + 50;
      case 'jack': return sum + 25;
      case '2': return sum + 20;
      case 'king': return sum + 4;
      case 'queen': return sum + 5;
      case 'ace': return sum + 1;
      default:
        const val = parseInt(card.value);
        return sum + (isNaN(val) ? 10 : val);
    }
  }, 0);
}

export class LocalGameManager {
  state: GameState;
  cpuDelay: number;
  private events: GameEvent[] = [];
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(config: LocalGameConfig) {
    this.cpuDelay = config.cpuDelay || 1500;
    this.state = createInitialState('local');
  }

  /**
   * Initialize a new local game with specified player counts
   */
  initializeGame(config: LocalGameConfig) {
    console.log('[LocalGameManager] initializeGame called with config:', config);
    this.clearTimeouts();
    const totalPlayers = 1 + config.cpuPlayerCount;
    console.log('[LocalGameManager] Total players:', totalPlayers);

    const players: Player[] = [createPlayer(0, 'You', true)];
    for (let i = 1; i < totalPlayers; i++) {
      players.push(createLocalCP(i));
    }

    console.log('[LocalGameManager] Players created:', players.map(p => ({ id: p.id, name: p.name, isLocal: p.isLocal })));

    this.state = createInitialState('local', players);
    this.startNewRound();
    
    // Store onChange callback for use in CPU turns
    if ((config as any).onChangeCallback) {
      (this as any)._onChangeCallback = (config as any).onChangeCallback;
    }
  }

  private startNewRound() {
    this.state.deck = buildDeck();
    this.state.discard = [];
    this.state.stack = [];
    this.state.pending = 0;
    this.state.jokerOnTop = false;
    this.state.jokerWild = false;
    this.state.wildSuit = null;
    this.state.over = false;

    // Deal 7 cards to active players
    const activePlayers = this.state.players.filter(p => !p.isEliminated);
    for (let i = 0; i < 7; i++) {
      activePlayers.forEach(p => {
        if (this.state.deck.length > 0) {
          p.hand.push(this.state.deck.pop()!);
        }
      });
    }

    // Draw initial discard card (not a special card)
    let initialCard: Card;
    do {
      initialCard = this.state.deck.pop()!;
    } while (['joker', '2', '7', '8', 'jack'].includes(initialCard.value));
    this.state.discard.push(initialCard);

    // Pick first active player
    this.state.turnIndex = this.state.players.findIndex(p => !p.isEliminated);
    this.emitStatus(this.state.players[this.state.turnIndex].isLocal ? 'Your turn — play a card or draw' : `${this.state.players[this.state.turnIndex].name}'s turn...`);
    
    // If CPU starts, schedule it
    if (!this.state.players[this.state.turnIndex].isLocal) {
      console.log('[Game] CPU starting, scheduling first turn...');
      const timeoutId = setTimeout(() => {
        console.log('[Game] Executing first CPU turn');
        this.executeCPUTurn();
      }, this.cpuDelay);
      this.pendingTimeouts.push(timeoutId);
    }
  }

  private handleVictory(winner: Player) {
    const activePlayers = this.state.players.filter(p => !p.isEliminated);
    
    if (activePlayers.length <= 2) {
      // Game over
      this.state.over = true;
      const loser = activePlayers.find(p => p.id !== winner.id);
      if (loser) loser.isEliminated = true;
      
      this.emitModal(
        winner.isLocal ? 'You Win!' : winner.name + ' Wins!',
        'Game over!',
      );
    } else {
      // Round over, eliminate highest points
      let maxPoints = -1;
      let playerToEliminate: Player | null = null;

      for (const p of activePlayers) {
        if (p.id !== winner.id) {
          const points = calculatePoints(p.hand);
          p.points = (p.points || 0) + points; // Keep track of cumulative or just this round? Server seems to replace.
          if (points > maxPoints) {
            maxPoints = points;
            playerToEliminate = p;
          }
        } else {
          // Winner of round gets 0 points for the round
        }
      }

      if (playerToEliminate) {
        playerToEliminate.isEliminated = true;
        this.emitModal(
          winner.isLocal ? 'You Won the Round!' : winner.name + ' Won the Round!',
          `${playerToEliminate.name} is eliminated with ${maxPoints} points. Starting next round...`,
        );
      }

      // Reset for next round - done after modal is closed in useLocalGame usually, 
      // but here we need to prepare the state.
      this.state.players.forEach(p => p.hand = []);
      // We will call startNewRound when the modal is acknowledged or after a delay.
      // To keep it consistent with the event loop, we'll let useLocalGame trigger it or do it here with a flag.
    }
  }

  /**
   * Reset for next round (called from hook after modal)
   */
  nextRound() {
    if (this.state.over) return;
    this.startNewRound();
  }

  /**
   * Play card from hand
   */
  playCard(cardIndex: number): GameState {
    const result = rules.playCard(this.state, 0, cardIndex);
    this.state = result.state;

    if (result.success) {
      // Only toast for important events
      if (result.message === 'Victory') {
        this.emitToast(result.message);
      }
      // Toast for uncalled last card penalty (2 cards)
      if (result.message === 'Card played' && this.state.players[0].hand.length === 0 && !this.state.players[0].lastCalled) {
        this.emitToast('No last call! Draw 2 penalty cards');
      }
      // Toast for victory draw scenario (jack-bridge or special finish)
      if (this.state.players[0].victoryDrawPending) {
        this.emitToast('Draw one card to win');
      }
      if (result.winner) {
        this.handleVictory(result.winner);
      } else if (this.state.stack.length === 0) {
        // Only advance turn if no stack is active
        this.scheduleNextTurn();
      }
    } else {
      this.emitToast(result.message);
    }

    return this.state;
  }

  /**
   * Play stack
   */
  playStack(): GameState {
    const result = rules.playStack(this.state, 0);
    this.state = result.state;

    if (result.success) {
      if (result.winner) {
        this.emitToast('Victory!');
        this.handleVictory(result.winner);
      } else {
        this.scheduleNextTurn();
      }
    }

    return this.state;
  }

  /**
   * Undo stack card
   */
  undoStackCard(stackIndex: number): GameState {
    if (stackIndex < 0 || stackIndex >= this.state.stack.length) {
      return this.state;
    }
    const result = rules.undoStackCard(this.state, 0, stackIndex);
    this.state = result.state;
    return this.state;
  }

  /**
   * Draw card
   */
  drawCard(): GameState {
    const result = rules.drawCard(this.state, 0);
    this.state = result.state;

    if (result.success) {
      if (result.winner) {
        this.handleVictory(result.winner);
      } else {
        // Only toast for draw penalty events or special draw messages
        if (result.message.includes('Drew') && this.state.pending > 0) {
          this.emitToast('Draw penalty: ' + this.state.pending);
        } else if (result.message !== 'Cards drawn' && result.message !== 'Drew 1 card(s)') {
          this.emitToast(result.message);
        }
        // Schedule CPU turn after delay
        this.scheduleNextTurn();
      }
    } else {
      this.emitToast(result.message);
    }

    return this.state;
  }

  /**
   * Call last card
   */
  callLastCard(): GameState {
    const result = rules.callLastCard(this.state, 0);
    this.state = result.state;
    this.emitToast(result.message);
    return this.state;
  }

  /**
   * Rotate player's hand view
   */
  rotateHand(direction: number): GameState {
    const player = this.state.players[0];
    const n = player.hand.length;
    if (!n) return this.state;
    this.state.offset = ((this.state.offset + direction) + n) % n;
    return this.state;
  }

  /**
   * Get best playable card for CPU
   */
  private selectBestCPUCard(hand: Card[]): Card | null {
    const playable = hand.filter(c => rules.isPlayable(this.state, c));
    if (playable.length === 0) return null;

    // Prefer special cards
    playable.sort(
      (a, b) =>
        (isSpecial(b) ? 1 : 0) - (isSpecial(a) ? 1 : 0),
    );

    return playable[0];
  }

  /**
   * Get best playable cards for stack
   */
  private selectBestCPUStack(hand: Card[]): Card[] {
    const stack: Card[] = [];
    const available = [...hand];

    const first = this.selectBestCPUCard(available);
    if (!first) return [];

    stack.push(first);
    available.splice(available.indexOf(first), 1);

    // Try to add matching cards to stack
    while (true) {
      const next = available.find(c => rules.canPlayOnStack(this.state, c, stack));
      if (next) {
        stack.push(next);
        available.splice(available.indexOf(next), 1);
      } else {
        break;
      }
    }

    return stack;
  }

  /**
   * Execute CPU turn - simplified version
   */
  private executeCPUTurn() {
    console.log('>>> executeCPUTurn CALLED', this.state.turnIndex);
    
    if (this.state.over) {
      console.log('>>> Game is over, skipping');
      return;
    }

    const player = this.state.players[this.state.turnIndex];
    if (!player) {
      console.log('>>> No player at turn index', this.state.turnIndex);
      return;
    }

    if (player.isEliminated) {
      console.log('>>> Player is eliminated, skipping');
      this.scheduleNextTurn();
      return;
    }

    if (player.isLocal) {
      console.log('>>> Player is local (human), skipping');
      return;
    }

    console.log('>>> CPU Player:', player.name, 'Hand size:', player.hand.length);

    // CRITICAL: We need to trigger onChange from here!
    // Store the onChange callback for use in executeCPUTurn
    const onChange = (this as any)._onChangeCallback;

    // Handle victory draw
    if (player.victoryDrawPending) {
      console.log('>>> CPU performing victory draw');
      const result = rules.drawCard(this.state, this.state.turnIndex);
      this.state = result.state;
      
      if (result.winner) {
        this.handleVictory(result.winner);
      } else {
        this.emitToast(result.message);
      }
      
      if (onChange) onChange();
      this.scheduleNextTurn();
      return;
    }

    // Handle pending (draw penalty)
    if (this.state.pending > 0) {
      console.log('>>> Handling pending penalty:', this.state.pending);
      const counter = player.hand.find(c => rules.canCounterPending(this.state, c));
      if (counter) {
        console.log('>>> CPU counters with:', counter.id);
        const result = rules.playCard(this.state, this.state.turnIndex, player.hand.indexOf(counter));
        this.state = result.state;
        if (onChange) onChange();
        this.scheduleNextTurn();
        return;
      }

      console.log('>>> CPU draws penalty cards');
      const pendingCount = this.state.pending;
      const drawResult = rules.drawCard(this.state, this.state.turnIndex);
      this.state = drawResult.state;
      this.emitToast(player.name + ' draws ' + pendingCount + ' cards!');
      if (onChange) onChange();
      this.scheduleNextTurn();
      return;
    }

    // Try to play stack - immediately play it, not leave for player
    const stackCards = this.selectBestCPUStack(player.hand);
    if (stackCards.length > 1) {
      console.log('>>> CPU plays stack of', stackCards.length, 'cards - committing to discard');
      
      // Add cards to stack and immediately play them (commit to discard)
      this.state.stack = stackCards;
      stackCards.forEach(c => {
        player.hand.splice(player.hand.indexOf(c), 1);
      });
      
      // Immediately commit stack to discard (like the player does with playStack)
      const stackResult = rules.playStack(this.state, this.state.turnIndex);
      this.state = stackResult.state;
      
      // Toast for victory draw scenario (jack-bridge or special finish)
      if (this.state.players[this.state.turnIndex].victoryDrawPending) {
        this.emitToast('Draw one card to win');
      }
      
      if (onChange) onChange();
      
      if (stackResult.winner) {
        this.handleVictory(stackResult.winner);
      } else {
        this.scheduleNextTurn();
      }
      return;
    }

    // Try to play single card
    const card = this.selectBestCPUCard(player.hand);
    if (card) {
      console.log('>>> CPU plays card:', card.id);
      const result = rules.playCard(this.state, this.state.turnIndex, player.hand.indexOf(card));
      this.state = result.state;
      
      // Trigger re-render
      if (onChange) onChange();

      // Toast for uncalled last card penalty (2 cards)
      if (result.message === 'Card played' && this.state.players[this.state.turnIndex].hand.length === 0 && !this.state.players[this.state.turnIndex].lastCalled) {
        this.emitToast('No last call! Draw 2 penalty cards');
      }
      // Toast for victory draw scenario (jack-bridge or special finish)
      if (this.state.players[this.state.turnIndex].victoryDrawPending) {
        this.emitToast('Draw one card to win');
      }

      if (result.winner) {
        this.handleVictory(result.winner);
      } else {
        this.scheduleNextTurn();
      }
      return;
    }

    // Draw if no playable cards
    console.log('>>> CPU has no playable cards, drawing');
    const drawResult = rules.drawCard(this.state, this.state.turnIndex);
    this.state = drawResult.state;
    if (onChange) onChange();
    this.scheduleNextTurn();
  }

  /**
   * Schedule next action (CPU turn or player notification)
   */
  private scheduleNextTurn() {
    if (this.state.over) return;

    // Keep advancing until we find a non-eliminated player
    let nextIdx = rules.computeNextTurnIndex(this.state);
    let iterations = 0;
    while (this.state.players[nextIdx]?.isEliminated && iterations < 10) {
      nextIdx = rules.computeNextTurnIndex(this.state);
      iterations++;
    }
    
    this.state.turnIndex = nextIdx;
    this.state = rules.autoCallLastCardCPU(this.state);

    const nextPlayer = this.state.players[nextIdx];
    if (!nextPlayer) {
      console.error('No player found at index:', nextIdx, 'players:', this.state.players.length);
      return;
    }

    if (nextPlayer.isLocal) {
      this.emitStatus('Your turn — play a card or draw');
    } else {
      console.log('[scheduleNextTurn] Scheduling CPU turn for:', nextPlayer.name);
      this.emitStatus(nextPlayer.name + "'s turn...");
      // Schedule CPU turn
      const timeoutId = setTimeout(() => this.executeCPUTurn(), this.cpuDelay);
      this.pendingTimeouts.push(timeoutId);
    }
  }

  /**
   * Schedule stack play with delay
   */
  private schedulePlayStack() {
    this.pendingTimeouts.push(
      setTimeout(() => {
        const result = rules.playStack(this.state, this.state.turnIndex);
        this.state = result.state;

        if (result.winner) {
          this.handleVictory(result.winner);
        }

        this.scheduleNextTurn();
      }, 1200),
    );
  }

  /**
   * Get playable status for card
   */
  isPlayable(card: Card): boolean {
    return rules.isPlayable(this.state, card);
  }

  /**
   * Check if can call last card
   */
  canCallLastCard(player: Player): boolean {
    return rules.canCallLastCard(player);
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

  clearTimeouts() {
    this.pendingTimeouts.forEach(t => clearTimeout(t));
    this.pendingTimeouts = [];
  }
}
