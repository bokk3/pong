import * as THREE from 'three';
import { PlayerId } from '../types';
import { CurveTrail } from '../entities/CurveTrail';

export interface CurveConfig {
  speed: number;
  turnSpeed: number;
  gapIntervalMin: number;
  gapIntervalMax: number;
  gapDuration: number;
  headRadius: number;
}

const DEFAULT_CONFIG: CurveConfig = {
  speed: 1.45, // balanced forward speed for snappy response
  turnSpeed: 4.6, // rad/s snappy arcade steering rate
  gapIntervalMin: 2.2, // seconds between gaps
  gapIntervalMax: 4.2,
  gapDuration: 0.28, // seconds gap lasts
  headRadius: 0.024 // head collision radius
};


// Distance from point to line segment
function distToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// Larger Square 2D Arena size: 4.8 x 4.8 square for plenty of maneuvering room
export const CURVE_ARENA_SIZE = 4.8;
export const CURVE_ARENA_HALF = CURVE_ARENA_SIZE / 2;

export class CurveController {
  public id: PlayerId;
  public trail: CurveTrail;
  public isBot: boolean = false;
  public isAlive: boolean = true;
  public difficulty: 'novice' | 'pro' | 'master' = 'novice';

  // Head state on arena plane (X, Z)
  public x: number = 0;
  public z: number = 0;
  public angle: number = 0;
  public steering: -1 | 0 | 1 = 0; // -1 = Left, 0 = Straight, 1 = Right

  // Visual Head Representation (Glowing sphere)
  public headMesh: THREE.Mesh;

  // Gap Timing
  public isDrawing: boolean = true;
  private timeToNextGap: number = 2.5;
  private gapTimer: number = 0;

  private config: CurveConfig;
  private totalElapsed: number = 0;

  // Arena bounds (pure square, no obstacles or net)
  public readonly minX: number;
  public readonly maxX: number;
  public readonly minZ: number;
  public readonly maxZ: number;

