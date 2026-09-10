import * as THREE from 'three';
import { PHYSICS_CONSTANTS, TABLE_BOUNDS } from './Constants';
import { EventBus } from '../core/EventBus';

export class BallPhysics {
  public position: THREE.Vector3 = new THREE.Vector3(0, 1.1, 1.5);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public spin: THREE.Vector3 = new THREE.Vector3(0, 0, 0); // (spinX = top/back, spinY = sidespin, spinZ = tilt)
  
  public isActive: boolean = false;
  private eventBus: EventBus;
  private prevPosition: THREE.Vector3 = new THREE.Vector3();

  constructor() {
    this.eventBus = EventBus.get();
  }

  public reset(pos: THREE.Vector3, vel: THREE.Vector3 = new THREE.Vector3(), spin: THREE.Vector3 = new THREE.Vector3()): void {
    this.position.copy(pos);
    this.prevPosition.copy(pos);
    this.velocity.copy(vel);
    this.spin.copy(spin);
    this.isActive = true;
  }

  public stop(): void {
    this.isActive = false;
    this.velocity.set(0, 0, 0);
    this.spin.set(0, 0, 0);
  }

  public update(deltaSeconds: number): void {
    if (!this.isActive) return;

    // Fixed sub-stepping to prevent tunneling at high speeds
    const fixedDt = PHYSICS_CONSTANTS.FIXED_TIMESTEP;
    const clampedDt = Math.min(deltaSeconds, 0.1);
    const subSteps = Math.min(
      Math.ceil(clampedDt / fixedDt),
      PHYSICS_CONSTANTS.MAX_SUB_STEPS
    );
    const dt = clampedDt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      this.integrateStep(dt);
    }
  }

  private integrateStep(dt: number): void {
    this.prevPosition.copy(this.position);

    const speed = this.velocity.length();

    // 1. Aerodynamic Drag: F_drag = -0.5 * rho * Cd * A * v^2 -> a_drag = -drag * v * |v|
    const dragAcc = this.velocity.clone().multiplyScalar(-PHYSICS_CONSTANTS.AIR_DRAG * speed);

    // 2. Gravity: a_g = (0, -g, 0)
    const gravAcc = new THREE.Vector3(0, -PHYSICS_CONSTANTS.GRAVITY, 0);

    // 3. Magnus Force: a_magnus = S * (spin x velocity)
    // Spin cross velocity gives lift and lateral hook
    const magnusAcc = new THREE.Vector3()
      .crossVectors(this.spin, this.velocity)
      .multiplyScalar(PHYSICS_CONSTANTS.MAGNUS_LIFT);

    // Total acceleration
    const totalAcc = dragAcc.add(gravAcc).add(magnusAcc);

    // Velocity Verlet / Euler integration
    this.velocity.addScaledVector(totalAcc, dt);
    this.position.addScaledVector(this.velocity, dt);

    // Spin natural air decay
    this.spin.multiplyScalar(Math.pow(PHYSICS_CONSTANTS.MAGNUS_SPIN_DECAY, dt * 60));

    // Continuous Collision Detection
    this.resolveCollisions();
  }

  private resolveCollisions(): void {
    const r = PHYSICS_CONSTANTS.BALL_RADIUS;
    const tableTop = TABLE_BOUNDS.tableTopY + r;
    const halfL = TABLE_BOUNDS.halfLength;
    const halfW = TABLE_BOUNDS.halfWidth;

    // --- A. TABLE SURFACE COLLISION ---
    // Check if the path crossed the table surface plane Y = tableTop
    if (this.prevPosition.y >= tableTop && this.position.y <= tableTop) {
      // Calculate exact interpolation parameter t in [0, 1]
      const t = (tableTop - this.prevPosition.y) / (this.position.y - this.prevPosition.y);
      const hitX = this.prevPosition.x + t * (this.position.x - this.prevPosition.x);
      const hitZ = this.prevPosition.z + t * (this.position.z - this.prevPosition.z);

      // Check if hit point is inside table perimeter
      if (Math.abs(hitX) <= halfW && Math.abs(hitZ) <= halfL) {
        // Place ball at contact surface
        this.position.y = tableTop;
        
        // Elastic rebound on Y
        this.velocity.y = -this.velocity.y * PHYSICS_CONSTANTS.TABLE_RESTITUTION_Y;

        // Ensure reliable net clearance on forward bounces heading towards the net (e.g. serves)
        const headingToNet = (hitZ > 0 && this.velocity.z < 0) || (hitZ < 0 && this.velocity.z > 0);
        if (headingToNet && Math.abs(hitZ) > 0.30) {
          const distToNet = Math.abs(hitZ);
          const horizSpeed = Math.max(Math.abs(this.velocity.z), 3.0);
          const tNet = distToNet / horizSpeed;
          // Target net height (0.9125m) + 0.085m safe clearance margin
          const minHeightAboveTable = (TABLE_BOUNDS.tableTopY + TABLE_BOUNDS.netHeight + 0.085) - tableTop;
          const minVyNeeded = (minHeightAboveTable + 0.5 * PHYSICS_CONSTANTS.GRAVITY * tNet * tNet) / tNet;
          this.velocity.y = Math.max(this.velocity.y, minVyNeeded);
        } else {
          // Standard minimum bounce velocity
          if (Math.abs(this.velocity.y) < 1.35) {
            this.velocity.y = 1.35;
          }
        }

        // Table surface friction alters horizontal speed based on spin
        // Topspin gives forward kick, backspin decelerates forward speed
        // spin.x > 0 means topspin when moving -Z (player to CPU)
        const forwardKick = this.spin.x * 0.008;
        this.velocity.z += (this.velocity.z < 0 ? -forwardKick : forwardKick);
        
        // Horizontal friction
        this.velocity.x *= PHYSICS_CONSTANTS.TABLE_FRICTION_XZ;
        this.velocity.z *= PHYSICS_CONSTANTS.TABLE_FRICTION_XZ;

        // Friction decays spin on table impact
        this.spin.x *= 0.65;
        this.spin.y *= 0.70;

        const surface = hitZ > 0 ? 'player_table' : 'cpu_table';
        this.eventBus.emit('ball:bounce', {
          position: new THREE.Vector3(hitX, tableTop, hitZ),
          surface,
          speed: this.velocity.length()
        });
        return;
      }
    }

    // --- B. NET COLLISION ---
    // Net is located at Z = 0, Y in [tableTopY, tableTopY + netHeight], X in [-netWidth/2, netWidth/2]
    const netYMin = TABLE_BOUNDS.tableTopY;
    const netYMax = TABLE_BOUNDS.tableTopY + TABLE_BOUNDS.netHeight;
    const netHalfW = TABLE_BOUNDS.netWidth / 2;

    // Check if path crossed Z = 0
    if ((this.prevPosition.z > 0 && this.position.z <= 0) ||
        (this.prevPosition.z < 0 && this.position.z >= 0)) {
      const t = (0 - this.prevPosition.z) / (this.position.z - this.prevPosition.z);
      const hitX = this.prevPosition.x + t * (this.position.x - this.prevPosition.x);
      const hitY = this.prevPosition.y + t * (this.position.y - this.prevPosition.y);

      if (Math.abs(hitX) <= netHalfW && hitY >= netYMin && hitY <= netYMax + r) {
        // Did it graze the top tape? (Net cord)
        if (hitY > netYMax - 0.02) {
          // Net cord deflection: slight slowdown, pop upward, passes over
          this.velocity.z *= 0.65;
          this.velocity.y = Math.max(this.velocity.y, 1.2);
          this.eventBus.emit('ball:bounce', {
            position: new THREE.Vector3(hitX, hitY, 0),
            surface: 'net',
            speed: this.velocity.length()
          });
        } else {
          // Solid net rebound: bounces backward and loses velocity
          this.position.z = this.prevPosition.z > 0 ? 0.03 : -0.03;
          this.velocity.z = -this.velocity.z * PHYSICS_CONSTANTS.NET_RESTITUTION;
          this.velocity.x *= 0.4;
          this.velocity.y *= 0.5;
          this.eventBus.emit('ball:bounce', {
            position: new THREE.Vector3(hitX, hitY, 0),
            surface: 'net',
            speed: this.velocity.length()
          });
        }
      }
    }

    // --- C. FLOOR COLLISION ---
    if (this.position.y <= r) {
      this.position.y = r;
      this.velocity.y = -this.velocity.y * PHYSICS_CONSTANTS.FLOOR_RESTITUTION_Y;
      this.velocity.x *= 0.75;
      this.velocity.z *= 0.75;

      if (Math.abs(this.velocity.y) < 0.2) {
        this.velocity.y = 0;
      }

      this.eventBus.emit('ball:bounce', {
        position: this.position.clone(),
        surface: 'floor',
        speed: this.velocity.length()
      });
    }
  }
}
