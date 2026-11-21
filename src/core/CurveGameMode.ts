import * as THREE from 'three';
import { CurveController } from '../controllers/CurveController';
import { PlayerId, CurveScore } from '../types';
import { EventBus } from './EventBus';
import { NetworkManager } from '../network/NetworkManager';
import { CurveCrashMessage, CurveInputMessage, CurveRoundStartMessage, NetworkMessage } from '../network/NetworkProtocol';
import { SoundEngine } from '../audio/SoundEngine';

export type CurveRoundState = 'COUNTDOWN' | 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';

export class CurveGameMode {
  public group: THREE.Group;
  public p1: CurveController; // Cyan
  public p2: CurveController; // Magenta / Orange

  private eventBus: EventBus;
  private network: NetworkManager;
  private sound: SoundEngine;

  public isMultiplayer: boolean = false;
  public roundState: CurveRoundState = 'COUNTDOWN';
  public roundNumber: number = 1;
  public countdownTimer: number = 3.0;
  public score: CurveScore = { player: 0, cpu: 0, targetScore: 5 };

  private netSyncTimer: number = 0;
  private roundOverDelay: number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.eventBus = EventBus.get();
    this.network = NetworkManager.get();
    this.sound = SoundEngine.get();

    // P1: Cyan (0x00f3ff), P2: Vibrant Orange/Red (0xff3b30)
    this.p1 = new CurveController('PLAYER', 0x00f3ff, false);
    this.p2 = new CurveController('CPU', 0xff3b30, true);

    this.buildSquareArena();

