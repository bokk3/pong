import { MatchScore, PlayerId, ShotRating, SpinType } from '../types';
import type { ArenaLayout, CurveArenaSettings } from '../core/CurveArena';

/**
 * Bump whenever packet shapes or game-flow semantics change. Peers with a different version refuse to
 * play each other (e.g. an old cached tab connecting to a freshly deployed one).
 */
export const PROTOCOL_VERSION = 3;

export type NetworkMessageType =
  | 'HANDSHAKE'
  | 'PADDLE_MOVE'
  | 'BALL_HIT'
  | 'BALL_SYNC'
  | 'POINT_SCORED'
  | 'REMATCH_REQUEST'
  | 'PING'
  | 'PONG'
  | 'CURVE_INPUT'
  | 'CURVE_ROUND_START'
  | 'CURVE_CRASH'
  | 'CURVE_SCORE_SYNC';

export interface HandshakeMessage {
  type: 'HANDSHAKE';
  username: string;
  gameMode?: 'PONG' | 'CURVE';
  targetScore?: number;
  role?: 'HOST' | 'CLIENT';
  protocolVersion?: number;
  /** Host's Curve Battle arena settings (size / obstacles / portals). */
  curveArena?: CurveArenaSettings;
}

export interface PaddleMoveMessage {
  type: 'PADDLE_MOVE';
  x: number;
  y: number;
  z: number;
  isForehand: boolean;
  isSwinging: boolean;
}

export interface BallHitMessage {
  type: 'BALL_HIT';
  hitter: PlayerId;
  contactPoint: [number, number, number];
  velocity: [number, number, number];
  spin: [number, number, number];
  rating: ShotRating;
  speed: number;
  isSmash: boolean;
  spinType: SpinType;
}

/** Host → client. `winner` and `score` are from the HOST's perspective; the client inverts them. */
export interface PointScoredMessage {
  type: 'POINT_SCORED';
  winner: PlayerId;
  reason: string;
  score: MatchScore;
}

export interface RematchMessage {
  type: 'REMATCH_REQUEST';
  status: 'requested' | 'accepted' | 'declined';
}

export interface PingMessage {
  type: 'PING';
  timestamp: number;
}

export interface PongMessage {
  type: 'PONG';
  timestamp: number;
}

export interface CurveInputMessage {
  type: 'CURVE_INPUT';
  x: number;
  z: number;
  angle: number;
  steering: -1 | 0 | 1;
  isDrawing: boolean;
}

export interface CurveRoundStartMessage {
  type: 'CURVE_ROUND_START';
  roundNumber: number;
  p1Spawn: { x: number; z: number; angle: number };
  p2Spawn: { x: number; z: number; angle: number };
  countdownMs: number;
  /** This round's arena: size, obstacles and portals (host-generated). */
  layout?: ArenaLayout;
}

export interface CurveCrashMessage {
  type: 'CURVE_CRASH';
  victim: PlayerId;
  x: number;
  z: number;
}

export interface CurveScoreSyncMessage {
  type: 'CURVE_SCORE_SYNC';
  player: number;
  cpu: number;
}

export interface BallSyncMessage {
  type: 'BALL_SYNC';
  position: [number, number, number];
  velocity: [number, number, number];
  spin: [number, number, number];
  isActive: boolean;
}

export type NetworkMessage =
  | HandshakeMessage
  | PaddleMoveMessage
  | BallHitMessage
  | BallSyncMessage
  | PointScoredMessage
  | RematchMessage
  | PingMessage
  | PongMessage
  | CurveInputMessage
  | CurveRoundStartMessage
  | CurveCrashMessage
  | CurveScoreSyncMessage;

