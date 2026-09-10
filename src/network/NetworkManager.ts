import { Peer, DataConnection } from 'peerjs';
import { EventBus } from '../core/EventBus';
import { MultiplayerRole } from '../types';
import { NetworkMessage } from './NetworkProtocol';

const PEER_PREFIX = 'sp3d-';
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

export class NetworkManager {
  private static instance: NetworkManager;
  private eventBus: EventBus;

  public peer: Peer | null = null;
  public conn: DataConnection | null = null;
  public role: MultiplayerRole = 'HOST';
  public localUsername: string = 'Player';
  public remoteUsername: string = 'Opponent';

  public isConnected: boolean = false;
  public pingMs: number = 0;
  private pingInterval: number | null = null;
  private presenceInterval: number | null = null;

  public onMessageReceived: ((msg: NetworkMessage) => void) | null = null;

  private constructor() {
    this.eventBus = EventBus.get();
    this.loadSavedUsername();
    this.startPresenceReporting();
  }

  public static get(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  private loadSavedUsername(): void {
    const saved = localStorage.getItem('spinpong_username');
    if (saved && saved.trim().length > 0) {
      this.localUsername = saved.trim().slice(0, 14);
    } else {
      const adjectives = ['Apex', 'Vortex', 'Spin', 'Cyber', 'Sonic', 'Flash', 'Hyper'];
      const nouns = ['Master', 'Ace', 'Paddle', 'Striker', 'Hero', 'Wizard', 'King'];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      this.localUsername = `${adj}${noun}`;
      localStorage.setItem('spinpong_username', this.localUsername);
    }
  }

  public setUsername(name: string): void {
    if (!name || name.trim().length === 0) return;
    this.localUsername = name.trim().slice(0, 14);
    localStorage.setItem('spinpong_username', this.localUsername);
  }

  public async initPeer(customRoomId?: string): Promise<string> {
    if (this.peer && !this.peer.destroyed) {
      return this.peer.id;
    }

    return new Promise((resolve, reject) => {
      const generatedId = customRoomId 
        ? `${PEER_PREFIX}${customRoomId.toLowerCase()}` 
        : `${PEER_PREFIX}${Math.random().toString(36).substring(2, 7)}`;

      this.peer = new Peer(generatedId, {
        config: { iceServers: STUN_SERVERS },
        debug: 0
      });

      this.peer.on('open', (id) => {
        this.setupIncomingConnectionHandler();
        resolve(id.replace(PEER_PREFIX, ''));
      });

      this.peer.on('error', (err: any) => {
        console.warn('[NetworkManager] Peer error:', err);
        if (err.type === 'unavailable-id') {
          // Retry with random ID if collision
          this.peer?.destroy();
          this.peer = null;
          this.initPeer().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  private setupIncomingConnectionHandler(): void {
    if (!this.peer) return;

    this.peer.on('connection', (incomingConn) => {
      if (this.isConnected) {
        incomingConn.close();
        return;
      }
      this.role = 'HOST';
      this.attachConnection(incomingConn);
    });
  }

  public async connectToPeer(roomId: string): Promise<boolean> {
    const targetPeerId = `${PEER_PREFIX}${roomId.toLowerCase()}`;
    await this.initPeer();

    return new Promise((resolve) => {
      const outgoing = this.peer!.connect(targetPeerId, {
        reliable: true
      });

      this.role = 'CLIENT';

      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          outgoing.close();
          resolve(false);
        }
      }, 5000);

      outgoing.on('open', () => {
        clearTimeout(timeout);
        this.attachConnection(outgoing);
        resolve(true);
      });

      outgoing.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private attachConnection(conn: DataConnection): void {
    this.conn = conn;

    conn.on('open', () => {
      this.isConnected = true;
      this.startPingHeartbeat();

      // Handshake
      this.send({
        type: 'HANDSHAKE',
        username: this.localUsername
      });

      this.eventBus.emit('network:status', {
        status: 'connected',
        role: this.role,
        remoteUsername: this.remoteUsername
      });

      this.reportPresence('playing');
    });

    conn.on('data', (data: any) => {
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) as NetworkMessage : data as NetworkMessage;
        this.handleMessage(msg);
      } catch (e) {
        console.error('[NetworkManager] Error parsing data:', e);
      }
    });

    conn.on('close', () => {
      this.handleDisconnect('Opponent disconnected');
    });

    conn.on('error', (err) => {
      console.warn('[NetworkManager] Connection error:', err);
      this.handleDisconnect('Connection error');
    });
  }

  private handleMessage(msg: NetworkMessage): void {
    if (msg.type === 'PING') {
      this.send({ type: 'PONG', timestamp: msg.timestamp });
      return;
    }

    if (msg.type === 'PONG') {
      const now = performance.now();
      const rtt = Math.max(1, Math.round(now - msg.timestamp));
      this.pingMs = rtt;
      this.eventBus.emit('network:ping', { pingMs: this.pingMs });
      return;
    }

    if (msg.type === 'HANDSHAKE') {
      this.remoteUsername = msg.username || 'Opponent';
      this.eventBus.emit('network:status', {
        status: 'connected',
        role: this.role,
        remoteUsername: this.remoteUsername
      });
      return;
    }

    if (msg.type === 'REMATCH_REQUEST') {
      this.eventBus.emit('multiplayer:rematch', { from: 'remote', status: msg.status });
    }

    if (this.onMessageReceived) {
      this.onMessageReceived(msg);
    }
  }

  public send(msg: NetworkMessage): void {
    if (this.conn && this.conn.open) {
      this.conn.send(JSON.stringify(msg));
    }
  }

  private startPingHeartbeat(): void {
    this.stopPingHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'PING', timestamp: performance.now() });
      }
    }, 1000);
  }

