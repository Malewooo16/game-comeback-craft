import React, { useEffect, useState } from 'react';
import { Trophy, ArrowLeft, Loader2, Star, Medal } from 'lucide-react';

interface LeaderboardPlayer {
  id: number;
  name: string;
  avatarUrl?: string | null;
  wins: number;
  totalGames: number;
}

export const Leaderboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [players, setPlayers] = useState<LeaderboardPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/leaderboard`);
        if (response.ok) {
          const data = await response.json();
          setPlayers(data);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0a0f1a] overflow-hidden text-white font-sans">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-gold/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <div className="w-full max-w-2xl px-8 z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="flex items-center justify-between mb-12">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white/40 hover:text-white transition-colors group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-[4px]">Return</span>
          </button>
          
          <div className="text-center">
            <h2 className="font-display text-5xl text-gold tracking-tight">Hall of Fame</h2>
            <p className="text-white/20 text-[10px] font-bold uppercase tracking-[4px] mt-2">Legendary Players</p>
          </div>
          
          <div className="w-20" /> {/* Spacer for centering */}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-[40px] p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="animate-spin text-gold" size={32} />
              <p className="text-white/20 text-[10px] font-bold uppercase tracking-[4px]">Accessing Records...</p>
            </div>
          ) : players.length > 0 ? (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {players.map((player, index) => {
                const isTopThree = index < 3;
                const colors = [
                  'from-gold/20 to-gold/5 border-gold/40',
                  'from-slate-400/20 to-slate-400/5 border-slate-400/40',
                  'from-amber-700/20 to-amber-700/5 border-amber-700/40',
                ];

                return (
                  <div 
                    key={player.id} 
                    className={`flex items-center gap-6 p-5 rounded-2xl border transition-all hover:scale-[1.01] ${
                      isTopThree ? `bg-gradient-to-br ${colors[index]}` : 'bg-white/5 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-10 flex flex-col items-center justify-center">
                      {index === 0 ? (
                        <Trophy className="text-gold" size={24} />
                      ) : index === 1 ? (
                        <Medal className="text-slate-400" size={24} />
                      ) : index === 2 ? (
                        <Medal className="text-amber-700" size={24} />
                      ) : (
                        <span className="font-display text-lg text-white/20">#{index + 1}</span>
                      )}
                    </div>

                    <div className="w-14 h-14 rounded-full border-2 border-white/10 p-1 flex-shrink-0">
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt={player.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <div className="w-full h-full rounded-full bg-white/5 flex items-center justify-center text-white/40 font-display">
                          {player.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-display text-xl text-white truncate">{player.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">{player.totalGames} Matches</span>
                        <div className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/60">
                          {player.totalGames > 0 ? Math.round((player.wins / player.totalGames) * 100) : 0}% Win Rate
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Star size={12} className={isTopThree ? 'text-gold fill-gold' : 'text-white/20'} />
                        <span className="font-display text-2xl text-white">{player.wins}</span>
                      </div>
                      <p className="text-[8px] font-black uppercase tracking-[3px] text-white/20">Victories</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 gap-6 opacity-20">
              <Trophy size={64} />
              <p className="text-[10px] font-bold uppercase tracking-[4px]">No Legends Recorded Yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
