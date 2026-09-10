import * as THREE from 'three';
import { PHYSICS_CONSTANTS, TABLE_BOUNDS } from './Constants';

export interface TrajectoryPoint {
  position: THREE.Vector3;
  time: number;
}

export class TrajectoryPredictor {
  /**
   * Predicts where the ball will cross target Z plane and when.
   */
  public static predictLanding(
    startPos: THREE.Vector3,
    startVel: THREE.Vector3,
    startSpin: THREE.Vector3,
    targetZ: number,
    maxTime: number = 2.0
  ): { position: THREE.Vector3; time: number; tableBouncePos: THREE.Vector3 | null } {
    const pos = startPos.clone();
    const vel = startVel.clone();
    const spin = startSpin.clone();
    const dt = 0.016; // 60Hz predictor step is fast and accurate enough

    let tableBouncePos: THREE.Vector3 | null = null;
    let time = 0;
    const tableTop = TABLE_BOUNDS.tableTopY + PHYSICS_CONSTANTS.BALL_RADIUS;

    const movingTowardsTarget = (targetZ > startPos.z && vel.z > 0) || (targetZ < startPos.z && vel.z < 0);
    if (!movingTowardsTarget && Math.abs(vel.z) < 0.1) {
      return { position: startPos.clone(), time: 0, tableBouncePos: null };
    }

    while (time < maxTime) {
      const prevZ = pos.z;
      const prevY = pos.y;

      // Integrate step
      const speed = vel.length();
      const drag = vel.clone().multiplyScalar(-PHYSICS_CONSTANTS.AIR_DRAG * speed);
      const grav = new THREE.Vector3(0, -PHYSICS_CONSTANTS.GRAVITY, 0);
      const magnus = new THREE.Vector3().crossVectors(spin, vel).multiplyScalar(PHYSICS_CONSTANTS.MAGNUS_LIFT);

      vel.addScaledVector(drag.add(grav).add(magnus), dt);
      pos.addScaledVector(vel, dt);
      time += dt;

      // Check table bounce
      if (prevY >= tableTop && pos.y <= tableTop && !tableBouncePos) {
        if (Math.abs(pos.x) <= TABLE_BOUNDS.halfWidth && Math.abs(pos.z) <= TABLE_BOUNDS.halfLength) {
          tableBouncePos = pos.clone();
          vel.y = -vel.y * PHYSICS_CONSTANTS.TABLE_RESTITUTION_Y;
        }
      }

      // Check crossing target Z
      if ((prevZ < targetZ && pos.z >= targetZ) || (prevZ > targetZ && pos.z <= targetZ)) {
        // Linear interpolate
        const alpha = (targetZ - prevZ) / (pos.z - prevZ);
        const hitX = THREE.MathUtils.lerp(pos.x - vel.x * dt, pos.x, alpha);
        const hitY = THREE.MathUtils.lerp(pos.y - vel.y * dt, pos.y, alpha);
        return {
          position: new THREE.Vector3(hitX, hitY, targetZ),
          time,
          tableBouncePos
        };
      }
    }

    return { position: pos, time, tableBouncePos };
  }

  /**
   * Computes the launch velocity vector (vx, vy, vz) to deliver the ball from
   * startPos to a target position on the opponent's table half while guaranteeing
   * net clearance and controlled arcade pace.
   */
  public static calculateLaunchVelocity(
    startPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    desiredSpeed: number,
    spin: THREE.Vector3,
    isSmash: boolean = false
  ): THREE.Vector3 {
    const deltaZ = targetPos.z - startPos.z;
    const directionZ = Math.sign(deltaZ);
    if (Math.abs(deltaZ) < 0.1) {
      return new THREE.Vector3(0, 1.5, directionZ * desiredSpeed);
    }

    // Determine flight time based on desired pace
    const horizontalSpeed = Math.max(desiredSpeed * 0.88, 4.0);
    const flightTime = THREE.MathUtils.clamp(
      Math.abs(deltaZ) / horizontalSpeed,
      isSmash ? 0.18 : 0.26,
      isSmash ? 0.28 : 0.42
    );

    const vz = deltaZ / flightTime;
    const vx = (targetPos.x - startPos.x) / flightTime;

    // Effective vertical acceleration accounting for gravity and Magnus spin effect
    const g = PHYSICS_CONSTANTS.GRAVITY;
    let magnusDown = 0;
    if (directionZ < 0) {
      // Moving towards CPU (-Z): positive spin.x pulls downward
      magnusDown = Math.max(0, spin.x) * Math.abs(vz) * PHYSICS_CONSTANTS.MAGNUS_LIFT;
    } else {
      // Moving towards Player (+Z): negative spin.x pulls downward
      magnusDown = Math.max(0, -spin.x) * Math.abs(vz) * PHYSICS_CONSTANTS.MAGNUS_LIFT;
    }
    const gEff = g + magnusDown;

    // Base vertical launch to reach targetPos.y at t = flightTime
    let vy = (targetPos.y - startPos.y + 0.5 * gEff * flightTime * flightTime) / flightTime;

    // Check net clearance at Z = 0
    if ((startPos.z > 0 && targetPos.z < 0) || (startPos.z < 0 && targetPos.z > 0)) {
      const tNet = Math.abs(startPos.z / vz);
      const netTapeY = TABLE_BOUNDS.tableTopY + TABLE_BOUNDS.netHeight;
      const clearanceMargin = isSmash ? 0.04 : 0.07;
      const minNetY = netTapeY + clearanceMargin;
      const yAtNet = startPos.y + vy * tNet - 0.5 * gEff * tNet * tNet;

      if (yAtNet < minNetY) {
        vy = (minNetY - startPos.y + 0.5 * gEff * tNet * tNet) / tNet;
      }
    }

    return new THREE.Vector3(vx, vy, vz);
  }
}

