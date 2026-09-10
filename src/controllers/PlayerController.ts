import * as THREE from 'three';
import { Paddle } from '../entities/Paddle';
import { Ball } from '../entities/Ball';
import { TrajectoryPredictor } from '../physics/TrajectoryPredictor';
import { PADDLE_SPECS, TABLE_BOUNDS, PHYSICS_CONSTANTS } from '../physics/Constants';
import { ShotRating, SpinType } from '../types';
import { EventBus } from '../core/EventBus';

interface BufferedStrike {
  spin: SpinType;
  power: number;
  isSmash: boolean;
  angleBias?: number;
  timestamp: number;
}

export class PlayerController {
  public paddle: Paddle;
  private ball: Ball;
  private eventBus: EventBus;

  // Settings & Sensitivity
  public sensitivity: number = 1.2; // Default 1.2x (range 0.5x to 2.5x)
  public isWebcamMode: boolean = false;

  // Input tracking
  private mousePrevPos = { x: 0, y: 0 };
  private mouseVelocity = { x: 0, y: 0 };
  private lastMouseMoveTime: number = 0;
  private isPointerDown: boolean = false;
  private pointerDownPos = { x: 0, y: 0 };

  // Timing & Assisted Position
  private manualOffset = new THREE.Vector2(0, 0);

  // Input Buffering (prevents missed swings if user clicks 50-140ms early)
  private bufferedStrike: BufferedStrike | null = null;
  private readonly BUFFER_WINDOW_MS: number = 140;

  // Keyboard state
  private keysPressed: Set<string> = new Set();

