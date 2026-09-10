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

    this.group.add(this.p1.trail.group);
    this.group.add(this.p1.headMesh);
    this.group.add(this.p2.trail.group);
    this.group.add(this.p2.headMesh);
  }

  public startMatch(isMultiplayer: boolean): void {
    this.isMultiplayer = isMultiplayer;
    this.score = { player: 0, cpu: 0, targetScore: 5 };
    this.roundNumber = 1;
    this.p2.isBot = !isMultiplayer;

    this.eventBus.emit('curve:score', { ...this.score });

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

    // Generate balanced random spawn positions on each half of the table
    // Table bounds: X in [-0.65, 0.65], Z in [-1.2, 1.2]
    const p1X = (Math.random() - 0.5) * 0.8;
    const p1Z = 0.5 + Math.random() * 0.5; // Player side (positive Z)
    const p1Angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8; // Facing towards net

    const p2X = (Math.random() - 0.5) * 0.8;
    const p2Z = -0.5 - Math.random() * 0.5; // CPU side (negative Z)
    const p2Angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8; // Facing towards net

    this.p1.reset(p1X, p1Z, p1Angle);
    this.p2.reset(p2X, p2Z, p2Angle);

    this.eventBus.emit('curve:round_start', { roundNumber: this.roundNumber });
  }

  public initRoundAsHost(): void {
    this.roundState = 'COUNTDOWN';
    this.countdownTimer = 2.4;

    const p1X = (Math.random() - 0.5) * 0.8;
    const p1Z = 0.5 + Math.random() * 0.5;
    const p1Angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;

    const p2X = (Math.random() - 0.5) * 0.8;
    const p2Z = -0.5 - Math.random() * 0.5;
    const p2Angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8;

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
      if (msg.victim === 'PLAYER') {
        this.p1.isAlive = false;
        this.handleCrash('PLAYER', msg.x, msg.z);
      } else {
        this.p2.isAlive = false;
        this.handleCrash('CPU', msg.x, msg.z);
      }
    } else if (msg.type === 'CURVE_SCORE_SYNC') {
      this.score.player = msg.player;
      this.score.cpu = msg.cpu;
      this.eventBus.emit('curve:score', { ...this.score });
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
      // 1. Update curves
      const p1Crashed = this.p1.update(dt, this.p2.trail);
      const p2Crashed = this.p2.update(dt, this.p1.trail);

      if (p1Crashed) {
        this.handleCrash('PLAYER', this.p1.x, this.p1.z);
      }
      if (p2Crashed) {
        this.handleCrash('CPU', this.p2.x, this.p2.z);
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
          this.eventBus.emit('curve:match_over', { winner, score: { ...this.score } });
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

  private handleCrash(victim: PlayerId, x: number, z: number): void {
    if (this.roundState !== 'PLAYING') return;

    this.sound.playPaddleHit(1.0, true);
    this.eventBus.emit('camera:shake', { intensity: 0.08, duration: 0.25 });

    this.eventBus.emit('curve:crash', { victim, x, z });

    // Surviving player gets point
    if (victim === 'PLAYER') {
      this.score.cpu++;
    } else {
      this.score.player++;
    }

    this.roundState = 'ROUND_OVER';
    this.roundOverDelay = 2.0;

    this.eventBus.emit('curve:score', { ...this.score });

    // Sync crash and score to peer if host
    if (this.isMultiplayer && this.network.isConnected) {
      const crashMsg: CurveCrashMessage = { type: 'CURVE_CRASH', victim, x, z };
      this.network.send(crashMsg);

      if (this.network.role === 'HOST') {
        this.network.send({
          type: 'CURVE_SCORE_SYNC',
          player: this.score.player,
          cpu: this.score.cpu
        });
      }
    }
  }

  public dispose(): void {
    this.p1.dispose();
    this.p2.dispose();
  }
}
