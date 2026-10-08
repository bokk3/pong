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

// In-memory edge presence cache (persists in warm Cloudflare Workers instances)
const activePeers = new Map<string, PeerPresence>();
const activeRooms = new Map<string, ActiveRoom>();

function cleanupStaleData(): void {
  const now = Date.now();
  for (const [id, peer] of activePeers.entries()) {
    if (now - peer.lastSeen > 20000) {
      activePeers.delete(id);
    }
  }

  for (const [id, room] of activeRooms.entries()) {
    // 25s timeout for room host heartbeats
    if (now - room.lastSeen > 25000) {
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

    const { peerId, username, status, gameMode, region, action, roomData } = data;

    if (!peerId) {
      return new Response(JSON.stringify({ error: 'Missing peerId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (status === 'leave') {
      activePeers.delete(peerId);
      // Remove any room hosted by this peer
      for (const [rId, room] of activeRooms.entries()) {
        if (room.hostPeerId === peerId) {
          activeRooms.delete(rId);
        }
      }
    } else {
      activePeers.set(peerId, {
        peerId,
        username: username || 'Player',
        status: status || 'menu',
        gameMode: gameMode || 'PONG',
        region: region || 'global',
        lastSeen: Date.now()
      });
    }

    // Room management actions
    if (action === 'create_room' || action === 'update_room') {
      const roomId = roomData?.roomId || peerId;
      activeRooms.set(roomId, {
        roomId,
        roomName: roomData?.roomName || `${username || 'Player'}'s Arena`,
        hostPeerId: peerId,
        hostName: username || 'Player',
        gameMode: roomData?.gameMode || gameMode || 'PONG',
        status: roomData?.status || 'waiting',
        targetScore: roomData?.targetScore || (gameMode === 'CURVE' ? 5 : 11),
        playerCount: roomData?.playerCount || 1,
        createdAt: activeRooms.get(roomId)?.createdAt || Date.now(),
        lastSeen: Date.now()
      });
    } else if (action === 'close_room') {
      if (roomData?.roomId) {
        activeRooms.delete(roomData.roomId);
      }
    }

    cleanupStaleData();

    return getPresenceResponse(peerId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
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

