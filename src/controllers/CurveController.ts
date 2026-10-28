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
   * 1. Kinematic Arc Simulation: accurately tests circular turning paths matching bike speed & turn rate.
   * 2. Hard Safety-First Gating: tactical aggression strictly forbidden if clearance < 0.85m.
   * 3. Steering Hysteresis: eliminates 60Hz alternating turn jitters.
   * 4. Canyon & Trap Avoidance: checks side corridors to prevent getting pinned into dead ends.
   * 5. Smart Offensive Tactics: cuts across and pins opponent to boundary when safe.
   */
  private computeBotSteering(opponentTrail?: CurveTrail, opponentState?: { x: number; z: number; angle: number; isAlive: boolean }): void {
    const isNovice = this.difficulty === 'novice';
    const isChampion = this.difficulty === 'master';

    // Lookahead reach
    const maxLookahead = isNovice ? 1.05 : isChampion ? 1.6 : 1.35;
    const simSteps = 18;
    const stepDt = (maxLookahead / this.config.speed) / simSteps;
    const wallMargin = isNovice ? 0.16 : 0.12;
    const safeRadius = this.config.headRadius * 1.6;

    // Prospective kinematic trajectories
    const candidates: Array<{
      initialSteer: -1 | 0 | 1;
      steerDirection: -1 | 0 | 1;
      turnRatio: number;
    }> = [
      { initialSteer: 0, steerDirection: 0, turnRatio: 0 },
      { initialSteer: -1, steerDirection: -1, turnRatio: 0.35 },
      { initialSteer: 1, steerDirection: 1, turnRatio: 0.35 },
      { initialSteer: -1, steerDirection: -1, turnRatio: 0.65 },
      { initialSteer: 1, steerDirection: 1, turnRatio: 0.65 },
      { initialSteer: -1, steerDirection: -1, turnRatio: 1.0 },
      { initialSteer: 1, steerDirection: 1, turnRatio: 1.0 }
    ];

    let bestDir: -1 | 0 | 1 = 0;
    let highestScore = -99999;

    // Evaluate each kinematic arc
    for (const cand of candidates) {
      let simX = this.x;
      let simZ = this.z;
      let simAngle = this.angle;
      let clearDistance = 0;
      let hitObstacle = false;
      const turnStepsCount = Math.round(simSteps * cand.turnRatio);

      for (let s = 1; s <= simSteps; s++) {
        const currentSteer = s <= turnStepsCount ? cand.steerDirection : 0;
        simAngle += currentSteer * this.config.turnSpeed * stepDt;
        simX += Math.cos(simAngle) * (this.config.speed * stepDt);
        simZ += Math.sin(simAngle) * (this.config.speed * stepDt);

        // Wall safety check
        if (simX <= this.minX + wallMargin || simX >= this.maxX - wallMargin ||
            simZ <= this.minZ + wallMargin || simZ >= this.maxZ - wallMargin) {
          hitObstacle = true;
          break;
        }

        const point = { x: simX, y: simZ };

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

        clearDistance = s * (this.config.speed * stepDt);
      }

      if (!hitObstacle) {
        clearDistance = maxLookahead;
      }

      // Base survival score: weighted by clear forward flight
      let score = clearDistance * 8.0;

      // Heavy penalty for imminent obstacles
      if (clearDistance < 0.40) {
        score -= 150;
      } else if (clearDistance < 0.75) {
        score -= 45;
      }

      // Steering hysteresis: reward continuing turn direction to eliminate jitter
      if (cand.initialSteer === this.steering) {
        score += 0.45;
      }
      if (cand.initialSteer === 0) {
        score += 0.20;
      }

      // Border avoidance bonus: prefer heading towards open arena center
      const distFromCenter = Math.hypot(simX, simZ);
      const centerBias = (1.0 - (distFromCenter / CURVE_ARENA_HALF)) * 1.2;
      score += centerBias;

      // Canyon / Pocket trap check at trajectory endpoint
      const leftWingX = simX + Math.cos(simAngle - Math.PI / 2) * 0.28;
      const leftWingZ = simZ + Math.sin(simAngle - Math.PI / 2) * 0.28;
      const rightWingX = simX + Math.cos(simAngle + Math.PI / 2) * 0.28;
      const rightWingZ = simZ + Math.sin(simAngle + Math.PI / 2) * 0.28;

      if (this.isLocationBlocked(leftWingX, leftWingZ, opponentTrail) &&
          this.isLocationBlocked(rightWingX, rightWingZ, opponentTrail)) {
        score -= 35; // Avoid dead-end canyons
      }

      // OFFENSIVE TACTICS: ONLY GATED IF SURVIVAL IS COMPLETELY SAFE (clearDistance >= 0.85m)
      if (clearDistance >= 0.85 && opponentState && opponentState.isAlive && !isNovice) {
        const distToOpp = Math.hypot(opponentState.x - this.x, opponentState.z - this.z);

        if (distToOpp < 2.5) {
          // Predict where opponent will be in 0.8s
          const oppPredX = opponentState.x + Math.cos(opponentState.angle) * 1.1;
          const oppPredZ = opponentState.z + Math.sin(opponentState.angle) * 1.1;

          const distToOppFuture = Math.hypot(oppPredX - simX, oppPredZ - simZ);

          // 1. Cut-off tactic: steer ahead of opponent to choke their corridor
          if (distToOppFuture < 0.75) {
            score += isChampion ? 3.5 : 2.0;
          }

          // 2. Wall-pinning tactic: if opponent is near border, cut off escape into center
          const oppDistFromCenter = Math.hypot(opponentState.x, opponentState.z);
          if (oppDistFromCenter > CURVE_ARENA_HALF * 0.60) {
            const botDistToCenter = Math.hypot(simX, simZ);
            if (botDistToCenter < oppDistFromCenter && distToOpp < 1.6) {
              score += isChampion ? 4.0 : 2.2;
            }
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestDir = cand.initialSteer;
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
