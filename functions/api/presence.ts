interface PeerPresence {
  peerId: string;
  username: string;
  status: 'menu' | 'searching' | 'playing';
  region?: string;
  lastSeen: number;
}

// In-memory edge presence cache (persists in warm Cloudflare Workers instances)
const activePeers = new Map<string, PeerPresence>();

function cleanupStalePeers(): void {
  const now = Date.now();
  for (const [id, peer] of activePeers.entries()) {
    // 20s timeout for heartbeats
    if (now - peer.lastSeen > 20000) {
      activePeers.delete(id);
    }
  }
}

export async function onRequestPost(context: { request: Request }): Promise<Response> {
  try {
    const data = await context.request.json() as Partial<PeerPresence>;
    const { peerId, username, status, region } = data;

    if (!peerId) {
      return new Response(JSON.stringify({ error: 'Missing peerId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (status === 'leave') {
      activePeers.delete(peerId);
    } else {
      activePeers.set(peerId, {
        peerId,
        username: username || 'Player',
        status: status || 'menu',
        region: region || 'global',
        lastSeen: Date.now()
      });
    }

    cleanupStalePeers();

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
  cleanupStalePeers();
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
  const candidates: Array<{ peerId: string; username: string; region?: string }> = [];

  for (const peer of activePeers.values()) {
    if (peer.status === 'searching') {
      lookingCount++;
      if (peer.peerId !== excludePeerId && candidates.length < 5) {
        candidates.push({
          peerId: peer.peerId,
          username: peer.username,
          region: peer.region
        });
      }
    } else if (peer.status === 'playing') {
      playingCount++;
    }
  }

  return new Response(JSON.stringify({
    lookingCount,
    playingCount,
    candidates
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}
