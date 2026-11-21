import * as THREE from 'three';
import { Table } from '../entities/Table';
import { Stadium } from '../entities/Stadium';
import { Ball } from '../entities/Ball';
import { Paddle } from '../entities/Paddle';
import { PlayerController } from '../controllers/PlayerController';
import { AIController } from '../controllers/AIController';
import { WebcamController } from '../controllers/WebcamController';
import { TiltController } from '../controllers/TiltController';
import { CameraController } from '../vfx/CameraController';
import { VFXManager } from '../vfx/VFXManager';
import { SoundEngine } from '../audio/SoundEngine';
import { HUD } from '../ui/HUD';
import { StateMachine } from './StateMachine';
import { EventBus } from './EventBus';
import { Difficulty, GameMode, GameModeType, MultiplayerRole, PlayerId } from '../types';
import { NetworkManager } from '../network/NetworkManager';
import { RemotePlayerController } from '../controllers/RemotePlayerController';
import { NetworkMessage } from '../network/NetworkProtocol';
import { CurveGameMode } from './CurveGameMode';

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

  // Curve Mode
  private curveMode: CurveGameMode;
  public gameModeType: GameModeType = 'PONG';

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
  private ballSyncTimer: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private botDifficulty: Difficulty = 'pro';
  private tilt: TiltController = new TiltController();
  private tiltCurveDir: -1 | 0 | 1 = 0;

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

    // Instantiate Curve Mode
    this.curveMode = new CurveGameMode();
    this.curveMode.group.visible = false;
    this.scene.add(this.curveMode.group);

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

    // Sensitivity control (1.2x is the default; tilt treats that as 1.0)
    this.hud.onSensitivityChange = (sens) => {
      this.playerCtrl.sensitivity = sens;
      this.tilt.sensitivity = sens / 1.2;
    };

    // Tilt (gyro) controls for phones & tablets
    this.hud.onToggleTilt = () => {
      void this.setTiltEnabled(!this.tilt.isEnabled);
    };
    // Flick the phone to swing (Pong)
    this.tilt.onFlick = () => {
      if (this.gameModeType !== 'PONG' || this.isPaused) return;
      if (this.stateMachine.state === 'SERVE_WAIT' && this.isLocalPlayerTurnToServe()) {
        this.playerCtrl.executeServe();
      } else if (this.stateMachine.state === 'RALLY') {
        this.playerCtrl.triggerExternalStrike('TOPSPIN', 1.2, false);
      }
    };
    // Re-enable tilt for returning players on their first tap (iOS needs a gesture for the permission)
    if (this.readTiltPreference() && TiltController.isSupported()) {
      window.addEventListener('pointerdown', () => { void this.setTiltEnabled(true, true); }, { once: true });
    }
    // "Level" is wherever the player is holding the phone at the start of each round
    this.eventBus.on('curve:round_start', () => this.tilt.calibrate());

    // Webcam mode toggle
    this.hud.onToggleWebcam = async () => {
      if (this.playerCtrl.isWebcamMode) {
        this.stopWebcam();
        this.hud.showCallout('MOUSE CONTROLS ACTIVE', 1200);
      } else {
        // Webcam and tilt both drive the paddle; only one at a time
        if (this.tilt.isEnabled) this.setTiltEnabled(false, true);
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
    this.hud.onGameModeSelect = (modeType: GameModeType) => {
      this.gameModeType = modeType;
    };

    this.hud.onCurveSteer = (dir: -1 | 0 | 1) => {
      if (this.gameModeType === 'CURVE') {
        this.curveMode.handleLocalSteering(dir);
      }
    };

    this.hud.onStartMatch = (diff: Difficulty) => {
      this.sound.init();
      this.mode = 'BOT';
      this.botDifficulty = diff;
      if (this.gameModeType === 'CURVE') {
        this.startCurveMatch(false, diff);
      } else {
        this.hud.setOpponentName(`CPU (${diff.toUpperCase()})`);
        this.aiCtrl.setDifficulty(diff);
        this.startPongMatch();
      }
    };

    this.hud.onStartMultiplayerMatch = (_role: MultiplayerRole, remoteUsername: string) => {
      this.sound.init();
      this.mode = 'MULTIPLAYER';

      // Ensure GameModeType matches NetworkManager's activeGameMode if synced from Host
      if (this.network.activeGameMode && this.network.activeGameMode !== this.gameModeType) {
        this.gameModeType = this.network.activeGameMode;
      }

      if (this.gameModeType === 'CURVE') {
        this.startCurveMatch(true);
      } else {
        this.hud.setOpponentName(remoteUsername.toUpperCase());
        this.remotePlayerCtrl.resetPosition();
        this.startPongMatch();
      }
    };

    // Called for single-player "play again"/"restart", and in multiplayer only once BOTH players
    // agreed to a rematch (the HUD negotiates that over the network).
    this.hud.onRematch = () => {
      this.isPaused = false;
      this.hud.showPauseMenu(false);
      if (this.gameModeType === 'CURVE') {
        this.startCurveMatch(this.mode === 'MULTIPLAYER', this.botDifficulty);
      } else {
        if (this.mode === 'MULTIPLAYER') {
          this.remotePlayerCtrl.resetPosition();
        }
        this.startPongMatch();
      }
    };

    this.hud.onReturnToMenu = () => this.returnToMenu();

    // Opponent dropped (tab closed, Wi-Fi lost...): end the online match cleanly instead of
    // leaving the player facing a frozen opponent.
    this.eventBus.on('network:status', ({ status }) => {
      if (status !== 'disconnected' || this.mode !== 'MULTIPLAYER') return;
      const state = this.stateMachine.state;
      if (state === 'MENU' || state === 'GAME_OVER') return;
      this.hud.showCallout('OPPONENT LEFT THE MATCH', 2200);
      this.ball.physics.stop();
      this.mode = 'BOT';
      window.setTimeout(() => {
        if (this.stateMachine.state !== 'MENU') {
          this.hud.hideGameOver();
          this.hud.showMainMenu();
          this.returnToMenu();
        }
      }, 2000);
    });

    // State Changes
    this.eventBus.on('state:changed', ({ to }) => {
      if (to === 'SERVE_WAIT') {
        this.tilt.calibrate();
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

    // Real-Time Keyboard Steering for Curve Mode & Space Serve for Pong
    const curveKeys = { left: false, right: false };

    const updateCurveSteering = () => {
      if (this.gameModeType === 'CURVE') {
        if (curveKeys.left && !curveKeys.right) {
          this.curveMode.handleLocalSteering(-1);
        } else if (curveKeys.right && !curveKeys.left) {
          this.curveMode.handleLocalSteering(1);
        } else {
          this.curveMode.handleLocalSteering(0);
        }
      }
    };

    window.addEventListener('keydown', (e) => {
      // Never hijack keys while the player is typing a nickname / room code
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }

      const inMatch = this.isInMatch();
      // Stop Space/arrows from scrolling or re-clicking whatever menu button still has focus
      if (inMatch && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
        e.preventDefault();
      }

      if (this.gameModeType === 'CURVE') {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          curveKeys.left = true;
          updateCurveSteering();
        } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          curveKeys.right = true;
          updateCurveSteering();
        }
      } else if (e.code === 'Space' && !this.isPaused && this.stateMachine.state === 'SERVE_WAIT' && this.isLocalPlayerTurnToServe()) {
        this.playerCtrl.executeServe();
      }

      if (e.code === 'Escape' && inMatch) {
        this.togglePause();
      }
    });

    this.hud.onPauseRequest = () => {
      if (this.isInMatch()) this.togglePause(true);
    };

    // Auto-pause single-player matches when the tab is hidden or the window loses focus
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'BOT' && this.isInMatch() && !this.isPaused) {
        this.togglePause(true);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.gameModeType === 'CURVE') {
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
          curveKeys.left = false;
          updateCurveSteering();
        } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
          curveKeys.right = false;
          updateCurveSteering();
        }
      }
    });


    this.canvas.addEventListener('pointerdown', () => {
      if (!this.isPaused && this.gameModeType === 'PONG' && this.stateMachine.state === 'SERVE_WAIT' && this.isLocalPlayerTurnToServe()) {
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

      // Host broadcasts the point to the client. Deferred so the state machine has finished
      // rotating the server / detecting game over before the score is serialized.
      if (this.mode === 'MULTIPLAYER' && this.network.role === 'HOST' && this.network.isConnected) {
        queueMicrotask(() => {
          this.network.send({
            type: 'POINT_SCORED',
            winner,
            reason,
            score: { ...this.stateMachine.score }
          });
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

    // Curve Battle Round Celebrations
    this.eventBus.on('curve:crash', ({ victim }) => {
      if (victim === 'CPU') {
        this.stadium.celebrate();
        this.sound.playCheer();
      }
    });

    this.eventBus.on('curve:match_over', ({ winner }) => {
      this.sound.playWhistle();
      if (winner === 'PLAYER') {
        this.sound.playVictoryJingle();
      }
      this.stadium.celebrate();
    });
  }

  /** The score is always kept from the local point of view (PLAYER = this device), online too. */
  private isLocalPlayerTurnToServe(): boolean {
    return this.stateMachine.score.server === 'PLAYER';
  }

  private setEntitiesVisibility(visible: boolean): void {
    this.ball.group.visible = visible;
    this.playerPaddle.group.visible = visible;
    this.cpuPaddle.group.visible = visible;
    this.table.group.visible = visible;
    // Wood court floor & ping pong barriers are visible for Pong, hidden in Curve mode to avoid Z-fighting
    this.stadium.setCourtVisible(visible);
    // Crowd bleachers and spectators stay active & visible in both modes
    this.stadium.group.visible = true;
  }

  private stopWebcam(): void {
    this.webcamCtrl.stop();
    this.playerCtrl.isWebcamMode = false;
    this.hud.setWebcamActive(false);
    const { video } = this.hud.getWebcamElements();
    video.srcObject = null;
  }

  private readTiltPreference(): boolean {
    try {
      return localStorage.getItem('spinpong_tilt') === '1';
    } catch {
      return false;
    }
  }

  private saveTiltPreference(on: boolean): void {
    try {
      localStorage.setItem('spinpong_tilt', on ? '1' : '0');
    } catch {
      // storage unavailable
    }
  }

  /** `silent`: no callouts (used for auto-restore and when switching to webcam). */
  private async setTiltEnabled(on: boolean, silent: boolean = false): Promise<void> {
    if (!on) {
      this.tilt.disable();
      this.playerCtrl.isTiltMode = false;
      if (this.tiltCurveDir !== 0) {
        this.tiltCurveDir = 0;
        if (this.gameModeType === 'CURVE') this.curveMode.handleLocalSteering(0);
      }
      this.hud.setTiltActive(false);
      if (!silent) {
        this.saveTiltPreference(false);
        this.hud.showCallout('TOUCH CONTROLS ACTIVE', 1200);
      }
      return;
    }

    if (this.playerCtrl.isWebcamMode) this.stopWebcam();

    const result = await this.tilt.enable();
    if (result === 'ok') {
      this.playerCtrl.isTiltMode = true;
      this.hud.setTiltActive(true);
      this.saveTiltPreference(true);
      if (!silent) {
        this.hud.showCallout(this.gameModeType === 'CURVE' ? '📱 TILT TO STEER' : '📱 TILT TO MOVE · TAP OR FLICK TO SWING', 2000);
      }
    } else {
      this.hud.setTiltActive(false);
      if (!silent) {
        this.hud.showCallout(result === 'denied' ? 'MOTION ACCESS WAS DENIED' : 'NO MOTION SENSOR ON THIS DEVICE', 2200);
      }
    }
  }

  /** Called every frame while tilt is on. */
  private applyTiltInput(): void {
    if (!this.tilt.isEnabled || this.isPaused) return;
    const v = this.tilt.value;

    if (this.gameModeType === 'PONG') {
      this.playerCtrl.setExternalMotion(v);
      return;
    }

    // Curve: dead zone + hysteresis so the line doesn't flicker between straight and turning
    let dir = this.tiltCurveDir;
    if (dir === 0) {
      if (v > 0.3) dir = 1;
      else if (v < -0.3) dir = -1;
    } else if (Math.abs(v) < 0.18 || Math.sign(v) !== dir) {
      dir = 0;
    }
    if (dir !== this.tiltCurveDir) {
      this.tiltCurveDir = dir;
      this.curveMode.handleLocalSteering(dir);
    }
  }

  private isInMatch(): boolean {
    const state = this.stateMachine.state;
    return state !== 'MENU' && state !== 'GAME_OVER';
  }

  /**
   * Single player: freezes the simulation. Online: only opens the menu overlay, since the opponent's
   * game keeps running and a local freeze would desync the two peers.
   */
  private togglePause(force?: boolean): void {
    const open = force ?? !this.hud.isPauseMenuOpen();
    if (this.mode === 'MULTIPLAYER') {
      this.isPaused = false;
      this.hud.showPauseMenu(open, true);
      return;
    }
    this.isPaused = open;
    this.hud.showPauseMenu(open, false);
    if (!open) {
      this.lastTime = performance.now();
    }
  }

  private returnToMenu(): void {
    this.isPaused = false;
    this.hud.showPauseMenu(false);
    this.hud.setCurveTouchControls(false);
    this.ball.physics.stop();
    this.stateMachine.cancelPendingServe();
    this.stateMachine.isAuthoritative = true;
    const wasMultiplayer = this.mode === 'MULTIPLAYER';
    // Switch mode before disconnecting so our own disconnect is not treated as the opponent leaving
    this.mode = 'BOT';
    if (wasMultiplayer) {
      this.network.disconnect();
    }
    this.gameModeType = this.hud.selectedGameMode;
    this.setEntitiesVisibility(true);
    this.curveMode.group.visible = false;
    this.cameraCtrl.setMode('PONG');
    this.stateMachine.setState('MENU');
  }

  /** Starts (or restarts) a Pong match for the current mode. Host/bot judge points; an online client follows the host. */
  private startPongMatch(): void {
    const isMultiplayer = this.mode === 'MULTIPLAYER';
    const isClient = isMultiplayer && this.network.role === 'CLIENT';
    this.stateMachine.isAuthoritative = !isClient;
    const target = isMultiplayer ? this.network.hostedTargetScore : 11;
    // The host always serves first; on the client that is the "CPU" side
    this.stateMachine.resetMatch(target, isClient ? 'CPU' : 'PLAYER');
    this.startMatchSequence();
  }

  private startCurveMatch(isMultiplayer: boolean, diff: Difficulty = 'pro'): void {
    this.tiltCurveDir = 0;
    this.gameModeType = 'CURVE';
    this.setEntitiesVisibility(false); // Hides ping pong table, net, paddles, ball, and wood floor (stadium crowd stays visible)
    this.curveMode.group.visible = true; // Shows plain square 2D arena
    this.cameraCtrl.setMode('CURVE'); // True 2D top-down view looking down at the table and arena
    this.stateMachine.setState('RALLY'); // Active playing state

    const oppName = isMultiplayer ? this.network.remoteUsername : `BOT (${diff.toUpperCase()})`;
    this.hud.setOpponentName(oppName);
    this.sound.playWhistle();
    this.curveMode.startMatch(isMultiplayer, diff, isMultiplayer ? this.network.hostedTargetScore : 5);
  }



  private handleNetworkMessage(msg: NetworkMessage): void {
    // If curve network packet, forward directly to CurveGameMode
    if (
      msg.type === 'CURVE_INPUT' ||
      msg.type === 'CURVE_ROUND_START' ||
      msg.type === 'CURVE_CRASH' ||
      msg.type === 'CURVE_SCORE_SYNC'
    ) {
      if (this.gameModeType === 'CURVE') {
        this.curveMode.handleNetworkMessage(msg);
      }
      return;
    }

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
      const invSy = msg.spin[1]; // rotating 180° about Y keeps the Y (sidespin) axis
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

    if (msg.type === 'BALL_SYNC') {
      if (this.network.role === 'CLIENT') {
        const invX = -msg.position[0];
        const invY = msg.position[1];
        const invZ = -msg.position[2];

        const invVx = -msg.velocity[0];
        const invVy = msg.velocity[1];
        const invVz = -msg.velocity[2];

        const invSx = -msg.spin[0];
        const invSy = msg.spin[1]; // rotating 180° about Y keeps the Y (sidespin) axis
        const invSz = -msg.spin[2];

        if (msg.isActive) {
          this.ball.physics.isActive = true;
          // Smooth correction: if deviation is more than 6cm, lerp toward host position
          const dx = this.ball.physics.position.x - invX;
          const dy = this.ball.physics.position.y - invY;
          const dz = this.ball.physics.position.z - invZ;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > 0.0036) {
            this.ball.physics.position.lerp(new THREE.Vector3(invX, invY, invZ), 0.6);
          }
          this.ball.physics.velocity.set(invVx, invVy, invVz);
          this.ball.physics.spin.set(invSx, invSy, invSz);
        } else {
          this.ball.physics.isActive = false;
          this.ball.physics.position.set(invX, invY, invZ);
        }
      }
      return;
    }

    if (msg.type === 'POINT_SCORED') {
      if (this.network.role === 'CLIENT' && this.gameModeType === 'PONG') {
        const flip = (id: PlayerId): PlayerId => (id === 'PLAYER' ? 'CPU' : 'PLAYER');
        const localScore = {
          ...msg.score,
          player: msg.score.cpu,
          cpu: msg.score.player,
          server: flip(msg.score.server)
        };
        this.stateMachine.applyRemotePoint(flip(msg.winner), msg.reason, localScore);
      }
      return;
    }
  }

  private setupWindowEvents(): void {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.cameraCtrl.setAspect(width / height);
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100);
    });

    this.eventBus.on('device:resize', (info) => {
      this.cameraCtrl.setAspect(info.aspectRatio);
      this.renderer.setSize(info.screenWidth, info.screenHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });
  }

  private startMatchSequence(): void {
    this.gameModeType = 'PONG';
    this.setEntitiesVisibility(true);
    this.curveMode.group.visible = false;
    this.cameraCtrl.setMode('PONG');
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

    if (this.gameModeType === 'CURVE') {
      // Curve Battle simulation loop
      if (this.stateMachine.state !== 'MENU') {
        this.applyTiltInput();
        this.curveMode.update(rawDelta);
        this.vfx.update(rawDelta);
        // Audience stays active and tracks curve battle leader
        const leadPos = new THREE.Vector3(this.curveMode.p1.x, 0, this.curveMode.p1.z);
        this.stadium.update(rawDelta, leadPos);
      }

      this.cameraCtrl.update(
        rawDelta,
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
      );

      this.renderer.render(this.scene, this.cameraCtrl.camera);
      return;
    }


    // Classic Pong simulation loop
    const { player, cpu, targetScore } = this.stateMachine.score;
    const isMatchPoint = player >= targetScore - 1 || cpu >= targetScore - 1;
    const targetScale = (isMatchPoint && this.stateMachine.state === 'RALLY') ? 0.85 : 1.0;
    this.timeScale = THREE.MathUtils.lerp(this.timeScale, targetScale, rawDelta * 5);
    const dt = rawDelta * this.timeScale;

    // Update Game Elements
    if (this.stateMachine.state !== 'MENU') {
      this.applyTiltInput();
      this.playerCtrl.update(dt);
      if (this.mode === 'BOT') {
        this.aiCtrl.update(dt);
      } else {
        this.remotePlayerCtrl.update(dt);
      }
      this.ball.update(dt);

      // Real-time authoritative ball streaming from HOST to CLIENT in multiplayer Pong
      if (this.mode === 'MULTIPLAYER' && this.network.role === 'HOST' && this.network.isConnected) {
        this.ballSyncTimer += rawDelta;
        if (this.ballSyncTimer >= 0.033) { // 30Hz sync
          this.ballSyncTimer = 0;
          this.network.send({
            type: 'BALL_SYNC',
            position: [this.ball.physics.position.x, this.ball.physics.position.y, this.ball.physics.position.z],
            velocity: [this.ball.physics.velocity.x, this.ball.physics.velocity.y, this.ball.physics.velocity.z],
            spin: [this.ball.physics.spin.x, this.ball.physics.spin.y, this.ball.physics.spin.z],
            isActive: this.ball.physics.isActive
          });
        }
      }

      this.stadium.update(dt, this.ball.physics.position);
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

