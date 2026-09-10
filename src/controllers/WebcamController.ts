import { SpinType } from '../types';

export interface WebcamMotionCallbacks {
  onMotionPosition: (normX: number, normY: number) => void;
  onSwipeStrike: (spin: SpinType, power: number, isSmash: boolean, angleBias: number) => void;
  onError: (errorMessage: string) => void;
  onStatusChange: (status: 'starting' | 'active' | 'inactive' | 'error') => void;
}

export class WebcamController {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private processCanvas: HTMLCanvasElement;
  private processCtx: CanvasRenderingContext2D;

  private overlayCanvas: HTMLCanvasElement | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;

  private prevFrameData: Uint8ClampedArray | null = null;
  private width: number = 120;
  private height: number = 90;

  private isRunning: boolean = false;
  private animFrameId: number | null = null;

  // Motion tracking smoothing
  private prevCenterX: number = 0.5;
  private prevCenterY: number = 0.5;
  private smoothNormX: number = 0;
  private lastStrikeTime: number = 0;
  private readonly STRIKE_COOLDOWN_MS: number = 240;

  private callbacks: WebcamMotionCallbacks;

  constructor(callbacks: WebcamMotionCallbacks) {
    this.callbacks = callbacks;
    this.processCanvas = document.createElement('canvas');
    this.processCanvas.width = this.width;
    this.processCanvas.height = this.height;
    this.processCtx = this.processCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  public setOverlayCanvas(canvas: HTMLCanvasElement): void {
    this.overlayCanvas = canvas;
    this.overlayCtx = canvas.getContext('2d')!;
  }

  public async start(): Promise<boolean> {
    if (this.isRunning) return true;

    try {
      this.callbacks.onStatusChange('starting');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam access not supported in this browser.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: 'user'
        },
        audio: false
      });

      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.muted = true;

      await new Promise<void>((resolve) => {
        if (!this.video) return;
        this.video.onloadedmetadata = () => {
          this.video!.play();
          resolve();
        };
      });

