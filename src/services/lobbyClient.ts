export interface ServerLobby {
  id: string;
  joinCode: string;
  players: {
    id: number;
    name: string;
    avatarUrl?: string | null;
    joinedAt: string;
    isReady: boolean;
  }[];
  maxPlayers: number;
  status: 'waiting' | 'active' | 'finished';
  hostId: number | null;
  gameId?: string | null;
  createdAt: string;
}

const API_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export async function createLobby(maxPlayers: number = 2): Promise<ServerLobby> {
  const response = await fetch(`${API_URL}/api/lobbies`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ maxPlayers }),
  });

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.error || 'Failed to create lobby');
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

export async function joinLobby(joinCode: string): Promise<ServerLobby> {
  const response = await fetch(`${API_URL}/api/lobbies/join`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ joinCode }),
  });

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.error || 'Failed to join lobby');
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

export async function getLobby(lobbyId: string): Promise<ServerLobby> {
  const response = await fetch(`${API_URL}/api/lobbies/${lobbyId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get lobby');
  }

  return response.json();
}

export async function setReady(lobbyId: string, isReady: boolean): Promise<ServerLobby> {
  const response = await fetch(`${API_URL}/api/lobbies/${lobbyId}/ready`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ isReady }),
  });

  if (!response.ok) {
    const error = await response.json();
    const err = new Error(error.error || 'Failed to set ready state');
    (err as any).status = response.status;
    throw err;
  }

  return response.json();
}

export async function leaveLobby(lobbyId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/lobbies/${lobbyId}/leave`, {
    method: 'POST',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to leave lobby');
  }
}
