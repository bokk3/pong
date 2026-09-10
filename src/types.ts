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

export type GameEvents = {
  'state:changed': { from: GameState; to: GameState };
  'score:updated': MatchScore;
  'serve:ready': { server: PlayerId };
  'ball:hit': ShotInfo;
  'ball:bounce': { position: THREE.Vector3; surface: 'player_table' | 'cpu_table' | 'floor' | 'net'; speed: number };
  'point:scored': { winner: PlayerId; reason: string };
  'match:over': { winner: PlayerId; score: MatchScore };
  'camera:shake': { intensity: number; duration: number };
};
