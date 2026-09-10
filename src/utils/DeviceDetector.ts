import { DeviceInfo } from '../types';
import { EventBus } from '../core/EventBus';

export class DeviceDetector {
  private static instance: DeviceDetector;
  private eventBus: EventBus;
  public info: DeviceInfo;

  private constructor() {
    this.eventBus = EventBus.get();
    this.info = this.detect();
    this.applyClasses();
    this.setupListeners();
  }

  public static get(): DeviceDetector {
    if (!DeviceDetector.instance) {
      DeviceDetector.instance = new DeviceDetector();
    }
    return DeviceDetector.instance;
  }

  private detect(): DeviceInfo {
    const ua = navigator.userAgent || '';
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspectRatio = width / (height || 1);
    const isPortrait = height >= width;

    const isMobileUa = /Android|iPhone|iPod|Windows Phone|webOS|BlackBerry/i.test(ua);
    const isTabletUa = /iPad|tablet|(android(?!.*mobile))/i.test(ua);

    const isMobile = isMobileUa || (isTouch && width < 768);
    const isTablet = !isMobile && (isTabletUa || (isTouch && width >= 768 && width <= 1024));

    return {
      isMobile,
      isTablet,
      isTouchDevice: isTouch,
      isPortrait,
      aspectRatio,
      orientation: isPortrait ? 'portrait' : 'landscape',
      screenWidth: width,
      screenHeight: height
    };
  }

  public update(): DeviceInfo {
    const prevPortrait = this.info.isPortrait;
    this.info = this.detect();
    this.applyClasses();

    this.eventBus.emit('device:resize', this.info);
    if (prevPortrait !== this.info.isPortrait) {
      this.eventBus.emit('device:orientation', {
        orientation: this.info.orientation,
        isPortrait: this.info.isPortrait
      });
    }

    return this.info;
  }

  private applyClasses(): void {
    const root = document.documentElement;
    root.classList.toggle('is-mobile', this.info.isMobile);
    root.classList.toggle('is-tablet', this.info.isTablet);
    root.classList.toggle('is-desktop', !this.info.isMobile && !this.info.isTablet);
    root.classList.toggle('is-touch', this.info.isTouchDevice);
    root.classList.toggle('is-portrait', this.info.isPortrait);
    root.classList.toggle('is-landscape', !this.info.isPortrait);
  }

  private setupListeners(): void {
    let resizeTimer: number | null = null;
    window.addEventListener('resize', () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        this.update();
      }, 60);
    });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.update(), 120);
    });

    if (screen && screen.orientation) {
      screen.orientation.addEventListener('change', () => {
        setTimeout(() => this.update(), 120);
      });
    }
  }
}
