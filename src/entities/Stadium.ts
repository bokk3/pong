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

    // 3. Bleachers & Stylized Arcade Crowd (Full Stadium surrounding table)
    this.buildBleachersAndCrowd();

    // 4. Stadium Lighting (Soft Ambient + Spotlights)
    this.setupLighting();
  }

  private buildBleachersAndCrowd(): void {
    const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
    const crowdColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899, 0x06b6d4, 0x84cc16];
    const skinTones = [0xfde047, 0xfcd34d, 0xfbbf24, 0xf87171, 0xd97706, 0x92400e];

    const createSpectator = (x: number, y: number, z: number, rotY: number, colorIdx: number): THREE.Group => {
      const crowdFigure = new THREE.Group();
      const shirtColor = crowdColors[colorIdx % crowdColors.length];
      const skinColor = skinTones[(colorIdx * 3) % skinTones.length];

      // Body (Torso)
      const bodyGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.45, 8);
      const bodyMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.5 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.225;
      crowdFigure.add(body);

      // Head (Rotates to track ball)
      const headGeo = new THREE.SphereGeometry(0.13, 8, 8);
      const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 0.52;
      head.name = 'head';
      crowdFigure.add(head);

      // Left Arm / Right Arm (Pumps up during celebration)
      const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6);
      const armMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 });
      
      const leftArm = new THREE.Mesh(armGeo, armMat);
      leftArm.position.set(-0.21, 0.28, 0);
      leftArm.rotation.z = Math.PI / 10;
      leftArm.name = 'leftArm';
      crowdFigure.add(leftArm);

      const rightArm = new THREE.Mesh(armGeo, armMat);
      rightArm.position.set(0.21, 0.28, 0);
      rightArm.rotation.z = -Math.PI / 10;
      rightArm.name = 'rightArm';
      crowdFigure.add(rightArm);

      crowdFigure.position.set(x, y, z);
      crowdFigure.rotation.y = rotY;
      crowdFigure.userData = {
        baseY: y,
        phase: Math.random() * Math.PI * 2,
        cheerDelay: Math.random() * 0.4,
        colorIdx
      };

      return crowdFigure;
    };

    // 1. Back Bleachers (Behind CPU table, looking south at +Z)
    const backTiers = 4;
    for (let t = 0; t < backTiers; t++) {
      const stepDepth = 0.95;
      const stepHeight = 0.48;
      const zPos = -5.6 - t * stepDepth;
      const yPos = (t + 1) * stepHeight;

      const stepGeo = new THREE.BoxGeometry(16, stepHeight, stepDepth);
      const stepMesh = new THREE.Mesh(stepGeo, bleacherMat);
      stepMesh.position.set(0, yPos - stepHeight / 2, zPos);
      stepMesh.receiveShadow = true;
      this.group.add(stepMesh);

      const count = 16;
      for (let i = 0; i < count; i++) {
        const xPos = -7.0 + (i * 14.0) / (count - 1) + (Math.random() - 0.5) * 0.25;
        const fig = createSpectator(xPos, yPos, zPos + (Math.random() - 0.5) * 0.1, 0, t * count + i);
        this.group.add(fig);
        this.crowdFigures.push(fig);
      }
    }

    // 2. Left Bleachers (Along -X side of table, looking east toward center)
    const sideTiers = 3;
    for (let t = 0; t < sideTiers; t++) {
      const stepWidth = 0.95;
      const stepHeight = 0.48;
      const xPos = -4.8 - t * stepWidth;
      const yPos = (t + 1) * stepHeight;

      const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, 10);
      const stepMesh = new THREE.Mesh(stepGeo, bleacherMat);
      stepMesh.position.set(xPos + stepWidth / 2, yPos - stepHeight / 2, -0.5);
      stepMesh.receiveShadow = true;
      this.group.add(stepMesh);

      const count = 10;
      for (let i = 0; i < count; i++) {
        const zPos = -4.8 + (i * 8.6) / (count - 1) + (Math.random() - 0.5) * 0.2;
        const fig = createSpectator(xPos + 0.3, yPos, zPos, Math.PI / 2, t * count + i + 100);
        this.group.add(fig);
        this.crowdFigures.push(fig);
      }
    }

    // 3. Right Bleachers (Along +X side of table, looking west toward center)
    for (let t = 0; t < sideTiers; t++) {
      const stepWidth = 0.95;
      const stepHeight = 0.48;
      const xPos = 4.8 + t * stepWidth;
      const yPos = (t + 1) * stepHeight;

      const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, 10);
      const stepMesh = new THREE.Mesh(stepGeo, bleacherMat);
      stepMesh.position.set(xPos - stepWidth / 2, yPos - stepHeight / 2, -0.5);
      stepMesh.receiveShadow = true;
      this.group.add(stepMesh);

      const count = 10;
      for (let i = 0; i < count; i++) {
        const zPos = -4.8 + (i * 8.6) / (count - 1) + (Math.random() - 0.5) * 0.2;
        const fig = createSpectator(xPos - 0.3, yPos, zPos, -Math.PI / 2, t * count + i + 200);
        this.group.add(fig);
        this.crowdFigures.push(fig);
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
    this.celebrateTimer = 2.4;
  }

  public update(dt: number, ballPos?: THREE.Vector3): void {
    this.crowdBobTime += dt;

    if (this.celebrateTimer > 0) {
      this.celebrateTimer -= dt;
      if (this.celebrateTimer <= 0) {
        this.isCelebrating = false;
      }
    }

    const t = this.crowdBobTime;

    for (let i = 0; i < this.crowdFigures.length; i++) {
      const fig = this.crowdFigures[i];
      const uData = fig.userData as { baseY: number; phase: number; cheerDelay: number; colorIdx: number };
      const baseY = uData.baseY;

      // 1. Bobbing / Cheering / Mexican Wave Jumping
      if (this.isCelebrating) {
        // High excitement jumps with staggered waves
        const jumpPhase = (t * 10) - (fig.position.x * 0.4) - (fig.position.z * 0.3);
        const jumpH = Math.max(0, Math.sin(jumpPhase)) * 0.28;
        fig.position.y = baseY + jumpH;

        // Pump arms up in the air!
        const leftArm = fig.getObjectByName('leftArm') as THREE.Mesh | null;
        const rightArm = fig.getObjectByName('rightArm') as THREE.Mesh | null;
        if (leftArm && rightArm) {
          leftArm.rotation.z = Math.PI - 0.3 + Math.sin(t * 14 + uData.phase) * 0.2;
          rightArm.rotation.z = -Math.PI + 0.3 - Math.sin(t * 14 + uData.phase) * 0.2;
        }
      } else {
        // Natural ambient sway and occasional gentle bounces
        const idleWave = Math.sin(t * 2.5 + uData.phase) * 0.035;
        fig.position.y = baseY + Math.max(0, idleWave);

        // Relaxed arms
        const leftArm = fig.getObjectByName('leftArm') as THREE.Mesh | null;
        const rightArm = fig.getObjectByName('rightArm') as THREE.Mesh | null;
        if (leftArm && rightArm) {
          leftArm.rotation.z = (Math.PI / 10) + Math.sin(t * 2 + uData.phase) * 0.05;
          rightArm.rotation.z = (-Math.PI / 10) - Math.sin(t * 2 + uData.phase) * 0.05;
        }
      }

      // 2. Head turning: spectators track the ball across the table!
      const head = fig.getObjectByName('head') as THREE.Mesh | null;
      if (head && ballPos) {
        // Angle toward ball in world space relative to spectator rotation
        const dx = ballPos.x - fig.position.x;
        const dz = ballPos.z - fig.position.z;
        const targetWorldYaw = Math.atan2(dx, dz);
        const relYaw = targetWorldYaw - fig.rotation.y;
        
        // Clamp realistic human neck rotation (-55 deg to +55 deg)
        const clampedYaw = Math.max(-0.95, Math.min(0.95, relYaw));
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, clampedYaw, dt * 6);
      }
    }
  }
}

