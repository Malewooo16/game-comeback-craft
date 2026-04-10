// Lobby system for game creation and joining
import { Player, createPlayer } from './gameState';

/**
 * Generate a simple UUID v4-like ID
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type GameMode = 'local' | 'multiplayer';

export interface PlayerInfo {
  id: number;
  name: string;
  isLocal: boolean;
  isReady: boolean;
  joinedAt: number;
}

export interface GameLobby {
  id: string;
  joinCode: string;
  mode: GameMode;
  players: PlayerInfo[];
  maxPlayers: number;
  isReady: boolean;
  createdAt: number;
  createdBy: number;
  cpuCount?: number; // For local mode
}

export interface GameConfig {
  name?: string;
  mode: GameMode;
  maxPlayers?: number;
  cpuCount?: number; // 1-3 for local mode
}

/**
 * Lobby manager - handles game creation and joining
 */
export class LobbyManager {
  private lobbies: Map<string, GameLobby> = new Map();
  private joinCodes: Map<string, string> = new Map(); // joinCode -> gameId
  private playerLobbies: Map<number, string> = new Map(); // playerId -> gameId
  private readonly STORAGE_KEY = 'last-card-lobbies';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Load lobbies from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.lobbies) {
          this.lobbies = new Map(Object.entries(data.lobbies));
        }
        if (data.joinCodes) {
          this.joinCodes = new Map(Object.entries(data.joinCodes));
        }
        if (data.playerLobbies) {
          this.playerLobbies = new Map(Object.entries(data.playerLobbies).map(([key, val]) => [Number(key), val as string]));
        }
      }
    } catch (e) {
      console.error('Failed to load lobbies from storage:', e);
    }
  }

  /**
   * Save lobbies to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        lobbies: Object.fromEntries(this.lobbies),
        joinCodes: Object.fromEntries(this.joinCodes),
        playerLobbies: Object.fromEntries(this.playerLobbies),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save lobbies to storage:', e);
    }
  }

  /**
   * Create a new game lobby
   */
  createGame(playerName: string, config: GameConfig): GameLobby {
    const gameId = generateId();
    const joinCode = this.generateJoinCode();
    const playerId = 0; // Creator is always player 0

    const players: PlayerInfo[] = [
      {
        id: playerId,
        name: playerName,
        isLocal: true,
        isReady: true,
        joinedAt: Date.now(),
      },
    ];

    // Add CPU players for local mode
    if (config.mode === 'local' && config.cpuCount) {
      for (let i = 1; i <= config.cpuCount; i++) {
        // CPU players are marked as "ready" immediately
        players.push({
          id: i,
          name: `CPU ${i}`,
          isLocal: false,
          isReady: true,
          joinedAt: Date.now(),
        });
      }
    }

    const lobby: GameLobby = {
      id: gameId,
      joinCode,
      mode: config.mode,
      players,
      maxPlayers:
        config.mode === 'local'
          ? 1 + (config.cpuCount || 1)
          : config.maxPlayers || 4,
      isReady:
        config.mode === 'local' ||
        (config.mode === 'multiplayer' ? false : false),
      createdAt: Date.now(),
      createdBy: playerId,
      cpuCount: config.cpuCount,
    };

    this.lobbies.set(gameId, lobby);
    this.joinCodes.set(joinCode, gameId);
    this.playerLobbies.set(playerId, gameId);
    this.saveToStorage();

    return lobby;
  }

  /**
   * Join existing game via join code
   */
  joinGame(joinCode: string, playerName: string): GameLobby | null {
    const gameId = this.joinCodes.get(joinCode);
    if (!gameId) {
      console.error('Invalid join code:', joinCode);
      return null;
    }

    const lobby = this.lobbies.get(gameId);
    if (!lobby) {
      console.error('Game not found:', gameId);
      return null;
    }

    // Check if game is full
    if (lobby.players.length >= lobby.maxPlayers) {
      console.error('Game is full');
      return null;
    }

    // Check if already joined
    const existing = lobby.players.find(p => p.name === playerName);
    if (existing) {
      console.error('Player already in game');
      return null;
    }

    // Only allow joining if game hasn't started (multiplayer mode)
    if (lobby.mode === 'multiplayer' && lobby.isReady) {
      console.error('Game already started');
      return null;
    }

    // Add player
    const newPlayerId = lobby.players.length;
    lobby.players.push({
      id: newPlayerId,
      name: playerName,
      isLocal: true,
      isReady: false,
      joinedAt: Date.now(),
    });

    this.playerLobbies.set(newPlayerId, gameId);
    this.saveToStorage();

    // Check if all players ready for multiplayer
    if (lobby.mode === 'multiplayer') {
      const allReady = lobby.players.every(p => p.isReady);
      if (allReady && lobby.players.length === lobby.maxPlayers) {
        lobby.isReady = true;
      }
    }

    return lobby;
  }

  /**
   * Mark player as ready in multiplayer game
   */
  playerReady(gameId: string, playerId: number): GameLobby | null {
    const lobby = this.lobbies.get(gameId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    player.isReady = true;

    // Check if all players ready
    const allReady = lobby.players.every(p => p.isReady);
    if (allReady && lobby.mode === 'multiplayer') {
      lobby.isReady = true;
    }

    return lobby;
  }

  /**
   * Get lobby by ID
   */
  getLobby(gameId: string): GameLobby | null {
    return this.lobbies.get(gameId) || null;
  }

  /**
   * Get lobby by join code
   */
  getLobbyByCode(joinCode: string): GameLobby | null {
    const gameId = this.joinCodes.get(joinCode);
    return gameId ? this.lobbies.get(gameId) || null : null;
  }

  /**
   * Get lobby for player
   */
  getPlayerLobby(playerId: number): GameLobby | null {
    const gameId = this.playerLobbies.get(playerId);
    return gameId ? this.lobbies.get(gameId) || null : null;
  }

  /**
   * Generate shareable link
   */
  generateShareLink(gameId: string): string {
    const lobby = this.lobbies.get(gameId);
    if (!lobby) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/join/${lobby.joinCode}`;
  }

  /**
   * Leave game/lobby
   */
  leaveGame(gameId: string, playerId: number): void {
    const lobby = this.lobbies.get(gameId);
    if (!lobby) return;

    const playerIdx = lobby.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return;

    lobby.players.splice(playerIdx, 1);

    // Delete empty lobbies
    if (lobby.players.length === 0) {
      this.lobbies.delete(gameId);
      this.joinCodes.delete(lobby.joinCode);
    }

    this.playerLobbies.delete(playerId);
  }

  /**
   * Generate unique 6-character join code
   */
  private generateJoinCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (this.joinCodes.has(code)) {
      return this.generateJoinCode();
    }
    return code;
  }

  /**
   * Convert lobby to game players
   */
  lobbyToPlayers(lobby: GameLobby): Player[] {
    return lobby.players.map(info =>
      createPlayer(info.id, info.name, info.isLocal),
    );
  }
}

/**
 * Singleton instance
 */
let instance: LobbyManager | null = null;

export function getLobbyManager(): LobbyManager {
  if (!instance) {
    instance = new LobbyManager();
  }
  return instance;
}

/**
 * Reset lobby manager (for testing)
 */
export function resetLobbyManager(): void {
  instance = null;
}
