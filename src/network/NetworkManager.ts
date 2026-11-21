import { Peer, DataConnection } from 'peerjs';
import { EventBus } from '../core/EventBus';
import { GameModeType, LobbyRoom, MultiplayerRole } from '../types';
import { NetworkMessage, PROTOCOL_VERSION } from './NetworkProtocol';

const PEER_PREFIX = 'sp3d-';

// Free public pub/sub relay used as a global room directory (no backend needed).
// ntfy.sh rate-limits each visitor (~60 request burst, then ~1 request / 10 s), so every timer below
// is kept well under that budget.
const GLOBAL_ROOMS_ENDPOINT = 'https://ntfy.sh/sp3d_arcade_rooms_v1';
const GLOBAL_ROOMS_WS = 'wss://ntfy.sh/sp3d_arcade_rooms_v1/ws';
const ROOM_HEARTBEAT_MS = 20_000;
const ROOM_STALE_MS = 50_000;
const ROOM_HISTORY_WINDOW = '60s';

// Edge presence counter (Cloudflare Pages Function). Kept infrequent to stay inside the free tier.
const PRESENCE_INTERVAL_MS = 15_000;

const HANDSHAKE_TIMEOUT_MS = 8_000;
const CONNECT_TIMEOUT_MS = 9_000;

// Free public STUN servers (no relay; they just discover each player's public address).
// Kept short: browsers slow down ICE gathering (and Firefox warns) with too many servers.
const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
];

// TURN relay (Metered "Open Relay" free plan, hard-capped so it can never bill). Only used when a direct
// connection is impossible (strict NAT, mobile carriers, corporate firewalls). This key can only fetch
// relay credentials and is meant to be public in browser code; it must also stay in CSP connect-src.
const TURN_CREDENTIALS_URL = 'https://truyens.metered.live/api/v1/turn/credentials?apiKey=97d7d915ac3f892523687af25b24cf8f51e6';
const TURN_FETCH_TIMEOUT_MS = 4_000;
// Used only if the credentials API is unreachable. If credentials are rotated in the Metered dashboard,
// update these too (or remove them).
const TURN_FALLBACK: RTCIceServer[] = [
  'turn:global.relay.metered.ca:80',
  'turn:global.relay.metered.ca:80?transport=tcp',
  'turn:global.relay.metered.ca:443',
  'turns:global.relay.metered.ca:443?transport=tcp'
].map(urls => ({ urls, username: '01ece1d1286f2002236f4164', credential: 'V+UQ5Ewas7iiZNUW' }));
const TURN_CACHE_MS = 30 * 60_000;

const ALLOWED_TARGET_SCORES = [5, 11, 21];

export interface CandidatePeer {
  peerId: string;
  username: string;
  region?: string;
}

export interface LobbySnapshot {
  lookingCount: number;
  playingCount: number;
  onlineCount: number;
  pongGamesCount: number;
  curveGamesCount: number;
  rooms: LobbyRoom[];
}

interface PresenceResponse {
  lookingCount?: number;
  playingCount?: number;
  onlineCount?: number;
  pongGamesCount?: number;
  curveGamesCount?: number;
  candidates?: CandidatePeer[];
  rooms?: unknown[];
}

