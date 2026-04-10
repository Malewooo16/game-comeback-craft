// Legacy useGame hook - delegates to useLocalGame for backward compatibility
import { useLocalGame } from '../hooks/useLocalGame';

export function useGame(cpuCount?: 1 | 2 | 3) {
  return useLocalGame(cpuCount);
}