  constructor(paddle: Paddle, ball: Ball) {
    this.paddle = paddle;
    this.ball = ball;
    this.eventBus = EventBus.get();

    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Touch support
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.pointerDownPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this.isPointerDown = true;
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.isPointerDown && e.changedTouches.length > 0) {
        const dx = e.changedTouches[0].clientX - this.pointerDownPos.x;
        const dy = e.changedTouches[0].clientY - this.pointerDownPos.y;
        this.executeSwipe(dx, dy);
        this.isPointerDown = false;
      }
    }, { passive: true });

    // Keyboard support
    window.addEventListener('keydown', (e) => {
      this.keysPressed.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyJ') {
        this.attemptStrike('TOPSPIN', 1.15);
      } else if (e.code === 'KeyK') {
        this.attemptStrike('BACKSPIN', 0.95);
      } else if (e.code === 'KeyL') {
        this.attemptStrike('TOPSPIN', 1.7, true);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.code);
    });
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isWebcamMode) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastMouseMoveTime) / 1000, 0.004);
    this.lastMouseMoveTime = now;

    const dx = e.movementX || (e.clientX - this.mousePrevPos.x);
    const dy = e.movementY || (e.clientY - this.mousePrevPos.y);

    this.mousePrevPos = { x: e.clientX, y: e.clientY };

    // Filter mouse velocity
    this.mouseVelocity.x = THREE.MathUtils.lerp(this.mouseVelocity.x, dx / dt, 0.5);
    this.mouseVelocity.y = THREE.MathUtils.lerp(this.mouseVelocity.y, dy / dt, 0.5);

    // Responsive manual nudge across screen width scaled by sensitivity
    const screenNormX = (e.clientX / window.innerWidth - 0.5) * 2;
    this.manualOffset.x = screenNormX * 0.55 * this.sensitivity;

    // Fast flick gesture detection with adaptive sensitivity threshold
    const speed = Math.hypot(this.mouseVelocity.x, this.mouseVelocity.y);
    const flickThreshold = 420 / Math.max(this.sensitivity, 0.5);
    if (speed > flickThreshold) {
      this.handleFlickGesture(this.mouseVelocity.y);
    }
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.isWebcamMode) return;
    this.isPointerDown = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.attemptStrike('TOPSPIN', 1.1);
  }

  private onMouseUp(_e: MouseEvent): void {
    this.isPointerDown = false;
  }

  private executeSwipe(_dx: number, dy: number): void {
    const swipeDistance = Math.hypot(_dx, dy);
    if (swipeDistance < 10) {
      this.attemptStrike('NONE', 1.0);
      return;
    }

    if (dy < -20) {
      this.attemptStrike('TOPSPIN', 1.25);
    } else if (dy > 20) {
      this.attemptStrike('BACKSPIN', 0.95);
    } else {
      this.attemptStrike('NONE', 1.1);
    }
  }

  private handleFlickGesture(vy: number): void {
    // vy negative = flicked forward/up -> topspin
    // vy positive = flicked downward -> chop/backspin
    if (vy < -350) {
      const isSmash = this.ball.physics.position.y > 1.08;
      this.attemptStrike('TOPSPIN', isSmash ? 1.7 : 1.3, isSmash);
    } else if (vy > 350) {
      this.attemptStrike('BACKSPIN', 1.0);
    } else {
      this.attemptStrike('NONE', 1.15);
    }
  }

  public setExternalMotion(normX: number): void {
    // normX in [-1, 1] from webcam hand tracking
    this.manualOffset.x = normX * 0.85 * this.sensitivity;
  }

  public triggerExternalStrike(spin: SpinType, power: number, isSmash: boolean, angleBias?: number): void {
    this.attemptStrike(spin, power, isSmash, angleBias);
  }

  public update(dt: number): void {
    const ballPos = this.ball.physics.position;
    const ballVel = this.ball.physics.velocity;

    // 1. Check Input Buffer
    if (this.bufferedStrike) {
      const elapsed = performance.now() - this.bufferedStrike.timestamp;
      if (elapsed > this.BUFFER_WINDOW_MS) {
        this.bufferedStrike = null;
      } else if (ballPos.z >= 1.42 && ballPos.z <= 2.2 && ballVel.z > 0) {
        const buf = this.bufferedStrike;
        this.bufferedStrike = null;
        this.performStrike(buf.spin, buf.power, buf.isSmash, buf.angleBias);
      }
    }

    // 2. Assisted Auto-Positioning
    let targetX = PADDLE_SPECS.PLAYER_DEFAULT_POS.x;
    let targetY = PADDLE_SPECS.PLAYER_DEFAULT_POS.y;
    const targetZ = PADDLE_SPECS.PLAYER_DEFAULT_POS.z;

    if (ballVel.z > 0.4 && ballPos.z < 2.3) {
      const pred = TrajectoryPredictor.predictLanding(
        ballPos,
        ballVel,
        this.ball.physics.spin,
        targetZ
      );

      targetX = THREE.MathUtils.clamp(pred.position.x, -PADDLE_SPECS.MAX_REACH_X, PADDLE_SPECS.MAX_REACH_X);
      targetY = THREE.MathUtils.clamp(pred.position.y, PADDLE_SPECS.MIN_Y, PADDLE_SPECS.MAX_Y);
    }

    // Apply manual offset nudge
    targetX += this.manualOffset.x;
    targetX = THREE.MathUtils.clamp(targetX, -PADDLE_SPECS.MAX_REACH_X * 1.2, PADDLE_SPECS.MAX_REACH_X * 1.2);

    // Smoothly update paddle target
    this.paddle.targetPosition.set(targetX, targetY, targetZ);
    this.paddle.update(dt);
  }

  /**
   * Attempts strike with input buffering for slightly early clicks.
   */
  public attemptStrike(
    preferredSpin: SpinType = 'TOPSPIN',
    power: number = 1.0,
    forceSmash: boolean = false,
    manualAngleBias?: number
  ): boolean {
    const ballPos = this.ball.physics.position;
    const ballVel = this.ball.physics.velocity;
    const paddlePos = this.paddle.position;

    // If ball not in motion towards player, still trigger visual swing
    if (!this.ball.physics.isActive || ballVel.z <= 0) {
      this.paddle.swing(ballPos.x >= paddlePos.x, preferredSpin, power);
      return false;
    }

    // If ball is rushing towards player but slightly early (e.g. Z in [1.0, 1.42]), buffer the input!
    if (ballPos.z >= 1.0 && ballPos.z < 1.42 && ballVel.z > 1.2) {
      this.bufferedStrike = {
        spin: preferredSpin,
        power,
        isSmash: forceSmash,
        angleBias: manualAngleBias,
        timestamp: performance.now()
      };
      // Initiate windup swing immediately for zero visual latency
      this.paddle.swing(ballPos.x >= paddlePos.x, preferredSpin, power * 0.85);
      return true;
    }

    // If ball is within the live strike zone
    if (ballPos.z >= 1.38 && ballPos.z <= 2.35) {
      const dist = paddlePos.distanceTo(ballPos);
      if (dist <= 1.0) {
        return this.performStrike(preferredSpin, power, forceSmash, manualAngleBias);
      }
    }

    // Otherwise out of range swing
    this.paddle.swing(ballPos.x >= paddlePos.x, preferredSpin, power);
    if (ballPos.z > 2.25) {
      this.eventBus.emit('ball:hit', {
        hitter: 'PLAYER',
        rating: 'LATE',
        speed: 0,
        spin: 'NONE',
        isSmash: false,
        contactPoint: ballPos.clone()
      });
    }
    return false;
  }

  private performStrike(
    preferredSpin: SpinType,
    power: number,
    forceSmash: boolean,
    manualAngleBias?: number
  ): boolean {
    const ballPos = this.ball.physics.position;
    const paddlePos = this.paddle.position;

    // Evaluate Timing Window
    let rating: ShotRating = 'GOOD';
    let speedBonus = 1.05;
    let angleBias = manualAngleBias ?? 0;

    // Sweet spot: 1.48 to 1.78
    if (ballPos.z < 1.48) {
      rating = 'EARLY';
      angleBias = manualAngleBias ?? (paddlePos.x > 0 ? -0.35 : 0.35);
      speedBonus = 0.96;
    } else if (ballPos.z > 1.78) {
      rating = 'LATE';
      angleBias = manualAngleBias ?? (paddlePos.x > 0 ? 0.32 : -0.32);
      speedBonus = 0.92;
    } else {
      rating = 'PERFECT';
      speedBonus = 1.30;
      angleBias = manualAngleBias ?? ((Math.random() - 0.5) * 0.08);
    }

    const isSmash = forceSmash || (ballPos.y > 1.08 && power > 1.25);
    if (isSmash) {
      rating = 'SMASH';
      speedBonus = 1.65;
    }

    const isForehand = ballPos.x >= paddlePos.x - 0.05;
    this.paddle.swing(isForehand, preferredSpin, power * speedBonus);

    this.executeReturnShot(rating, preferredSpin, speedBonus * power, angleBias, isSmash);
    return true;
  }

  private executeReturnShot(
    rating: ShotRating,
    spinType: SpinType,
    powerMultiplier: number,
    angleBias: number,
    isSmash: boolean
  ): void {
    const ballPos = this.ball.physics.position;

    let targetX = THREE.MathUtils.clamp(
      -ballPos.x * 0.65 + angleBias * TABLE_BOUNDS.halfWidth,
      -TABLE_BOUNDS.halfWidth * 0.88,
      TABLE_BOUNDS.halfWidth * 0.88
    );

    const baseSpeed = isSmash ? 24.5 : 14.0 * powerMultiplier;
    const launchZ = -(baseSpeed * 0.9);

    let launchY = 2.4;
    if (isSmash) {
      launchY = -0.7;
    } else if (spinType === 'TOPSPIN') {
      launchY = 2.8;
    } else if (spinType === 'BACKSPIN') {
      launchY = 1.75;
    }

    const flightTime = Math.abs((PHYSICS_CONST