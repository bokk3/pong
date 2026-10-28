import { Peer, DataConnection } from 'peerjs';
import { EventBus } from '../core/EventBus';
import { MultiplayerRole } from '../types';
import { NetworkMessage } from './NetworkProtocol';

const PEER_PREFIX = 'sp3d-';
const GLOBAL_ROOMS_ENDPOINT = 'https://ntfy.sh/sp3d_arcade_rooms_v1';
const GLOBAL_ROOMS_WS = 'wss://ntfy.sh/sp3d_arcade_rooms_v1/ws';

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

export interface CandidatePeer {
  peerId: string;
  username: string;
  region?: string;
}

export class NetworkManager {
  private static instance: NetworkManager;
  private eventBus: EventBus;

  public peer: Peer | null = null;
  public conn: DataConnection | null = null;
  public role: MultiplayerRole = 'HOST';
  public localUsername: string = 'Player';
  public remoteUsername: string = 'Opponent';
  public hostedTargetScore: number = 11;
  public activeGameMode: 'PONG' | 'CURVE' = 'PONG';
  public hostedRoomId: string | null = null;

  public isConnected: boolean = false;
  public isSearching: boolean = false;
  public pingMs: number = 0;
  private pingInterval: number | null = null;
  private presenceInterval: number | null = null;
  private roomHeartbeatTimer: number | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private isHandshakeComplete: boolean = false;

  public onMessageReceived: ((msg: NetworkMessage) => void) | null = null;

