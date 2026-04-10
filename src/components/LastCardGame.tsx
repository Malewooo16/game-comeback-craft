import { useGame } from '../game/useGame';
import { useServerMultiplayerGame, ServerMultiplayerGameConfig } from '../hooks/useServerMultiplayerGame';
import { cardUrl, Card } from '../game/gameState';

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
  // Use appropriate hook based on game mode
  const localGame = useGame(config?.cpuCount);
  
  let gameState, gameManager, toastMsg, statusMsg, modal, setModal, playCard, playStack, undoStackCard, drawCard, callLastCard, rotateHand;

  if (config?.mode === 'multiplayer' && config.gameId && config.playerId !== undefined) {
    // Multiplayer mode with server sync
    const serverConfig: ServerMultiplayerGameConfig = {
      gameId: config.gameId,
      localPlayerId: config.playerId,
      players: [],
    };
    const multiGame = useServerMultiplayerGame(serverConfig);
    gameState = multiGame.state;
    toastMsg = multiGame.toastMsg;
    statusMsg = multiGame.statusMsg;
    modal = multiGame.modal;
    setModal = multiGame.setModal;
    playCard = multiGame.playCard;
    playStack = multiGame.playStack;
    undoStackCard = multiGame.undoStackCard;
    drawCard = multiGame.drawCard;
    callLastCard = multiGame.callLastCard;
    rotateHand = multiGame.rotateHand;
    gameManager = { canCallLastCard: multiGame.canCallLastCard, isPlayable: multiGame.isPlayable };
  } else {
    // Local mode (default)
    gameState = localGame.state;
    gameManager = localGame.manager;
    toastMsg = localGame.toastMsg;
    statusMsg = localGame.statusMsg;
    modal = localGame.modal;
    setModal = localGame.setModal;
    playCard = localGame.playCard;
    playStack = localGame.playStack;
    undoStackCard = localGame.undoStackCard;
    drawCard = localGame.drawCard;
    callLastCard = localGame.callLastCard;
    rotateHand = localGame.rotateHand;
  }

  // Guard against undefined state during initialization
  if (!gameState || !gameManager) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="text-4xl mb-4">🎮</div>
          <p className="text-foreground text-lg">Initializing game...</p>
        </div>
      </div>
    );
  }

  // Guard against multiplayer game with no players yet
  if (!gameState.players || gameState.players.length === 0) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-foreground text-lg">Waiting for players to join...</p>
        </div>
      </div>
    );
  }

  const G = gameState;
  const localPlayerId = config?.mode === 'multiplayer' ? config.playerId : 0;
  const player = G.players[localPlayerId];
  const topCard = G.discard[G.discard.length - 1];
  const currentPlayer = G.players[G.turnIndex];
  const isEliminated = player?.isEliminated;
  const isPlayerTurn = G.turnIndex === localPlayerId && !G.over && !isEliminated;
  
  // Last Card Button Logic:
  // 1. Player must have 1 card or all cards of same value
  // 2. Player must NOT have called it yet
  // 3. Game must not be over
  // 4. Player must not be eliminated
  const canLC = player && 
                gameManager.canCallLastCard(player) && 
                !player.lastCalled && 
                !G.over && 
                !isEliminated;
  
  const hasStack = G.stack.length > 0 && isPlayerTurn;
  const showMore = player && player.hand.length > 7;
  
  // Get opponent for multiplayer
  const opponent = config?.mode === 'multiplayer' && G.players.length > 1 
    ? G.players.find((_, idx) => idx !== localPlayerId)
    : null;
  const isOpponentTurn = opponent && G.turnIndex === G.players.indexOf(opponent) && !G.over;
  
  // Compute correct status message
  let computedStatusMsg = currentPlayer 
    ? (G.turnIndex === localPlayerId ? "Your turn" : `${currentPlayer.name}'s turn`)
    : statusMsg;
  
  if (isEliminated) {
    computedStatusMsg = "You are spectating (Eliminated)";
  }

  // Compute visible hand cards
  const MAX_VISIBLE = 7;
  const handCards: { card: Card; realIndex: number }[] = [];
  if (player && player.hand.length > 0 && !isEliminated) {
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

  const showRules = () => {
    setModal({
      title: '📖 Rules',
      message: 'Match suit or number to play.\n\n🃏 2 → Draw 2 (stackable)\n🃏 Joker → Draw 5 + Ghost Match\n🃏 7 → Skip next player\n🃏 8 → Reverse direction\n🃏 Jack → Bridge (Any card can follow!)\n\nStack → Play multiple same-rank cards!\n\nCall "Last Card!" or get +2 penalty!\n\nRound Elimination:\nWhen a player wins, everyone else counts points. Joker=50, Jack=25, 2=20, King=4, Queen=5, Ace=1. Highest points is eliminated!'
    });
  };

  // Show player count for debugging
  const debugPlayers = (
    <div className="absolute top-3 left-4 bg-black/60 border border-gold/30 px-2 py-1 rounded text-[10px] text-gold/60 z-50">
      Players: {G.players.length} | Turn: {G.turnIndex} ({G.players[G.turnIndex]?.name})
    </div>
  );

  return (
    <div className="w-screen h-screen flex flex-col relative font-sans">
      {/* Spectator Overlay */}
      {isEliminated && !G.over && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 border border-gold/30 px-4 py-1.5 rounded-full text-gold/80 text-xs font-bold tracking-[2px] uppercase z-[50] backdrop-blur-sm animate-pulse">
          Spectating
        </div>
      )}

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
        
        {/* Debug info */}
        {debugPlayers}

        {/* Rules button */}
        <button onClick={showRules}
          className="absolute top-3 right-4 w-7 h-7 rounded-full bg-gold/10 border border-gold/30 text-gold text-sm flex items-center justify-center z-[25] hover:bg-gold/25 transition-colors">
          ?
        </button>

        {/* Opponents */}
        {G.players.filter(p => p.id !== localPlayerId).map(p => {
          // Calculate relative position based on localPlayerId
          // 0: local bottom, 1: left, 2: top, 3: right (clockwise)
          const numPlayers = G.players.length;
          const relativeIdx = (p.id - localPlayerId + numPlayers) % numPlayers;
          
          const positions: Record<number, string> = {
            1: 'left-10 top-1/2 -translate-y-1/2',   // Left
            2: 'top-3 left-1/2 -translate-x-1/2',     // Top
            3: 'right-10 top-1/2 -translate-y-1/2',  // Right
          };

          // If only 2 players, put opponent at top
          const positionClass = numPlayers === 2 ? positions[2] : (positions[relativeIdx] || positions[2]);
          
          return (
            <div key={p.id} className={`absolute flex flex-col items-center gap-1 z-[15] ${positionClass} ${p.isEliminated ? 'opacity-40 grayscale-[30%]' : ''}`}>
              <div className="text-foreground/60 text-[11px] tracking-wider uppercase flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold))] ${G.turnIndex === p.id ? 'animate-pulse' : 'opacity-0'}`} />
                <span>{p.name} {p.isEliminated ? '(OUT)' : ''}</span>
                {p.points !== undefined && p.points > 0 && (
                  <span className="text-gold/40 text-[9px] ml-1">[{p.points}pts]</span>
                )}
              </div>
              {!p.isEliminated ? (
                <div className="flex">
                  {p.hand.map((card, i) => (
                    <div key={i} className="w-9 h-[50px] rounded-[5px] border-2 border-gold/50 flex-shrink-0 -mx-1"
                      style={{
                        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                        boxShadow: '2px 2px 6px rgba(0,0,0,0.4)',
                      }}>
                      <div className="w-full h-full flex items-center justify-center text-gold/40 text-lg">♠</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-destructive/60 font-bold uppercase tracking-widest mt-1">Eliminated</div>
              )}
              {/* Opp stack */}
              {G.turnIndex === p.id && G.oppStack.length > 0 && (
                <div className="flex items-center justify-center min-h-[50px]">
                  {G.oppStack.map((c, i) => (
                    <div key={i} className="w-9 h-[50px] rounded bg-white border border-gray-300 overflow-hidden shadow-lg"
                      style={{ transform: `translateX(${(i - 1) * 15}px) rotate(${(i - 1) * 8}deg)` }}>
                      <img src={cardUrl(c)} alt={c.id} className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Center */}
        <div className="flex flex-col items-center gap-4 z-10">
          <div className="flex gap-8 items-center">
            {/* Draw pile */}
            <div className="text-center">
              <div className="relative cursor-pointer group" onClick={isPlayerTurn ? drawCard : undefined}
                style={{ opacity: isPlayerTurn ? 1 : 0.5 }}>
                <div className="w-[72px] h-[101px] rounded-[7px] border-2 border-gold/50 flex items-center justify-center transition-transform group-hover:-translate-y-1"
                  style={{
                    background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #1a237e 100%)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  }}>
                  <span className="text-gold/40 text-2xl">♠</span>
                </div>
                <div className="absolute -top-2.5 -right-2.5 bg-gold text-primary-foreground text-[11px] font-bold w-[22px] h-[22px] rounded-full flex items-center justify-center z-[5]">
                  {G.deck.length}
                </div>
              </div>
              <div className="text-gold/50 text-[10px] tracking-[2px] uppercase mt-1.5">Draw</div>
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
              <div className={`text-[10px] tracking-[2px] uppercase mt-1.5 ${G.stack.length > 0 ? 'text-emerald-400' : 'text-gold/50'}`}>
                {G.stack.length > 0 ? 'Stack' : 'Discard'}
              </div>
            </div>
          </div>

          {/* Stack area */}
          <div className="flex items-center gap-4 min-h-[110px]">
            <div className="relative flex items-center justify-center min-w-[180px] min-h-[110px]">
              {G.stack.map((c, i) => (
                <div key={i}
                  onClick={() => isPlayerTurn && undoStackCard(i)}
                  className={`absolute transition-all duration-300 ${isPlayerTurn ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} ${i === G.stack.length - 1 ? 'drop-shadow-[0_0_12px_hsl(var(--gold)/0.9)] z-[100]' : ''}`}
                  style={{ transform: `translateX(${(i - 1) * 30}px) rotate(${(i - 1) * 8}deg)` }}>
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
              {G.stack.length > 0 && (
                <div className="absolute -top-2.5 -right-2.5 bg-gradient-to-br from-destructive to-red-800 text-white text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center z-[200] shadow-lg">
                  {G.stack.length}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {hasStack && G.stack.length === 1 && (
                <button onClick={playStack}
                  className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-2 border-emerald-300/40 text-white font-semibold text-sm px-5 py-2.5 rounded-lg uppercase tracking-wider shadow-[0_4px_16px_rgba(46,204,113,0.4)] hover:scale-105 transition-transform z-[1000]">
                  ▶ Play
                </button>
              )}
              {hasStack && G.stack.length > 1 && (
                <button onClick={playStack}
                  className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-2 border-emerald-300/40 text-white font-semibold text-sm px-5 py-2.5 rounded-lg uppercase tracking-wider shadow-[0_4px_16px_rgba(46,204,113,0.4)] hover:scale-105 transition-transform z-[1000]">
                  ▶ Stack
                </button>
              )}
            </div>
          </div>

          {/* Penalty */}
          {G.pending > 0 && (
            <div className="bg-destructive/20 border border-destructive/50 text-red-400 text-sm font-semibold px-3.5 py-1 rounded-full">
              ⚠ Draw penalty: {G.pending}
            </div>
          )}

          {G.wildSuit && (
            <div className="text-gold-light text-sm font-medium">
              Wild Suit: {G.wildSuit.toUpperCase()}
            </div>
          )}
        </div>

        {/* Player area */}
        <div className="absolute bottom-0 left-0 right-0 h-[175px] flex flex-col items-center justify-end pb-2 z-[15]">
          <div className="text-foreground/70 text-[11px] tracking-[2px] uppercase mb-1.5 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full bg-gold shadow-[0_0_8px_hsl(var(--gold))] ${isPlayerTurn ? 'animate-pulse' : 'opacity-0'}`} />
            <span>Your Hand</span>
          </div>
          <div className="relative w-full h-[130px] flex items-end justify-center">
            {handCards.map(({ card, realIndex }, i) => {
              const angle = aStart + step * i;
              const lift = Math.abs(angle) * 0.4;
              let ok = false;
              if (isPlayerTurn) {
                try { ok = gameManager.isPlayable(card); } catch { ok = false; }
              }
              return (
                <div key={card.id + '-' + i}
                  onClick={() => isPlayerTurn && playCard(realIndex)}
                  className={`absolute bottom-0 origin-bottom transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${ok ? 'cursor-pointer hover:brightness-110 hover:drop-shadow-[0_0_8px_hsl(var(--gold)/0.7)]' : 'grayscale-[50%] brightness-[0.65] cursor-not-allowed'}`}
                  style={{
                    left: `calc(50% + ${(i - handCards.length / 2) * 50}px)`,
                    transform: `rotate(${angle}deg) translateY(-${lift}px)`,
                    zIndex: i + 1,
                  }}
                  onMouseEnter={e => { if (ok) (e.currentTarget.style.transform = `rotate(${angle}deg) translateY(-${lift + 22}px)`); }}
                  onMouseLeave={e => { e.currentTarget.style.transform = `rotate(${angle}deg) translateY(-${lift}px)`; }}
                >
                  <div className="w-[72px] h-[101px] rounded-[7px] bg-white border-[1.5px] border-gray-300 shadow-lg overflow-hidden">
                    <img src={cardUrl(card)} alt={card.id} className="w-full h-full object-contain" />
                  </div>
                </div>
              );
            })}
            {showMore && (
              <div className="absolute bottom-0.5 right-1.5 bg-gold/25 border border-gold/45 text-gold-light text-[10px] px-2 py-0.5 rounded-xl">
                +{player.hand.length - MAX_VISIBLE} more
              </div>
            )}
          </div>
        </div>

        {/* Hand navigation */}
        {player && player.hand.length > 5 && (
          <div className="absolute bottom-5 left-0 right-0 flex justify-between px-[270px] z-[20] pointer-events-none">
            <button onClick={() => rotateHand(-1)}
              className="pointer-events-auto w-8 h-8 rounded-full bg-gold/20 border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/40 transition-colors">
              ◀
            </button>
            <button onClick={() => rotateHand(1)}
              className="pointer-events-auto w-8 h-8 rounded-full bg-gold/20 border border-gold/40 text-gold flex items-center justify-center hover:bg-gold/40 transition-colors">
              ▶
            </button>
          </div>
        )}

        {/* Last Card button */}
        {canLC && (
          <button onClick={callLastCard}
            className="absolute bottom-[52px] right-5 bg-gradient-to-br from-game-red to-red-900 border-2 border-red-400/40 text-white font-display text-sm font-bold px-4 py-2 rounded-lg tracking-wider uppercase z-[25] shadow-[0_4px_16px_rgba(204,34,34,0.4)] hover:scale-105 transition-transform">
            Last Card!
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="bg-black/50 border-t border-gold/20 px-5 py-2 flex items-center gap-3 min-h-[40px] z-[20]">
        <span className="text-gold-light text-sm font-medium flex-1">{computedStatusMsg}</span>
        <span className="bg-gold/15 border border-gold/40 text-gold text-[11px] px-2.5 py-0.5 rounded-full tracking-wider">
          {G.turnIndex === localPlayerId ? 'YOUR TURN' : `${G.players[G.turnIndex]?.name.toUpperCase()}'S TURN`}
        </span>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center">
          <div className="bg-gradient-to-br from-[#1a2a4a] to-[#0d1f3c] border border-gold/50 rounded-2xl p-8 text-center max-w-[380px] w-[90%] shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
            <h2 className="font-display text-gold-light text-2xl mb-3">{modal.title}</h2>
            <p className="text-foreground/75 text-sm mb-6 leading-relaxed whitespace-pre-line">{modal.message}</p>
            <button onClick={() => {
              setModal(null);
              if (modal.title !== '📖 Rules') {
                if (onBackToMode) {
                  onBackToMode();
                } else if (localGame.newGame) {
                  localGame.newGame();
                }
              }
            }}
              className="bg-gradient-to-br from-gold to-gold-light text-primary-foreground font-bold text-sm px-6 py-3 rounded-lg tracking-wider uppercase hover:scale-105 transition-transform">
              {modal.title === '📖 Rules' ? 'Close' : 'Back to Menu'}
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/95 border border-gold/50 text-gold-light font-display text-lg px-7 py-3 rounded-xl z-[300] pointer-events-none text-center animate-in fade-in zoom-in-95 duration-200">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default LastCardGame;
