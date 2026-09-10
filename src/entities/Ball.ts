import * as THREE from 'three';
import { PHYSICS_CONSTANTS, TABLE_BOUNDS } from '../physics/Constants';
import { BallPhysics } from '../physics/BallPhysics';

export class Ball {
  public mesh: THREE.Mesh;
  public shadowMesh: THREE.Mesh;
  public group: THREE.Group;
  public physics: BallPhysics;

  constructor() {
    this.group = new THREE.Group();
    this.physics = new BallPhysics();

    // 1. Procedural 3-star ball texture to make rotation & spin visually obvious
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 64);

    // Red ITTF 3-star stamp logo on equator
    ctx.fillStyle = '#e11d48';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★★★', 32, 32);
    ctx.fillText('★★★', 96, 32);

    // Subtle equatorial seam line
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(128, 32);
    ctx.stroke();

    const ballTexture = new THREE.CanvasTexture(canvas);

    // 2. Ball Mesh
    const ballGeo = new THREE.SphereGeometry(PHYSICS_CONSTANTS.BALL_RADIUS, 32, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTexture,
      roughness: 0.35,
      metalness: 0.02
    });
    this.mesh = new THREE.Mesh(ballGeo, ballMat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    // 3. Dynamic Contact Shadow
    const shadowGeo = new THREE.CircleGeometry(PHYSICS_CONSTANTS.BALL_RADIUS * 1.5, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x030712,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = TABLE_BOUNDS.tableTopY + 0.002;
    this.group.add(this.shadowMesh);
  }

  public update(dt: number): void {
    this.physics.update(dt);

    // Sync mesh position to physics position
    this.mesh.position.copy(this.physics.position);

    // Apply spin rotation to ball mesh
    const spinSpeed = this.physics.spin.length();
    if (spinSpeed > 0.1) {
      const rotAxis = this.physics.spin.clone().normalize();
      const deltaAngle = spinSpeed * dt;
      this.mesh.rotateOnAxis(rotAxis, deltaAngle);
    }

    // Dynamic contact shadow projection
    this.updateShadow();
  }

  private updateShadow(): void {
    const ballY = this.physics.position.y;
    const tableTop = TABLE_BOUNDS.tableTopY + 0.002;
    const isAboveTable = Math.abs(this.physics.position.x) <= TABLE_BOUNDS.halfWidth &&
                         Math.abs(this.physics.position.z) <= TABLE_BOUNDS.halfLength;

    const groundY = isAboveTable ? tableTop : 0.005;
    const heightAboveSurface = Math.max(0, ballY - groundY);

    this.shadowMesh.position.x = this.physics.position.x;
    this.shadowMesh.position.z = this.physics.position.z;
    this.shadowMesh.position.y = groundY;

    // Scale and fade shadow with height
    const shadowScale = 1.0 + Math.min(heightAboveSurface * 2.0, 3.5);
    this.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);

    const baseOpacity = isAboveTable ? 0.5 : 0.35;
    const fade = Math.max(0.05, baseOpacity - heightAboveSurface * 0.4);
    (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = fade;
  }
}