function clampText(value: unknown, fallback: string, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

/**
 * Rooms come from a public relay that anyone can post to, so every field is validated and coerced
 * before it can reach the DOM.
 */
export function sanitizeRoom(raw: unknown, now: number = Date.now()): LobbyRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const roomId = typeof r.roomId === 'string' ? r.roomId.toLowerCase() : '';
  if (!/^sp3d-[a-z0-9]{3,16}$/.test(roomId)) return null;

  const gameMode: GameModeType = r.gameMode === 'CURVE' ? 'CURVE' : 'PONG';
  const rawTarget = Number(r.targetScore);
  const targetScore = ALLOWED_TARGET_SCORES.includes(rawTarget) ? rawTarget : (gameMode === 'CURVE' ? 5 : 11);
  const playerCount = Number(r.playerCount) >= 2 ? 2 : 1;
  const createdAt = Number.isFinite(Number(r.createdAt ?? r.timestamp)) ? Number(r.createdAt ?? r.timestamp) : now;

  return {
    roomId,
    roomName: clampText(r.roomName, 'Arena', 32),
    hostName: clampText(r.hostName, 'Player', 16),
    gameMode,
    status: r.status === 'playing' ? 'playing' : 'waiting',
    targetScore,
    playerCount,
    createdAt,
    isQuickMatch: r.isQuickMatch === true
  };
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
  public activeGameMode: GameModeType = 'PONG';
  public hostedRoomId: string | null = null;

  public isConnected: boolean = false;
  public isSearching: boolean = false;
  public pingMs: number = 0;
  private pingInterval: number | null = null;
  private presenceInterval: number | null = null;
  private roomHeartbeatTimer: number | null = null;
  private handshakeTimer: number | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private isHandshakeComplete: boolean = false;
  private readonly anonPresenceId = `${PEER_PREFIX}anon${Math.random().toString(36).substring(2, 9)}`;

  public onMessageReceived: ((msg: NetworkMessage) => void) | null = null;

  private constructor() {
    this.eventBus = EventBus.get();
    this.loadSavedUsername();
    this.setupBroadcastChannel();
    this.startPresenceReporting();

    window.addEventListener('pagehide', () => {
      // Best effort: take our room off the public list right away
      if (this.hostedRoomId) {
        const body = JSON.stringify({ action: 'ROOM_CLOSED', roomId: this.hostedRoomId });
        navigator.sendBeacon?.(GLOBAL_ROOMS_ENDPOINT, body);
      }
    });
  }

  public static get(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  private loadSavedUsername(): void {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('spinpong_username');
    } catch {
      // storage unavailable (private mode, blocked cookies)
    }
    if (saved && saved.trim().length > 0) {
      this.localUsername = saved.trim().slice(0, 14);
    } else {
      const adjectives = ['Apex', 'Vortex', 'Spin', 'Cyber', 'Sonic', 'Flash', 'Hyper'];
      const nouns = ['Master', 'Ace', 'Paddle', 'Striker', 'Hero', 'Wizard', 'King'];
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      this.setUsername(`${adj}${noun}`);
    }
  }

  public setUsername(name: string): void {
    if (!name || name.trim().length === 0) return;
    this.localUsername = name.trim().slice(0, 14);
    try {
      localStorage.setItem('spinpong_username', this.localUsername);
    } catch {
      // ignore
    }
  }

  // --- Same-browser multi-tab matchmaking (handy for local testing) ---
  private setupBroadcastChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.broadcastChannel = new BroadcastChannel('spinpong_p2p_channel');
      this.broadcastChannel.onmessage = async (event) => {
        const data = event.data as { type?: string; peerId?: string; gameMode?: GameModeType } | null;
        if (data?.type !== 'SEARCHING' || !this.isSearching || this.isConnected || !this.peer?.open) return;
        const remotePeerId = data.peerId;
        if (!remotePeerId || remotePeerId === this.peer.id) return;
        if (data.gameMode && data.gameMode !== this.activeGameMode) return;
        // Tie-breaker: the lexicographically greater peer initiates the connection as CLIENT
        if (this.peer.id > remotePeerId) {
          await this.connectToPeer(remotePeerId);
        }
      };
    } catch {
      this.broadcastChannel = null;
    }
  }

  public broadcastLocalSearch(): void {
    if (this.broadcastChannel && this.peer?.open) {
      this.broadcastChannel.postMessage({
        type: 'SEARCHING',
        peerId: this.peer.id,
        username: this.localUsername,
        gameMode: this.activeGameMode
      });
    }
  }

  // --- Peer lifecycle ---
  public async initPeer(customRoomId?: string): Promise<string> {
    const cleanCustom = customRoomId
      ? customRoomId.trim().toLowerCase().replace(PEER_PREFIX, '').replace(/[^a-z0-9]/g, '')
      : undefined;

    if (this.peer && !this.peer.destroyed && this.peer.open) {
      const currentClean = this.peer.id.replace(PEER_PREFIX, '');
      if (!cleanCustom || currentClean === cleanCustom) {
        return currentClean;
      }
      this.peer.destroy();
      this.peer = null;
    }

    // A peer that lost its signalling connection can usually be revived without a new ID
    if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
      this.peer.destroy();
      this.peer = null;
    }

    const iceServers = await this.getIceServers();

    return new Promise((resolve, reject) => {
      const generatedId = cleanCustom
        ? `${PEER_PREFIX}${cleanCustom}`
        : `${PEER_PREFIX}${Math.random().toString(36).substring(2, 7)}`;

      const peer = new Peer(generatedId, {
        config: { iceServers },
        debug: 0
      });
      this.peer = peer;

      peer.on('open', (id) => {
        this.setupIncomingConnectionHandler(peer);
        resolve(id.replace(PEER_PREFIX, ''));
      });

      peer.on('disconnected', () => {
        // Lost the signalling server (not the opponent). Try to come back with the same ID.
        if (!peer.destroyed) {
          try { peer.reconnect(); } catch { /* ignore */ }
        }
      });

      peer.on('error', (err: Error & { type?: string }) => {
        if (err.type === 'unavailable-id') {
          // Retry with a random ID on collision
          peer.destroy();
          if (this.peer === peer) this.peer = null;
          this.initPeer().then(resolve).catch(reject);
        } else if (err.type === 'peer-unavailable') {
          // Raised when connecting to a room that no longer exists; handled by connectToPeer's timeout
        } else if (!peer.open) {
          reject(err);
        } else {
          console.warn('[Network] Peer error:', err.type ?? err.message);
        }
      });
    });
  }

  private turnServers: RTCIceServer[] = [];
  private turnFetchedAt: number = 0;

  /**
   * STUN plus, when reachable, the TURN relay. Never throws or blocks for long: if the relay
   * provider is down or over quota, players still get direct (STUN-only) connections.
   */
  private async getIceServers(): Promise<RTCIceServer[]> {
    if (this.turnServers.length === 0 || Date.now() - this.turnFetchedAt > TURN_CACHE_MS) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(TURN_CREDENTIALS_URL, { signal: controller.signal, cache: 'no-store' });
        if (res.ok) {
          const data = await res.json() as unknown;
          if (Array.isArray(data)) {
            const turn = data.filter((s): s is RTCIceServer => {
              if (!s || typeof s !== 'object') return false;
              const urls = (s as RTCIceServer).urls;
              const list = Array.isArray(urls) ? urls : [urls];
              // Keep only relay entries; our own STUN list already covers discovery
              return list.length > 0 && list.every(u => typeof u === 'string' && /^turns?:/.test(u));
            });
            if (turn.length > 0) {
              this.turnServers = turn;
              this.turnFetchedAt = Date.now();
            }
          }
        }
      } catch {
        // timeout / offline / quota: fall back to STUN only
      } finally {
        clearTimeout(timer);
      }
    }
    return [...STUN_SERVERS, ...(this.turnServers.length > 0 ? this.turnServers : TURN_FALLBACK)];
  }

  private setupIncomingConnectionHandler(peer: Peer): void {
    peer.on('connection', (incomingConn) => {
      if (this.isConnected || this.conn) {
        incomingConn.on('open', () => incomingConn.close());
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

    try {
      await this.initPeer();
    } catch {
      return false;
    }
    if (!this.peer || !this.peer.open) return false;
    if (this.peer.id === targetPeerId) return false;

    if (this.conn) {
      try { this.conn.close(); } catch { /* ignore */ }
      this.conn = null;
    }

    return new Promise((resolve) => {
      const outgoing = this.peer!.connect(targetPeerId, { reliable: true });
      this.role = 'CLIENT';

      // Generous timeout for mobile & home NAT traversal
      const timeout = window.setTimeout(() => {
        if (!outgoing.open) {
          try { outgoing.close(); } catch { /* ignore */ }
          resolve(false);
        }
      }, CONNECT_TIMEOUT_MS);

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

      // Each side sends exactly one handshake; the match starts once the other side's arrives.
      this.send({
        type: 'HANDSHAKE',
        username: this.localUsername,
        gameMode: this.activeGameMode,
        targetScore: this.hostedTargetScore,
        role: this.role,
        protocolVersion: PROTOCOL_VERSION
      });

      this.clearHandshakeTimer();
      this.handshakeTimer = window.setTimeout(() => {
        if (!this.isHandshakeComplete) {
          this.handleDisconnect('Opponent did not respond');
        }
      }, HANDSHAKE_TIMEOUT_MS);
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data', (data: unknown) => {
      if (conn !== this.conn) return;
      try {
        const msg = (typeof data === 'string' ? JSON.parse(data) : data) as NetworkMessage;
        if (msg && typeof msg === 'object' && typeof msg.type === 'string') {
          this.handleMessage(msg);
        }
      } catch {
        // ignore malformed packets
      }
    });

    conn.on('close', () => {
      if (conn === this.conn) this.handleDisconnect('Opponent disconnected');
    });

    conn.on('error', () => {
      if (conn === this.conn) this.handleDisconnect('Connection error');
    });
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer !== null) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private handleMessage(msg: NetworkMessage): void {
    if (msg.type === 'PING') {
      this.send({ type: 'PONG', timestamp: msg.timestamp });
      return;
    }

    if (msg.type === 'PONG') {
      this.pingMs = Math.max(1, Math.round(performance.now() - msg.timestamp));
      this.eventBus.emit('network:ping', { pingMs: this.pingMs });
      return;
    }

    if (msg.type === 'HANDSHAKE') {
      if (this.isHandshakeComplete) return;

      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        this.handleDisconnect('Version mismatch — refresh the page to update the game');
        return;
      }

      this.isHandshakeComplete = true;
      this.clearHandshakeTimer();
      this.remoteUsername = clampText(msg.username, 'Opponent', 14);

      // The HOST decides game mode and target score
      if (this.role === 'CLIENT') {
        if (msg.gameMode === 'PONG' || msg.gameMode === 'CURVE') {
          this.activeGameMode = msg.gameMode;
        }
        if (msg.targetScore && ALLOWED_TARGET_SCORES.includes(msg.targetScore)) {
          this.hostedTargetScore = msg.targetScore;
        }
      } else if (this.hostedRoomId) {
        // Our room is now full; take it off the public list
        void this.closeLobbyRoom();
      }

      this.eventBus.emit('network:status', {
        status: 'connected',
        role: this.role,
        remoteUsername: this.remoteUsername,
        gameMode: this.activeGameMode,
        targetScore: this.hostedTargetScore
      });
      this.reportPresence('playing');
      return;
    }

    // Ignore gameplay packets until both sides agreed on the match setup
    if (!this.isHandshakeComplete) return;

    if (msg.type === 'REMATCH_REQUEST') {
      this.eventBus.emit('multiplayer:rematch', { from: 'remote', status: msg.status });
      return;
    }

    if (this.onMessageReceived) {
      this.onMessageReceived(msg);
    }
  }

  public send(msg: NetworkMessage): void {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(JSON.stringify(msg));
      } catch {
        // channel closing; the close handler will clean up
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
    const wasActive = this.isConnected || this.conn !== null;
    this.isConnected = false;
    this.isSearching = false;
    this.isHandshakeComplete = false;
    this.clearHandshakeTimer();
    this.stopPingHeartbeat();
    if (this.conn) {
      const conn = this.conn;
      this.conn = null;
      try { conn.close(); } catch { /* ignore */ }
    }

    if (wasActive) {
      this.eventBus.emit('network:status', {
        status: 'disconnected',
        message: reason
      });
    }

    this.reportPresence('menu');
  }

  public disconnect(): void {
    void this.closeLobbyRoom();
    this.handleDisconnect('User left match');
  }

  // --- Quick Match (built on the global room directory) ---

  /**
   * Joins the oldest open room for `gameMode`, or hosts a quick-match room and keeps looking.
   * Resolves once connected or when `isCancelled()` turns true.
   */
  public async quickMatch(
    gameMode: GameModeType,
    onStatus: (title: string, sub: string) => void,
    isCancelled: () => boolean
  ): Promise<void> {
    this.isSearching = true;
    this.activeGameMode = gameMode;
    this.hostedTargetScore = gameMode === 'CURVE' ? 5 : 11;

    onStatus('Connecting to P2P network...', 'Getting a room code...');
    let myId: string;
    try {
      myId = `${PEER_PREFIX}${await this.initPeer()}`;
    } catch {
      onStatus('Could not reach the matchmaking server', 'Check your connection and try again.');
      this.isSearching = false;
      return;
    }

    const tryJoinOpenRooms = async (onlyOlderThan?: number): Promise<boolean> => {
      const { rooms } = await this.fetchLobbyRooms();
      const open = rooms
        .filter(r => r.status === 'waiting' && r.gameMode === gameMode && r.roomId !== myId)
        .filter(r => onlyOlderThan === undefined || r.createdAt < onlyOlderThan || (r.createdAt === onlyOlderThan && r.roomId < myId))
        .sort((a, b) => Number(b.isQuickMatch) - Number(a.isQuickMatch) || a.createdAt - b.createdAt)
        .slice(0, 3);

      for (const room of open) {
        if (isCancelled() || this.isConnected) return this.isConnected;
        onStatus('Opponent found!', `Connecting to ${room.hostName}...`);
        const wasHosting = this.hostedRoomId !== null;
        if (wasHosting) await this.closeLobbyRoom();
        if (await this.connectToPeer(room.roomId)) return true;
        if (wasHosting && !isCancelled()) {
          await this.createLobbyRoom(gameMode, `${this.localUsername}'s Quick Match`, undefined, true);
        }
      }
      return false;
    };

    onStatus('Scanning for opponents...', 'Looking for open rooms...');
    this.broadcastLocalSearch();
    if (await tryJoinOpenRooms()) return;
    if (isCancelled()) return;

    // Nobody waiting: host a public quick-match room and keep looking
    await this.createLobbyRoom(gameMode, `${this.localUsername}'s Quick Match`, undefined, true);
    const myCreatedAt = this.hostedRoomCreatedAt;
    onStatus('Waiting for a challenger...', `Hosting room ${myId.replace(PEER_PREFIX, '').toUpperCase()} · it is listed in the public lobby`);

    while (!isCancelled() && !this.isConnected) {
      await new Promise(r => window.setTimeout(r, 10_000));
      if (isCancelled() || this.isConnected) break;
      this.broadcastLocalSearch();
      // If someone else is also waiting, the newer room joins the older one so the two don't wait forever
      if (await tryJoinOpenRooms(myCreatedAt)) return;
    }
  }

  // --- Presence (online counter) ---
  private startPresenceReporting(): void {
    this.reportPresence('menu');
    this.presenceInterval = window.setInterval(() => {
      if (document.hidden) return;
      this.reportPresence(this.isConnected ? 'playing' : (this.isSearching ? 'searching' : 'menu'));
    }, PRESENCE_INTERVAL_MS);
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
    roomData?: { roomName?: string; gameMode?: GameModeType; targetScore?: number; roomId?: string }
  ): Promise<PresenceResponse | null> {
    try {
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peerId: this.peer?.id || this.anonPresenceId,
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
        const data = await res.json() as PresenceResponse;
        this.eventBus.emit('presence:updated', {
          lookingCount: data.lookingCount || 0,
          playingCount: data.playingCount || 0,
          onlineCount: Math.max(1, data.onlineCount || 0),
          pongGamesCount: data.pongGamesCount || 0,
          curveGamesCount: data.curveGamesCount || 0
        });
        return data;
      }
    } catch {
      // presence is best-effort
    }
    return null;
  }

  // --- Public room directory ---
  private hostedRoomCreatedAt: number = 0;

  public async createLobbyRoom(gameMode: GameModeType, customRoomName?: string, targetScore?: number, isQuickMatch: boolean = false): Promise<string> {
    const code = await this.initPeer();
    this.activeGameMode = gameMode;
    this.hostedTargetScore = targetScore && ALLOWED_TARGET_SCORES.includes(targetScore)
      ? targetScore
      : (gameMode === 'CURVE' ? 5 : 11);
    this.hostedRoomId = this.peer?.id || `${PEER_PREFIX}${code}`;
    this.hostedRoomCreatedAt = Date.now();

    const manifest = {
      action: 'ROOM_ANNOUNCE',
      roomId: this.hostedRoomId,
      roomName: (customRoomName || `${this.localUsername}'s ${gameMode === 'CURVE' ? 'Curve' : 'Pong'} Arena`).slice(0, 32),
      hostName: this.localUsername,
      gameMode: this.activeGameMode,
      targetScore: this.hostedTargetScore,
      status: 'waiting',
      playerCount: 1,
      isQuickMatch,
      createdAt: this.hostedRoomCreatedAt,
      timestamp: Date.now()
    };

    await this.publishGlobalRoom(manifest);

    if (this.roomHeartbeatTimer) clearInterval(this.roomHeartbeatTimer);
    this.roomHeartbeatTimer = window.setInterval(() => {
      if (this.hostedRoomId === manifest.roomId && !this.isConnected) {
        void this.publishGlobalRoom({ ...manifest, timestamp: Date.now() });
      }
    }, ROOM_HEARTBEAT_MS);

    return code;
  }

  public async closeLobbyRoom(): Promise<void> {
    if (this.roomHeartbeatTimer) {
      clearInterval(this.roomHeartbeatTimer);
      this.roomHeartbeatTimer = null;
    }
    if (this.hostedRoomId) {
      const roomId = this.hostedRoomId;
      this.hostedRoomId = null;
      await this.publishGlobalRoom({ action: 'ROOM_CLOSED', roomId });
    }
  }

  private async publishGlobalRoom(data: Record<string, unknown>): Promise<void> {
    try {
      await fetch(GLOBAL_ROOMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
      });
    } catch {
      // relay unreachable; the edge fallback below still lists the room for same-region players
    }

    void this.reportPresence('searching', data.action === 'ROOM_CLOSED' ? 'close_room' : 'update_room', {
      roomId: data.roomId as string | undefined,
      roomName: data.roomName as string | undefined,
      gameMode: data.gameMode as GameModeType | undefined,
      targetScore: data.targetScore as number | undefined
    });
  }

  public async fetchLobbyRooms(): Promise<LobbySnapshot> {
    const rooms = new Map<string, LobbyRoom>();
    const now = Date.now();

    // 1. Global relay: replay recent announcements in order
    try {
      const res = await fetch(`${GLOBAL_ROOMS_ENDPOINT}/json?poll=1&since=${ROOM_HISTORY_WINDOW}`, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as { event?: string; time?: number; message?: unknown };
            if (ev.event !== 'message' || typeof ev.message !== 'string') continue;
            const msgData = JSON.parse(ev.message) as Record<string, unknown>;
            if (msgData.action === 'ROOM_ANNOUNCE') {
              const age = ev.time ? now - ev.time * 1000 : now - Number(msgData.timestamp || 0);
              const room = sanitizeRoom(msgData, now);
              if (room && age < ROOM_STALE_MS) rooms.set(room.roomId, room);
            } else if (msgData.action === 'ROOM_CLOSED' && typeof msgData.roomId === 'string') {
              rooms.delete(msgData.roomId.toLowerCase());
            }
          } catch {
            // skip foreign / malformed messages on the public topic
          }
        }
      }
    } catch {
      // relay unreachable
    }

    // 2. Edge fallback (/api/presence)
    let edge: PresenceResponse | null = null;
    try {
      const res = await fetch('/api/presence', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        edge = await res.json() as PresenceResponse;
        for (const raw of edge.rooms || []) {
          const room = sanitizeRoom(raw, now);
          if (room && !rooms.has(room.roomId)) rooms.set(room.roomId, room);
        }
      }
    } catch {
      // ignore
    }

    const roomList = Array.from(rooms.values()).sort((a, b) => b.createdAt - a.createdAt);
    const waitingRooms = roomList.filter(r => r.status === 'waiting').length;
    const lookingCount = Math.max(edge?.lookingCount || 0, waitingRooms);
    const playingCount = edge?.playingCount || (this.isConnected ? 2 : 0);

    const result: LobbySnapshot = {
      lookingCount,
      playingCount,
      onlineCount: Math.max(1, edge?.onlineCount || 0, lookingCount + playingCount),
      pongGamesCount: edge?.pongGamesCount || 0,
      curveGamesCount: edge?.curveGamesCount || 0,
      rooms: roomList
    };

    this.eventBus.emit('presence:updated', result);
    return result;
  }

  /** Live updates while the lobby is open. Bursts of relay messages are coalesced into one refetch. */
  public subscribeToLobbyUpdates(onUpdate: (rooms: LobbyRoom[]) => void): () => void {
    let ws: WebSocket | null = null;
    let isDisposed = false;
    let refetchTimer: number | null = null;

    try {
      ws = new WebSocket(GLOBAL_ROOMS_WS);
      ws.onmessage = (event) => {
        if (isDisposed) return;
        try {
          const ev = JSON.parse(event.data as string) as { event?: string };
          if (ev.event !== 'message' || refetchTimer !== null) return;
          refetchTimer = window.setTimeout(() => {
            refetchTimer = null;
            if (isDisposed) return;
            this.fetchLobbyRooms().then(data => {
              if (!isDisposed) onUpdate(data.rooms);
            });
          }, 1500);
        } catch {
          // ignore
        }
      };
    } catch {
      ws = null;
    }

    return () => {
      isDisposed = true;
      if (refetchTimer !== null) clearTimeout(refetchTimer);
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
        ws = null;
      }
    };
  }
}
