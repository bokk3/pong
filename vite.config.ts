import { defineConfig, Plugin } from 'vite';

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

function presenceDevPlugin(): Plugin {
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
      if (now - room.lastSeen > 25000) {
        activeRooms.delete(id);
      }
    }
  }

  function getResponse(excludePeerId?: string) {
    cleanupStaleData();
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

    const rooms = Array.from(activeRooms.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return {
      onlineCount: activePeers.size,
      lookingCount,
      playingCount,
      pongGamesCount: Math.ceil(pongGamesCount / 2),
      curveGamesCount: Math.ceil(curveGamesCount / 2),
      candidates,
      rooms
    };
  }

  return {
    name: 'presence-dev-plugin',
    configureServer(server) {
      server.middlewares.use('/api/presence', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}') as Partial<PeerPresence> & {
                action?: 'presence' | 'create_room' | 'update_room' | 'close_room';
                roomData?: Partial<ActiveRoom>;
              };
              const { peerId, username, status, gameMode, region, action, roomData } = data;
              if (peerId) {
                if (status === 'leave') {
                  activePeers.delete(peerId);
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
              }
              const responseData = getResponse(peerId);
              res.end(JSON.stringify(responseData));
            } catch (err: unknown) {
              res.statusCode = 500;
              const msg = err instanceof Error ? err.message : 'Server error';
              res.end(JSON.stringify({ error: msg }));
            }
          });
        } else {
          const responseData = getResponse();
          res.end(JSON.stringify(responseData));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [presenceDevPlugin()],
  server: {
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext'
  }
});

