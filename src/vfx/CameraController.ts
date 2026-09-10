import * as THREE from 'three';

export class CameraController {
  public camera: THREE.PerspectiveCamera;
  
  // Base configuration
  private basePosition = new THREE.Vector3(0, 1.48, 2.75);
  private baseLookAt = new THREE.Vector3(0, 0.82, -0.35);
  private currentLookAt = new THREE.Vector3(0, 0.82, -0.35);

  // Dynamic tracking
  private targetOffset = new THREE.Vector3();
  private shakeOffset = new THREE.Vector3();
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;

  // FOV punch & responsive FOV
  private defaultFov: number = 55;
  private currentFov: number = 55;
  private targetFov: number = 55;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.defaultFov, aspect, 0.1, 100);
    this.setAspect(aspect);
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(this.baseLookAt);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;

    if (aspect < 1.0) {
      // Portrait mode (phones / tablets in vertical orientation):
      // On narrow aspect (e.g. 9/16 = 0.5625), horizontal FOV would drop drastically if vFOV remained 55 deg.
      // We scale defaultFov up and place the camera slightly higher and further back
      // so the full table width (1.525m) and sidelines stay comfortably framed.
      const aspectFactor = Math.min(1.75, Math.max(1.0, 0.86 / aspect));
      this.defaultFov = Math.round(52 * aspectFactor);
      this.basePosition.set(0, 1.76, 3.15);
      this.baseLookAt.set(0, 0.78, -0.22);
    } else {
      // Landscape mode (desktop / wide orientation):
      this.defaultFov = 55;
      this.basePosition.set(0, 1.48, 2.75);
      this.baseLookAt.set(0, 0.82, -0.35);
    }

    this.targetFov = this.defaultFov;
    this.currentFov = this.defaultFov;
    this.camera.fov = this.defaultFov;
    this.camera.updateProjectionMatrix();
  }

  public triggerShake(intensity: number = 0.05, duration: number = 0.25): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  public triggerFovPunch(punchFov: number = 48): void {
    this.targetFov = punchFov;
  }

  public update(dt: number, ballPos: THREE.Vector3, playerPos: THREE.Vector3): void {
    // 1. Dynamic subtle camera sway tracking the rally
    const isPortrait = this.camera.aspect < 1.0;
    const swayFactorX = isPortrait ? 0.15 : 0.25;
    const targetX = playerPos.x * swayFactorX + ballPos.x * (swayFactorX * 0.6);
    const targetY = this.basePosition.y + (ballPos.y - 0.9) * 0.08;
    this.targetOffset.set(targetX, targetY, this.basePosition.z);

    this.camera.position.lerp(this.targetOffset, Math.min(dt * 4.5, 1.0));

    // Dynamic LookAt (tracks table center with slight ball bias)
    const desiredLookAt = new THREE.Vector3(
      ballPos.x * (isPortrait ? 0.12 : 0.2),
      this.baseLookAt.y + (ballPos.y - 0.85) * 0.1,
      this.baseLookAt.z + ballPos.z * 0.08
    );
    this.currentLookAt.lerp(desiredLookAt, Math.min(dt * 5.0, 1.0));

    // 2. Shake decay & application
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      const decay = Math.max(0, this.shakeDuration / 0.25);
      const amp = this.shakeIntensity * decay;
      this.shakeOffset.set(
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp * 0.5
      );
      this.camera.position.add(this.shakeOffset);
      if (this.shakeDuration <= 0) {
        this.shakeIntensity = 0;
      }
    }

    this.camera.lookAt(this.currentLookAt);

    // 3. FOV Punch recovery
    this.targetFov = THREE.MathUtils.lerp(this.targetFov, this.defaultFov, Math.min(dt * 6.0, 1.0));
    this.currentFov = THREE.MathUtils.lerp(this.currentFov, this.targetFov, Math.min(dt * 10.0, 1.0));
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }
  }
}
