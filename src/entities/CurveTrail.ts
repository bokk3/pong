import * as THREE from 'three';

export interface TrailSegment {
  p1: THREE.Vector2;
  p2: THREE.Vector2;
  time: number;
}

const MAX_VERTICES = 15000;
const TRAIL_WIDTH = 0.024; // 2.4cm wide neon trail

export class CurveTrail {
  public group: THREE.Group;
  public segments: TrailSegment[] = [];

  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshStandardMaterial;
  private mesh: THREE.Mesh;
  private positions: Float32Array;
  private vertexIndex: number = 0;
  private lastPoint: THREE.Vector2 | null = null;
  private yElevation: number;

  constructor(color: number, tableY: number = 0.76) {
    this.group = new THREE.Group();
    this.yElevation = tableY + 0.003; // Just above table top

    this.positions = new Float32Array(MAX_VERTICES * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.8,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }

  public reset(): void {
    this.segments = [];
    this.vertexIndex = 0;
    this.lastPoint = null;
    this.geometry.setDrawRange(0, 0);
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  public addPoint(x: number, z: number, isDrawing: boolean, currentTime: number): void {
    const currentPoint = new THREE.Vector2(x, z);

    if (!isDrawing) {
      this.lastPoint = null;
      return;
    }

    if (!this.lastPoint) {
      this.lastPoint = currentPoint;
      return;
    }

    const dist = currentPoint.distanceTo(this.lastPoint);
    // Add segment only if moved at least 0.8cm
    if (dist < 0.008) {
      return;
    }

    const dir = new THREE.Vector2().subVectors(currentPoint, this.lastPoint).normalize();
    const normal = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(TRAIL_WIDTH / 2);

    const p1 = this.lastPoint;
    const p2 = currentPoint;

    const v1 = { x: p1.x - normal.x, z: p1.y - normal.y };
    const v2 = { x: p1.x + normal.x, z: p1.y + normal.y };
    const v3 = { x: p2.x - normal.x, z: p2.y - normal.y };
    const v4 = { x: p2.x + normal.x, z: p2.y + normal.y };

    if (this.vertexIndex + 6 <= MAX_VERTICES) {
      const p = this.positions;
      let i = this.vertexIndex * 3;

      // Tri 1
      p[i++] = v1.x; p[i++] = this.yElevation; p[i++] = v1.z;
      p[i++] = v2.x; p[i++] = this.yElevation; p[i++] = v2.z;
      p[i++] = v3.x; p[i++] = this.yElevation; p[i++] = v3.z;

      // Tri 2
      p[i++] = v2.x; p[i++] = this.yElevation; p[i++] = v2.z;
      p[i++] = v4.x; p[i++] = this.yElevation; p[i++] = v4.z;
      p[i++] = v3.x; p[i++] = this.yElevation; p[i++] = v3.z;

      this.vertexIndex += 6;
      this.geometry.setDrawRange(0, this.vertexIndex);
      const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
    }

    this.segments.push({
      p1: new THREE.Vector2(p1.x, p1.y),
      p2: new THREE.Vector2(p2.x, p2.y),
      time: currentTime
    });

    this.lastPoint = currentPoint;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
