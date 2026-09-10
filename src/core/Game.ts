import * as THREE from 'three';
import { Table } from '../entities/Table';
import { Stadium } from '../entities/Stadium';
import { Ball } from '../entities/Ball';
import { Paddle } from '../entities/Paddle';
import { PlayerController } from '../controllers/PlayerController';
import { AIController } from '../controllers/AIController';
import { WebcamController } from '../controllers/WebcamController';
import { CameraController } from '../vfx/CameraController';
import { VFXManager } from '../vfx/VFXManager';
import { SoundEngine } from '../audio/SoundEngine';
import { HUD } from '../ui/HUD';
import { StateMachine } from './StateMachine';
import { EventBus } from './EventBus';
import { Difficulty, GameMode, MultiplayerRole, PlayerId } from '../types';
import { NetworkManager } from '../network/NetworkManager';
import { RemotePlayerController } from '../controllers/RemotePlayerController';
import { NetworkMessage } from '../network/NetworkProtocol';

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cameraCtrl: CameraController;

  // Entities
  private table: Table;
  private stadium: Stadium;
  private ball: Ball;
  private playerPaddle: Paddle;
  private cpuPaddle: Paddle;

  // Controllers & Systems
  private playerCtrl: PlayerController;
  private aiCtrl: AIController;
  private remotePlayerCtrl: RemotePlayerController;
  private webcamCtrl: WebcamController;
  private network: NetworkManager;
  private mode: GameMode = 'BOT';
  private vfx: VFXManager;
  private sound: SoundEngine;
  private hud: HUD;
  private stateMachine: StateMachine;
  private eventBus: EventBus;

  // Loop & Timing
  private lastTime: number = 0;
  private timeScale: number = 1.0;
  private freezeFrames: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.eventBus = EventBus.get();

    // 1. Three.js Scene & Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1128);
    this.scene.fog = new THREE.FogExp2(0x0a1128, 0.035);

    const aspect = window.innerWidth / window.innerHeight;
    this.cameraCtrl = new CameraController(aspect);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Instantiate Entities
    this.table = new Table();
    this.stadium = new Stadium();
    this.ball = new Ball();
    this.playerPaddle = new Paddle('PLAYER');
    this.cpuPaddle = new Paddle('CPU');

    this.scene.add(this.table.group);
    this.scene.add(this.stadium.group);
    this.scene.add(this.ball.group);
    this.scene.add(this.playerPaddle.group);
    this.scene.add(this.cpuPaddle.group);

    // 3. Audio & VFX
    this.sound = SoundEngine.get();
    this.vfx = new VFXManager();
    this.scene.add(this.vfx.group);

    // 4. Controllers & Logic
    this.playerCtrl = new PlayerController(this.playerPaddle, this.ball);
    this.aiCtrl = new AIController(this.cpuPaddle, this.ball, 'pro');
    this.remotePlayerCtrl = new RemotePlayerController(this.cpuPaddle);
    this.stateMachine = new StateMachine();
    this.hud = new HUD();
    this.network = NetworkManager.get();

    // Broadcast local paddle position at 60Hz over WebRTC DataChannel
    this.playerCtrl.onPaddlePositionUpdate = (x, y, z, isForehand, isSwinging) => {
      if (this.mode === 'MULTIPLAYER' && this.network.isConnected) {
        this.network.send({
          type: 'PADDLE_MOVE',
          x, y, z, isForehand, isSwinging
        });
      }
    };

    // Handle incoming WebRTC messages
    this.network.onMessageReceived = (msg) => this.handleNetworkMessage(msg);

    // 5. Webcam Controller
    this.webcamCtrl = new WebcamController({
      onMotionPosition: (normX) => {
        this.playerCtrl.setExternalMotion(normX);
      },
      onSwipeStrike: (spin, power, isSmash, angleBias) => {
        if (this.stateMachine.state === 'SERVE_WAIT' && this.isLocalPlayerTurnToServe()) {
          this.playerCtrl.executeServe();
        } else if (this.stateMachine.state === 'RALLY') {
          this.playerCtrl.triggerExternalStrike(spin, power, isSmash, angleBias);
        }
      },
      onError: (errMsg) => {
        this.hud.setWebcamStatus('ERROR: ' + errMsg, true);
        this.hud.showCallout('WEBCAM: ' + errMsg, 2000);
      },
      onStatusChange: (status) => {
        if (status === 'starting') {
          this.hud.setWebcamStatus('CONNECTING...', false);
        } else if (status === 'active') {
          this.hud.setWebcamStatus('CAMERA ACTIVE', false);
          this.hud.showCallout('📷 WEBCAM MODE ACTIVE!', 1500);
        } else if (status === 'inactive') {
          this.hud.setWebcamStatus('DISABLED', false);
        }
      }
    });

    // 6. Connect Systems
    this.setupEventHandlers();
    this.setupWindowEvents();
  }

  private setupEventHandlers(): void {
    // Audio trigger on user gesture
    window.addEventListener('pointerdown', () => this.sound.init(), { once: true });
    window.addEventListener('keydown', () => this.sound.init(), { once: true });

    // Sensitivity control
    this.hud.onSensitivityChange = (sens) => {
      this.playerCtrl.sensitivity = sens;
    };

    // Webcam mode toggle
    this.hud.onToggleWebcam = async () => {
      if (this.playerCtrl.isWebcamMode) {
        this.webcamCtrl.stop();
        this.playerCtrl.isWebcamMode = false;
        this.hud.setWebcamActive(false);
        const { video } = this.hud.getWebcamElements();
        video.srcObject = null;
        this.hud.showCallout('MOUSE CONTROLS ACTIVE', 1200);
      } else {
        this.hud.setWebcamActive(true);
        const { video, overlay } = this.hud.getWebcamElements();
        this.webcamCtrl.setOverlayCanvas(overlay);
        const started = await this.webcamCtrl.start();
        if (started) {
          video.srcObject = this.webcamCtrl.getVideoStream();
          this.playerCtrl.isWebcamMode = true;
        } else {
          this.hud.setWebcamActive(false);
          this.playerCtrl.isWebcamMode = false;
        }
      }
    };

    this.hud.onResume = () => {
      this.isPaused = false;
      this.lastTime = performance.now();
    };

    // HUD Menu Actions
    this.hud.onStartMatch = (diff: Difficulty) => {
      this.sound.init();
      this.mode = 'BOT';
      this.hud.setOpponentName(`CPU (${diff.toUpperCase()})`);
      this.aiCtrl.setDifficulty(diff);
      this.stateMachine.resetMatch();
      this.startMatchSequence();
    };

    this.hud.onStartMultiplayerMatch = (_role: MultiplayerRole, remoteUsername: string) => {
      this.sound.init();
      this.mode = 'MULTIPLAYER';
      this.hud.setOpponentName(remoteUsername);
      this.remotePlayerCtrl.resetPosition();
      this.stateMachine.resetMatch();
      this.startMatchSequence();
    };

    this.hud.onRematch = () => {
      this.isPaused = false;
      this.hud.showPauseMenu(false);
      if (this.mode === 'MULTIPLAYER' && this.network.isConnected) {
        this.network.send({ type: 'REMATCH_REQUEST', status: 'requested' });
        this.eventBus.emit('multiplayer:rematch', { from: 'local', status: 'requested' });
      } else {
        this.stateMachine.resetMatch();
        this.startMatchSequence();
      }
    };

    this.hud.onReturnToMenu = () => {
      this.isPaused = false;
      this.hud.showPauseMenu(false);
      this.ball.physics.stop();
      if (this.mode === 'MULTIPLAYER') {
        this.network.disconnect();
      }
      this.mode = 'BOT';
      this.stateMachine.setState('MENU');
    };

    // State Changes
    this.eventBus.on('state:changed', ({ to }) => {
      if (to === 'SERVE_WAIT') {
        const canServe = this.isLocalPlayerTurnToServe();
        this.hud.showServePrompt(canServe);
        if (!canServe && this.mode === 'BOT') {
          setTimeout(() => {
            if (this.stateMachine.state === 'SERVE_WAIT') {
              this.aiCtrl.executeServe();
            }
          }, 900);
        }
      } else {
        this.hud.showServePrompt(false);
      }
    });

    // Space / Click for player serve
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.stateMachine.state === 'SERVE_WAIT' && this.isLocalPlayerTurnToServe()) {
        this.playerCtrl.executeServe();
      }
      if (e.code === 'Escape') {
        if (this.stateMachine.state !== 'MENU' && this.stateMachine.state !== 'GAME_OVER') {
          this.isPaused = !this.isPaused;
          this.hud.showPauseMenu(this.isPaused);
          if (!this.isPaused) {
            this.lastTime = performance.now();
          }
        }
      }
    });

    this.canvas.addEventListener('pointerdown', () => {
      if (this.stateMachine.state === 'SERVE_WAIT' && this.isLocalPlayerTurnToServe()) {
        this.playerCtrl.executeServe();
      }
    });

    // Ball Hit Sound & VFX
    this.eventBus.on('ball:hit', (shot) => {
      this.sound.playPaddleHit(shot.speed / 12, shot.isSmash);
      this.sound.playSwoosh(shot.speed / 14);
      this.vfx.createHitSparks(shot.contactPoint, shot.isSmash);

      if (shot.isSmash) {
        this.freezeFrames = 2; // 30ms impact micro-pause
        this.cameraCtrl.triggerFovPunch(48);
        this.cameraCtrl.triggerShake(0.09, 0.35);
      }

      // Broadcast shot to remote player over WebRTC
      if (this.mode === 'MULTIPLAYER' && shot.hitter === 'PLAYER' && this.network.isConnected) {
        this.network.send({
          type: 'BALL_HIT',
          hitter: 'PLAYER',
          contactPoint: [shot.contactPoint.x, shot.contactPoint.y, shot.contactPoint.z],
          velocity: [this.ball.physics.velocity.x, this.ball.physics.velocity.y, this.ball.physics.velocity.z],
          spin: [this.ball.physics.spin.x, this.ball.physics.spin.y, this.ball.physics.spin.z],
          rating: shot.rating,
          speed: shot.speed,
          isSmash: shot.isSmash,
          spinType: shot.spin
        });
      }
    });

    // Ball Bounce Sound & VFX
    this.eventBus.on('ball:bounce', ({ position, surface, speed }) => {
      if (surface === 'net') {
        this.sound.playNetClip();
      } else if (surface === 'player_table' || surface === 'cpu_table') {
        this.sound.playTableBounce(speed);
        this.vfx.createBounceRing(position);
      }
    });

    // Camera Shake
    this.eventBus.on('camera:shake', ({ intensity, duration }) => {
      this.cameraCtrl.triggerShake(intensity, duration);
    });

    // Point Scored
    this.eventBus.on('point:scored', ({ winner, reason }) => {
      this.ball.physics.stop();
      this.stadium.celebrate();
      this.sound.playCheer();

      // Host broadcasts the point and score to client
      if (this.mode === 'MULTIPLAYER' && this.network.role === 'HOST' && this.network.isConnected) {
        this.network.send({
          type: 'POINT_SCORED',
          winner,
          reason
        });
        this.network.send({
          type: 'SCORE_SYNC',
          score: this.stateMachine.score
        });
      }

      if (winner === 'PLAYER') {
        if (reason === 'ACE!') {
          this.hud.showShotFeedback({
            hitter: 'PLAYER',
            rating: 'ACE',
            speed: 0,
            spin: 'NONE',
            isSmash: false,
            contactPoint: this.ball.physics.position.clone()
          });
          this.hud.showCallout(`⚡ SERVICE ACE!`, 1300);
        } else {
          this.hud.showCallout(`POINT TO YOU! (${reason})`, 1000);
        }
      } else {
        const oppName = this.mode === 'MULTIPLAYER' ? this.network.remoteUsername.toUpperCase() : 'CPU';
        this.hud.showCallout(`${oppName} SCORED (${reason})`, 1000);
      }
    });

    // Match Over
    this.eventBus.on('match:over', ({ winner }) => {
      this.sound.playWhistle();
      if (winner === 'PLAYER') {
        this.sound.playVictoryJingle();
      }
      this.stadium.celebrate();
    });
  }

  private isLocalPlayerTurnToServe(): boolean {
    if (this.mode === 'BOT') {
      return this.stateMachine.score.server === 'PLAYER';
    }
    // In Multiplayer: Host is PLAYER, Client is CPU from local perspective
    if (this.network.role === 'HOST') {
      return this.stateMachine.score.server === 'PLAYER';
    } else {
      return this.stateMachine.score.server === 'CPU';
    }
  }

  private handleNetworkMessage(msg: NetworkMessage): void {
    if (msg.type === 'PADDLE_MOVE') {
      this.remotePlayerCtrl.onRemotePaddleMove(msg);
      return;
    }

    if (msg.type === 'BALL_HIT') {
      // Invert coordinates for ball struck from opposite side of court
      const invX = -msg.contactPoint[0];
      const invY = msg.contactPoint[1];
      const invZ = -msg.contactPoint[2];

      const invVx = -msg.velocity[0];
      const invVy = msg.velocity[1];
      const invVz = -msg.velocity[2];

      const invSx = -msg.spin[0];
      const invSy = -msg.spin[1];
      const invSz = -msg.spin[2];

      this.ball.physics.position.set(invX, invY, invZ);
      this.ball.physics.velocity.set(invVx, invVy, invVz);
      this.ball.physics.spin.set(invSx, invSy, invSz);
      this.ball.physics.isActive = true;

      this.sound.playPaddleHit(msg.speed / 12, msg.isSmash);
      this.sound.playSwoosh(msg.speed / 14);
      this.vfx.createHitSparks(this.ball.physics.position, msg.isSmash);

      this.eventBus.emit('ball:hit', {
        hitter: 'CPU',
        rating: msg.rating,
        speed: msg.speed,
        spin: msg.spinType,
        isSmash: msg.isSmash,
        contactPoint: this.ball.physics.position.clone()
      });
      return;
    }

    if (msg.type === 'POINT_SCORED') {
      if (this.network.role === 'CLIENT') {
        const localWinner: PlayerId = msg.winner === 'PLAYER' ? 'CPU' : 'PLAYER';
        this.stateMachine.applyRemotePoint(localWinner, msg.reason, this.stateMachine.score);
      }
      return;
    }

    if (msg.type === 'SCORE_SYNC') {
      if (this.network.role === 'CLIENT') {
        const invertedScore = {
          ...msg.score,
          player: msg.score.cpu,
          cpu: msg.score.player,
          server: (msg.score.server === 'PLAYER' ? 'CPU' : 'PLAYER') as PlayerId
        };
        this.stateMachine.syncScore(invertedScore);
      }
      return;
    }
  }

  private setupWindowEvents(): void {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.cameraCtrl.setAspect(width / height);
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  }

  private startMatchSequence(): void {
    this.sound.playWhistle();
    this.stateMachine.prepareService();
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animate(this.lastTime);
  }

  private animate(currentTime: number): void {
    requestAnimationFrame((t) => this.animate(t));

    const rawDelta = Math.min((currentTime - this.lastTime) / 1000, 0.05);
    this.lastTime = currentTime;

    if (this.isPaused) {
      this.renderer.render(this.scene, this.cameraCtrl.camera);
      return;
    }

    // Freeze frame pause on powerful smashes
    if (this.freezeFrames > 0) {
      this.freezeFrames--;
      this.renderer.render(this.scene, this.cameraCtrl.camera);
      return;
    }

    // Match point dramatic slow motion (0.85x)
    const isMatchPoint = this.stateMachine.score.player >= 10 || this.stateMachine.score.cpu >= 10;
    const targetScale = (isMatchPoint && this.stateMachine.state === 'RALLY') ? 0.85 : 1.0;
    this.timeScale = THREE.MathUtils.lerp(this.timeScale, targetScale, rawDelta * 5);
    const dt = rawDelta * this.timeScale;

    // Update Game Elements
    if (this.stateMachine.state !== 'MENU') {
      this.playerCtrl.update(dt);
      if (this.mode === 'BOT') {
        this.aiCtrl.update(dt);
      } else {
        this.remotePlayerCtrl.update(dt);
      }
      this.ball.update(dt);
      this.stadium.update(dt);
      this.vfx.update(dt);
      this.vfx.updateTrail(
        this.ball.physics.position,
        'TOPSPIN',
        false,
        this.ball.physics.isActive && this.stateMachine.state === 'RALLY'
      );
    }

    // Camera follow
    this.cameraCtrl.update(
      rawDelta,
      this.ball.physics.position,
      this.playerPaddle.position
    );

    // Render Scene
    this.renderer.render(this.scene, this.cameraCtrl.camera);
  }
}
