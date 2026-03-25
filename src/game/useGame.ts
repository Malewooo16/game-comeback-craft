import { useState, useCallback, useRef, useEffect } from 'react';
import { GameEngine, GameEvent } from './engine';

export function useGame() {
  const engineRef = useRef<GameEngine>(new GameEngine());
  const [, setTick] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("Your turn — play a card or draw");
  const [modal, setModal] = useState<{ title: string; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const onChange = useCallback(() => {
    const events = engineRef.current.flushEvents();
    events.forEach((e: GameEvent) => {
      if (e.type === 'toast') {
        setToastMsg(e.message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(null), 1900);
      }
      if (e.type === 'status') setStatusMsg(e.message);
      if (e.type === 'modal') setModal({ title: e.title, message: e.message });
    });
    setTick(t => t + 1);
  }, []);

  const newGame = useCallback(() => {
    setModal(null);
    engineRef.current.newGame(onChange);
  }, [onChange]);

  useEffect(() => {
    newGame();
    return () => engineRef.current.clearTimeouts();
  }, [newGame]);

  const playCard = useCallback((idx: number) => engineRef.current.playCard(idx, onChange), [onChange]);
  const playStack = useCallback(() => engineRef.current.playStack(onChange), [onChange]);
  const undoStackCard = useCallback((idx: number) => engineRef.current.undoStackCard(idx, onChange), [onChange]);
  const drawCard = useCallback(() => engineRef.current.drawCard(onChange), [onChange]);
  const callLastCard = useCallback(() => engineRef.current.callLastCard(onChange), [onChange]);
  const rotateHand = useCallback((d: number) => engineRef.current.rotateHand(d, onChange), [onChange]);

  return {
    state: engineRef.current.state,
    engine: engineRef.current,
    toastMsg,
    statusMsg,
    modal,
    setModal,
    newGame,
    playCard,
    playStack,
    undoStackCard,
    drawCard,
    callLastCard,
    rotateHand,
  };
}
