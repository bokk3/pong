import * as THREE from 'three';

export class Stadium {
  public group: THREE.Group;
  private crowdFigures: THREE.Group[] = [];
  private crowdBobTime: number = 0;
  private isCelebrating: boolean = false;
  private celebrateTimer: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.buildStadium();
  }

  private buildStadium(): void {
    // 1. Polished Wood Sports Floor
    const floorGeo = new THREE.PlaneGeometry(24, 28);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#b45309'; // Warm golden wood
    ctx.fillRect(0, 0, 256, 256);

    // Subtle plank lines
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.2)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(8, 10);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.4,
      metalness: 0.05
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    this.group.add(floorMesh);

    // Court boundary lines on floor
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.35, transparent: true });
    const courtBorderGeo = new THREE.RingGeometry(3.6, 3.65, 4);
    const courtBorder = new THREE.Mesh(courtBorderGeo, lineMat);
    courtBorder.rotation.x = -Math.PI / 2;
    courtBorder.rotation.z = Math.PI / 4;
    courtBorder.position.y = 0.001;
    this.group.add(courtBorder);

    // 2. Surrounds / Court Barriers (Red & Blue A-Frame Barriers)
    const barrierGeo = new THREE.BoxGeometry(2.3, 0.65, 0.08);
    const blueBarrierMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 });
    const redBarrierMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 });

    const barrierPlacements = [
      // Left side barriers
      { x: -2.8, z: -2.4, rotY: Math.PI / 2, mat: blueBarrierMat },
      { x: -2.8, z: 0, rotY: Math.PI / 2, mat: redBarrierMat },
      { x: -2.8, z: 2.4, rotY: Math.PI / 2, mat: blueBarrierMat },
      // Right side barriers
      { x: 2.8, z: -2.4, rotY: Math.PI / 2, mat: blueBarrierMat },
      { x: 2.8, z: 0, rotY: Math.PI / 2, mat: redBarrierMat },
      { x: 2.8, z: 2.4, rotY: Math.PI / 2, mat: blueBarrierMat },
      // Far end barriers
      { x: -1.2, z: -4.5, rotY: 0, mat: redBarrierMat },
      { x: 1.2, z: -4.5, rotY: 0, mat: blueBarrierMat }
    ];

    barrierPlacements.forEach(b => {
      const barrier = new THREE.Mesh(barrierGeo, b.mat);
      barrier.position.set(b.x, 0.325, b.z);
      barrier.rotation.y = b.rotY;
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      this.group.add(barrier);
    });

    // 3. Bleachers & Stylized Wii-style Crowd
    this.buildBleachersAndCrowd();

    // 4. Stadium Lighting (Soft Ambient + Spotlights)
    this.setupLighting();
  }

  private buildBleachersAndCrowd(): void {
    const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const crowdColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899];

    // Background bleacher tiers (facing player from behind the CPU side)
    const tiers = 4;
    for (let t = 0; t < tiers; t++) {
      const stepDepth = 1.0;
      const stepHeight = 0.5;
      const zPos = -5.8 - t * stepDepth;
      const yPos = (t + 1) * stepHeight;

      const stepGeo = new THREE.BoxGeometry(16, stepHeight, stepDepth);
      const stepMesh = new THREE.Mesh(stepGeo, bleacherMat);
      stepMesh.position.set(0, yPos - stepHeight / 2, zPos);
      stepMesh.receiveShadow = true;
      this.group.add(stepMesh);

      // Add stylized low-poly crowd spectators along the tier
      const count = 12;
      for (let i = 0; i < count; i++) {
        const xPos = -6.5 + (i * 13) / (count - 1) + (Math.random() - 0.5) * 0.2;
        const color = crowdColors[(t * count + i) % crowdColors.length];

        const crowdFigure = new THREE.Group();
        // Body (Capsule/Cylinder)
        const bodyGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.225;
        crowdFigure.add(body);

        // Head (Sphere)
        const headGeo = new THREE.SphereGeometry(0.14, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.6 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 0.52;
        crowdFigure.add(head);

        crowdFigure.position.set(xPos, yPos, zPos + (Math.random() - 0.5) * 0.1);
        this.group.add(crowdFigure);
        this.crowdFigures.push(crowdFigure);
      }
    }
  }

  private setupLighting(): void {
    // Ambient arena fill light
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.7);
    this.group.add(ambientLight);

    // Overhead central spotlight on table
    const mainSpot = new THREE.SpotLight(0xffffff, 2.2);
    mainSpot.position.set(0, 5.5, 0.5);
    mainSpot.angle = Math.PI / 3;
    mainSpot.penumbra = 0.4;
    mainSpot.decay = 1.2;
    mainSpot.distance = 15;
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 1024;
    mainSpot.shadow.mapSize.height = 1024;
    mainSpot.shadow.camera.near = 1;
    mainSpot.shadow.camera.far = 12;
    mainSpot.shadow.bias = -0.001;
    this.group.add(mainSpot);
    this.group.add(mainSpot.target);

    // Warm key light from player side
    const playerSideLight = new THREE.DirectionalLight(0xfff7ed, 0.9);
    playerSideLight.position.set(2, 4, 3);
    this.group.add(playerSideLight);

    // Cool rim light from CPU side
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.6);
    rimLight.position.set(-3, 3, -4);
    this.group.add(rimLight);
  }

  public celebrate(): void {
    this.isCelebrating = true;
    this.celebrateTimer = 2.0;
  }

  public update(dt: number): void {
    this.crowdBobTime += dt * 3;

    if (this.celebrateTimer > 0) {
      this.celebrateTimer -= dt;
      if (this.celebrateTimer <= 0) {
        this.isCelebrating = false;
      }
    }

    const jumpSpeed = this.isCelebrating ? 12 : 2.5;
    const jumpAmp = this.isCelebrating ? 0.18 : 0.02;

    for (let i = 0; i < this.crowdFigures.length; i++) {
      const fig = this.crowdFigures[i];
      const offset = i * 0.4;
      fig.position.y += Math.sin(this.crowdBobTime * (jumpSpeed / 3) + offset) * jumpAmp * dt * 4;
    }
  }
}