  constructor(id: PlayerId, color: number, isBot: boolean = false, config: Partial<CurveConfig> = {}) {
    this.id = id;
    this.isBot = isBot;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.trail = new CurveTrail(color, 0.046);

    // Head sphere
    const headGeo = new THREE.SphereGeometry(this.config.headRadius * 1.25, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.3,
      roughness: 0.1,
      metalness: 0.9
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = 0.052;

    // Outer square boundaries with small safety padding
    const margin = 0.04;
    this.minX = -CURVE_ARENA_HALF + margin;
    this.maxX = CURVE_ARENA_HALF - margin;
    this.minZ = -CURVE_ARENA_HALF + margin;
    this.maxZ = CURVE_ARENA_HALF - margin;

    this.scheduleNextGap();
  }



  public reset(spawnX: number, spawnZ: number, spawnAngle: number): void {
    this.x = spawnX;
    this.z = spawnZ;
    this.angle = spawnAngle;
    this.steering = 0;
    this.isAlive = true;
    this.isDrawing = true;
    this.totalElapsed = 0;
    this.scheduleNextGap();

    this.trail.reset();
    this.updateHeadMesh();
  }

  private scheduleNextGap(): void {
    this.timeToNextGap = this.config.gapIntervalMin + 
      Math.random() * (this.config.gapIntervalMax - this.config.gapIntervalMin);
    this.gapTimer = 0;
  }

  public setSteering(dir: -1 | 0 | 1): void {
    this.steering = dir;
  }

  public update(dt: number, opponentTrail?: CurveTrail, opponentState?: { x: number; z: number; angle: number; isAlive: boolean }): boolean {
    if (!this.isAlive) return false;

    this.totalElapsed += dt;

    // 1. If Bot, compute autonomous steering with opponent tactical awareness
    if (this.isBot) {
      this.computeBotSteering(opponentTrail, opponentState);
    }

    // 2. Angular steering
    if (this.steering !== 0) {
      this.angle += this.steering * this.config.turnSpeed * dt;
    }

    // 3. Gap mechanic update
    this.gapTimer += dt;
    if (this.isDrawing) {
      if (this.gapTimer >= this.timeToNextGap) {
        this.isDrawing = false;
        this.gapTimer = 0;
      }
    } else {
      if (this.gapTimer >= this.config.gapDuration) {
        this.isDrawing = true;
        this.gapTimer = 0;
        this.scheduleNextGap();
      }
    }

    // 4. Forward kinematics
    const prevX = this.x;
    const prevZ = this.z;
    const dx = Math.cos(this.angle) * this.config.speed * dt;
    const dz = Math.sin(this.angle) * this.config.speed * dt;

    this.x += dx;
    this.z += dz;

    this.updateHeadMesh();

    // 5. Add point to trail
    this.trail.addPoint(this.x, this.z, this.isDrawing, this.totalElapsed);

    // 6. Check Collision
    if (this.checkCollision(prevX, prevZ, this.x, this.z, opponentTrail)) {
      this.isAlive = false;
      return true; // Just crashed
    }

    return false;
  }

  private updateHeadMesh(): void {
    this.headMesh.position.x = this.x;
    this.headMesh.position.z = this.z;
    this.headMesh.visible = this.isAlive;
  }

  public checkCollision(
    _prevX: number,
    _prevZ: number,
    currX: number,
    currZ: number,
    opponentTrail?: CurveTrail
  ): boolean {
    // 1. Square Boundary Collision
    if (currX <= this.minX || currX >= this.maxX || currZ <= this.minZ || currZ >= this.maxZ) {
      return true;
    }

    const headRadius = this.config.headRadius;
    const currPos = { x: currX, y: currZ };

    // 2. Collision against own trail (exclude last 0.22 seconds of trail to avoid self-colliding with head)
    const graceTime = 0.22;
    for (let i = 0; i < this.trail.segments.length; i++) {
      const seg = this.trail.segments[i];
      if (this.totalElapsed - seg.time < graceTime) {
        continue; // Still near head
      }

      if (distToSegment(currPos, seg.p1, seg.p2) < headRadius * 1.3) {
        return true;
      }
    }

    // 3. Collision against opponent's trail
    if (opponentTrail) {
      for (let i = 0; i < opponentTrail.segments.length; i++) {
        const seg = opponentTrail.segments[i];
        if (distToSegment(currPos, seg.p1, seg.p2) < headRadius * 1.3) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Advanced Curve Bot AI:
   * 1. Multi-step fan raycasting with pocket volume sampling (detects trapped cavities).
   * 2. Edge repulsion with corner anti-pinch (never commits into narrow corner traps).
   * 3. Aggressive tactical cutting-off: steers across opponent's path to starve their space.
   * 4. Wall-pinning: if opponent is near the edge, cuts inward to box them against the wall.
   */
  private computeBotSteering(opponentTrail?: CurveTrail, opponentState?: { x: number; z: number; angle: number; isAlive: boolean }): void {
    const isNovice = this.difficulty === 'novice';
    const isChampion = this.difficulty === 'master';

    // Lookahead reach
    const maxLookahead = isNovice ? 0.9 : isChampion ? 1.4 : 1.15;

    // Prospective candidate steering commands
    const candidates: Array<{ dir: -1 | 0 | 1; turnAngle: number; straightBias: number }> = [
      { dir: 0, turnAngle: 0, straightBias: 0.15 },
      { dir: -1, turnAngle: -0.4, straightBias: 0 },
      { dir: 1, turnAngle: 0.4, straightBias: 0 },
      { dir: -1, turnAngle: -0.85, straightBias: -0.05 },
      { dir: 1, turnAngle: 0.85, straightBias: -0.05 },
      { dir: -1, turnAngle: -1.35, straightBias: -0.1 },
      { dir: 1, turnAngle: 1.35, straightBias: -0.1 }
    ];

    let bestDir: -1 | 0 | 1 = 0;
    let highestScore = -9999;

    // Evaluate each prospective turn
    for (const cand of candidates) {
      const probeAngle = this.angle + cand.turnAngle;
      let clearDistance = 0;
      let hitObstacle = false;
      const steps = 12;

      for (let s = 1; s <= steps; s++) {
        const dist = (s / steps) * maxLookahead;
        const px = this.x + Math.cos(probeAngle) * dist;
        const pz = this.z + Math.sin(probeAngle) * dist;

        // Wall safety check (with generous margin)
        const wallMargin = isNovice ? 0.16 : 0.12;
        if (px <= this.minX + wallMargin || px >= this.maxX - wallMargin || pz <= this.minZ + wallMargin || pz >= this.maxZ - wallMargin) {
          hitObstacle = true;
          break;
        }

        const point = { x: px, y: pz };
        const safeRadius = this.config.headRadius * 1.7;

        // Own trail obstacle check
        for (let i = 0; i < this.trail.segments.length; i++) {
          const seg = this.trail.segments[i];
          if (this.totalElapsed - seg.time < 0.25) continue;
          if (distToSegment(point, seg.p1, seg.p2) < safeRadius) {
            hitObstacle = true;
            break;
          }
        }
        if (hitObstacle) break;

        // Opponent trail obstacle check
        if (opponentTrail) {
          for (let i = 0; i < opponentTrail.segments.length; i++) {
            const seg = opponentTrail.segments[i];
            if (distToSegment(point, seg.p1, seg.p2) < safeRadius) {
              hitObstacle = true;
              break;
            }
          }
          if (hitObstacle) break;
        }

        clearDistance = dist;
      }

      if (!hitObstacle) {
        clearDistance = maxLookahead;
      }

      // Base survival score: length of uninterrupted forward flight
      let score = clearDistance * 4.0 + cand.straightBias;

      // Heavy penalty for immediate dead ends (< 0.35m ahead)
      if (clearDistance < 0.35) {
        score -= 50;
      }

      // End of probe position
      const probeEndX = this.x + Math.cos(probeAngle) * clearDistance;
      const probeEndZ = this.z + Math.sin(probeAngle) * clearDistance;

      // Pocket Area Check: sample left and right wings from probe endpoint
      // This detects if the bot is driving straight into a narrow canyon/pocket
      const leftWingX = probeEndX + Math.cos(probeAngle - Math.PI / 2) * 0.25;
      const leftWingZ = probeEndZ + Math.sin(probeAngle - Math.PI / 2) * 0.25;
      const rightWingX = probeEndX + Math.cos(probeAngle + Math.PI / 2) * 0.25;
      const rightWingZ = probeEndZ + Math.sin(probeAngle + Math.PI / 2) * 0.25;

      const isLeftClogged = this.isLocationBlocked(leftWingX, leftWingZ, opponentTrail);
      const isRightClogged = this.isLocationBlocked(rightWingX, rightWingZ, opponentTrail);

      if (isLeftClogged && isRightClogged) {
        score -= 25; // Canyon trap penalty!
      }

      // Border avoidance bonus: prefer heading towards the open center
      const distFromCenter = Math.hypot(probeEndX, probeEndZ);
      const centerBias = (1.0 - (distFromCenter / CURVE_ARENA_HALF)) * 0.8;
      score += centerBias;

      // --- Offensive Tactics vs Opponent ---
      if (opponentState && opponentState.isAlive && !isNovice) {
        const distToOpp = Math.hypot(opponentState.x - this.x, opponentState.z - this.z);

        // If opponent is within medium engagement distance (~2.2m)
        if (distToOpp < 2.2) {
          // Predict where opponent will be in 0.8s
          const oppPredX = opponentState.x + Math.cos(opponentState.angle) * 1.1;
          const oppPredZ = opponentState.z + Math.sin(opponentState.angle) * 1.1;

          // Distance from this candidate probe end to opponent's future trajectory
          const distToOppFuture = Math.hypot(oppPredX - probeEndX, oppPredZ - probeEndZ);

          // 1. Cut-off tactic: steer across their path ahead of them
          if (distToOppFuture < 0.7 && clearDistance > 0.6) {
            score += isChampion ? 3.5 : 2.0;
          }

          // 2. Wall-pinning tactic: if opponent is close to boundary, cut off their escape into center
          const oppDistFromCenter = Math.hypot(opponentState.x, opponentState.z);
          if (oppDistFromCenter > CURVE_ARENA_HALF * 0.65) {
            // Opponent is near wall! Check if our trajectory is between opponent and center
            const botDistToCenter = Math.hypot(probeEndX, probeEndZ);
            if (botDistToCenter < oppDistFromCenter && distToOpp < 1.4) {
              score += isChampion ? 4.0 : 2.2; // Box them against the border!
            }
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestDir = cand.dir;
      }
    }

    this.steering = bestDir;
  }

  private isLocationBlocked(x: number, z: number, opponentTrail?: CurveTrail): boolean {
    if (x <= this.minX + 0.05 || x >= this.maxX - 0.05 || z <= this.minZ + 0.05 || z >= this.maxZ - 0.05) {
      return true;
    }
    const p = { x, y: z };
    const r = this.config.headRadius * 1.5;

    for (let i = 0; i < this.trail.segments.length; i++) {
      if (this.totalElapsed - this.trail.segments[i].time < 0.25) continue;
      if (distToSegment(p, this.trail.segments[i].p1, this.trail.segments[i].p2) < r) return true;
    }
    if (opponentTrail) {
      for (let i = 0; i < opponentTrail.segments.length; i++) {
        if (distToSegment(p, opponentTrail.segments[i].p1, opponentTrail.segments[i].p2) < r) return true;
      }
    }
    return false;
  }



  public dispose(): void {
    this.trail.dispose();
    this.headMesh.geometry.dispose();
  }
}
