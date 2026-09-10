import * as THREE from 'three';
import { TABLE_BOUNDS } from '../physics/Constants';

export class Table {
  public group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.buildTable();
  }

  private buildTable(): void {
    const { length, width, height, netHeight, netWidth } = TABLE_BOUNDS;
    const tableThickness = 0.05;

    // --- 1. Table Top Surface ---
    const topGeo = new THREE.BoxGeometry(width, tableThickness, length);
    // Ping pong table blue
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x005bb5,
      roughness: 0.35,
      metalness: 0.1
    });
    const tableTop = new THREE.Mesh(topGeo, topMat);
    tableTop.position.set(0, height - tableThickness / 2, 0);
    tableTop.receiveShadow = true;
    tableTop.castShadow = true;
    this.group.add(tableTop);

    // --- 2. Table Boundary Lines & Center Line ---
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Outer edge lines (2cm white border)
    const lineWidth = 0.02;
    const lineY = height + 0.001; // Slightly above surface to prevent z-fighting

    // Side long lines (2 lines along length)
    const longLineGeo = new THREE.PlaneGeometry(lineWidth, length);
    const leftLine = new THREE.Mesh(longLineGeo, lineMat);
    leftLine.rotation.x = -Math.PI / 2;
    leftLine.position.set(-width / 2 + lineWidth / 2, lineY, 0);
    this.group.add(leftLine);

    const rightLine = new THREE.Mesh(longLineGeo, lineMat);
    rightLine.rotation.x = -Math.PI / 2;
    rightLine.position.set(width / 2 - lineWidth / 2, lineY, 0);
    this.group.add(rightLine);

    // End lines (2 lines along width at baseline)
    const endLineGeo = new THREE.PlaneGeometry(width, lineWidth);
    const playerEndLine = new THREE.Mesh(endLineGeo, lineMat);
    playerEndLine.rotation.x = -Math.PI / 2;
    playerEndLine.position.set(0, lineY, length / 2 - lineWidth / 2);
    this.group.add(playerEndLine);

    const cpuEndLine = new THREE.Mesh(endLineGeo, lineMat);
    cpuEndLine.rotation.x = -Math.PI / 2;
    cpuEndLine.position.set(0, lineY, -length / 2 + lineWidth / 2);
    this.group.add(cpuEndLine);

    // Center serve dividing line (3mm wide along length)
    const centerLineGeo = new THREE.PlaneGeometry(0.004, length);
    const centerLine = new THREE.Mesh(centerLineGeo, lineMat);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.set(0, lineY, 0);
    this.group.add(centerLine);

    // --- 3. Net Assembly ---
    // Procedural grid texture for net mesh
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.0)';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(230, 240, 255, 0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 64; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(64, i);
      ctx.stroke();
    }
    const netTexture = new THREE.CanvasTexture(canvas);
    netTexture.wrapS = THREE.RepeatWrapping;
    netTexture.wrapT = THREE.RepeatWrapping;
    netTexture.repeat.set(24, 2);

    const netGeo = new THREE.PlaneGeometry(netWidth, netHeight);
    const netMat = new THREE.MeshStandardMaterial({
      map: netTexture,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      roughness: 0.8
    });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, height + netHeight / 2, 0);
    netMesh.castShadow = true;
    this.group.add(netMesh);

    // White net top tape
    const netTapeGeo = new THREE.BoxGeometry(netWidth, 0.015, 0.012);
    const netTapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const netTape = new THREE.Mesh(netTapeGeo, netTapeMat);
    netTape.position.set(0, height + netHeight - 0.0075, 0);
    this.group.add(netTape);

    // Net side support posts
    const postGeo = new THREE.CylinderGeometry(0.012, 0.012, netHeight + 0.02, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 });
    
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-netWidth / 2, height + netHeight / 2, 0);
    this.group.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(netWidth / 2, height + netHeight / 2, 0);
    this.group.add(rightPost);

    // --- 4. Table Frame & Legs ---
    const legGeo = new THREE.BoxGeometry(0.04, height - tableThickness, 0.04);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.6, roughness: 0.4 });

    const legOffsets = [
      [-width / 2 + 0.08, -length / 2 + 0.15],
      [width / 2 - 0.08, -length / 2 + 0.15],
      [-width / 2 + 0.08, length / 2 - 0.15],
      [width / 2 - 0.08, length / 2 - 0.15]
    ];

    legOffsets.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, (height - tableThickness) / 2, lz);
      leg.castShadow = true;
      this.group.add(leg);
    });

    // Crossbar support
    const crossbarGeo = new THREE.BoxGeometry(width - 0.16, 0.03, 0.03);
    const crossbar1 = new THREE.Mesh(crossbarGeo, legMat);
    crossbar1.position.set(0, 0.25, -length / 2 + 0.15);
    this.group.add(crossbar1);

    const crossbar2 = new THREE.Mesh(crossbarGeo, legMat);
    crossbar2.position.set(0, 0.25, length / 2 - 0.15);
    this.group.add(crossbar2);
  }
}
