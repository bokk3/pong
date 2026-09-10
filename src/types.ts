import * as THREE from 'three';

export type GameState =
  | 'MENU'
  | 'SERVE_WAIT'
  | 'BALL_TOSS'
  | 'RALLY'
  | 'POINT_SCORED'
  | 'MATCH_POINT'
  | 'PAUSED'
  | 'GAME_OVER';

export type PlayerId = 'PLAYER' | 'CPU';

export type GameMode = 'BOT' | 'MULTIPLAYER';

export type MultiplayerRole = 'HOST' | 'CLIENT';

export interface NetworkStats {
  pingMs: number;
  connectionState: 'disconnected' | 'connecting' | 'connected';
  remoteUsername?: string;
  role?: MultiplayerRole;
}

export interface PresenceStats {
  lookingCount: number;
  playingCount: number;
}

export type ShotRating = 'PERFECT' | 'GOOD' | 'EARLY' | 'LATE' | 'SMASH' | 'MISS' | 'ACE';

export type SpinType = 'NONE' | 'TOPSPIN' | 'BACKSPIN' | 'SIDESPIN_LEFT' | 'SIDESPIN_RIGHT';

export type Difficulty = 'novice' | 'pro' | 'master';

export interface ShotInfo {
  hitter: PlayerId;
  rating: ShotRating;
  speed: number;
  spin: SpinType;
  isSmash: boolean;
  contactPoint: THREE.Vector3;
}

export interface MatchScore {
  player: number;
  cpu: number;
  server: PlayerId;
  consecutiveServes: number;
  rallyCount: number;
  longestRally: number;
  smashWinners: number;
  totalPlayerShots: number;
  goodOrBetterShots: number;
}

export interface TableBounds {
  length: number;
  width: number;
  height: number;
  netHeight: number;
  netWidth: number;
  halfLength: number;
  halfWidth: number;
  tableTopY: number;
}

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isTouchDevice: boolean;
  isPortrait: boolean;
  aspectRatio: number;
  orientation: 'portrait' | 'landscape';
  screenWidth: number;
  screenHeight: number;
}

export type GameModeType = 'PONG' | 'CURVE';

export interface CurveScore {
  player: number;
  cpu: number;
  targetScore: number;
}

export interface CurvePlayerState {
  id: PlayerId;
  x: number;
  z: number;
  angle: number;
  isAlive: boolean;
  isDrawing: boolean;
}

export type GameEvents = {
  'state:changed': { from: GameState; to: GameState };
  'score:updated': MatchScore;
  'serve:ready': { server: PlayerId };
  'ball:hit': ShotInfo;
  'ball:bounce': { position: THREE.Vector3; surface: 'player_table' | 'cpu_table' | 'floor' | 'net'; speed: number };
  'point:scored': { winner: PlayerId; reason: string };
  'match:over': { winner: PlayerId; score: MatchScore };
  'camera:shake': { intensity: number; duration: number };
  'network:ping': { pingMs: number };
  'network:status': { status: 'disconnected' | 'connecting' | 'connected'; message?: string; role?: MultiplayerRole; remoteUsername?: string };
  'presence:updated': PresenceStats;
  'multiplayer:rematch': { from: 'local' | 'remote'; status: 'requested' | 'accepted' | 'declined' };
  'device:orientation': { orientation: 'portrait' | 'landscape'; isPortrait: boolean };
  'device:resize': DeviceInfo;
  'curve:score': CurveScore;
  'curve:crash': { victim: PlayerId; x: number; z: number };
  'curve:round_start': { roundNumber: number };
  'curve:match_over': { winner: PlayerId; score: CurveScore };
};

