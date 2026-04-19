const CDN = "https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/png/";

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
const VALUES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;

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
  isCPU: boolean;
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
}

export function cardUrl(card: Card): string {
  return CDN + card.id + '.png';
}

function shuffle(a: Card[]): Card[] {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const v of VALUES) d.push({ suit: s, value: v, id: v + '_of_' + s });
  d.push({ suit: 'red', value: 'joker', id: 'red_joker' });
  d.push({ suit: 'black', value: 'joker', id: 'black_joker' });
  return shuffle(d);
}

const CPU_NAMES = ["Lucky Lucy", "Card Shark", "The Joker"];

export type GameEvent = 
  | { type: 'toast'; message: string }
  | { type: 'status'; message: string }
  | { type: 'modal'; title: string; message: string }
  | { type: 'animate_card'; card: Card; from: 'hand' | 'cpu'; playerId?: number }
  | { type: 'animate_stack'; cards: Card[] };

export class GameEngine {
  state: GameState;
  private events: GameEvent[] = [];
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): GameState {
    return {
      deck: [], discard: [], players: [],
      turnIndex: 0, dir: 1, pending: 0, offset: 0,
      over: false, jokerPrev: null, jokerOnTop: false,
      jokerWild: false, wildSuit: null, stack: [], oppStack: []
    };
  }

  clearTimeouts() {
    this.pendingTimeouts.forEach(t => clearTimeout(t));
    this.pendingTimeouts = [];
  }

  flushEvents(): GameEvent[] {
    const e = [...this.events];
    this.events = [];
    return e;
  }

  private emit(event: GameEvent) {
    this.events.push(event);
  }

  private toast(m: string) { this.emit({ type: 'toast', message: m }); }
  private status(m: string) { this.emit({ type: 'status', message: m }); }
  private showModal(t: string, m: string) { this.emit({ type: 'modal', title: t, message: m }); }

  newGame(onChange: () => void) {
    this.clearTimeouts();
    const G = this.createInitialState();
    G.deck = buildDeck();
    G.players = [
      { id: 0, name: 'You', hand: [], lastCalled: false, victoryDrawPending: false, isCPU: false },
      { id: 1, name: CPU_NAMES[0], hand: [], lastCalled: false, victoryDrawPending: false, isCPU: true },
      { id: 2, name: CPU_NAMES[1], hand: [], lastCalled: false, victoryDrawPending: false, isCPU: true },
      { id: 3, name: CPU_NAMES[2], hand: [], lastCalled: false, victoryDrawPending: false, isCPU: true },
    ];

    for (let i = 0; i < 7; i++) {
      G.players.forEach(p => p.hand.push(G.deck.pop()!));
    }

    let c: Card;
    do { c = G.deck.pop()!; } while (['joker', '2', '7', '8', 'jack'].includes(c.value));
    G.discard.push(c);

    this.state = G;
    this.status("Your turn — play a card or draw");
    onChange();
  }

  private topCard(): Card { return this.state.discard[this.state.discard.length - 1]; }
  
  private effectiveCard(): Card {
    const G = this.state;
    if (this.topCard().value === 'joker' && G.pending === 0 && G.jokerPrev && !G.jokerWild) return G.jokerPrev;
    return this.topCard();
  }

  private stackTop(customStack?: Card[]): Card {
    const s = customStack || this.state.stack;
    return s.length > 0 ? s[s.length - 1] : this.effectiveCard();
  }

  private canPlayOnStack(card: Card, customStack?: Card[]): boolean | null {
    const s = customStack || this.state.stack;
    if (s.length === 0) return null;
    const t = s[s.length - 1];
    if (card.value === 'jack' && s.some(c => c.value !== 'jack')) return false;
    if (s.every(c => c.value === 'jack')) return true;
    return card.value === t.value;
  }

  private canCounterPending(card: Card): boolean | null {
    const G = this.state;
    if (G.pending === 0) return null;
    const tc = this.topCard();
    if (tc.value === 'joker') return card.value === 'joker';
    if (tc.value === '2') return card.value === '2' || card.value === 'joker';
    return false;
  }

  isPlayable(card: Card): boolean {
    const G = this.state;
    const pendingResult = this.canCounterPending(card);
    if (pendingResult !== null) return pendingResult;
    const stackResult = this.canPlayOnStack(card);
    if (stackResult !== null) return stackResult;
    const t = this.stackTop();
    if (t.value === 'jack') return true;
    if (G.jokerWild) return true;
    if (card.value === 'jack') return true;
    if (card.value === 'joker') return true;
    return card.suit === t.suit || card.value === t.value;
  }

  canCallLastCard(player: Player): boolean {
    if (player.hand.length === 0) return false;
    if (player.hand.length === 1) return true;
    const firstVal = player.hand[0].value;
    return player.hand.every(c => c.value === firstVal);
  }

  private isSpecial(card: Card): boolean {
    return !['ace', '3', '4', '5', '6', '9', '10', 'queen', 'king'].includes(card.value);
  }

  private getBestSuit(hand: Card[]): string {
    const counts: Record<string, number> = {};
    hand.forEach(c => { if (c.suit !== 'red' && c.suit !== 'black') counts[c.suit] = (counts[c.suit] || 0) + 1; });
    let best = 'hearts', max = -1;
    for (const s in counts) { if (counts[s] > max) { max = counts[s]; best = s; } }
    return best;
  }

  private applySpecial(card: Card) {
    const G = this.state;
    if (card.value !== 'joker') G.jokerWild = false;
    if (card.value === '2') { G.pending += 2; this.toast("Draw 2!"); }
    else if (card.value === 'joker') {
      const prev = G.discard[G.discard.length - 2] || null;
      if (prev && prev.value === 'joker') {
        G.jokerWild = true; G.jokerOnTop = false;
        this.toast("DOUBLE JOKER! Wild! Any card can be played!");
        G.wildSuit = this.getBestSuit(G.players[G.turnIndex].hand);
      } else {
        G.jokerOnTop = true;
        G.jokerPrev = prev;
        this.toast("JOKER! Draw 5!");
      }
      G.pending += 5;
    }
    else if (card.value === '8') { G.dir *= -1; this.toast("Reverse!"); }
    else if (card.value === 'jack') {
      G.jokerWild = false; G.jokerOnTop = false;
      G.wildSuit = null;
      this.toast("Jack! Bridge!");
    }
  }

  private drawN(n: number): Card[] {
    const G = this.state;
    const res: Card[] = [];
    for (let i = 0; i < n; i++) {
      if (G.deck.length === 0) this.reshuffle();
      if (G.deck.length > 0) res.push(G.deck.pop()!);
    }
    return res;
  }

  private reshuffle() {
    const G = this.state;
    if (G.discard.length <= 1) return;
    const t = G.discard.pop()!;
    const newDiscard: Card[] = [];
    G.discard.forEach(c => { if (c.value !== 'joker') newDiscard.push(c); });
    G.deck = shuffle(newDiscard);
    G.discard = [t];
    this.toast("Deck reshuffled!");
  }

  private checkVictory(player: Player, playedCards: Card[], onChange: () => void): boolean {
    const G = this.state;
    if (player.hand.length === 0) {
      const playedJacks = playedCards.filter(c => c.value === 'jack');
      if (playedJacks.length > 0) {
        player.victoryDrawPending = true;
        player.victoryWild = true;
        this.toast(player.name + ": Jack Bridge! Victory Draw next turn.");
        onChange();
        this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1600));
        return true;
      }
      if (!player.lastCalled) {
        player.hand.push(...this.drawN(2));
        this.toast(player.name + " forgot Last Card! +2 penalty");
        onChange();
        this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1600));
        return true;
      }
      const lastCard = playedCards[playedCards.length - 1];
      if (this.isSpecial(lastCard)) {
        player.victoryDrawPending = true;
        player.victoryWild = G.jokerWild;
        this.toast(player.name + ": Special finish! Victory Draw next turn.");
        onChange();
        this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1600));
        return true;
      } else {
        this.showModal(player.id === 0 ? "You Win!" : player.name + " Wins!", player.name + " played all cards!");
        G.over = true;
        onChange();
        return true;
      }
    }
    return false;
  }

  private endTurn(onChange: () => void) {
    const G = this.state;
    if (G.over) return;

    let totalSkips = 0;
    for (let i = G.discard.length - 1; i >= 0; i--) {
      if (G.discard[i].value === '7') totalSkips++;
      else break;
    }

    let step = G.dir;
    if (totalSkips > 0) {
      step = G.dir * (totalSkips + 1);
      const skippedNames: string[] = [];
      for (let s = 1; s <= totalSkips; s++) {
        const idx = (G.turnIndex + G.dir * s + 8) % 4;
        skippedNames.push(G.players[idx].name);
      }
      this.toast(skippedNames.join(", ") + " skipped!");
    }
    G.turnIndex = (G.turnIndex + step + 16) % 4;

    G.players.forEach(p => {
      if (p.isCPU && !p.lastCalled && this.canCallLastCard(p)) {
        p.lastCalled = true;
        this.toast(p.name + ": Last Card!");
      }
    });

    onChange();

    const nextPlayer = G.players[G.turnIndex];

    if (nextPlayer.hand.length === 0 && nextPlayer.victoryDrawPending && G.pending > 0) {
      nextPlayer.hand.push(...this.drawN(G.pending));
      nextPlayer.victoryDrawPending = false;
      nextPlayer.victoryWild = false;
      G.pending = 0; G.jokerOnTop = false;
      this.toast(nextPlayer.name + " hit while at zero! Back in the game.");
      onChange();
    }

    if (nextPlayer.victoryDrawPending) { this.handleVictoryDraw(nextPlayer, onChange); return; }

    if (nextPlayer.isCPU) {
      this.status(nextPlayer.name + "'s turn...");
      onChange();
      this.pendingTimeouts.push(setTimeout(() => this.oppTurn(onChange), 2000));
    } else {
      this.status("Your turn — play a card or draw");
      onChange();
    }
  }

  private handleVictoryDraw(player: Player, onChange: () => void) {
    const G = this.state;
    this.status(player.name + " performing Victory Draw...");
    onChange();
    this.pendingTimeouts.push(setTimeout(() => {
      const d = this.drawN(1);
      if (d.length) {
        const card = d[0];
        const tc = this.topCard();
        const isNormal = !this.isSpecial(card);
        let win = false;
        if (isNormal) {
          let activeSuit: string = tc.suit;
          if (tc.value === 'jack' || G.jokerWild) activeSuit = G.wildSuit || tc.suit;
          if (card.suit === activeSuit) win = true;
          else if (!G.jokerWild && tc.value !== 'jack' && card.value === tc.value) win = true;
        }
        if (win) {
          this.showModal(player.id === 0 ? "You Win!" : player.name + " Wins!",
            player.name + " won on Victory Draw with " + card.id.replace(/_/g, ' ') + "!");
          G.over = true;
          onChange();
        } else {
          player.hand.push(card);
          player.victoryDrawPending = false;
          player.lastCalled = false;
          this.toast(player.name + " failed Victory Draw! Drew " + card.id.replace(/_/g, ' '));
          onChange();
          this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1600));
        }
      }
    }, 1000));
  }

  playCard(idx: number, onChange: () => void) {
    const G = this.state;
    if (G.turnIndex !== 0 || G.over) return;
    const player = G.players[0];
    const card = player.hand[idx];
    if (!this.isPlayable(card)) { this.toast("Can't play that card!"); onChange(); return; }
    player.hand.splice(idx, 1);
    G.offset = player.hand.length > 0 ? G.offset % player.hand.length : 0;

    if (G.stack.length === 0) {
      const sameValue = player.hand.filter(c => c.value === card.value);
      if (card.value === 'jack' || card.value === 'joker' || sameValue.length >= 1) {
        G.stack.push(card);
        this.status("Stack created! Add more or submit");
        onChange();
      } else {
        G.discard.push(card);
        this.applySpecial(card);
        onChange();
        if (this.checkVictory(player, [card], onChange)) return;
        player.lastCalled = false;
        this.endTurn(onChange);
      }
    } else {
      G.stack.push(card);
      this.status("Add more or submit stack");
      onChange();
    }
  }

  playStack(onChange: () => void) {
    const G = this.state;
    if (G.stack.length === 0) return;
    const playedStack = [...G.stack];
    playedStack.forEach(c => {
      G.discard.push(c);
      this.applySpecial(c);
    });
    G.stack = [];
    onChange();
    if (this.checkVictory(G.players[0], playedStack, onChange)) return;
    G.players[0].lastCalled = false;
    this.endTurn(onChange);
  }

  undoStackCard(idx: number, onChange: () => void) {
    const G = this.state;
    if (idx < 0 || idx >= G.stack.length) return;
    const card = G.stack.splice(idx, 1)[0];
    G.players[0].hand.push(card);
    if (G.stack.length === 0) this.status("Stack cleared");
    onChange();
  }

  drawCard(onChange: () => void) {
    const G = this.state;
    if (G.turnIndex !== 0 || G.over) return;
    const player = G.players[0];
    if (G.stack.length > 0) { G.stack = []; this.toast("Stack cleared!"); }

    if (G.pending > 0) {
      player.hand.push(...this.drawN(G.pending));
      this.toast("You draw " + G.pending + " cards!");
      G.pending = 0; G.jokerOnTop = false;
      onChange();
      this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1200));
      return;
    }

    const d = this.drawN(1);
    if (d.length) player.hand.push(...d);
    onChange();
    this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1000));
  }

  callLastCard(onChange: () => void) {
    const G = this.state;
    if (!this.canCallLastCard(G.players[0])) { this.toast("Can't call yet!"); onChange(); return; }
    G.players[0].lastCalled = true;
    this.toast("You: Last Card!");
    onChange();
  }

  rotateHand(d: number, onChange: () => void) {
    const G = this.state;
    const n = G.players[0].hand.length;
    if (!n) return;
    G.offset = ((G.offset + d) + n) % n;
    onChange();
  }

  private oppTurn(onChange: () => void) {
    const G = this.state;
    if (G.over) return;
    const p = G.players[G.turnIndex];

    if (G.pending > 0) {
      const counter = p.hand.find(c => this.canCounterPending(c));
      if (counter) {
        p.hand.splice(p.hand.indexOf(counter), 1);
        G.discard.push(counter);
        this.applySpecial(counter);
        this.status(p.name + " countered!");
        onChange();
        if (this.checkVictory(p, [counter], onChange)) return;
        this.endTurn(onChange);
        return;
      }
      p.hand.push(...this.drawN(G.pending));
      this.toast(p.name + " draws " + G.pending + "!");
      G.pending = 0; G.jokerOnTop = false;
      onChange();
      this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1200));
      return;
    }

    const playable = p.hand.filter(c => this.isPlayable(c));
    if (playable.length === 0) {
      const d = this.drawN(1);
      if (d.length) p.hand.push(d[0]);
      onChange();
      this.pendingTimeouts.push(setTimeout(() => this.endTurn(onChange), 1000));
      return;
    }

    playable.sort((a, b) => (this.isSpecial(b) ? 1 : 0) - (this.isSpecial(a) ? 1 : 0));
    const first = playable[0];
    p.hand.splice(p.hand.indexOf(first), 1);
    G.oppStack = [first];

    while (true) {
      const next = p.hand.find(c => this.canPlayOnStack(c, G.oppStack));
      if (next) {
        p.hand.splice(p.hand.indexOf(next), 1);
        G.oppStack.push(next);
      } else break;
    }

    if (!p.lastCalled && p.hand.length === 1) p.lastCalled = true;
    if (p.lastCalled) this.toast(p.name + ": Last Card!");
    onChange();

    this.pendingTimeouts.push(setTimeout(() => {
      const finalStack = [...G.oppStack];
      G.oppStack.forEach(c => {
        G.discard.push(c);
        this.applySpecial(c);
      });
      G.oppStack = [];
      onChange();
      if (this.checkVictory(p, finalStack, onChange)) return;
      this.endTurn(onChange);
    }, 1200));
  }
}