  private constructor() {
    this.eventBus = EventBus.get();
    this.loadSavedUsername();
    this.setupBroadcastChannel();
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

  private setupBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('spinpong_p2p_channel');
        this.broadcastChannel.onmessage = async (event) => {
          const data = event.data;
          if (data?.type === 'SEARCHING' && this.isSearching && !this.isConnected && this.peer?.open) {
            const remotePeerId = data.peerId as string;
            // Avoid connecting to self
            if (remotePeerId && remotePeerId !== this.peer.id) {
              // Tie-breaker: lexicographically greater peerId initiates the connection as CLIENT
              if (this.peer.id > remotePeerId) {
                console.log('[NetworkManager] Multi-tab local peer found:', remotePeerId);
                await this.connectToPeer(remotePeerId);
              }
            }
          }
        };
      } catch (err) {
        console.warn('[NetworkManager] BroadcastChannel not supported:', err);
      }
    }
  }

  public broadcastLocalSearch(): void {
    if (this.broadcastChannel && this.peer?.open) {
      this.broadcastChannel.postMessage({
        type: 'SEARCHING',
        peerId: this.peer.id,
        username: this.localUsername
      });
    }
  }

  public async initPeer(customRoomId?: string): Promise<string> {
    const cleanCustom = customRoomId 
      ? customRoomId.trim().toLowerCase().replace(PEER_PREFIX, '').replace(/[^a-z0-9]/g, '')
      : undefined;

    // If peer is already open and valid
    if (this.peer && !this.peer.destroyed && this.peer.open) {
      const currentClean = this.peer.id.replace(PEER_PREFIX, '');
      if (!cleanCustom || currentClean === cleanCustom) {
        return currentClean;
      }
      this.peer.destroy();
      this.peer = null;
    }

    return new Promise((resolve, reject) => {
      const generatedId = cleanCustom 
        ? `${PEER_PREFIX}${cleanCustom}` 
        : `${PEER_PREFIX}${Math.random().toString(36).substring(2, 7)}`;

      this.peer = new Peer(generatedId, {
        config: { iceServers: STUN_SERVERS },
        debug: 0
      });

      this.peer.on('open', (id) => {
        this.setupIncomingConnectionHandler();
        const cleanId = id.replace(PEER_PREFIX, '');
        resolve(cleanId);
      });

      this.peer.on('error', (err: Error & { type?: string }) => {
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
      this.isSearching = false;
      this.attachConnection(incomingConn);
    });
  }

  public async connectToPeer(roomId: string): Promise<boolean> {
    const cleanRoomId = roomId.trim().toLowerCase().replace(PEER_PREFIX, '').replace(/[^a-z0-9]/g, '');
    if (!cleanRoomId) return false;
    const targetPeerId = `${PEER_PREFIX}${cleanRoomId}`;

    await this.initPeer();
    if (!this.peer || !this.peer.open) return false;

    // Do not connect to self
    if (this.peer.id === targetPeerId) return false;

    if (this.conn) {
      try { this.conn.close(); } catch {}
      this.conn = null;
    }

    return new Promise((resolve) => {
      const outgoing = this.peer!.connect(targetPeerId, {
        reliable: true
      });

      this.role = 'CLIENT';

      // 9 second timeout for mobile & home NAT traversal
      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          try { outgoing.close(); } catch {}
          resolve(false);
        }
      }, 9000);

      outgoing.on('open', () => {
        clearTimeout(timeout);
        this.isSearching = false;
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
    this.isHandshakeComplete = false;

    const onOpen = () => {
      this.isConnected = true;
      this.startPingHeartbeat();

      // Send initial handshake with game mode and target score
      this.send({
        type: 'HANDSHAKE',
        username: this.localUsername,
        gameMode: this.activeGameMode,
        targetScore: this.hostedTargetScore,
        role: this.role
      });

      // Emit connected status
      this.eventBus.emit('network:status', {
        status: 'connected',
        role: this.role,
        remoteUsername: this.remoteUsername,
        gameMode: this.activeGameMode,
        targetScore: this.hostedTargetScore
      });

      this.reportPresence('playing');
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data', (data: unknown) => {
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
      this.isConnected = true;
      if (!this.pingInterval) {
        this.startPingHeartbeat();
      }
      this.remoteUsername = msg.username || 'Opponent';

      // Synchronize game mode and target score from HOST to CLIENT
      if (this.role === 'CLIENT') {
        if (msg.gameMode) {
          this.activeGameMode = msg.gameMode;
        }
        if (msg.targetScore) {
          this.hostedTargetScore = msg.targetScore;
        }
      }

      if (!this.isHandshakeComplete) {
        this.isHandshakeComplete = true;
        // Reply with local metadata
        this.send({
          type: 'HANDSHAKE',
          username: this.localUsername,
          gameMode: this.activeGameMode,
          targetScore: this.hostedTargetScore,
          role: this.role
        });
      }

      this.eventBus.emit('network:status', {
        status: 'connected',
        role: this.role,
        remoteUsername: this.remoteUsername,
        gameMode: this.activeGameMode,
        targetScore: this.hostedTargetScore
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
      try {
        this.conn.send(JSON.stringify(msg));
      } catch (e) {
        console.warn('[NetworkManager] Error sending packet:', e);
      }
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
    this.isSearching = false;
    this.isHandshakeComplete = false;
    this.stopPingHeartbeat();
    if (this.roomHeartbeatTimer) {
      clearInterval(this.roomHeartbeatTimer);
      this.roomHeartbeatTimer = null;
    }
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
   * Sequentially probes candidates to establish connection with available challenger.
   */
  public async findBestCandidateMatch(candidates: Array<{ peerId: string; username: string }>): Promise<string | null> {
    if (!candidates || candidates.length === 0) return null;

    for (const candidate of candidates) {
      const cleanId = candidate.peerId.replace(PEER_PREFIX, '');
      if (this.peer && cleanId === this.peer.id.replace(PEER_PREFIX, '')) {
        continue;
      }

      console.log('[NetworkManager] Attempting connection to candidate:', cleanId);
      const connected = await this.connectToPeer(cleanId);
      if (connected) {
        console.log('[NetworkManager] Successfully connected to candidate:', cleanId);
        return cleanId;
      }
    }

    return null;
  }

  // --- Presence & Queue Heartbeats ---
  private startPresenceReporting(): void {
    this.reportPresence('menu');
    this.presenceInterval = window.setInterval(() => {
      this.reportPresence(this.isConnected ? 'playing' : (this.isSearching ? 'searching' : 'menu'));
    }, 6000);
  }

  public stopPresenceReporting(): void {
    if (this.presenceInterval !== null) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
  }

  public async reportPresence(
    status: 'menu' | 'searching' | 'playing' | 'leave',
    action?: 'presence' | 'create_room' | 'update_room' | 'close_room',
    roomData?: { roomName?: string; gameMode?: 'PONG' | 'CURVE'; targetScore?: number; roomId?: string }
  ): Promise<{
    lookingCount: number;
    playingCount: number;
    onlineCount?: number;
    pongGamesCount?: number;
    curveGamesCount?: number;
    candidates: CandidatePeer[];
    rooms?: any[];
  } | null> {
    try {
      const peerId = this.peer?.id || `${PEER_PREFIX}anon_${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId,
          username: this.localUsername,
          status,
          gameMode: this.activeGameMode,
          action: action || (this.hostedRoomId ? 'update_room' : 'presence'),
          roomData: roomData || (this.hostedRoomId ? {
            roomId: this.hostedRoomId,
            gameMode: this.activeGameMode,
            status: this.isConnected ? 'playing' : 'waiting'
          } : undefined)
        })
      });

      if (res.ok) {
        const data = await res.json();
        this.eventBus.emit('presence:updated', {
          lookingCount: data.lookingCount || 0,
          playingCount: data.playingCount || 0,
          onlineCount: data.onlineCount || 0,
          pongGamesCount: data.pongGamesCount || 0,
          curveGamesCount: data.curveGamesCount || 0,
          rooms: data.rooms || []
        });
        return data;
      }
    } catch {
      this.eventBus.emit('presence:updated', {
        lookingCount: status === 'searching' ? 1 : 0,
        playingCount: status === 'playing' ? 1 : 0
      });
    }
    return null;
  }

  public async createLobbyRoom(gameMode: 'PONG' | 'CURVE', customRoomName?: string, targetScore?: number): Promise<string> {
    const code = await this.initPeer();
    this.activeGameMode = gameMode;
    this.hostedTargetScore = targetScore || (gameMode === 'CURVE' ? 5 : 11);
    this.hostedRoomId = this.peer?.id || `${PEER_PREFIX}${code}`;

    const manifest = {
      action: 'ROOM_ANNOUNCE',
      roomId: this.hostedRoomId,
      roomName: customRoomName || `${this.localUsername}'s ${gameMode === 'CURVE' ? 'Curve' : 'Pong'} Arena`,
      hostName: this.localUsername,
      gameMode: this.activeGameMode,
      targetScore: this.hostedTargetScore,
      status: 'waiting',
      playerCount: 1,
      timestamp: Date.now()
    };

    // 1. Broadcast to global cross-device relay
    await this.publishGlobalRoom(manifest);

    // 2. Start 4-second heartbeat while waiting
    if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
    this.roomHeartbeatTimer = window.setInterval(() => {
      if (this.hostedRoomId && !this.isConnected) {
        this.publishGlobalRoom({ ...manifest, timestamp: Date.now() });
      }
    }, 4000);

    return code;
  }

  public async closeLobbyRoom(): Promise<void> {
    if (this.roomHeartbeatTimer) {
      clearInterval(this.roomHeartbeatTimer);
      this.roomHeartbeatTimer = null;
    }
    if (this.hostedRoomId) {
      await this.publishGlobalRoom({
        action: 'ROOM_CLOSED',
        roomId: this.hostedRoomId
      });
      this.hostedRoomId = null;
    }
  }

  private async publishGlobalRoom(data: Record<string, any>): Promise<void> {
    try {
      await fetch(GLOBAL_ROOMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
      });
    } catch {}

    // Fallback to local /api/presence
    this.reportPresence('searching', data.action === 'ROOM_CLOSED' ? 'close_room' : 'update_room', {
      roomId: data.roomId,
      roomName: data.roomName,
      gameMode: data.gameMode,
      targetScore: data.targetScore
    });
  }

  public async fetchLobbyRooms(): Promise<{ lookingCount: number; playingCount: number; onlineCount?: number; pongGamesCount?: number; curveGamesCount?: number; rooms: any[] }> {
    const globalRoomsMap = new Map<string, any>();
    const now = Date.now();

    // 1. Query global relay (last 30 seconds)
    try {
      const res = await fetch(`${GLOBAL_ROOMS_ENDPOINT}/json?poll=1&since=30s`, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.event === 'message' && ev.message) {
              let msgData: any = null;
              if (typeof ev.message === 'string') {
                try {
                  msgData = JSON.parse(ev.message);
                } catch {}
              } else if (typeof ev.message === 'object') {
                msgData = ev.message;
              }

              if (msgData && msgData.action === 'ROOM_ANNOUNCE' && msgData.roomId) {
                // Heartbeat must be within 35 seconds (server time ev.time or client timestamp)
                const msgAge = ev.time ? (now - ev.time * 1000) : (now - (msgData.timestamp || 0));
                if (msgAge < 35000) {
                  globalRoomsMap.set(msgData.roomId, {
                    roomId: msgData.roomId,
                    roomName: msgData.roomName || 'Arena',
                    hostName: msgData.hostName || 'Player',
                    gameMode: msgData.gameMode || 'PONG',
                    status: msgData.status || 'waiting',
                    targetScore: msgData.targetScore || 11,
                    playerCount: msgData.playerCount || 1,
                    createdAt: msgData.timestamp || now
                  });
                }
              } else if (msgData && msgData.action === 'ROOM_CLOSED' && msgData.roomId) {
                globalRoomsMap.delete(msgData.roomId);
              }
            }
          } catch {}
        }
      }
    } catch {}

    // 2. Query fallback /api/presence
    let localData: any = null;
    try {
      const res = await fetch('/api/presence', { method: 'GET' });
      if (res.ok) {
        localData = await res.json();
        if (localData.rooms) {
          for (const r of localData.rooms) {
            if (!globalRoomsMap.has(r.roomId)) {
              globalRoomsMap.set(r.roomId, r);
            }
          }
        }
      }
    } catch {}

    const combinedRooms = Array.from(globalRoomsMap.values());
    const lookingCount = (localData?.lookingCount || 0) + (combinedRooms.length > 0 ? combinedRooms.length : 0);
    const playingCount = localData?.playingCount || (this.isConnected ? 1 : 0);

    const result = {
      lookingCount,
      playingCount,
      onlineCount: Math.max(lookingCount + playingCount, localData?.onlineCount || 1),
      pongGamesCount: localData?.pongGamesCount || 0,
      curveGamesCount: localData?.curveGamesCount || 0,
      rooms: combinedRooms
    };

    this.eventBus.emit('presence:updated', result);
    return result;
  }

  public subscribeToLobbyUpdates(onUpdate: (rooms: any[]) => void): () => void {
    let ws: WebSocket | null = null;
    let isDisposed = false;

    try {
      ws = new WebSocket(GLOBAL_ROOMS_WS);
      ws.onmessage = (event) => {
        if (isDisposed) return;
        try {
          const ev = JSON.parse(event.data);
          if (ev.event === 'message' && ev.message) {
            // Re-fetch latest snapshot on real-time room notification
            this.fetchLobbyRooms().then(data => {
              if (!isDisposed && data.rooms) {
                onUpdate(data.rooms);
              }
            });
          }
        } catch {}
      };
    } catch {}

    return () => {
      isDisposed = true;
      if (ws) {
        try { ws.close(); } catch {}
        ws = null;
      }
    };
  }
}

