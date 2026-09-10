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

      // Check if ball is in strike zone
      if (!this.hasStruckThisTurn && ballPos.z <= -1.45 && ballPos.z >= -2.2) {
        const dist = this.paddle.position.distanceTo(ballPos);
        if (dist < 0.75) {
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
    let shotSpeed = 12.0;
    let isSmash = false;
    let rating: ShotRating = 'GOOD';

    if (this.difficulty === 'novice') {
      shotSpeed = 10.5;
      spinType = Math.random() > 0.6 ? 'TOPSPIN' : 'NONE';
      // Chance of unforced error
      if (Math.random() < 0.12) {
        rating = 'LATE';
      }
    } else if (this.difficulty === 'pro') {
      shotSpeed = 13.5;
      spinType = Math.random() > 0.3 ? 'TOPSPIN' : 'BACKSPIN';
      if (ballPos.y > 1.15 && Math.random() > 0.4) {
        isSmash = true;
        shotSpeed = 20.0;
      }
      rating = 'PERFECT';
    } else {
      // Master
      shotSpeed = 16.0;
      spinType = 'TOPSPIN';
      if (ballPos.y > 1.05) {
        isSmash = true;
        shotSpeed = 25.0;
      }
      rating = 'PERFECT';
    }

    this.paddle.swing(isForehand, spinType, isSmash ? 1.6 : 1.1);

    // Aim for player table corners (Z positive)
    // Alternate left/right corner placement
    const targetCornerX = (Math.random() - 0.5) * (TABLE_BOUNDS.width * 0.75);
    const launchZ = shotSpeed * 0.9;
    let launchY = isSmash ? -0.5 : (spinType === 'TOPSPIN' ? 2.6 : 1.9);

    const flightTime = Math.abs((PHYSICS_CONSTANTS.PLAYER_Z_MAX * 0.6) / launchZ);
    const launchX = (targetCornerX - ballPos.x) / flightTime;

    this.ball.physics.velocity.set(launchX, launchY, launchZ);

    const spinVector = new THREE.Vector3();
    if (spinType === 'TOPSPIN') {
      spinVector.x = isSmash ? -40 : -60; // Topspin when moving +Z pulls down towards player table
    } else if (spinType === 'BACKSPIN') {
      spinVector.x = 40;
    }
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
      new THREE.Vector3(-0.15, 0.88, -1.55),
      new THREE.Vector3(0, 1.6, 0),
      new THREE.Vector3(0, 0, 0)
    );

    setTimeout(() => {
      this.paddle.swing(true, 'TOPSPIN', 1.0);
      // Serve bounces on CPU side first (Z ~ -0.95), clears net, bounces on Player side (Z ~ 0.85)
      this.ball.physics.velocity.set(-0.1, -1.0, 5.5);
      this.ball.physics.spin.set(-25, 0, 0);

      this.eventBus.emit('ball:hit', {
        hitter: 'CPU',
        rating: 'GOOD',
        speed: 5.6,
        spin: 'TOPSPIN',
        isSmash: false,
        contactPoint: this.ball.physics.position.clone()
      });
    }, 160);
  }
}
