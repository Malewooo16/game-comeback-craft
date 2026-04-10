// Pusher service for real-time multiplayer sync
import { GameState } from '../game/gameState';

export interface MoveEvent {
  gameId: string;
  playerId: number;
  timestamp: number;
  moveType: 'play' | 'draw' | 'callLastCard' | 'undoStack' | 'playStack';
  payload: unknown;
  stateHash: string;
}

export interface PusherConfig {
  key: string;
  cluster: string;
  serverUrl?: string;
}

/**
 * Pusher service for real-time game synchronization
 * This is a mock implementation - replace with actual Pusher client in production
 */
export class PusherService {
  private config: PusherConfig;
  private channels: Map<string, { listeners: Set<(event: MoveEvent) => void> }> = new Map();
  private moveBuffer: Map<string, MoveEvent[]> = new Map();

  constructor(config: PusherConfig) {
    this.config = config;
  }

  /**
   * Join a game channel
   */
  async joinGameChannel(gameId: string): Promise<void> {
    if (!this.channels.has(gameId)) {
      this.channels.set(gameId, { listeners: new Set() });
    }
    console.log(`[Pusher] Joined channel: game-${gameId}`);
    return Promise.resolve();
  }

  /**
   * Subscribe to a lobby channel
   */
  subscribe(channelName: string): { bind: (event: string, callback: (data: any) => void) => void } {
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, { listeners: new Set() });
    }
    console.log(`[Pusher] Subscribed to channel: ${channelName}`);
    
    // Return a channel-like object with bind method
    return {
      bind: (event: string, callback: (data: any) => void) => {
        const channel = this.channels.get(channelName);
        if (channel) {
          // Wrap callback to match expected type
          channel.listeners.add(callback as any);
        }
      }
    };
  }

  /**
   * Unsubscribe from a lobby channel
   */
  unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.listeners.clear();
      this.channels.delete(channelName);
    }
    console.log(`[Pusher] Unsubscribed from channel: ${channelName}`);
  }

  /**
   * Broadcast move to all players in channel
   */
  async broadcastMove(event: MoveEvent): Promise<void> {
    const channelName = `game-${event.gameId}`;
    const channel = this.channels.get(event.gameId);

    if (!channel) {
      console.warn(`[Pusher] Channel not found: ${channelName}`);
      return;
    }

    // Buffer the move
    if (!this.moveBuffer.has(event.gameId)) {
      this.moveBuffer.set(event.gameId, []);
    }
    this.moveBuffer.get(event.gameId)!.push(event);

    // Notify all listeners (in production, Pusher server would handle this)
    // Simulate network delay of 50-150ms
    return new Promise(resolve => {
      setTimeout(() => {
        channel.listeners.forEach(listener => {
          try {
            listener(event);
          } catch (err) {
            console.error('[Pusher] Error in listener:', err);
          }
        });
        resolve();
      }, 50 + Math.random() * 100);
    });
  }

  /**
   * Register listener for remote moves
   */
  onRemoteMove(callback: (event: MoveEvent) => void): () => void {
    // This implementation would work with actual Pusher SDK
    // For now, returns unsubscribe function
    const unsubscribe = () => {
      // Cleanup would happen here
    };
    return unsubscribe;
  }

  /**
   * Sync full game state to server
   */
  async syncGameState(state: GameState): Promise<void> {
    console.log(`[Pusher] Syncing game state for ${state.gameId}`);
    // In production: Send state to server for archival/replay
    return Promise.resolve();
  }

  /**
   * Leave game channel
   */
  leaveGame(gameId: string): void {
    const channel = this.channels.get(gameId);
    if (channel) {
      channel.listeners.clear();
      this.channels.delete(gameId);
      this.moveBuffer.delete(gameId);
    }
    console.log(`[Pusher] Left channel: game-${gameId}`);
  }

  /**
   * Get move history for a game (for replay/debugging)
   */
  getMoveHistory(gameId: string): MoveEvent[] {
    return this.moveBuffer.get(gameId) || [];
  }

  /**
   * Clear move history
   */
  clearMoveHistory(gameId: string): void {
    this.moveBuffer.delete(gameId);
  }
}

/**
 * Factory function to create Pusher service
 */
export function createPusherService(config: PusherConfig): PusherService {
  return new PusherService(config);
}

let instance: PusherService | null = null;

export function getPusherService(): PusherService {
  if (!instance) {
    // In local dev, use defaults or from env
    instance = new PusherService({
      key: import.meta.env.VITE_PUSHER_KEY || 'local',
      cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'mt1',
    });
  }
  return instance;
}

/**
 * In production, replace the PusherService above with actual Pusher integration:
 *
 * import Pusher from 'pusher-js';
 *
 * export class PusherService {
 *   private pusher: Pusher;
 *   private channels: Map<string, Channel> = new Map();
 *
 *   constructor(config: PusherConfig) {
 *     this.pusher = new Pusher(config.key, {
 *       cluster: config.cluster,
 *       // ... other options
 *     });
 *   }
 *
 *   async joinGameChannel(gameId: string): Promise<void> {
 *     const channel = this.pusher.subscribe(`private-game-${gameId}`);
 *     this.channels.set(gameId, channel);
 *   }
 *
 *   async broadcastMove(event: MoveEvent): Promise<void> {
 *     // Send to backend API which pushes to channel
 *     await fetch('/api/games/' + event.gameId + '/moves', {
 *       method: 'POST',
 *       body: JSON.stringify(event),
 *     });
 *   }
 *
 *   onRemoteMove(callback: (event: MoveEvent) => void): () => void {
 *     const handler = (data: MoveEvent) => callback(data);
 *     // Subscribe to movement events
 *     // Returns unsubscribe function
 *   }
 * }
 */
