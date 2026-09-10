import { defineConfig, Plugin } from 'vite';

interface PeerPresence {
  peerId: string;
  username: string;
  status: 'menu' | 'searching' | 'playing';
  region?: string;
  lastSeen: number;
}

function presenceDevPlugin(): Plugin {
  const activePeers = new Map<string, PeerPresence>();

  function cleanupStalePeers(): void {
    const now = Date.now();
    for (const [id, peer] of activePeers.entries()) {
      if (now - peer.lastSeen > 20000) {
        activePeers.delete(id);
      }
    }
  }

  function getResponse(excludePeerId?: string) {
    cleanupStalePeers();
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

    return { lookingCount, playingCount, candidates };
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
              const data = JSON.parse(body || '{}') as Partial<PeerPresence>;
              const { peerId, username, status, region } = data;
              if (peerId) {
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