      this.isRunning = true;
      this.callbacks.onStatusChange('active');
      this.processLoop();
      return true;
    } catch (err: unknown) {
      console.warn('Webcam initialization failed:', err);
      const errMsg = err instanceof Error ? err.message : 'Could not access webcam';
      this.callbacks.onStatusChange('error');
      this.callbacks.onError(errMsg);
      this.stop();
      return false;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.prevFrameData = null;
    this.callbacks.onStatusChange('inactive');

    // Clear overlay
    if (this.overlayCtx && this.overlayCanvas) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  public getVideoStream(): MediaStream | null {
    return this.stream;
  }

  private processLoop(): void {
    if (!this.isRunning || !this.video) return;

    if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
      this.analyzeFrame();
    }

    this.animFrameId = requestAnimationFrame(() => this.processLoop());
  }

  private analyzeFrame(): void {
    if (!this.video) return;

    // Draw current video frame to processing canvas
    this.processCtx.drawImage(this.video, 0, 0, this.width, this.height);
    const frame = this.processCtx.getImageData(0, 0, this.width, this.height);
    const data = frame.data;

    if (!this.prevFrameData) {
      this.prevFrameData = new Uint8ClampedArray(data.length);
      this.prevFrameData.set(data);
      return;
    }

    let motionCount = 0;
    let sumX = 0;
    let sumY = 0;

    const diffThreshold = 28; // Noise threshold
    const step = 2; // Check every 2nd pixel for blazing 60fps performance

    for (let y = 0; y < this.height; y += step) {
      for (let x = 0; x < this.width; x += step) {
        const idx = (y * this.width + x) * 4;

        // Grayscale delta
        const l1 = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) >> 10;
        const l0 = (this.prevFrameData[idx] * 299 + this.prevFrameData[idx + 1] * 587 + this.prevFrameData[idx + 2] * 114) >> 10;

        const diff = Math.abs(l1 - l0);

        if (diff > diffThreshold) {
          motionCount++;
          sumX += x;
          sumY += y;
        }
      }
    }

    // Copy to prevFrameData
    this.prevFrameData.set(data);

    // Minimum motion pixels to trigger tracking
    if (motionCount > 18) {
      // Center of motion
      const rawCenterX = sumX / motionCount / this.width;
      const rawCenterY = sumY / motionCount / this.height;

      // Note: Video is mirrored so user's right hand corresponds to screen right!
      // In mirrored mode, screenX = 1.0 - rawCenterX
      const mirroredX = 1.0 - rawCenterX;
      const targetNormX = (mirroredX - 0.5) * 2.2; // Scale to [-1.1, 1.1]

      // Velocity between frames
      const vx = mirroredX - this.prevCenterX;
      const vy = rawCenterY - this.prevCenterY; // vy negative = hand moved UP

      this.prevCenterX = mirroredX;
      this.prevCenterY = rawCenterY;

      // Smooth position output
      this.smoothNormX += (targetNormX - this.smoothNormX) * 0.45;
      this.callbacks.onMotionPosition(this.smoothNormX, rawCenterY);

      // Render debug overlay
      this.drawOverlay(mirroredX, rawCenterY, vx, vy, motionCount);

      // Check for swipe strike
      const speed = Math.hypot(vx, vy);
      const now = performance.now();

      // Swipe trigger threshold
      if (speed > 0.075 && (now - this.lastStrikeTime) > this.STRIKE_COOLDOWN_MS) {
        this.lastStrikeTime = now;
        this.handleMotionSwipe(vx, vy, speed);
      }
    } else {
      if (this.overlayCtx && this.overlayCanvas) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      }
    }
  }

  private handleMotionSwipe(vx: number, vy: number, speed: number): void {
    let spin: SpinType = 'TOPSPIN';
    let isSmash = false;
    const power = Math.min(Math.max(speed * 12, 1.0), 1.8);
    let angleBias = vx * 2.5; // Horizontal swipe creates cross-court angle

    // Vertical swipe direction
    // vy < -0.04 -> Swiped hand UPWARDS -> Topspin dive
    // vy > 0.04 -> Swiped hand DOWNWARDS -> Backspin slice or smash
    if (vy < -0.035) {
      spin = 'TOPSPIN';
    } else if (vy > 0.05) {
      spin = 'BACKSPIN';
      if (speed > 0.14) {
        isSmash = true;
      }
    } else {
      spin = 'NONE';
    }

    this.callbacks.onSwipeStrike(spin, power, isSmash, angleBias);
  }

  private drawOverlay(x: number, y: number, vx: number, vy: number, motionCount: number): void {
    if (!this.overlayCtx || !this.overlayCanvas) return;

    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    this.overlayCtx.clearRect(0, 0, w, h);

    const px = x * w;
    const py = y * h;

    // Center tracking reticle
    this.overlayCtx.strokeStyle = '#00d2ff';
    this.overlayCtx.lineWidth = 3;
    this.overlayCtx.beginPath();
    this.overlayCtx.arc(px, py, 14, 0, Math.PI * 2);
    this.overlayCtx.stroke();

    // Inner glowing dot
    this.overlayCtx.fillStyle = motionCount > 40 ? '#ffcc00' : '#00ff88';
    this.overlayCtx.beginPath();
    this.overlayCtx.arc(px, py, 5, 0, Math.PI * 2);
    this.overlayCtx.fill();

    // Swipe velocity vector arrow
    const speed = Math.hypot(vx, vy);
    if (speed > 0.02) {
      this.overlayCtx.strokeStyle = speed > 0.075 ? '#ff3b30' : '#ffcc00';
      this.overlayCtx.lineWidth = 4;
      this.overlayCtx.beginPath();
      this.overlayCtx.moveTo(px, py);
      this.overlayCtx.lineTo(px + vx * w * 3, py + vy * h * 3);
      this.overlayCtx.stroke();
    }
  }
}
