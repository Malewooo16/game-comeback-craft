// Pure game rules engine - NO side effects, NO timeouts, NO events
import { Card, GameState, Player, GameMoveResult, SUITS, VALUES } from './gameState';

// ============ DECK UTILITIES ============

function shuffle(a: Card[]): Card[] {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) {
    for (const v of VALUES) {
      d.push({ suit: s, value: v, id: v + '_of_' + s });
    }
  }
  d.push({ suit: 'red', value: 'joker', id: 'red_joker' });
  d.push({ suit: 'black', value: 'joker', id: 'black_joker' });
  return shuffle(d);
}

// ============ DECK STATE OPERATIONS ============

export function drawCards(state: GameState, count: number): { state: GameState; cards: Card[] } {
  const newState = { ...state };
  const cards: Card[] = [];
  let remaining = count;

  while (remaining > 0) {
    if (newState.deck.length === 0) {
      // Reshuffle: move discard back to deck (keeping top card)
      if (newState.discard.length <= 1) break;
      const topCard = newState.discard[newState.discard.length - 1];
      const reshuffled = newState.discard.slice(0, -1).filter(c => c.value !== 'joker');
      newState.deck = shuffle(reshuffled);
      newState.discard = [topCard];
    }

    if (newState.deck.length > 0) {
      cards.push(newState.deck.pop()!);
      remaining--;
    } else {
      break;
    }
  }

  return { state: newState, cards };
}

// ============ CARD VALIDATION ============

function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1];
}

function effectiveCard(state: GameState): Card {
  const top = topCard(state);
  if (top.value === 'joker' && state.pending === 0 && state.jokerPrev && !state.jokerWild) {
    return state.jokerPrev;
  }
  return top;
}

function stackTop(state: GameState, customStack?: Card[]): Card {
  const s = customStack || state.stack;
  return s.length > 0 ? s[s.length - 1] : effectiveCard(state);
}

export function canPlayOnStack(state: GameState, card: Card, customStack?: Card[]): boolean | null {
  const s = customStack || state.stack;
  if (s.length === 0) return null;
  const t = s[s.length - 1];
  if (card.value === 'jack' && s.some(c => c.value !== 'jack')) return false;
  if (s.every(c => c.value === 'jack')) return true;
  return card.value === t.value;
}

export function canCounterPending(state: GameState, card: Card): boolean | null {
  if (state.pending === 0) return null;
  const tc = topCard(state);
  if (tc.value === 'joker') return card.value === 'joker';
  if (tc.value === '2') return card.value === '2' || card.value === 'joker';
  return false;
}

export function isPlayable(state: GameState, card: Card): boolean {
  const pendingResult = canCounterPending(state, card);
  if (pendingResult !== null) return pendingResult;

  const stackResult = canPlayOnStack(state, card);
  if (stackResult !== null) return stackResult;

  const t = stackTop(state);
  if (t.value === 'jack') return true;
  if (state.jokerWild) return true;
  if (card.value === 'jack') return true;
  if (card.value === 'joker') return true;
  return card.suit === t.suit || card.value === t.value;
}

export function canCallLastCard(player: Player): boolean {
  if (player.hand.length === 0) return false;
  if (player.hand.length === 1) return true;
  const firstVal = player.hand[0].value;
  return player.hand.every(c => c.value === firstVal);
}

// ============ SPECIAL CARD LOGIC ============

function isSpecial(card: Card): boolean {
  return !['ace', '3', '4', '5', '6', '9', '10', 'queen', 'king'].includes(card.value);
}

export function isSpecialCard(card: Card): boolean {
  return isSpecial(card);
}

