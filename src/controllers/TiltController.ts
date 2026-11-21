/**
 * Phone/tablet tilt ("gyro") input.
 *
 * Reads DeviceOrientationEvent (beta/gamma) and converts it to the gravity vector in device space, then
 * projects that onto the *screen's* horizontal axis. That gives one "how far is the right edge of the
 * screen tipped down" value that works the same in portrait and landscape, whether the phone is held flat
 * or upright like a steering wheel, and is consistent between iOS and Android (unlike raw accelerometer
 * signs).
 *
 * The neutral position is re-measured with calibrate(), so players can hold the device at any comfortable
 * angle. Optional flick detection (fast wrist rotation) is exposed via onFlick.
 */

type PermissionResult = 'granted' | 'denied' | 'default';

interface IOSDeviceOrientationEvent {
  requestPermission?: () => Promise<PermissionResult>;
}

export type TiltEnableResult = 'ok' | 'denied' | 'unsupported';

const DEG = Math.PI / 180;
/** Tilt (as sin of the angle) that maps to full deflection at sensitivity 1.0, roughly 24 degrees. */
const FULL_TILT = 0.4;
/** Ignore tiny wobbles around neutral. */
const DEADZONE = 0.04;
/** Rotation speed (deg/s) that counts as a deliberate flick of the phone. */
const FLICK_RATE = 360;
const FLICK_COOLDOWN_MS = 450;

export class TiltController {
  public isEnabled: boolean = false;
  public sensitivity: number = 1.0;
  public onFlick: (() => void) | null = null;

  private raw: number = 0;          // screen-horizontal gravity component, -1..1
  private smoothed: number = 0;
  private neutral: number = 0;
  private hasReading: boolean = false;
  private needsCalibration: boolean = true;
  private lastFlickTime: number = 0;

  private readonly onOrientation = (e: DeviceOrientationEvent) => this.handleOrientation(e);
  private readonly onMotion = (e: DeviceMotionEvent) => this.handleMotion(e);
  private readonly onScreenRotate = () => { this.needsCalibration = true; };

  /** True when the browser exposes orientation events and the device is touch-first. */
  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /**
   * Must be called from a user gesture (tap) so iOS can show its motion-permission prompt.
   * Resolves 'unsupported' if no sensor data arrives (desktop browsers expose the API without a sensor).
   */
  public async enable(): Promise<TiltEnableResult> {
    if (!TiltController.isSupported()) return 'unsupported';
    if (this.isEnabled) return 'ok';

    // iOS asks the player; some other browsers expose the same function but answer without asking.
    // Either way, actual sensor readings are what count (checked below).
    let permissionRefused = false;
    const ctor = window.DeviceOrientationEvent as unknown as IOSDeviceOrientationEvent;
    if (typeof ctor.requestPermission === 'function') {
      try {
        permissionRefused = (await ctor.requestPermission()) !== 'granted';
      } catch {
        permissionRefused = true;
      }
      // Motion (for flicks) uses a separate permission on iOS; ignore if it's refused.
      const motionCtor = window.DeviceMotionEvent as unknown as IOSDeviceOrientationEvent | undefined;
      if (motionCtor && typeof motionCtor.requestPermission === 'function') {
        try { await motionCtor.requestPermission(); } catch { /* flicks just won't fire */ }
      }
    }

    this.hasReading = false;
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('devicemotion', this.onMotion);
    window.addEventListener('orientationchange', this.onScreenRotate);
    screen.orientation?.addEventListener?.('change', this.onScreenRotate);

    // Wait briefly for a real reading; laptops often expose the event but never fire it.
    const gotData = await new Promise<boolean>((resolve) => {
      if (this.hasReading) { resolve(true); return; }
      const started = performance.now();
      const check = () => {
        if (this.hasReading) resolve(true);
        else if (performance.now() - started > 1500) resolve(false);
        else window.setTimeout(check, 50);
      };
      check();
    });

    if (!gotData) {
      this.removeListeners();
      return permissionRefused ? 'denied' : 'unsupported';
    }

    this.isEnabled = true;
    this.needsCalibration = true;
    return 'ok';
  }

  public disable(): void {
    this.isEnabled = false;
    this.removeListeners();
    this.smoothed = 0;
  }

  /** Treat the current holding angle as "level". */
  public calibrate(): void {
    if (this.hasReading) {
      this.neutral = this.smoothed;
      this.needsCalibration = false;
    } else {
      this.needsCalibration = true;
    }
  }

  /** Lateral input in [-1, 1]; positive = right edge of the screen tipped down. */
  public get value(): number {
    if (!this.isEnabled) return 0;
    let v = this.smoothed - this.neutral;
    if (Math.abs(v) < DEADZONE) return 0;
    v -= Math.sign(v) * DEADZONE;
    return Math.max(-1, Math.min(1, (v / (FULL_TILT - DEADZONE)) * this.sensitivity));
  }

  private removeListeners(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    window.removeEventListener('orientationchange', this.onScreenRotate);
    screen.orientation?.removeEventListener?.('change', this.onScreenRotate);
  }

  private screenAngle(): number {
    const a = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
    return ((a % 360) + 360) % 360;
  }

  private handleOrientation(e: DeviceOrientationEvent): void {
    if (e.beta === null || e.gamma === null) return;
    const beta = e.beta * DEG;
    const gamma = e.gamma * DEG;

    // Gravity direction in device coordinates (W3C Z-X'-Y'' Euler angles)
    const gx = Math.cos(beta) * Math.sin(gamma);
    const gy = -Math.sin(beta);

    // Project onto the screen's horizontal axis for the current screen rotation
    const angle = this.screenAngle();
    let sx: number;
    if (angle === 90) sx = -gy;
    else if (angle === 180) sx = -gx;
    else if (angle === 270) sx = gy;
    else sx = gx;

    this.raw = Math.max(-1, Math.min(1, sx));
    if (!this.hasReading) {
      this.smoothed = this.raw;
      this.hasReading = true;
    } else {
      // Light low-pass filter: removes sensor jitter without adding noticeable lag
      this.smoothed += (this.raw - this.smoothed) * 0.35;
    }

    if (this.needsCalibration) this.calibrate();
  }

  private handleMotion(e: DeviceMotionEvent): void {
    if (!this.isEnabled || !this.onFlick) return;
    const r = e.rotationRate;
    if (!r) return;
    const rate = Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0);
    const now = performance.now();
    if (rate > FLICK_RATE && now - this.lastFlickTime > FLICK_COOLDOWN_MS) {
      this.lastFlickTime = now;
      this.onFlick();
    }
  }
}
