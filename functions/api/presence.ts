interface PeerPresence {
  peerId: string;
  username: string;
  status: 'menu' | 'searching' | 'playing';
  gameMode?: 'PONG' | 'CURVE';
  roomName?: string;
  roomId?: string;
  region?: string;
  lastSeen: number;
}

interface ActiveRoom {
  roomId: string;
  roomName: string;
  hostPeerId: string;
  hostName: string;
  gameMode: 'PONG' | 'CURVE';
  status: 'waiting' | 'playing';
  targetScore: number;
  playerCount: number;
  createdAt: number;
  lastSeen: number;
}

// In-memory edge presence cache. It only lives as long as a warm worker isolate and is not shared
// between isolates/regions, so counts are approximate; the global room list comes from the ntfy relay.
const activePeers = new Map<string, PeerPresence>();
const activeRooms = new Map<string, ActiveRoom>();
const MAX_PEERS = 5000;
const MAX_ROOMS = 200;

function clampText(value: unknown, fallback: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

function cleanupStaleData(): void {
  const now = Date.now();
  for (const [id, peer] of activePeers.entries()) {
    if (now - peer.lastSeen > 40000) {
      activePeers.delete(id);
    }
  }

  for (const [id, room] of activeRooms.entries()) {
    // Host heartbeats every 20s; allow for one missed beat
    if (now - room.lastSeen > 50000) {
      activeRooms.delete(id);
    }
  }
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  try {
    const data = await context.request.json() as Partial<PeerPresence> & {
      action?: 'presence' | 'create_room' | 'update_room' | 'close_room';
      roomData?: Partial<ActiveRoom>;
    };

    const { peerId, region, action, roomData } = data;
    // Public endpoint: validate and clamp everything before it is stored or echoed back to other players
    const username = clampText(data.username, 'Player', 16);
    const gameMode: 'PONG' | 'CURVE' = data.gameMode === 'CURVE' ? 'CURVE' : 'PONG';
    const rawStatus = data.status as string | undefined;
    const status: PeerPresence['status'] | 'leave' =
      rawStatus === 'searching' || rawStatus === 'playing' || rawStatus === 'leave' ? rawStatus : 'menu';

    if (typeof peerId !== 'string' || !/^sp3d-[a-z0-9]{3,20}$/.test(peerId)) {
      return new Response(JSON.stringify({ error: 'Invalid peerId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    cleanupStaleData();
    // Hard caps so a flood of fake peers cannot grow worker memory without bound
    const canAddPeer = activePeers.has(peerId) || activePeers.size < MAX_PEERS;

    if (status === 'leave') {
      activePeers.delete(peerId);
      // Remove any room hosted by this peer
      for (const [rId, room] of activeRooms.entries()) {
        if (room.hostPeerId === peerId) {
          activeRooms.delete(rId);
        }
      }
    } else if (canAddPeer) {
      activePeers.set(peerId, {
        peerId,
        username,
        status,
        gameMode,
        region: clampText(region, 'global', 16),
        lastSeen: Date.now()
      });
    }

    // Room management actions. A peer may only list or close its own room (roomId === its peerId).
    if (action === 'create_room' || action === 'update_room') {
      const roomId = peerId;
      if (activeRooms.has(roomId) || activeRooms.size < MAX_ROOMS) {
        const roomMode: 'PONG' | 'CURVE' = roomData?.gameMode === 'CURVE' ? 'CURVE' : gameMode;
        const target = Number(roomData?.targetScore);
        activeRooms.set(roomId, {
          roomId,
          roomName: clampText(roomData?.roomName, `${username}'s Arena`, 32),
          hostPeerId: peerId,
          hostName: username,
          gameMode: roomMode,
          status: roomData?.status === 'playing' ? 'playing' : 'waiting',
          targetScore: [5, 11, 21].includes(target) ? target : (roomMode === 'CURVE' ? 5 : 11),
          playerCount: roomData?.playerCount === 2 ? 2 : 1,
          createdAt: activeRooms.get(roomId)?.createdAt || Date.now(),
          lastSeen: Date.now()
        });
      }
    } else if (action === 'close_room') {
      activeRooms.delete(peerId);
    }

    return getPresenceResponse(peerId);
  } catch (err: unknown) {
    // Usually a malformed JSON body; don't echo internals back
    void err;
    return new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestGet(): Promise<Response> {
  cleanupStaleData();
  return getPresenceResponse();
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function getPresenceResponse(excludePeerId?: string): Response {
  let lookingCount = 0;
  let playingCount = 0;
  let pongGamesCount = 0;
  let curveGamesCount = 0;
  const candidates: Array<{ peerId: string; username: string; gameMode?: 'PONG' | 'CURVE'; region?: string }> = [];

  for (const peer of activePeers.values()) {
    if (peer.status === 'searching') {
      lookingCount++;
      if (peer.peerId !== excludePeerId && candidates.length < 8) {
        candidates.push({
          peerId: peer.peerId,
          username: peer.username,
          gameMode: peer.gameMode,
          region: peer.region
        });
      }
    } else if (peer.status === 'playing') {
      playingCount++;
      if (peer.gameMode === 'CURVE') {
        curveGamesCount++;
      } else {
        pongGamesCount++;
      }
    }
  }

  // Active rooms list sorted newest first
  const rooms = Array.from(activeRooms.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20);

  return new Response(JSON.stringify({
    onlineCount: activePeers.size,
    lookingCount,
    playingCount,
    pongGamesCount: Math.ceil(pongGamesCount / 2),
    curveGamesCount: Math.ceil(curveGamesCount / 2),
    candidates,
    rooms
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