function getBestSuit(hand: Card[]): string {
  const counts: Record<string, number> = {};
  hand.forEach(c => {
    if (c.suit !== 'red' && c.suit !== 'black') {
      counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
  });
  let best = 'hearts',
    max = -1;
  for (const s in counts) {
    if (counts[s] > max) {
      max = counts[s];
      best = s;
    }
  }
  return best;
}

export function applySpecialCard(state: GameState, card: Card, wildSuit?: string | null): GameState {
  const newState = { ...state };

  if (card.value !== 'joker') newState.jokerWild = false;

  if (card.value === '2') {
    newState.pending += 2;
  } else if (card.value === 'joker') {
    const prev = newState.discard[newState.discard.length - 2] || null;
    if (prev && prev.value === 'joker') {
      newState.jokerWild = true;
      newState.jokerOnTop = false;
      newState.wildSuit = wildSuit || getBestSuit(newState.players[newState.turnIndex].hand);
    } else {
      newState.jokerOnTop = true;
      newState.jokerPrev = prev;
    }
    newState.pending += 5;
  } else if (card.value === '8') {
    newState.dir *= -1;
  } else if (card.value === 'jack') {
    newState.jokerWild = false;
    newState.jokerOnTop = false;
    newState.wildSuit = wildSuit || null;
  }

  return newState;
}

// ============ TURN MANAGEMENT ============

export function computeNextTurnIndex(state: GameState): number {
  const activePlayers = state.players.filter(p => !p.isEliminated);
  const numPlayers = activePlayers.length;
  if (numPlayers < 2) return state.turnIndex;

  // Find current player's index in active players
  const currentPlayer = state.players[state.turnIndex];
  const currentActiveIdx = activePlayers.indexOf(currentPlayer);
  if (currentActiveIdx === -1) {
    // Current player is eliminated, find first active player
    return state.players.findIndex(p => !p.isEliminated);
  }

  let totalSkips = 0;
  for (let i = state.discard.length - 1; i >= 0; i--) {
    if (state.discard[i].value === '7') totalSkips++;
    else break;
  }

  let step = state.dir;
  
  // Handle 8 as skip in 1v1
  const lastPlayed = state.discard[state.discard.length - 1];
  if (numPlayers === 2 && lastPlayed && lastPlayed.value === '8') {
    step = 0;
  } else if (totalSkips > 0) {
    step = state.dir * (totalSkips + 1);
  }

  const nextActiveIdx = (currentActiveIdx + step + (numPlayers * 10)) % numPlayers;
  return state.players.indexOf(activePlayers[nextActiveIdx]);
}

export function autoCallLastCardCPU(state: GameState): GameState {
  const newState = { ...state };
  newState.players.forEach(p => {
    if (!p.isLocal && !p.lastCalled && canCallLastCard(p)) {
      p.lastCalled = true;
    }
  });
  return newState;
}

// ============ VICTORY DETECTION ============

export function checkVictory(state: GameState, player: Player, playedCards: Card[]): { won: boolean; reason?: string } {
  if (player.hand.length === 0) {
    const playedJacks = playedCards.filter(c => c.value === 'jack');
    if (playedJacks.length > 0) {
      return { won: false, reason: 'jack-bridge' };
    }
    if (!player.lastCalled) {
      return { won: false, reason: 'not-called' };
    }
    const lastCard = playedCards[playedCards.length - 1];
    if (isSpecial(lastCard)) {
      return { won: false, reason: 'special-finish' };
    }
    return { won: true, reason: 'normal' };
  }
  return { won: false };
}

export function applyVictoryPenalty(state: GameState, player: Player): GameState {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const targetPlayer = newState.players[newState.players.indexOf(player)];
  const { state: drawState, cards } = drawCards(newState, 2);
  targetPlayer.hand.push(...cards);
  return drawState;
}

export function applyVictoryDraw(state: GameState, player: Player): GameState {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const targetPlayer = newState.players[newState.players.indexOf(player)];
  targetPlayer.victoryDrawPending = true;
  targetPlayer.victoryWild = state.jokerWild;
  return newState;
}

export function processVictoryDraw(state: GameState, player: Player, drawnCard: Card): { state: GameState; won: boolean } {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const targetPlayer = newState.players[newState.players.indexOf(player)];

  if (!isSpecial(drawnCard)) {
    const tc = topCard(newState);
    let activeSuit: string = tc.suit;
    if (tc.value === 'jack' || newState.jokerWild) {
      activeSuit = newState.wildSuit || tc.suit;
    }
    if (drawnCard.suit === activeSuit) {
      return { state: newState, won: true };
    } else if (!newState.jokerWild && tc.value !== 'jack' && drawnCard.value === tc.value) {
      return { state: newState, won: true };
    }
  }

  targetPlayer.hand.push(drawnCard);
  targetPlayer.victoryDrawPending = false;
  targetPlayer.lastCalled = false;
  return { state: newState, won: false };
}

// ============ MAIN MOVE OPERATIONS ============

export function playCard(
  state: GameState,
  playerIndex: number,
  cardIndex: number,
  wildSuit?: string | null,
): GameMoveResult {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = newState.players[playerIndex];

  if (!player || newState.over) {
    return { state: newState, moveType: 'play', success: false, message: 'Game is over' };
  }

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    return { state: newState, moveType: 'play', success: false, message: 'Invalid card index' };
  }

  const card = player.hand[cardIndex];
  if (!isPlayable(newState, card)) {
    return { state: newState, moveType: 'play', success: false, message: "Can't play that card" };
  }

  player.hand.splice(cardIndex, 1);
  newState.offset = player.hand.length > 0 ? newState.offset % player.hand.length : 0;

  // For jokers: play immediately ONLY if it's the only one of its value in hand
  if (card.value === 'joker') {
    const otherJokers = player.hand.filter(c => c.value === 'joker');
    if (otherJokers.length === 0) {
      // Play directly to discard
      newState.discard.push(card);
      let resultState = applySpecialCard(newState, card, wildSuit);

      const victory = checkVictory(resultState, player, [card]);
      if (victory.won) {
        resultState.over = true;
        return {
          state: resultState,
          moveType: 'play',
          success: true,
          message: 'Victory',
          winner: player,
        };
      }

      if (victory.reason === 'not-called') {
        resultState = applyVictoryPenalty(resultState, player);
      } else if (victory.reason === 'jack-bridge' || victory.reason === 'special-finish') {
        resultState = applyVictoryDraw(resultState, player);
      }

      player.lastCalled = false;
      return { state: resultState, moveType: 'play', success: true, message: 'Card played' };
    }
    // Note: If otherJokers.length > 0, it falls through to the stack logic below
  }

  // If a stack is already active, add to it (for non-jokers, or jokers with siblings)
  if (newState.stack.length > 0) {
    newState.stack.push(card);
    return { state: newState, moveType: 'play', success: true, message: 'Card added to stack' };
  }

  // For jacks: always create stack (to allow bridging with any card)
  if (card.value === 'jack') {
    newState.stack.push(card);
    return { state: newState, moveType: 'play', success: true, message: 'Stack created' };
  }

  const sameValue = player.hand.filter(c => c.value === card.value);
  if (sameValue.length >= 1) {
    // Create stack
    newState.stack.push(card);
    return { state: newState, moveType: 'play', success: true, message: 'Stack created' };
  } else {
    // Play directly to discard
    newState.discard.push(card);
    let resultState = applySpecialCard(newState, card, wildSuit);

    const victory = checkVictory(resultState, player, [card]);
    if (victory.won) {
      resultState.over = true;
      return {
        state: resultState,
        moveType: 'play',
        success: true,
        message: 'Victory',
        winner: player,
      };
    }

    if (victory.reason === 'not-called') {
      resultState = applyVictoryPenalty(resultState, player);
    } else if (victory.reason === 'jack-bridge' || victory.reason === 'special-finish') {
      resultState = applyVictoryDraw(resultState, player);
    }

    player.lastCalled = false;
    return { state: resultState, moveType: 'play', success: true, message: 'Card played' };
  }
}

