// Server client - communicates with backend via Pusher and REST API
import Pusher from 'pusher-js';
import { GameState, GameMove, ServerMessage } from '../types/server';

export interface ServerClientConfig {
  serverUrl: string; // e.g., 'http://localhost:3001'
  pusherKey: string; // e.g., 'your-pusher-key'
  pusherCluster: string; // e.g., 'mt1'
}

export class ServerClient {
  private config: ServerClientConfig;
  private pusher: Pusher | null = null;
  private channel: any | null = null;
  private gameId: string | null = null;
  private playerId: number | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(config: ServerClientConfig) {
    this.config = config;
  }

  /**
   * Create a new game on the server
   */
  async createGame(players: any[]): Promise<{ gameId: string; players: any[] }> {
    const response = await fetch(`${this.config.serverUrl}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players }),
    });

    if (!response.ok) {
      throw new Error('Failed to create game');
    }

    return response.json();
  }

  /**
   * Join a game (establish Pusher connection)
   */
  async joinGame(gameId: string, playerId: number): Promise<GameState> {
    return new Promise((resolve, reject) => {
      try {
        this.gameId = gameId;
        this.playerId = playerId;

        // Initialize Pusher
        this.pusher = new Pusher(this.config.pusherKey, {
          cluster: this.config.pusherCluster,
          forceTLS: true,
        });

        console.log('[ServerClient] Connecting to Pusher with key:', this.config.pusherKey);
        console.log('[ServerClient] Auth endpoint:', `${this.config.serverUrl}/pusher/auth`);

        // Subscribe to game channel (using public channel for now)
        this.channel = this.pusher.subscribe(`game-${gameId}`);

        this.channel.bind('game-state', (message: ServerMessage) => {
          console.log('[ServerClient] Received game-state');
          this.emit('game-state', message.data);
        });

        this.channel.bind('move-applied', (message: ServerMessage) => {
          console.log('[ServerClient] Move applied');
          this.emit('move-applied', message.data);
        });

        this.channel.bind('invalid-move', (message: ServerMessage) => {
          console.log('[ServerClient] Invalid move:', message.error);
          this.emit('invalid-move', message);
        });

        this.channel.bind('player-joined', (message: ServerMessage) => {
          console.log('[ServerClient] Player joined');
          this.emit('player-joined', message.data);
        });

        this.channel.bind('rematch-request', (message: ServerMessage) => {
          console.log('[ServerClient] Rematch request received');
          this.emit('rematch-request', message.data);
        });

        this.channel.bind('rematch-response', (message: ServerMessage) => {
          console.log('[ServerClient] Rematch response received');
          this.emit('rematch-response', message.data);
        });

        this.channel.bind('rematch-cancelled', (message: ServerMessage) => {
          console.log('[ServerClient] Rematch cancelled received');
          this.emit('rematch-cancelled', message.data);
        });

        this.channel.bind('pusher:subscription_succeeded', () => {
          console.log('[ServerClient] Subscribed to game channel successfully');

          // Notify server of connection
          this.notifyConnect().then(() => {
            // Fetch initial state
            this.fetchGameState(gameId).then(resolve).catch(reject);
          });
        });

        this.channel.bind('pusher:subscription_error', (error: any) => {
          console.error('[ServerClient] Subscription error:', error);
          reject(new Error(`Pusher subscription failed: ${error.message || error}`));
        });

        // Handle Pusher errors
        this.pusher.connection.bind('error', (error: any) => {
          console.error('[ServerClient] Pusher connection error:', error);
        });
      } catch (error) {
        console.error('[ServerClient] Initialization error:', error);
        reject(error);
      }
    });
  }

  /**
   * Fetch initial game state from server
   */
  private async fetchGameState(gameId: string): Promise<GameState> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/games/${gameId}/state`);
      if (!response.ok) {
        console.warn(`[ServerClient] Initial state fetch failed (${response.status}), using default state`);
        return this.createDefaultGameState(gameId);
      }
      const data = await response.json();
      return data.state || this.createDefaultGameState(gameId);
    } catch (err) {
      console.warn('[ServerClient] Failed to fetch initial state:', err);
      return this.createDefaultGameState(gameId);
    }
  }

  /**
   * Create a default game state
   */
  private createDefaultGameState(gameId: string): GameState {
    return {
      gameId,
      turnIndex: 0,
      dir: 1,
      players: [],
      deck: [],
      discard: [],
      stack: [],
      oppStack: [],
      offset: 0,
      pending: 0,
      over: false,
      jokerPrev: null,
      jokerOnTop: false,
      jokerWild: false,
      wildSuit: null,
      gameMode: 'multiplayer',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Notify server of connection
   */
  private async notifyConnect(): Promise<void> {
    try {
      const response = await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: this.playerId }),
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Server returned ${response.status}`);
      }
      // 404 is OK for now - endpoint might not exist yet
      console.log('[ServerClient] Connection notification sent');
    } catch (err) {
      console.warn('[ServerClient] Failed to notify connect (non-critical):', err);
      // Don't reject - this is non-critical for game to start
    }
  }

  /**
   * Send a game move
   */
  async sendMove(move: GameMove): Promise<void> {
    if (!this.gameId) {
      throw new Error('Not connected to game');
    }

    const response = await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Move failed');
    }
  }

  /**
   * Request state sync via REST
   */
  async syncRequest(): Promise<GameState> {
    if (!this.gameId) {
      throw new Error('Not connected to game');
    }

    const response = await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/state`);
    if (!response.ok) {
      throw new Error('Failed to sync state');
    }
    const data = await response.json();
    return data.state;
  }

  /**
   * Listen for server events
   */
  on(eventType: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * Emit event to listeners
   */
  private emit(eventType: string, data: any): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in listener for ${eventType}:`, err);
        }
      });
    }
  }

  /**
   * Disconnect from Pusher
   */
  async disconnect(): Promise<void> {
    if (this.gameId && this.playerId) {
      try {
        await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: this.playerId }),
        });
      } catch (err) {
        console.error('Error notifying disconnect:', err);
      }
    }

    if (this.channel) {
      this.pusher?.unsubscribe(`game-${this.gameId}`);
      this.channel = null;
    }

    if (this.pusher) {
      this.pusher.disconnect();
      this.pusher = null;
    }

    console.log('[ServerClient] Disconnected from server');
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.pusher !== null && this.channel !== null;
  }

  /**
   * Request a rematch
   */
  async requestRematch(): Promise<{ success: boolean; message?: string }> {
    if (!this.gameId || !this.playerId) {
      throw new Error('Not connected to game');
    }

    const response = await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/rematch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: this.playerId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Rematch request failed');
    }

    return response.json();
  }

  /**
   * Respond to a rematch request
   */
  async respondRematch(accepted: boolean): Promise<{ success: boolean; newGameId?: string }> {
    if (!this.gameId || !this.playerId) {
      throw new Error('Not connected to game');
    }

    const response = await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/rematch/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: this.playerId, accepted }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Rematch response failed');
    }

    return response.json();
  }

  /**
   * Cancel a rematch request
   */
  async cancelRematch(): Promise<{ success: boolean; message?: string }> {
    if (!this.gameId || !this.playerId) {
      throw new Error('Not connected to game');
    }

    const response = await fetch(`${this.config.serverUrl}/api/games/${this.gameId}/rematch/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: this.playerId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Cancel rematch failed');
    }

    return response.json();
  }
}

// Create singleton instance
let serverClient: ServerClient | null = null;

export function getServerClient(config?: ServerClientConfig): ServerClient {
  if (!serverClient) {
    if (!config) {
      // Use defaults for development
      config = {
        serverUrl: import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',
        pusherKey: import.meta.env.VITE_PUSHER_KEY || 'local-dev',
        pusherCluster: import.meta.env.VITE_PUSHER_CLUSTER || 'mt1',
      };
    }
    serverClient = new ServerClient(config);
  }
  return serverClient;
}

export function resetServerClient(): void {
  serverClient?.disconnect();
  serverClient = null;
}
