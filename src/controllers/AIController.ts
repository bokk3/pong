import * as THREE from 'three';
import { Paddle } from '../entities/Paddle';
import { Ball } from '../entities/Ball';
import { TrajectoryPredictor } from '../physics/TrajectoryPredictor';
import { PADDLE_SPECS, TABLE_BOUNDS, PHYSICS_CONSTANTS } from '../physics/Constants';
import { Difficulty, ShotRating, SpinType } from '../types';
import { EventBus } from '../core/EventBus';

export class AIController {
  public paddle: Paddle;
  private ball: Ball;
  private eventBus: EventBus;
  private difficulty: Difficulty = 'pro';

  // AI behavior variables
  private reactionDelay: number = 0.08;
  private timeSinceBallHit: number = 0;
  private noiseOffset = new THREE.Vector2();
  private hasStruckThisTurn: boolean = false;

  constructor(paddle: Paddle, ball: Ball, difficulty: Difficulty = 'pro') {
    this.paddle = paddle;
    this.ball = ball;
    this.eventBus = EventBus.get();
    this.setDifficulty(difficulty);

    this.eventBus.on('ball:hit', (shot) => {
      if (shot.hitter === 'PLAYER') {
        this.timeSinceBallHit = 0;
        this.hasStruckThisTurn = false;
        this.generateNoise();
      }
    });
  }

  public setDifficulty(diff: Difficulty): void {
    this.difficulty = diff;
    if (diff === 'novice') {
      this.reactionDelay = 0.22;
    } else if (diff === 'pro') {
      this.reactionDelay = 0.08;
    } else {
      this.reactionDelay = 0.02;
    }
  }

  private generateNoise(): void {
    if (this.difficulty === 'novice') {
      this.noiseOffset.set((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15);
    } else if (this.difficulty === 'pro') {
      this.noiseOffset.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.06);
    } else {
      this.noiseOffset.set(0, 0);
    }
  }

  public update(dt: number): void {
    this.timeSinceBallHit += dt;
    const ballPos = this.ball.physics.position;
    const ballVel = this.ball.physics.velocity;

    // Default CPU stance
    let targetX = PADDLE_SPECS.CPU_DEFAULT_POS.x;
    let targetY = PADDLE_SPECS.CPU_DEFAULT_POS.y;
    const targetZ = PADDLE_SPECS.CPU_DEFAULT_POS.z;

    // Track incoming ball if moving towards CPU (velocity.z < -0.5)
    if (ballVel.z < -0.5 && this.timeSinceBallHit >= this.reactionDelay) {
      const pred = TrajectoryPredictor.predictLanding(
        ballPos,
        ballVel,
        this.ball.physics.spin,
        targetZ
      );

      targetX = THREE.MathUtils.clamp(
        pred.position.x + this.noiseOffset.x,
        -PADDLE_SPECS.MAX_REACH_X,
        PADDLE_SPECS.MAX_REACH_X
      );
      targetY = THREE.MathUtils.clamp(
        pred.position.y + this.noiseOffset.y,
        PADDLE_SPECS.MIN_Y,
        PADDLE_SPECS.MAX_Y
      );

      // Check if ball is in strike zone (forgiving reach for smooth rallies)
      if (!this.hasStruckThisTurn && ballPos.z <= -1.35 && ballPos.z >= -2.35) {
        const dist = this.paddle.position.distanceTo(ballPos);
        if (dist < 0.95) {
          this.executeAIStrike();
          this.hasStruckThisTurn = true;
        }
      }
    }

    // Move AI paddle with difficulty-based tracking speed
    const trackSpeed = this.difficulty === 'novice' ? 9.0 : (this.difficulty === 'pro' ? 15.0 : 22.0);
    this.paddle.targetPosition.set(targetX, targetY, targetZ);
    this.paddle.position.lerp(this.paddle.targetPosition, Math.min(dt * trackSpeed, 1.0));
    this.paddle.update(dt);
  }

