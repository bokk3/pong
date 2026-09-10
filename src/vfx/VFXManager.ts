import * as THREE from 'three';
import { SpinType } from '../types';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
}

interface BounceRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export class VFXManager {
  public group: THREE.Group;
  
  // Ball Trail
  private trailLine: THREE.Line;
  private trailPositions: Float32Array;
  private trailMaxPoints: number = 24;
  private trailHistory: THREE.Vector3[] = [];
  private trailColors: { [key in SpinType]: THREE.Color } = {
    'NONE': new THREE.Color(0xffffff),
    'TOPSPIN': new THREE.Color(0xff6600), // Fiery orange
    'BACKSPIN': new THREE.Color(0x00d2ff), // Cyan ice
    'SIDESPIN_LEFT': new THREE.Color(0xa855f7), // Purple hook
    'SIDESPIN_RIGHT': new THREE.Color(0xa855f7)
  };

  // Hit Spark Particles
  private particles: Particle[] = [];
  private particleGeo: THREE.BufferGeometry;

  // Table Bounce Rings
  private bounceRings: BounceRing[] = [];
  private ringGeo: THREE.RingGeometry;

  constructor() {
    this.group = new THREE.Group();

    // 1. Trail Line Setup
    this.trailPositions = new Float32Array(this.trailMaxPoints * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      linewidth: 2
    });
    this.trailLine = new THREE.Line(trailGeo, trailMat);
    this.group.add(this.trailLine);

    // 2. Particle setup
    this.particleGeo = new THREE.BoxGeometry(0.015, 0.015, 0.015);

    // 3. Ring setup
    this.ringGeo = new THREE.RingGeometry(0.02, 0.045, 16);
  }

  public updateTrail(ballPos: THREE.Vector3, spin: SpinType, isSmash: boolean, isActive: boolean): void {
    if (!isActive) {
      this.trailHistory = [];
      this.trailLine.visible = false;
      return;
    }

    this.trailLine.visible = true;
    this.trailHistory.unshift(ballPos.clone());
    if (this.trailHistory.length > this.trailMaxPoints) {
      this.trailHistory.pop();
    }

    const posAttr = this.trailLine.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.trailMaxPoints; i++) {
      if (i < this.trailHistory.length) {
        posAttr.setXYZ(i, this.trailHistory[i].x, this.trailHistory[i].y, this.trailHistory[i].z);
      } else if (this.trailHistory.length > 0) {
        const last = this.trailHistory[this.trailHistory.length - 1];
        posAttr.setXYZ(i, last.x, last.y, last.z);
      }
    }
    posAttr.needsUpdate = true;

    // Trail color based on spin or smash
    const mat = this.trailLine.material as THREE.LineBasicMaterial;
    if (isSmash) {
      mat.color.setHex(0xff2200);
      mat.opacity = 0.9;
    } else {
      mat.color.copy(this.trailColors[spin] || this.trailColors.NONE);
      mat.opacity = 0.55;
    }
  }

  public createHitSparks(pos: THREE.Vector3, isSmash: boolean = false): void {
    const count = isSmash ? 24 : 10;
    const colorHex = isSmash ? 0xff3b30 : 0xffcc00;

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(pos);

      const speed = (isSmash ? 3.5 : 1.8) * (0.5 + Math.random() * 0.5);
      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.2) * Math.PI;

      const vel = new THREE.Vector3(
        Math.cos(angle) * Math.cos(elevation) * speed,
        Math.sin(elevation) * speed + 0.5,
        Math.sin(angle) * Math.cos(elevation) * speed
      );

      this.group.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: isSmash ? 0.35 : 0.22,
        startScale: 1.0
      });
    }
  }

  public createBounceRing(pos: THREE.Vector3): void {
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(this.ringGeo, ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + 0.003, pos.z);

    this.group.add(mesh);
    this.bounceRings.push({
      mesh,
      life: 0,
      maxLife: 0.3
    });
  }

  public update(dt: number): void {
    // 1. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      } else {
        p.velocity.y -= 9.8 * dt * 0.6; // Light gravity
        p.mesh.position.addScaledVector(p.velocity, dt);

        const progress = p.life / p.maxLife;
        const scale = (1 - progress) * p.startScale;
        p.mesh.scale.set(scale, scale, scale);
      }
    }

    // 2. Update bounce rings
    for (let i = this.bounceRings.length - 1; i >= 0; i--) {
      const r = this.bounceRings[i];
      r.life += dt;

      if (r.life >= r.maxLife) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.bounceRings.splice(i, 1);
      } else {
        const progress = r.life / r.maxLife;
        const scale = 1.0 + progress * 3.5;
        r.mesh.scale.set(scale, scale, scale);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress);
      }
    }
  }
}
