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
  public onPaddlePositionUpdate: ((x: number, y: number, z: number, isForehand: boolean, isSwinging: boolean) => void) | null = null;

  // Input tracking
  private mousePrevPos = { x: 0, y: 0 };
  private mouseVelocity = { x: 0, y: 0 };
  private lastMouseMoveTime: number = 0;
  private isPointerDown: boolean = false;
  private pointerDownPos = { x: 0, y: 0 };

  // Timing & Assisted Position
  private manualOffset = new THREE.Vector2(0, 0);

  // Cooldowns and debouncing
  private lastSwingTime: number = 0;
  private readonly SWING_COOLDOWN_MS: number = 220;
  private lastFlickTime: number = 0;
  private readonly FLICK_COOLDOWN_MS: number = 180;
  private isServing: boolean = false;

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
      if (e.code === 'Space') {
        // Support Z (topspin) and X (backspin) modifiers as listed in README
        if (this.keysPressed.has('KeyZ')) {
          this.attemptStrike('TOPSPIN', 1.25);
        } else if (this.keysPressed.has('KeyX')) {
          this.attemptStrike('BACKSPIN', 0.95);
        } else {
          this.attemptStrike('TOPSPIN', 1.15);
        }
      } else if (e.code === 'KeyJ') {
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

    // Fast flick gesture detection with adaptive sensitivity threshold and debouncing
    const speed = Math.hypot(this.mouseVelocity.x, this.mouseVelocity.y);
    const flickThreshold = 450 / Math.max(this.sensitivity, 0.5);
    if (speed > flickThreshold && (now - this.lastFlickTime > this.FLICK_COOLDOWN_MS)) {
      this.lastFlickTime = now;
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

    // 2. Keyboard Manual Movement (Arrow Keys & WASD as listed in README)
    const keyMoveSpeed = 3.2 * this.sensitivity;
    if (this.keysPressed.has('ArrowLeft') || this.keysPressed.has('KeyA')) {
      this.manualOffset.x = Math.max(this.manualOffset.x - keyMoveSpeed * dt, -PADDLE_SPECS.MAX_REACH_X);
    }
    if (this.keysPressed.has('ArrowRight') || this.keysPressed.has('KeyD')) {
      this.manualOffset.x = Math.min(this.manualOffset.x + keyMoveSpeed * dt, PADDLE_SPECS.MAX_REACH_X);
    }
    if (this.keysPressed.has('ArrowUp') || this.keysPressed.has('KeyW')) {
      this.manualOffset.y = Math.max(this.manualOffset.y - keyMoveSpeed * dt * 0.4, -0.45); // forward towards table
    }
    if (this.keysPressed.has('ArrowDown') || this.keysPressed.has('KeyS')) {
      this.manualOffset.y = Math.min(this.manualOffset.y + keyMoveSpeed * dt * 0.4, 0.4); // back away from table
    }

    // 3. Assisted Auto-Positioning
    let targetX = PADDLE_SPECS.PLAYER_DEFAULT_POS.x;
    let targetY = PADDLE_SPECS.PLAYER_DEFAULT_POS.y;
    const targetZ = PADDLE_SPECS.PLAYER_DEFAULT_POS.z + this.manualOffset.y;

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

    if (this.onPaddlePositionUpdate) {
      this.onPaddlePositionUpdate(
        this.paddle.position.x,
        this.paddle.position.y,
        this.paddle.position.z,
        this.ball.physics.position.x >= this.paddle.position.x - 0.05,
        this.paddle.isSwinging
      );
    }
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

    const now = performance.now();
    if (now - this.lastSwingTime < this.SWING_COOLDOWN_MS) {
      return false;
    }
    this.lastSwingTime = now;

    // If ball not in motion towards player, still trigger visual swing
    if (!this.ball.physics.isActive || ballVel.z <= 0) {
      this.paddle.swing(ballPos.x >= paddlePos.x, preferredSpin, power);
      return false;
    }

    // If ball is rushing towards player but slightly early, buffer the input
    if (ballPos.z >= 0.95 && ballPos.z < 1.35 && ballVel.z > 0.8) {
      this.bufferedStrike = {
        spin: preferredSpin,
        power,
        isSmash: forceSmash,
        angleBias: manualAngleBias,
        timestamp: now
      };
      this.paddle.swing(ballPos.x >= paddlePos.x, preferredSpin, power * 0.9);
      return true;
    }

    // If ball is within the live strike zone (forgiving reach and depth)
    if (ballPos.z >= 1.22 && ballPos.z <= 2.45) {
      const dist = paddlePos.distanceTo(ballPos);
      if (dist <= 1.35) {
        return this.performStrike(preferredSpin, power, forceSmash, manualAngleBias);
      }
    }

    // Out of range swing (whiff) - visual paddle swing only; DO NOT emit ball:hit
    this.paddle.swing(ballPos.x >= paddlePos.x, preferredSpin, power);
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

    // Timing Window: generous sweet spot for long, rhythmic rallies
    let rating: ShotRating = 'GOOD';
    let speedBonus = 1.0;
    let angleBias = manualAngleBias ?? 0;

    // Sweet spot: 1.40 to 1.88
    if (ballPos.z < 1.40) {
      rating = 'EARLY';
      // Early timing pulls cross-court
      angleBias = manualAngleBias ?? (paddlePos.x > 0 ? -0.40 : 0.40);
      speedBonus = 0.98;
    } else if (ballPos.z > 1.88) {
      rating = 'LATE';
      // Late timing sends shot down-the-line
      angleBias = manualAngleBias ?? (paddlePos.x > 0 ? 0.35 : -0.35);
      speedBonus = 0.95;
    } else {
      rating = 'PERFECT';
      speedBonus = 1.15;
      angleBias = manualAngleBias ?? ((Math.random() - 0.5) * 0.08);
    }

    const isSmash = forceSmash || (ballPos.y > 1.10 && power > 1.25 && ballPos.z < 1.85);
    if (isSmash) {
      rating = 'SMASH';
      speedBonus = 1.35;
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

    // Calculate target landing position on CPU table (Z in [-1.37, 0])
    let targetX: number;
    if (rating === 'EARLY') {
      targetX = ballPos.x > 0 ? -0.42 : 0.42;
    } else if (rating === 'LATE') {
      targetX = ballPos.x > 0 ? 0.38 : -0.38;
    } else {
      targetX = THREE.MathUtils.clamp(
        -ballPos.x * 0.35 + angleBias * TABLE_BOUNDS.halfWidth * 0.75,
        -0.58,
        0.58
      );
    }

    // Target depth on CPU table
    let targetZ = -0.88;
    if (isSmash) {
      targetZ = -1.15;
    } else if (spinType === 'TOPSPIN') {
      targetZ = -1.02; // Deep dipping topspin
    } else if (spinType === 'BACKSPIN') {
      targetZ = -0.65; // Shorter floating backspin
    }

    // Controlled arcade pace (7.4 to 10.8 m/s for rallies; 13.5 m/s for smashes)
    const baseSpeed = isSmash ? 13.5 : THREE.MathUtils.clamp(8.6 * powerMultiplier, 7.4, 10.8);

    const spinVector = new THREE.Vector3();
    if (spinType === 'TOPSPIN' || isSmash) {
      spinVector.x = isSmash ? 45 : 60;
    } else if (spinType === 'BACKSPIN') {
      spinVector.x = -40;
    }
    spinVector.y = -angleBias * 30;

    const targetPos = new THREE.Vector3(
      targetX,
      TABLE_BOUNDS.tableTopY + PHYSICS_CONSTANTS.BALL_RADIUS,
      targetZ
    );

    const launchVel = TrajectoryPredictor.calculateLaunchVelocity(
      ballPos,
      targetPos,
      baseSpeed,
      spinVector,
      isSmash
    );

    this.ball.physics.velocity.copy(launchVel);
    this.ball.physics.spin.copy(spinVector);

    this.eventBus.emit('ball:hit', {
      hitter: 'PLAYER',
      rating,
      speed: this.ball.physics.velocity.length(),
      spin: spinType,
      isSmash,
      contactPoint: ballPos.clone()
    });

    if (isSmash) {
      this.eventBus.emit('camera:shake', { intensity: 0.08, duration: 0.35 });
    }
  }

  public executeServe(): void {
    if (this.isServing) return;
    this.isServing = true;

    this.ball.physics.reset(
      new THREE.Vector3(0.15, 0.88, 1.50),
      new THREE.Vector3(0, 1.3, 0),
      new THREE.Vector3(0, 0, 0)
    );

    setTimeout(() => {
      this.paddle.swing(true, 'TOPSPIN', 1.0);
      // Clean serve strike: directs ball to bounce on player's table side around Z ~ 0.95m
      this.ball.physics.velocity.set(0.06, -1.8, -5.2);
      this.ball.physics.spin.set(10, 0, 0);

      this.eventBus.emit('ball:hit', {
        hitter: 'PLAYER',
        rating: 'GOOD',
        speed: 5.6,
        spin: 'TOPSPIN',
        isSmash: false,
        contactPoint: this.ball.physics.position.clone()
      });

      setTimeout(() => {
        this.isServing = false;
      }, 500);
    }, 180);
  }
}