  private executeAIStrike(): void {
    const ballPos = this.ball.physics.position;
    const isForehand = ballPos.x <= this.paddle.position.x;

    // Pick shot characteristics based on difficulty
    let spinType: SpinType = 'TOPSPIN';
    let shotSpeed = 8.8;
    let isSmash = false;
    let rating: ShotRating = 'GOOD';
    let targetX = 0;
    let targetZ = 0.85;

    if (this.difficulty === 'novice') {
      shotSpeed = 7.5;
      spinType = Math.random() > 0.7 ? 'TOPSPIN' : 'NONE';
      // Novice aims comfortably for table center to keep rallies alive
      targetX = (Math.random() - 0.5) * 0.40;
      targetZ = 0.80;
      rating = Math.random() < 0.1 ? 'LATE' : 'GOOD';
    } else if (this.difficulty === 'pro') {
      spinType = Math.random() > 0.35 ? 'TOPSPIN' : 'BACKSPIN';
      if (ballPos.y > 1.15 && Math.random() > 0.5) {
        isSmash = true;
        shotSpeed = 13.0;
        targetZ = 1.12;
      } else {
        shotSpeed = 8.8;
        targetZ = spinType === 'TOPSPIN' ? 0.96 : 0.70;
      }
      targetX = THREE.MathUtils.clamp((Math.random() - 0.5) * 0.90, -0.52, 0.52);
      rating = 'PERFECT';
    } else {
      // Master
      spinType = 'TOPSPIN';
      if (ballPos.y > 1.08 && Math.random() > 0.4) {
        isSmash = true;
        shotSpeed = 14.5;
        targetZ = 1.18;
      } else {
        shotSpeed = 10.5;
        targetZ = 1.05;
      }
      targetX = THREE.MathUtils.clamp((Math.random() - 0.5) * 1.15, -0.62, 0.62);
      rating = 'PERFECT';
    }

    this.paddle.swing(isForehand, spinType, isSmash ? 1.4 : 1.05);

    // Spin vector
    const spinVector = new THREE.Vector3();
    if (spinType === 'TOPSPIN') {
      spinVector.x = isSmash ? -40 : -55; // Pulls down towards player table (+Z)
    } else if (spinType === 'BACKSPIN') {
      spinVector.x = 35;
    }
    spinVector.y = -targetX * 25;

    const targetPos = new THREE.Vector3(
      targetX,
      TABLE_BOUNDS.tableTopY + PHYSICS_CONSTANTS.BALL_RADIUS,
      targetZ
    );

    const launchVel = TrajectoryPredictor.calculateLaunchVelocity(
      ballPos,
      targetPos,
      shotSpeed,
      spinVector,
      isSmash
    );

    this.ball.physics.velocity.copy(launchVel);
    this.ball.physics.spin.copy(spinVector);

    this.eventBus.emit('ball:hit', {
      hitter: 'CPU',
      rating,
      speed: this.ball.physics.velocity.length(),
      spin: spinType,
      isSmash,
      contactPoint: ballPos.clone()
    });
  }

  public executeServe(): void {
    this.ball.physics.reset(
      new THREE.Vector3(-0.16, 0.86, -1.55),
      new THREE.Vector3(0, 1.4, 0),
      new THREE.Vector3(0, 0, 0)
    );

    setTimeout(() => {
      this.paddle.swing(true, 'TOPSPIN', 1.0);
      // Serve bounces on CPU side first, clears net, lands on player side
      this.ball.physics.velocity.set(-0.06, -1.0, 5.6);
      this.ball.physics.spin.set(-22, 0, 0);

      this.eventBus.emit('ball:hit', {
        hitter: 'CPU',
        rating: 'GOOD',
        speed: 5.8,
        spin: 'TOPSPIN',
        isSmash: false,
        contactPoint: this.ball.physics.position.clone()
      });
    }, 180);
  }
}
