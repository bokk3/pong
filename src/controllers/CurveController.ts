import * as THREE from 'three';
import { PlayerId } from '../types';
import { CurveTrail } from '../entities/CurveTrail';
import { TABLE_BOUNDS } from '../physics/Constants';

export interface CurveConfig {
  speed: number;
  turnSpeed: number;
  gapIntervalMin: number;
  gapIntervalMax: number;
  gapDuration: number;
  headRadius: number;
}

const DEFAULT_CONFIG: CurveConfig = {
  speed: 1.15, // m/s forward speed
  turnSpeed: 3.2, // rad/s turning rate
  gapIntervalMin: 2.2, // seconds between gaps
  gapIntervalMax: 4.2,
  gapDuration: 0.28, // seconds gap lasts
  headRadius: 0.016 // head collision radius
};

// Line segment intersection helper
function lineIntersects(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): boolean {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(det) < 1e-8) return false;

  const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
  const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;

  return 0 <= lambda && lambda <= 1 && 0 <= gamma && gamma <= 1;
}

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

export class CurveController {
  public id: PlayerId;
  public trail: CurveTrail;
  public isBot: boolean = false;
  public isAlive: boolean = true;

  // Head state on table plane (X, Z)
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

  // Table bounds
  private readonly minX: number;
  private readonly maxX: number;
  private readonly minZ: number;
  private readonly maxZ: number;

  constructor(id: PlayerId, color: number, isBot: boolean = false, config: Partial<CurveConfig> = {}) {
    this.id = id;
    this.isBot = isBot;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.trail = new CurveTrail(color, TABLE_BOUNDS.tableTopY);

    // Head sphere
    const headGeo = new THREE.SphereGeometry(this.config.headRadius * 1.3, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.9
    });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.castShadow = true;
    this.headMesh.position.y = TABLE_BOUNDS.tableTopY + 0.015;

    // Outer table perimeter boundaries (inset slightly so trail stays on felt)
    const margin = 0.02;
    this.minX = -TABLE_BOUNDS.halfWidth + margin;
    this.maxX = TABLE_BOUNDS.halfWidth - margin;
    this.minZ = -TABLE_BOUNDS.halfLength + margin;
    this.maxZ = TABLE_BOUNDS.halfLength - margin;

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

  public update(dt: number, opponentTrail?: CurveTrail): boolean {
    if (!this.isAlive) return false;

    this.totalElapsed += dt;

    // 1. If Bot, compute autonomous steering
    if (this.isBot) {
      this.computeBotSteering(opponentTrail);
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
    prevX: number,
    prevZ: number,
    currX: number,
    currZ: number,
    opponentTrail?: CurveTrail
  ): boolean {
    // 1. Table Boundary Collision
    if (currX <= this.minX || currX >= this.maxX || currZ <= this.minZ || currZ >= this.maxZ) {
      return true;
    }

    // 2. Net obstacle collision (Net sits at Z=0 between -halfWidth and halfWidth)
    // Curve heads cannot drive right through the solid net center post
    const headRadius = this.config.headRadius;
    if (Math.abs(currZ) < 0.02 && Math.abs(currX) < TABLE_BOUNDS.halfWidth) {
      // Allow passing through only if near net extremes or if crossing directly
      if (lineIntersects(
        { x: prevX, y: prevZ },
        { x: currX, y: currZ },
        { x: -TABLE_BOUNDS.halfWidth, y: 0 },
        { x: TABLE_BOUNDS.halfWidth, y: 0 }
      )) {
        return true;
      }
    }

    const currPos = { x: currX, y: currZ };

    // 3. Collision against own trail (exclude last 0.22 seconds of trail to avoid self-colliding with head)
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

    // 4. Collision against opponent's trail
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
   * Smart curve Bot AI: casts rays ahead to evaluate free travel distance
   */
  private computeBotSteering(opponentTrail?: CurveTrail): void {
    const lookAheadDistance = 0.38; // ~35cm lookahead
    const anglesToTest = [
      { dir: 0 as (-1 | 0 | 1), offset: 0 },
      { dir: -1 as (-1 | 0 | 1), offset: -0.45 },
      { dir: 1 as (-1 | 0 | 1), offset: 0.45 },
      { dir: -1 as (-1 | 0 | 1), offset: -0.9 },
      { dir: 1 as (-1 | 0 | 1), offset: 0.9 }
    ];

    let bestDir: -1 | 0 | 1 = 0;
    let maxClearDistance = -1;

    for (const test of anglesToTest) {
      const testAngle = this.angle + test.offset;
      let clearDist = 0;
      const steps = 7;
      let hit = false;

      for (let s = 1; s <= steps; s++) {
        const d = (s / steps) * lookAheadDistance;
        const tx = this.x + Math.cos(testAngle) * d;
        const tz = this.z + Math.sin(testAngle) * d;

        // Check boundaries
        if (tx <= this.minX || tx >= this.maxX || tz <= this.minZ || tz >= this.maxZ) {
          hit = true;
          break;
        }

        // Check net
        if (Math.abs(tz) < 0.02) {
          hit = true;
          break;
        }

        // Check own trail
        const p = { x: tx, y: tz };
        for (const seg of this.trail.segments) {
          if (this.totalElapsed - seg.time < 0.22) continue;
          if (distToSegment(p, seg.p1, seg.p2) < this.config.headRadius * 1.4) {
            hit = true;
            break;
          }
        }
        if (hit) break;

        // Check opponent trail
        if (opponentTrail) {
          for (const seg of opponentTrail.segments) {
            if (distToSegment(p, seg.p1, seg.p2) < this.config.headRadius * 1.4) {
              hit = true;
              break;
            }
          }
          if (hit) break;
        }

        clearDist = d;
      }

      if (!hit) {
        clearDist = lookAheadDistance;
      }

      // Add slight bias to continue straight if safe
      const score = clearDist + (test.dir === 0 ? 0.05 : 0);

      if (score > maxClearDistance) {
        maxClearDistance = score;
        bestDir = test.dir;
      }
    }

    this.steering = bestDir;
  }

  public dispose(): void {
    this.trail.dispose();
    this.headMesh.geometry.dispose();
  }
}
