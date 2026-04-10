// CPU AI helper functions
import { Card, Player, GameState } from './gameState';
import * as rules from './gameRules';

/**
 * Check if a card is "special" (affects gameplay)
 */
export function isSpecial(card: Card): boolean {
  return !['ace', '3', '4', '5', '6', '9', '10', 'queen', 'king'].includes(
    card.value,
  );
}

/**
 * Select best single card for CPU to play
 */
export function selectBestCPUCard(state: GameState, hand: Card[]): Card | null {
  const playable = hand.filter(c => rules.isPlayable(state, c));
  if (playable.length === 0) return null;

  // Prefer special cards (they disrupt opponents)
  playable.sort((a, b) => (isSpecial(b) ? 1 : 0) - (isSpecial(a) ? 1 : 0));

  return playable[0];
}

/**
 * Select best stack of cards for CPU to play
 */
export function selectBestCPUStack(
  state: GameState,
  hand: Card[],
): Card[] {
  const stack: Card[] = [];
  const available = [...hand];

  const first = selectBestCPUCard(state, available);
  if (!first) return [];

  stack.push(first);
  available.splice(available.indexOf(first), 1);

  // Try to add matching cards to stack
  while (true) {
    const next = available.find(c =>
      rules.canPlayOnStack(state, c, stack),
    );
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
 * Get difficulty level (affects CPU decision-making)
 */
export enum CPUDifficulty {
  Easy = 0,
  Medium = 1,
  Hard = 2,
}

/**
 * Select CPU card with difficulty consideration
 */
export function selectCPUCardByDifficulty(
  state: GameState,
  hand: Card[],
  difficulty: CPUDifficulty = CPUDifficulty.Medium,
): Card | null {
  const playable = hand.filter(c => rules.isPlayable(state, c));
  if (playable.length === 0) return null;

  switch (difficulty) {
    case CPUDifficulty.Easy:
      // Random playable card
      return playable[Math.floor(Math.random() * playable.length)];

    case CPUDifficulty.Hard:
      // Advanced strategy: value-based selection
      const scored = playable.map(c => {
        let score = 0;
        if (isSpecial(c)) score += 10;
        if (c.value === 'joker' || c.value === 'jack') score += 15;
        if (c.value === '2') score += 5; // Stack penalties
        if (c.value === '8') score += 3; // Reverse
        if (c.value === '7') score += 4; // Skip
        // Avoid keeping high-value cards
        score -= hand.length;
        return { card: c, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0].card;

    case CPUDifficulty.Medium:
    default:
      // Prefer special cards
      playable.sort((a, b) => (isSpecial(b) ? 1 : 0) - (isSpecial(a) ? 1 : 0));
      return playable[0];
  }
}
