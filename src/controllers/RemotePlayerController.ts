import * as THREE from 'three';
import { Paddle } from '../entities/Paddle';
import { PADDLE_SPECS } from '../physics/Constants';
import { PaddleMoveMessage } from '../network/NetworkProtocol';

export class RemotePlayerController {
  public paddle: Paddle;
  private targetPosition: THREE.Vector3;

  constructor(paddle: Paddle) {
    this.paddle = paddle;
    this.targetPosition = new THREE.Vector3(
      PADDLE_SPECS.CPU_DEFAULT_POS.x,
      PADDLE_SPECS.CPU_DEFAULT_POS.y,
      PADDLE_SPECS.CPU_DEFAULT_POS.z
    );
  }

  public update(dt: number): void {
    // Smoothly lerp paddle position to absorb network packet jitter
    this.paddle.position.lerp(this.targetPosition, Math.min(dt * 24.0, 1.0));
    this.paddle.update(dt);
  }

  public onRemotePaddleMove(msg: PaddleMoveMessage): void {
    // Invert X and Z coordinates for opposite court view
    const invertedX = -msg.x;
    const invertedZ = -msg.z;
    const clampedY = THREE.MathUtils.clamp(msg.y, PADDLE_SPECS.MIN_Y, PADDLE_SPECS.MAX_Y);

    this.targetPosition.set(invertedX, clampedY, invertedZ);

    if (msg.isSwinging) {
      this.paddle.swing(msg.isForehand, 'TOPSPIN', 1.0);
    }
  }

  public resetPosition(): void {
    this.targetPosition.set(
      PADDLE_SPECS.CPU_DEFAULT_POS.x,
      PADDLE_SPECS.CPU_DEFAULT_POS.y,
      PADDLE_SPECS.CPU_DEFAULT_POS.z
    );
    this.paddle.position.copy(this.targetPosition);
  }
}
