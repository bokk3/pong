import { MatchScore, PlayerId, ShotRating, SpinType } from '../types';

export type NetworkMessageType =
  | 'HANDSHAKE'
  | 'PADDLE_MOVE'
  | 'BALL_HIT'
  | 'SERVE_START'
  | 'SCORE_SYNC'
  | 'POINT_SCORED'
  | 'REMATCH_REQUEST'
  | 'PING'
  | 'PONG';

export interface HandshakeMessage {
  type: 'HANDSHAKE';
  username: string;
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

export interface ServeStartMessage {
  type: 'SERVE_START';
  server: PlayerId;
  position: [number, number, number];
  velocity: [number, number, number];
  spin: [number, number, number];
}

export interface ScoreSyncMessage {
  type: 'SCORE_SYNC';
  score: MatchScore;
}

export interface PointScoredMessage {
  type: 'POINT_SCORED';
  winner: PlayerId;
  reason: string;
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

export type NetworkMessage =
  | HandshakeMessage
  | PaddleMoveMessage
  | BallHitMessage
  | ServeStartMessage
  | ScoreSyncMessage
  | PointScoredMessage
  | RematchMessage
  | PingMessage
  | PongMessage;
