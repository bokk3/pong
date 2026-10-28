import * as THREE from 'three';
import { Paddle } from '../entities/Paddle';
import { PADDLE_SPECS } from '../physics/Constants';
import { PaddleMoveMessage } from '../network/NetworkProtocol';

export class RemotePlayerController {
  public paddle: Paddle;

  constructor(paddle: Paddle) {
    this.paddle = paddle;
    this.resetPosition();
  }

  public update(dt: number): void {
    // Let paddle smoothly track its target position with its snappy follow speed
    this.paddle.update(dt);
  }

  public onRemotePaddleMove(msg: PaddleMoveMessage): void {
    // Invert X and Z coordinates for opposite court view
    const invertedX = -msg.x;
    const invertedZ = -msg.z;
    const clampedY = THREE.MathUtils.clamp(msg.y, PADDLE_SPECS.MIN_Y, PADDLE_SPECS.MAX_Y);

    this.paddle.targetPosition.set(invertedX, clampedY, invertedZ);

    if (msg.isSwinging) {
      this.paddle.swing(msg.isForehand, 'TOPSPIN', 1.0);
    }
  }

  public resetPosition(): void {
    this.paddle.targetPosition.set(
      PADDLE_SPECS.CPU_DEFAULT_POS.x,
      PADDLE_SPECS.CPU_DEFAULT_POS.y,
      PADDLE_SPECS.CPU_DEFAULT_POS.z
    );
    this.paddle.position.copy(this.paddle.targetPosition);
  }
}
