export class SoundEngine {
  private static instance: SoundEngine;
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  private constructor() {}

  public static get(): SoundEngine {
    if (!SoundEngine.instance) {
      SoundEngine.instance = new SoundEngine();
    }
    return SoundEngine.instance;
  }

  public init(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Crisp, woody paddle hit impulse ("pock").
   */
  public playPaddleHit(power: number = 1.0, isSmash: boolean = false): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Transient click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = isSmash ? 520 : 420;
    osc.type = isSmash ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq * (0.9 + power * 0.25), now);
    osc.frequency.exponentialRampToValueAtTime(140, now + (isSmash ? 0.08 : 0.05));

    const vol = Math.min(Math.max(power * 0.4, 0.2), 0.7);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isSmash ? 0.12 : 0.07));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    // 2. Woody resonance body
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(260, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(90, now + 0.09);

    bodyGain.gain.setValueAtTime(vol * 0.6, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.ctx.destination);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.12);
  }

  /**
   * Hollow celluloid ping ("tok") on table bounce.
   */
  public playTableBounce(speed: number = 10): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Celluloid resonance around 950Hz - 1150Hz
    const pitch = 980 + Math.random() * 80;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);

    const speedNorm = Math.min(speed / 15, 1.2);
    const vol = Math.min(speedNorm * 0.35, 0.5);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  /**
   * Damped rattle for net cord hits.
   */
  public playNetClip(): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Aerodynamic swing swoosh.
   */
  public playSwoosh(speed: number = 1.0): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(1400 * speed, now + 0.08);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.15);
    filter.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.16);
  }

  /**
   * Dual-tone umpire whistle.
   */
  public playWhistle(): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    [2650, 3100].forEach(freq => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.setValueAtTime(0.15, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  /**
   * Crowd cheering & applause on point scored.
   */
  public playCheer(): void {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = 1.4;

    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.linearRampToValueAtTime(1600, now + 0.3);
    filter.frequency.exponentialRampToValueAtTime(500, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Triumphant chime arpeggio on game victory.
   */
  public playVictoryJingle(): void {
    if (this.isMuted || !this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      const time = now + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + 0.55);
    });
  }
}