  private stopPingHeartbeat(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public handleDisconnect(reason: string = 'Disconnected'): void {
    this.isConnected = false;
    this.stopPingHeartbeat();
    if (this.conn) {
      try { this.conn.close(); } catch {}
      this.conn = null;
    }

    this.eventBus.emit('network:status', {
      status: 'disconnected',
      message: reason
    });

    this.reportPresence('menu');
  }

  public disconnect(): void {
    this.handleDisconnect('User left match');
  }

  /**
   * Probes candidate peers and selects the one with the lowest ping RTT.
   */
  public async findBestCandidateMatch(candidates: Array<{ peerId: string; username: string }>): Promise<string | null> {
    if (!candidates || candidates.length === 0) return null;

    let bestPeerId: string | null = null;
    let lowestPing = Infinity;

    // Connect to candidates concurrently with a 1.2s probing window
    const probePromises = candidates.map(async (candidate) => {
      try {
        const start = performance.now();
        const connected = await this.connectToPeer(candidate.peerId.replace(PEER_PREFIX, ''));
        if (connected) {
          const rtt = performance.now() - start;
          if (rtt < lowestPing) {
            lowestPing = rtt;
            bestPeerId = candidate.peerId.replace(PEER_PREFIX, '');
          }
        }
      } catch {}
    });

    await Promise.race([
      Promise.all(probePromises),
      new Promise((res) => setTimeout(res, 1200))
    ]);

    return bestPeerId;
  }

  // --- Cloudflare Pages Presence & Queue Heartbeats ---
  private startPresenceReporting(): void {
    this.reportPresence('menu');
    this.presenceInterval = window.setInterval(() => {
      this.reportPresence(this.isConnected ? 'playing' : 'menu');
    }, 12000);
  }

  public stopPresenceReporting(): void {
    if (this.presenceInterval !== null) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
  }

  public async reportPresence(status: 'menu' | 'searching' | 'playing' | 'leave'): Promise<{ lookingCount: number; playingCount: number; candidates: any[] } | null> {
    try {
      const peerId = this.peer?.id || `${PEER_PREFIX}anon_${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId,
          username: this.localUsername,
          status
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.eventBus.emit('presence:updated', {
          lookingCount: data.lookingCount || 0,
          playingCount: data.playingCount || 0
        });
        return data;
      }
    } catch {
      // Running locally or offline - graceful fallback with friendly simulated presence
      this.eventBus.emit('presence:updated', {
        lookingCount: status === 'searching' ? 1 : 0,
        playingCount: status === 'playing' ? 1 : 0
      });
    }
    return null;
  }
}