/**
 * Play all cards in stack to discard
 */
export function playStack(state: GameState, playerIndex: number, wildSuit?: string | null): GameMoveResult {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = newState.players[playerIndex];

  if (newState.stack.length === 0) {
    return { state: newState, moveType: 'playStack', success: false, message: 'No stack' };
  }

  const playedStack = [...newState.stack];
  playedStack.forEach(c => {
    newState.discard.push(c);
    const withSpecial = applySpecialCard(newState, c, wildSuit);
    Object.assign(newState, withSpecial);
  });
  newState.stack = [];

  const victory = checkVictory(newState, player, playedStack);
  if (victory.won) {
    newState.over = true;
    return {
      state: newState,
      moveType: 'playStack',
      success: true,
      message: 'Stack played - Victory!',
      winner: player,
    };
  }

  if (victory.reason === 'not-called') {
    const penaltyState = applyVictoryPenalty(newState, player);
    Object.assign(newState, penaltyState);
  } else if (victory.reason === 'jack-bridge' || victory.reason === 'special-finish') {
    const drawState = applyVictoryDraw(newState, player);
    Object.assign(newState, drawState);
  }

  player.lastCalled = false;
  return { state: newState, moveType: 'playStack', success: true, message: 'Stack played' };
}

/**
 * Remove card from stack and return to hand
 */
export function undoStackCard(state: GameState, playerIndex: number, stackIndex: number): GameMoveResult {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };

  if (stackIndex < 0 || stackIndex >= newState.stack.length) {
    return { state: newState, moveType: 'undoStack', success: false, message: 'Invalid stack index' };
  }

  const card = newState.stack.splice(stackIndex, 1)[0];
  newState.players[playerIndex].hand.push(card);

  return { state: newState, moveType: 'undoStack', success: true, message: 'Card removed from stack' };
}

/**
 * Draw cards (handles pending penalty or normal draw)
 */
export function drawCard(state: GameState, playerIndex: number): GameMoveResult {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = newState.players[playerIndex];

  if (newState.over) {
    return { state: newState, moveType: 'draw', success: false, message: 'Game is over' };
  }

  // Clear any active stack
  if (newState.stack.length > 0) {
    newState.stack = [];
  }

  let cardsToAdd = 1;
  if (newState.pending > 0) {
    cardsToAdd = newState.pending;
    newState.pending = 0;
    newState.jokerOnTop = false;
  }

  const { state: drawState, cards } = drawCards(newState, cardsToAdd);
  player.hand.push(...cards);

  return { state: drawState, moveType: 'draw', success: true, message: `Drew ${cardsToAdd} card(s)` };
}

/**
 * Call Last Card
 */
export function callLastCard(state: GameState, playerIndex: number): GameMoveResult {
  const newState = { ...state, players: state.players.map(p => ({ ...p })) };
  const player = newState.players[playerIndex];

  if (!canCallLastCard(player)) {
    return { state: newState, moveType: 'callLastCard', success: false, message: "Can't call yet" };
  }

  player.lastCalled = true;
  return { state: newState, moveType: 'callLastCard', success: true, message: 'Last Card called!' };
}
