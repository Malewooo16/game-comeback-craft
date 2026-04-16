import { useGame } from '../game/useGame';
import { useServerMultiplayerGame, ServerMultiplayerGameConfig } from '../hooks/useServerMultiplayerGame';
import { cardUrl, Card } from '../game/engine';
import { useIsMobile } from '../hooks/use-mobile';
import { useEffect, useState } from 'react';

interface LastCardGameProps {
  config?: {
    mode: 'local' | 'multiplayer';
    cpuCount?: 1 | 2 | 3;
    gameId?: string;
    playerId?: number;
  };
  onBackToMode?: () => void;
}

const LastCardGame = ({ config, onBackToMode }: LastCardGameProps) => {
  if (config?.mode === 'multiplayer' && config.gameId && config.playerId !== undefined) {
    return <MultiplayerGameView config={config as any} onBackToMode={onBackToMode} />;
  }
  return <LocalGameView config={config} onBackToMode={onBackToMode} />;
};

const MultiplayerGameView = ({ config, onBackToMode }: { config: { gameId: string, playerId: number }, onBackToMode?: () => void }) => {
  const serverConfig: ServerMultiplayerGameConfig = {
    gameId: config.gameId,
    localPlayerId: config.playerId,
    players: [],
  };
  const multiGame = useServerMultiplayerGame(serverConfig);
  
  // Consume animation triggers after they've been shown
  useEffect(() => {
    if (multiGame.animTriggers && Object.keys(multiGame.animTriggers).length > 0) {
      const timer = setTimeout(() => {
        multiGame.animTriggers;
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [multiGame.animTriggers]);
  
  if (!multiGame.state) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="text-4xl mb-4">🎮</div>
          <p className="text-foreground text-lg italic tracking-widest uppercase opacity-50">Syncing with table...</p>
        </div>
      </div>
    );
  }

  const gameManager = { 
    canCallLastCard: (p: any) => multiGame.canCallLastCard(p), 
    isPlayable: (c: Card) => multiGame.isPlayable(c) 
  };
  
  return (
    <GameUI 
      G={multiGame.state}
      gameManager={gameManager}
      toastMsg={multiGame.toastMsg}
      statusMsg={multiGame.statusMsg}
      modal={multiGame.modal}
      setModal={multiGame.setModal}
      playCard={multiGame.playCard}
      playStack={multiGame.playStack}
      undoStackCard={multiGame.undoStackCard}
      drawCard={multiGame.drawCard}
      callLastCard={multiGame.callLastCard}
      rotateHand={multiGame.rotateHand}
      leaveGame={multiGame.leaveGame}
      onBackToMode={onBackToMode}
      localPlayerIndex={multiGame.state.players.findIndex(p => p.id === config.playerId)}
      mode="multiplayer"
      is1v1={multiGame.is1v1}
      rematchStatus={multiGame.rematchStatus}
      isPending={multiGame.isPending}
      requestRematch={multiGame.requestRematch}
      acceptRematch={multiGame.acceptRematch}
      declineRematch={multiGame.declineRematch}
      cancelRematch={multiGame.cancelRematch}
      animTriggers={multiGame.animTriggers}
    />
  );
};

const LocalGameView = ({ config, onBackToMode }: { config?: LastCardGameProps['config'], onBackToMode?: () => void }) => {
  const localGame = useGame(config?.cpuCount);

  if (!localGame.state || !localGame.manager) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="text-4xl mb-4">🎮</div>
          <p className="text-foreground text-lg">Initializing local game...</p>
        </div>
      </div>
    );
  }

  const gameManager = { 
    canCallLastCard: (p: any) => localGame.canCallLastCard(p), 
    isPlayable: (c: Card) => localGame.isPlayable(c) 
  };

  return (
    <GameUI 
      G={localGame.state}
      gameManager={gameManager}
      toastMsg={localGame.toastMsg}
      statusMsg={localGame.statusMsg}
      modal={localGame.modal}
      setModal={localGame.setModal}
      playCard={localGame.playCard}
      playStack={localGame.playStack}
      undoStackCard={localGame.undoStackCard}
      drawCard={localGame.drawCard}
      callLastCard={localGame.callLastCard}
      rotateHand={localGame.rotateHand}
      newGame={localGame.newGame}
      onBackToMode={onBackToMode}
      localPlayerIndex={0}
      mode="local"
    />
  );
};

