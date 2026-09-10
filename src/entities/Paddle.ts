import * as THREE from 'three';
import { PlayerId, SpinType } from '../types';
import { PADDLE_SPECS } from '../physics/Constants';

export class Paddle {
  public group: THREE.Group;
  public playerId: PlayerId;
  public position: THREE.Vector3;
  public targetPosition: THREE.Vector3;

  private bladeMesh!: THREE.Mesh;
  private redRubberMesh!: THREE.Mesh;
  private blackRubberMesh!: THREE.Mesh;
  private handleMesh!: THREE.Mesh;
  private handMesh!: THREE.Mesh;

  // Swing animation state
  private isSwinging: boolean = false;
  private swingProgress: number = 0;
  private swingDuration: number = 0.22;
  private isForehand: boolean = true;
  private currentSpin: SpinType = 'NONE';
  private swingPower: number = 1.0;

  constructor(playerId: PlayerId) {
    this.playerId = playerId;
    this.group = new THREE.Group();

    const defaultPos = playerId === 'PLAYER'
      ? PADDLE_SPECS.PLAYER_DEFAULT_POS
      : PADDLE_SPECS.CPU_DEFAULT_POS;

    this.position = new THREE.Vector3(defaultPos.x, defaultPos.y, defaultPos.z);
    this.targetPosition = this.position.clone();
    this.group.position.copy(this.position);

    this.buildPaddle();
    this.resetOrientation();
  }

  private buildPaddle(): void {
    const headRadius = PADDLE_SPECS.HEAD_RADIUS;
    const thickness = PADDLE_SPECS.THICKNESS;

    // 1. Blade wooden rim core
    const rimGeo = new THREE.CylinderGeometry(headRadius, headRadius, thickness, 32);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xc89666, // Natural birch plywood
      roughness: 0.6
    });
    this.bladeMesh = new THREE.Mesh(rimGeo, rimMat);
    this.bladeMesh.rotation.x = Math.PI / 2;
    this.bladeMesh.castShadow = true;
    this.group.add(this.bladeMesh);

    // 2. Red Forehand Rubber (Face facing towards opponent in default stance)
    const rubberThickness = 0.003;
    const rubberGeo = new THREE.CylinderGeometry(headRadius - 0.002, headRadius - 0.002, rubberThickness, 32);
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xd91e36, // Vibrant table tennis red
      roughness: 0.3,
      metalness: 0.05
    });
    this.redRubberMesh = new THREE.Mesh(rubberGeo, redMat);
    this.redRubberMesh.rotation.x = Math.PI / 2;
    this.redRubberMesh.position.z = thickness / 2 + rubberThickness / 2;
    this.group.add(this.redRubberMesh);

    // 3. Black Backhand Rubber
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.3,
      metalness: 0.05
    });
    this.blackRubberMesh = new THREE.Mesh(rubberGeo, blackMat);
    this.blackRubberMesh.rotation.x = Math.PI / 2;
    this.blackRubberMesh.position.z = -thickness / 2 - rubberThickness / 2;
    this.group.add(this.blackRubberMesh);

    // 4. Wooden Handle
    const handleGeo = new THREE.CylinderGeometry(0.015, 0.018, PADDLE_SPECS.HANDLE_LENGTH, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xa06535,
      roughness: 0.5
    });
    this.handleMesh = new THREE.Mesh(handleGeo, handleMat);
    this.handleMesh.position.set(0, -headRadius - PADDLE_SPECS.HANDLE_LENGTH / 2 + 0.015, 0);
    this.handleMesh.castShadow = true;
    this.group.add(this.handleMesh);

    // 5. Stylized Disembodied Hand / Glove (Wii Sports aesthetic)
    const handGeo = new THREE.SphereGeometry(0.038, 16, 16);
    const handMat = new THREE.MeshStandardMaterial({
      color: this.playerId === 'PLAYER' ? 0x00d2ff : 0xff5500, // Player Cyan, CPU Orange
      roughness: 0.4
    });
    this.handMesh = new THREE.Mesh(handGeo, handMat);
    this.handMesh.scale.set(0.9, 1.2, 0.9);
    this.handMesh.position.set(0, -headRadius - PADDLE_SPECS.HANDLE_LENGTH + 0.01, 0);
    this.handMesh.castShadow = true;
    this.group.add(this.handMesh);
  }

  public resetOrientation(): void {
    if (this.playerId === 'PLAYER') {
      this.group.rotation.set(-0.15, 0, 0);
    } else {
      this.group.rotation.set(0.15, Math.PI, 0);
    }
  }

  /**
   * Triggers a swing gesture animation.
   */
  public swing(isForehand: boolean, spin: SpinType = 'NONE', power: number = 1.0): void {
    this.isSwinging = true;
    this.swingProgress = 0;
    this.isForehand = isForehand;
    this.currentSpin = spin;
    this.swingPower = Math.min(Math.max(power, 0.6), 1.8);
    this.swingDuration = 0.20 / (this.swingPower * 0.8 + 0.2);
  }

  public followSpeed: number = 28.0;

  public update(dt: number): void {
    // Smooth position interpolation toward target (snappy tracking)
    this.position.lerp(this.targetPosition, Math.min(dt * this.followSpeed, 1.0));
    this.group.position.copy(this.position);

    if (this.isSwinging) {
      this.swingProgress += dt / this.swingDuration;

      if (this.swingProgress >= 1.0) {
        this.isSwinging = false;
        this.swingProgress = 0;
        this.resetOrientation();
      } else {
        this.applySwingAnimation(this.swingProgress);
      }
    }
  }

  private applySwingAnimation(p: number): void {
    // Curve: 0 -> backswing peak at 0.2 -> strike impact at 0.5 -> follow-through at 0.8 -> return at 1.0
    const sign = this.playerId === 'PLAYER' ? 1 : -1;
    const sideSign = this.isForehand ? 1 : -1;

    // Angle of attack based on spin
    let pitchTilt = 0; // Negative tilts forward/closed (topspin), positive tilts open (slice)
    if (this.currentSpin === 'TOPSPIN') {
      pitchTilt = -0.45;
    } else if (this.currentSpin === 'BACKSPIN') {
      pitchTilt = 0.35;
    }

    let swingPhaseAngle: number;
    if (p < 0.3) {
      // Windup / backswing
      const t = p / 0.3;
      swingPhaseAngle = -0.35 * t;
    } else if (p < 0.6) {
      // Powerful forward strike
      const t = (p - 0.3) / 0.3;
      swingPhaseAngle = -0.35 + 1.1 * t;
    } else {
      // Follow through and recoil back
      const t = (p - 0.6) / 0.4;
      swingPhaseAngle = 0.75 * (1 - t);
    }

    const baseRotationY = this.playerId === 'PLAYER' ? 0 : Math.PI;

    this.group.rotation.x = (-0.15 + pitchTilt + swingPhaseAngle * 0.4) * sign;
    this.group.rotation.y = baseRotationY + swingPhaseAngle * sideSign * 0.6;
    this.group.rotation.z = -swingPhaseAngle * sideSign * 0.35;

    // Dynamic forward reach during swing impact
    const forwardLunge = Math.sin(p * Math.PI) * 0.12 * sign;
    this.group.position.z = this.position.z - forwardLunge;
  }
}