    this.group.add(this.p1.trail.group);
    this.group.add(this.p1.headMesh);
    this.group.add(this.p2.trail.group);
    this.group.add(this.p2.headMesh);
  }

  private buildSquareArena(): void {
    const size = 4.8; // Expanded square canvas
    const half = size / 2;

    // 1. Dark, crisp matte arena floor (elevated cleanly above any court elements)
    const floorGeo = new THREE.PlaneGeometry(size, size);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x070c18, // Deep dark retro navy
      side: THREE.FrontSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.04, 0);
    this.group.add(floor);

    // 2. Subtle grid lines on the square arena
    const gridHelper = new THREE.GridHelper(size, 20, 0x1e293b, 0x0f172a);
    gridHelper.position.y = 0.042;
    this.group.add(gridHelper);

    // 3. Glowing outer boundary walls (arena border)
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const wallThick = 0.025;
    const wallHeight = 0.06;
    const wallY = 0.04 + wallHeight / 2;

    // Top wall (+Z)
    const wallTop = new THREE.Mesh(new THREE.BoxGeometry(size + wallThick * 2, wallHeight, wallThick), borderMat);
    wallTop.position.set(0, wallY, half + wallThick / 2);
    this.group.add(wallTop);

    // Bottom wall (-Z)
    const wallBottom = new THREE.Mesh(new THREE.BoxGeometry(size + wallThick * 2, wallHeight, wallThick), borderMat);
    wallBottom.position.set(0, wallY, -half - wallThick / 2);
    this.group.add(wallBottom);

    // Left wall (-X)
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, size), borderMat);
    wallLeft.position.set(-half - wallThick / 2, wallY, 0);
    this.group.add(wallLeft);

    // Right wall (+X)
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, size), borderMat);
    wallRight.position.set(half + wallThick / 2, wallY, 0);
    this.group.add(wallRight);
  }

  /**
   * Internally p1 is always the HOST (or the local player vs the bot) and p2 the CLIENT (or the bot);
   * `score.player` / `score.cpu` belong to p1 / p2. Events are converted to the local point of view
   * so the HUD always shows "you" on the left.
   */
  private get localIsP1(): boolean {
    return !this.isMultiplayer || this.network.role === 'HOST';
  }

  private toLocal(id: PlayerId): PlayerId {
    if (this.localIsP1) return id;
    return id === 'PLAYER' ? 'CPU' : 'PLAYER';
  }

  private localScore(): CurveScore {
    if (this.localIsP1) return { ...this.score };
    return { player: this.score.cpu, cpu: this.score.player, targetScore: this.score.targetScore };
  }

  public startMatch(isMultiplayer: boolean, difficulty: 'novice' | 'pro' | 'master' = 'pro', targetScore: number = 5): void {
    this.isMultiplayer = isMultiplayer;
    this.score = { player: 0, cpu: 0, targetScore: Math.max(1, targetScore) };
    this.roundNumber = 1;
    this.roundState = 'COUNTDOWN';
    this.p2.isBot = !isMultiplayer;
    this.p2.difficulty = difficulty;
    this.p1.isRemote = isMultiplayer && this.network.role === 'CLIENT';
    this.p2.isRemote = isMultiplayer && this.network.role === 'HOST';

    this.eventBus.emit('curve:score', this.localScore());

    if (this.isMultiplayer) {
      if (this.network.role === 'HOST') {
        this.initRoundAsHost();
      }
    } else {
      this.initLocalRound();
    }
  }

  public initLocalRound(): void {
    this.roundState = 'COUNTDOWN';
    this.countdownTimer = 2.4;

    // Round spawn:
    // Random positions comfortably inside the 4.8m square (between -1.6 and 1.6), pointing in random directions
    const span = 3.0; // 3m span inside 4.8m square
    const p1X = (Math.random() - 0.5) * span;
    const p1Z = (Math.random() - 0.5) * span;
    const p1Angle = Math.random() * Math.PI * 2;

    let p2X = (Math.random() - 0.5) * span;
    let p2Z = (Math.random() - 0.5) * span;
    // Ensure players don't spawn right on top of each other
    while (Math.hypot(p2X - p1X, p2Z - p1Z) < 1.1) {
      p2X = (Math.random() - 0.5) * span;
      p2Z = (Math.random() - 0.5) * span;
    }
    const p2Angle = Math.random() * Math.PI * 2;

    this.p1.reset(p1X, p1Z, p1Angle);
    this.p2.reset(p2X, p2Z, p2Angle);

    this.eventBus.emit('curve:round_start', { roundNumber: this.roundNumber });
  }

  public initRoundAsHost(): void {
    this.roundState = 'COUNTDOWN';
    this.countdownTimer = 2.4;

    const span = 3.0;
    const p1X = (Math.random() - 0.5) * span;
    const p1Z = (Math.random() - 0.5) * span;
    const p1Angle = Math.random() * Math.PI * 2;

    let p2X = (Math.random() - 0.5) * span;
    let p2Z = (Math.random() - 0.5) * span;
    while (Math.hypot(p2X - p1X, p2Z - p1Z) < 1.1) {
      p2X = (Math.random() - 0.5) * span;
      p2Z = (Math.random() - 0.5) * span;
    }
    const p2Angle = Math.random() * Math.PI * 2;

    this.p1.reset(p1X, p1Z, p1Angle);
    this.p2.reset(p2X, p2Z, p2Angle);

    const startMsg: CurveRoundStartMessage = {
      type: 'CURVE_ROUND_START',
      roundNumber: this.roundNumber,
      p1Spawn: { x: p1X, z: p1Z, angle: p1Angle },
      p2Spawn: { x: p2X, z: p2Z, angle: p2Angle },
      countdownMs: 2400
    };
    this.network.send(startMsg);

    this.eventBus.emit('curve:round_start', { roundNumber: this.roundNumber });
  }



  public handleNetworkMessage(msg: NetworkMessage): void {
    if (msg.type === 'CURVE_ROUND_START') {
      this.roundNumber = msg.roundNumber;
      this.roundState = 'COUNTDOWN';
      this.countdownTimer = msg.countdownMs / 1000;

      // Note: for CLIENT, local player controls p2 or remote mirrors p1
      // When CLIENT receives host's p1Spawn & p2Spawn:
      // P1 is remote (HOST), P2 is local (CLIENT)
      this.p1.reset(msg.p1Spawn.x, msg.p1Spawn.z, msg.p1Spawn.angle);
      this.p2.reset(msg.p2Spawn.x, msg.p2Spawn.z, msg.p2Spawn.angle);

      this.eventBus.emit('curve:round_start', { roundNumber: this.roundNumber });
    } else if (msg.type === 'CURVE_INPUT') {
      // Remote player updated position & heading
      const target = this.network.role === 'HOST' ? this.p2 : this.p1;
      target.x = msg.x;
      target.z = msg.z;
      target.angle = msg.angle;
      target.steering = msg.steering;
      target.isDrawing = msg.isDrawing;
    } else if (msg.type === 'CURVE_CRASH') {
      // victim uses global naming: PLAYER = p1 (host), CPU = p2 (client)
      const curve = msg.victim === 'PLAYER' ? this.p1 : this.p2;
      curve.isAlive = false;
      if (this.network.role === 'HOST') {
        // Client reported its own crash; the host scores it and echoes the result back
        this.handleCrash(msg.victim, msg.x, msg.z);
      } else {
        this.applyCrash(msg.victim, msg.x, msg.z);
      }
    } else if (msg.type === 'CURVE_SCORE_SYNC') {
      this.score.player = msg.player;
      this.score.cpu = msg.cpu;
      this.eventBus.emit('curve:score', this.localScore());
    }
  }

  public handleLocalSteering(dir: -1 | 0 | 1): void {
    if (this.isMultiplayer && this.network.role === 'CLIENT') {
      this.p2.setSteering(dir);
    } else {
      this.p1.setSteering(dir);
    }
  }

  public update(dt: number): void {
    if (this.roundState === 'COUNTDOWN') {
      this.countdownTimer -= dt;
      if (this.countdownTimer <= 0) {
        this.roundState = 'PLAYING';
      }
      return;
    }

    if (this.roundState === 'PLAYING') {
      // 1. Update curves with mutual awareness of opponent position and heading
      const p2State = { x: this.p2.x, z: this.p2.z, angle: this.p2.angle, isAlive: this.p2.isAlive };
      const p1State = { x: this.p1.x, z: this.p1.z, angle: this.p1.angle, isAlive: this.p1.isAlive };

      const p1Crashed = this.p1.update(dt, this.p2.trail, p2State);
      const p2Crashed = this.p2.update(dt, this.p1.trail, p1State);

      if (this.isMultiplayer && this.network.role === 'CLIENT') {
        // The client only reports its own crash; the host decides the round
        if (p2Crashed) {
          this.network.send({ type: 'CURVE_CRASH', victim: 'CPU', x: this.p2.x, z: this.p2.z });
        }
      } else {
        if (p1Crashed) {
          this.handleCrash('PLAYER', this.p1.x, this.p1.z);
        }
        if (p2Crashed) {
          this.handleCrash('CPU', this.p2.x, this.p2.z);
        }
      }


      // 2. Broadcast local player position over network
      if (this.isMultiplayer && this.network.isConnected) {
        this.netSyncTimer += dt;
        if (this.netSyncTimer >= 1 / 30) { // 30Hz network sync
          this.netSyncTimer = 0;
          const localCurve = this.network.role === 'HOST' ? this.p1 : this.p2;
          const inputMsg: CurveInputMessage = {
            type: 'CURVE_INPUT',
            x: localCurve.x,
            z: localCurve.z,
            angle: localCurve.angle,
            steering: localCurve.steering,
            isDrawing: localCurve.isDrawing
          };
          this.network.send(inputMsg);
        }
      }
    } else if (this.roundState === 'ROUND_OVER') {
      this.roundOverDelay -= dt;
      if (this.roundOverDelay <= 0) {
        // Next round or match over
        if (this.score.player >= this.score.targetScore || this.score.cpu >= this.score.targetScore) {
          this.roundState = 'MATCH_OVER';
          const winner: PlayerId = this.score.player >= this.score.targetScore ? 'PLAYER' : 'CPU';
          this.eventBus.emit('curve:match_over', { winner: this.toLocal(winner), score: this.localScore() });
        } else {
          this.roundNumber++;
          if (this.isMultiplayer) {
            if (this.network.role === 'HOST') {
              this.initRoundAsHost();
            }
          } else {
            this.initLocalRound();
          }
        }
      }
    }
  }

  /** Authoritative crash handling (single player, or the host in multiplayer). `victim` uses global naming. */
  private handleCrash(victim: PlayerId, x: number, z: number): void {
    if (this.roundState !== 'PLAYING') return;

    // Surviving player gets the point
    if (victim === 'PLAYER') {
      this.score.cpu++;
    } else {
      this.score.player++;
    }

    // Send the score first so the client already has it when the crash message ends its round
    if (this.isMultiplayer && this.network.isConnected) {
      this.network.send({
        type: 'CURVE_SCORE_SYNC',
        player: this.score.player,
        cpu: this.score.cpu
      });
      const crashMsg: CurveCrashMessage = { type: 'CURVE_CRASH', victim, x, z };
      this.network.send(crashMsg);
    }

    this.applyCrash(victim, x, z);
    this.eventBus.emit('curve:score', this.localScore());
  }

  /** Presentation and round-state side of a crash (runs on every peer). */
  private applyCrash(victim: PlayerId, x: number, z: number): void {
    if (this.roundState !== 'PLAYING') return;

    this.sound.playPaddleHit(1.0, true);
    this.eventBus.emit('camera:shake', { intensity: 0.08, duration: 0.25 });
    this.eventBus.emit('curve:crash', { victim: this.toLocal(victim), x, z });

    this.roundState = 'ROUND_OVER';
    this.roundOverDelay = 2.0;
  }

  public dispose(): void {
    this.p1.dispose();
    this.p2.dispose();
  }
}
