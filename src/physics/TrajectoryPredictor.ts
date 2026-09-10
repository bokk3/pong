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
}