interface GameUIProps {
  G: any;
  gameManager: any;
  toastMsg: string | null;
  statusMsg: string;
  modal: any;
  setModal: (m: any) => void;
  playCard: (i: number) => void;
  playStack: () => void;
  undoStackCard: (i: number) => void;
  drawCard: () => void;
  callLastCard: () => void;
  rotateHand: (d: number) => void;
  leaveGame?: () => void;
  newGame?: () => void;
  onBackToMode?: () => void;
  localPlayerIndex: number;
  mode: 'local' | 'multiplayer';
  // Rematch props (multiplayer only)
  is1v1?: boolean;
  rematchStatus?: 'idle' | 'requesting' | 'waiting' | 'offer' | 'declined';
  isPending?: boolean;
  requestRematch?: () => void;
  acceptRematch?: () => void;
  declineRematch?: () => void;
  cancelRematch?: () => void;
  animTriggers?: {
    stackPlayed?: boolean;
    cardPlayed?: boolean;
    turnChange?: boolean;
    penaltyApplied?: boolean;
  };
}

const GameUI = ({
  G, gameManager, toastMsg, statusMsg, modal, setModal, 
  playCard, playStack, undoStackCard, drawCard, callLastCard, rotateHand,
  leaveGame, newGame, onBackToMode, localPlayerIndex, mode,
  is1v1, rematchStatus, isPending, requestRematch, acceptRematch, declineRematch, cancelRematch, animTriggers
}: GameUIProps) => {
  const isMobile = useIsMobile();
  const player = localPlayerIndex !== -1 ? G.players[localPlayerIndex] : null;
  const topCard = G.discard[G.discard.length - 1];
  const isEliminated = player?.isEliminated;
  
  // Draw animation state
  const [drawnCard, setDrawnCard] = useState<Card | null>(null);
  const [isAnimatingDraw, setIsAnimatingDraw] = useState(false);
  
  // Game over state - disable all interactions
  const isGameOver = G.over;
  
  // Logical turn state (for rendering visibility/highlights)
  const isMyTurn = G.turnIndex === localPlayerIndex && !G.over && !isEliminated;
  // Interaction state (No longer blocks on isPending to allow rapid moves)
  const isInteractionEnabled = isMyTurn && !isGameOver;
  
  // Handle draw with animation
  const handleDraw = () => {
    if (!isInteractionEnabled || G.deck.length === 0) return;
    
    // Get a random card from deck for animation (visual only)
    const randomCard = G.deck[Math.floor(Math.random() * G.deck.length)];
    setDrawnCard(randomCard);
    setIsAnimatingDraw(true);
    
    // Trigger actual draw after brief delay
    setTimeout(() => {
      drawCard();
      setIsAnimatingDraw(false);
      setDrawnCard(null);
    }, 300);
  };
  
  const canLC = player && 
                gameManager.canCallLastCard(player) && 
                !player.lastCalled && 
                !isGameOver && 
                !isEliminated;

  const showRules = () => {
    setModal({
      title: '📖 Rules',
      message: 'Match suit or number to play.\n\n🃏 2 → Draw 2 (stackable)\n🃏 Joker → Draw 5 + Ghost Match\n🃏 7 → Skip next player\n🃏 8 → Reverse direction\n🃏 Jack → Bridge (Any card can follow!)\n\nStack → Play multiple same-rank cards!\n\nCall "Last Card!" or get +2 penalty!'
    });
  };

  // Compute visible hand cards
  const MAX_VISIBLE = isMobile ? 4 : 7;
  const handCards: { card: Card; realIndex: number }[] = [];
  if (player && player.hand.length > 0) {
    const n = player.hand.length;
    const offset = (G.offset % n + n) % n;
    const vis = Math.min(n, MAX_VISIBLE);
    for (let i = 0; i < vis; i++) {
      const idx = (offset + i) % n;
      handCards.push({ card: player.hand[idx], realIndex: idx });
    }
  }

  const spread = Math.min(8 * (handCards.length - 1), 48);
  const step = handCards.length > 1 ? spread / (handCards.length - 1) : 0;
  const aStart = -spread / 2;

  // Map opponents to positions relative to localPlayerIndex
  const opponents = G.players
    .map((p: any, originalIndex: number) => ({ ...p, originalIndex }))
    .filter((_: any, idx: number) => idx !== localPlayerIndex);

  return (
    <div className="w-screen h-screen flex flex-col relative font-sans overflow-hidden bg-[#0a0f1a]">
      {/* Table */}
      <div className="flex-1 relative flex items-center justify-center"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, hsl(var(--felt)) 0%, hsl(var(--felt-dark)) 60%, hsl(160 70% 4%) 100%)',
          border: '3px solid hsl(160 40% 25%)',
          boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5)',
        }}>

        {/* Game title */}
        <div className="absolute top-1/2 left-5 -translate-y-1/2 font-display text-xs tracking-[3px] uppercase text-gold/25 pointer-events-none z-[5]"
          style={{ writingMode: 'vertical-rl' }}>
          Last Card
        </div>

        {/* Top Right Buttons */}
        <div className="absolute top-3 right-4 flex items-center gap-2 z-[25]">
          <button 
            onClick={() => setModal({ 
              title: 'Leave Game?', 
              message: 'Are you sure you want to leave? This will result in a loss.' 
            })}
            className="px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wider hover:bg-red-500/25 transition-colors shadow-lg"
          >
            Leave
          </button>
          <button 
            onClick={showRules}
            className="w-7 h-7 rounded-full bg-gold/10 border border-gold/30 text-gold text-sm flex items-center justify-center hover:bg-gold/25 transition-colors shadow-lg"
          >
            ?
          </button>
        </div>

        {/* Opponents */}
        {opponents.map((p: any, i: number) => {
          let posKey = i + 1;
          if (opponents.length === 1) posKey = 2; // In 1v1, put opp at top

          const positions: Record<number, string> = {
            1: 'left-10 top-1/2 -translate-y-1/2',
            2: 'top-3 left-1/2 -translate-x-1/2',
            3: 'right-10 top-1/2 -translate-y-1/2',
          };

          return (
            <div key={p.id} className={`absolute flex flex-col items-center gap-1 z-[15] ${positions[posKey] || positions[2]}`}>
              <div className="text-foreground/60 text-[11px] tracking-wider uppercase flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold))] ${G.turnIndex === p.originalIndex && animTriggers?.turnChange ? 'animate-pulse' : (G.turnIndex === p.originalIndex ? 'animate-pulse' : 'opacity-0')}`} />
                <span>{p.name} {p.isEliminated ? '(OUT)' : ''}</span>
              </div>
              <div className="flex">
                {p.hand.map((_: any, cardIdx: number) => (
                  <div key={cardIdx} className="w-9 h-[50px] rounded-[5px] border-[1px] border-gold/30 flex-shrink-0 -mx-1"
                    style={{
                      background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                      boxShadow: '2px 2px 6px rgba(0,0,0,0.4)',
                    }} />
                ))}
              </div>
              {/* Opp stack - only show opponent's stack when it's their turn */}
              {G.turnIndex === p.originalIndex && G.oppStack?.length > 0 && (
                <div className="flex items-center justify-center min-h-[50px] mt-2">
                  {G.oppStack.map((c: Card, stackIdx: number, arr: Card[]) => (
                    <div key={stackIdx} className="w-9 h-[50px] rounded bg-white border border-gray-300 overflow-hidden shadow-lg"
                      style={{ transform: `translateX(${(stackIdx - (arr.length - 1) / 2) * 15}px) rotate(${(stackIdx - (arr.length - 1) / 2) * 8}deg)` }}>
                      <img src={cardUrl(c)} alt={c.id} className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Center */}
        <div className="flex flex-col items-center gap-4 z-10 scale-90 md:scale-100">
          <div className="flex gap-8 items-center">
            {/* Draw pile */}
            <div className="text-center">
              <div className="relative cursor-pointer group" onClick={isInteractionEnabled ? handleDraw : undefined}
                style={{ opacity: isInteractionEnabled ? 1 : 0.5 }}>
                <div className={`w-[72px] h-[101px] rounded-[7px] border-2 border-gold/50 flex items-center justify-center transition-transform group-hover:-translate-y-1 ${isAnimatingDraw ? 'scale-95' : ''}`}
                  style={{
                    background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  }}>
                  {drawnCard ? (
                    <div className="w-[68px] h-[97px] rounded-[5px] bg-white border-[1px] border-gray-300 overflow-hidden">
                      <img src={cardUrl(drawnCard)} alt="drawn" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <span className="text-gold/40 text-2xl">♠</span>
                  )}
                </div>
                {/* Animated card flying to hand */}
                {isAnimatingDraw && drawnCard && (
                  <div className="absolute left-1/2 top-1/2 pointer-events-none z-50"
                    style={{
                      animation: 'flyToHand 400ms ease-out forwards',
                    }}>
                    <div className="w-[60px] h-[84px] rounded-[5px] bg-white border border-gray-300 shadow-xl overflow-hidden">
                      <img src={cardUrl(drawnCard)} alt="flying" className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
                <div className="absolute -top-2.5 -right-2.5 bg-gold text-primary-foreground text-[11px] font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center z-[5]">
                  {G.deck.length}
                </div>
              </div>
              <div className="text-gold/50 text-[10px] tracking-[2px] uppercase mt-1.5 font-bold">Draw</div>
            </div>

            {/* Direction */}
            <div className="text-3xl" style={{
              filter: 'drop-shadow(0 0 8px hsl(var(--gold) / 0.6))',
              color: G.dir === 1 ? 'hsl(var(--gold) / 0.7)' : 'hsl(200 70% 70% / 0.7)',
            }}>
              {G.dir === 1 ? '◀' : '▶'}
            </div>

            {/* Discard pile */}
            <div className="text-center">
              <div className="relative">
                {topCard && (
                  <div className="w-[72px] h-[101px] rounded-[7px] bg-white border-[1.5px] border-gray-300 overflow-hidden flex items-center justify-center"
                    style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                    <img src={cardUrl(topCard)} alt="top" className="w-full h-full object-contain" />
                  </div>
                )}
              </div>
              {/* Only show Stack label when it's my turn and I have a stack */}
              {isMyTurn && G.stack?.length > 0 && (
                <div className="text-[10px] tracking-[2px] uppercase mt-1.5 font-bold text-emerald-400">
                  Stack
                </div>
              )}
            </div>
          </div>

          {/* Stack area */}
          <div className="flex items-center gap-4 min-h-[110px]">
            <div className="relative flex items-center justify-center min-w-[180px] min-h-[110px]">
              {isMyTurn && G.stack?.map((c: Card, i: number) => (
                <div key={c.id}
                  onClick={() => isInteractionEnabled && undoStackCard(i)}
                  className={`absolute transition-all duration-300 ${isInteractionEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${i === G.stack.length - 1 ? 'drop-shadow-[0_0_12px_hsl(var(--gold)/0.9)] z-[100]' : ''}`}
                  style={{ 
                    transform: `translateX(${(i - (G.stack.length - 1) / 2) * 30}px) rotate(${(i - (G.stack.length - 1) / 2) * 8}deg)` 
                  }}>
                  <div className="w-[72px] h-[101px] rounded-[7px] bg-white border-[1.5px] border-gray-300 overflow-hidden shadow-lg">
                    <img src={cardUrl(c)} alt={c.id} className="w-full h-full object-contain" />
                  </div>
                  {i === G.stack.length - 1 && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-br from-gold to-gold-light text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                      NOW
                    </div>
                  )}
                </div>
              ))}
              {isMyTurn && G.stack?.length > 0 && (
                <div className="absolute -top-2.5 -right-2.5 bg-gradient-to-br from-destructive to-red-800 text-white text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center z-[200] shadow-lg">
                  {G.stack.length}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {isInteractionEnabled && G.stack?.length >= 1 && (
                <button 
                  onClick={playStack}
                  disabled={isPending}
                  className={`bg-gradient-to-br from-emerald-500 to-emerald-600 border-2 border-emerald-300/40 text-white font-semibold text-sm px-5 py-2.5 rounded-lg uppercase tracking-wider shadow-[0_4px_16px_rgba(46,204,113,0.4)] hover:scale-105 transition-transform z-[1000] ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  ▶ {G.stack.length > 1 ? 'Stack' : 'Play'}
                </button>
              )}
            </div>
          </div>

          {/* Penalty */}
          {G.pending > 0 && (
            <div className="bg-destructive/20 border border-destructive/50 text-red-400 text-sm font-semibold px-3.5 py-1 rounded-full animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              ⚠ Draw penalty: {G.pending}
            </div>
          )}

          {/* {G.wildSuit && (
            <div className="text-gold-light text-[11px] font-bold bg-gold/10 px-4 py-1.5 rounded-full border border-gold/20 uppercase tracking-[2px]">
              Wild Suit: {G.wildSuit}
            </div>
          )} */}
        </div>

        {/* Player Hand area */}
        <div className="absolute bottom-0 left-0 right-0 h-[150px] md:h-[175px] flex flex-col items-center justify-end pb-3 md:pb-2 z-[15]">
          <div className="text-foreground/70 text-[11px] tracking-[2px] uppercase mb-1.5 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold))] ${isMyTurn ? 'animate-pulse' : 'opacity-0'}`} />
            <span>Your Hand</span>
          </div>
          <div className="relative w-full h-[110px] md:h-[130px] flex items-end justify-center mb-0">
            {handCards.map(({ card, realIndex }, i) => {
              const angle = aStart + step * i;
              const lift = Math.abs(angle) * 0.4;
              const isActive = isMyTurn && gameManager.isPlayable(card);

              return (
                <div key={card.id}
                  onClick={() => isInteractionEnabled && playCard(realIndex)}
                  className={`absolute bottom-0 origin-bottom transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isActive ? (isInteractionEnabled ? 'cursor-pointer hover:brightness-110' : 'cursor-wait') : 'grayscale-[50%] brightness-[0.65] cursor-not-allowed'}`}
                  style={{
                    left: `calc(50% + ${(i - (handCards.length - 1) / 2) * (isMobile ? 35 : 50)}px)`,
                    transform: `translateX(-50%) rotate(${angle}deg) translateY(-${lift}px)`,
                    zIndex: 10 + i,
                  }}
                  onMouseEnter={e => { if (isActive && isInteractionEnabled) (e.currentTarget.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(-${lift + 22}px) scale(1.1)`); }}
                  onMouseLeave={e => { e.currentTarget.style.transform = `translateX(-50%) rotate(${angle}deg) translateY(-${lift}px) scale(1)`; }}
                >
                  <div className={`${isMobile ? 'w-[56px] h-[78px]' : 'w-[72px] h-[101px]'} rounded-[7px] bg-white border-[1.5px] border-gray-300 shadow-lg overflow-hidden transition-all ${isActive ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0a3a2a]' : ''}`}>
                    <img src={cardUrl(card)} alt={card.id} className="w-full h-full object-contain" />
                  </div>
                </div>
              );
            })}
            {player && player.hand.length > MAX_VISIBLE && (
              <div className="hidden bottom-0.5 right-[calc(50%-220px)] bg-gold/25 border border-gold/45 text-gold-light text-[10px] px-2 py-0.5 rounded-xl font-bold">
                +{player.hand.length - MAX_VISIBLE} more
              </div>
            )}
          </div>
        </div>

        {/* Hand navigation */}
        {player && player.hand.length > MAX_VISIBLE && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[285px] md:w-[560px] flex justify-between z-[20] pointer-events-none">
            <button onClick={() => rotateHand(-1)}
              className="pointer-events-auto w-8 h-8 rounded-full bg-gold/20 border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/40 transition-colors shadow-lg">
              ◀
            </button>
            <button onClick={() => rotateHand(1)}
              className="pointer-events-auto w-8 h-8 rounded-full bg-gold/20 border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/40 transition-colors shadow-lg">
              ▶
            </button>
          </div>
        )}

        {/* Last Card button */}
        {canLC && (
          <button onClick={callLastCard}
            className="absolute bottom-[140px] md:bottom-[52px] right-3 md:right-5 bg-gradient-to-br from-game-red to-red-900 border-2 border-red-400/40 text-white font-display text-xs md:text-sm font-bold px-3 md:px-4 py-2 rounded-lg tracking-wider uppercase z-[25] shadow-[0_4px_16px_rgba(204,34,34,0.4)] hover:scale-105 transition-transform animate-bounce">
            Last Card!
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="bg-black/50 border-t border-gold/20 px-5 py-2 flex items-center gap-3 min-h-[40px] z-[20]">
        <span className="text-gold-light text-sm font-medium flex-1 italic">{statusMsg}</span>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${mode === 'multiplayer' ? 'bg-emerald-500' : 'bg-blue-500'} shadow-[0_0_8px_currentColor]`} />
          <span className="bg-gold/15 border border-gold/40 text-gold text-[11px] px-2.5 py-0.5 rounded-full tracking-wider font-bold">
            {isGameOver ? 'GAME OVER' : (G.turnIndex === localPlayerIndex ? 'YOUR TURN' : `${G.players[G.turnIndex]?.name.toUpperCase()}'S TURN`)}
          </span>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center">
          <div className="bg-gradient-to-br from-[#1a2a4a] to-[#0d1f3c] border border-gold/50 rounded-2xl p-8 text-center max-w-[380px] w-[90%] shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
            <h2 className="font-display text-gold-light text-2xl mb-3">{modal.title}</h2>
            <p className="text-foreground/75 text-sm mb-6 leading-relaxed whitespace-pre-line">{modal.message}</p>
            
            {/* Rematch Offer (Accept/Decline) */}
            {modal.title === 'Rematch Request' ? (
              <div className="flex gap-4 justify-center">
                <button 
                  onClick={() => {
                    declineRematch?.();
                  }}
                  className="bg-white/10 text-white font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:bg-white/20 transition-colors"
                >
                  Decline
                </button>
                <button 
                  onClick={() => {
                    acceptRematch?.();
                  }}
                  className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:scale-105 transition-transform shadow-[0_0_20px_rgba(46,204,113,0.3)]"
                >
                  Accept
                </button>
              </div>
            ) : modal.title === 'Rematch Requested' ? (
              /* Waiting for opponent */
              <button 
                onClick={() => {
                  cancelRematch?.();
                }}
                className="bg-white/10 text-white font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            ) : modal.title === 'Leave Game?' ? (
              /* Leave Game */
              <div className="flex gap-4 justify-center">
                <button 
                  onClick={() => setModal(null)}
                  className="bg-white/10 text-white font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    if (mode === 'multiplayer' && leaveGame) {
                      await leaveGame();
                    }
                    setModal(null);
                    onBackToMode?.();
                  }}
                  className="bg-gradient-to-br from-red-500 to-red-600 text-white font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:scale-105 transition-transform shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                >
                  Leave
                </button>
              </div>
            ) : (
              /* Endgame or Rules modal */
              <div className="flex flex-col gap-4">
                {G.over && G.lastActionMessage?.includes('abandoned') && (
                  <div className="bg-destructive/10 border border-destructive/30 p-3 rounded-xl">
                    <p className="text-red-400 font-bold text-xs uppercase tracking-[2px] mb-1">Match Terminated</p>
                    <p className="text-foreground/80 text-xs italic">"{G.lastActionMessage}"</p>
                  </div>
                )}
                
                {/* Show Rematch button only for 1v1 multiplayer game that's over and not already waiting */}
                {mode === 'multiplayer' && is1v1 && G.over && modal.title !== '📖 Rules' && rematchStatus === 'idle' && (
                  <button 
                    onClick={() => requestRematch?.()}
                    className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:scale-105 transition-transform shadow-[0_0_20px_rgba(46,204,113,0.3)]"
                  >
                    🔄 Rematch
                  </button>
                )}
                
                <button 
                  onClick={() => {
                    setModal(null);
                    if (modal.title !== '📖 Rules') {
                      if (onBackToMode) {
                        onBackToMode();
                      } else if (newGame) {
                        newGame();
                      }
                    }
                  }}
                  className="bg-gradient-to-br from-gold to-gold-light text-primary-foreground font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:scale-105 transition-transform"
                >
                  {modal.title === '📖 Rules' ? 'Close' : (mode === 'multiplayer' ? 'Back to Menu' : 'Play Again')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/95 border border-gold/50 text-gold-light font-display text-lg px-7 py-3 rounded-xl z-[300] pointer-events-none text-center animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default LastCardGame;
