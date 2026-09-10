import { Difficulty, MatchScore, PlayerId, ShotInfo } from '../types';
import { EventBus } from '../core/EventBus';

export class HUD {
  private eventBus: EventBus;

  // DOM Elements - Scoreboard
  private playerScoreEl: HTMLElement;
  private cpuScoreEl: HTMLElement;
  private playerCardEl: HTMLElement;
  private cpuCardEl: HTMLElement;
  private cpuNameEl: HTMLElement;
  private rallyCounterEl: HTMLElement;
  private matchInfoEl: HTMLElement;
  private feedbackBannerEl: HTMLElement;
  private calloutBannerEl: HTMLElement;
  private servePromptEl: HTMLElement;

  // Settings & Webcam DOM Elements
  private sensitivitySliderEl: HTMLInputElement;
  private menuSensitivitySliderEl: HTMLInputElement;
  private sensValEl: HTMLElement;
  private menuSensValEl: HTMLElement;
  private webcamToggleBtn: HTMLElement;
  private menuWebcamToggleBtn: HTMLElement;
  private webcamCloseBtn: HTMLElement;
  private webcamPipEl: HTMLElement;
  private webcamStatusBadgeEl: HTMLElement;
  private webcamVideoEl: HTMLVideoElement;
  private webcamOverlayCanvas: HTMLCanvasElement;

  // Menu Overlays
  private mainMenuEl: HTMLElement;
  private pauseMenuEl: HTMLElement;
  private gameOverEl: HTMLElement;
  private startBtn: HTMLElement;
  private resumeBtn: HTMLElement;
  private pauseRestartBtn: HTMLElement;
  private pauseMenuBtn: HTMLElement;
  private rematchBtn: HTMLElement;
  private menuBtn: HTMLElement;

  // Stats DOM
  private statFinalScoreEl: HTMLElement;
  private statLongestRallyEl: HTMLElement;
  private statSmashWinnersEl: HTMLElement;
  private statAccuracyEl: HTMLElement;
  private resultTitleEl: HTMLElement;
  private resultSubtitleEl: HTMLElement;

  private selectedDifficulty: Difficulty = 'pro';
  private feedbackTimeout: number | null = null;
  private calloutTimeout: number | null = null;

  // Callbacks
  public onStartMatch: ((diff: Difficulty) => void) | null = null;
  public onResume: (() => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onReturnToMenu: (() => void) | null = null;
  public onSensitivityChange: ((val: number) => void) | null = null;
  public onToggleWebcam: (() => void) | null = null;

  constructor() {
    this.eventBus = EventBus.get();

    this.playerScoreEl = document.getElementById('player-score')!;
    this.cpuScoreEl = document.getElementById('cpu-score')!;
    this.playerCardEl = document.getElementById('player-score-card')!;
    this.cpuCardEl = document.getElementById('cpu-score-card')!;
    this.cpuNameEl = document.getElementById('cpu-name')!;
    this.rallyCounterEl = document.getElementById('rally-counter')!;
    this.matchInfoEl = document.getElementById('match-info')!;
    this.feedbackBannerEl = document.getElementById('feedback-banner')!;
    this.calloutBannerEl = document.getElementById('callout-banner')!;
    this.servePromptEl = document.getElementById('serve-prompt')!;

    // Settings & Webcam
    this.sensitivitySliderEl = document.getElementById('sensitivity-slider') as HTMLInputElement;
    this.menuSensitivitySliderEl = document.getElementById('menu-sensitivity-slider') as HTMLInputElement;
    this.sensValEl = document.getElementById('sens-val')!;
    this.menuSensValEl = document.getElementById('menu-sens-val')!;
    this.webcamToggleBtn = document.getElementById('webcam-toggle-btn')!;
    this.menuWebcamToggleBtn = document.getElementById('menu-webcam-toggle-btn')!;
    this.webcamCloseBtn = document.getElementById('webcam-close-btn')!;
    this.webcamPipEl = document.getElementById('webcam-pip')!;
    this.webcamStatusBadgeEl = document.getElementById('webcam-status-badge')!;
    this.webcamVideoEl = document.getElementById('webcam-video') as HTMLVideoElement;
    this.webcamOverlayCanvas = document.getElementById('webcam-overlay') as HTMLCanvasElement;

    this.mainMenuEl = document.getElementById('main-menu')!;
    this.pauseMenuEl = document.getElementById('pause-menu')!;
    this.gameOverEl = document.getElementById('game-over-screen')!;
    this.startBtn = document.getElementById('start-btn')!;
    this.resumeBtn = document.getElementById('resume-btn')!;
    this.pauseRestartBtn = document.getElementById('pause-restart-btn')!;
    this.pauseMenuBtn = document.getElementById('pause-menu-btn')!;
    this.rematchBtn = document.getElementById('rematch-btn')!;
    this.menuBtn = document.getElementById('menu-btn')!;

    this.statFinalScoreEl = document.getElementById('stat-final-score')!;
    this.statLongestRallyEl = document.getElementById('stat-longest-rally')!;
    this.statSmashWinnersEl = document.getElementById('stat-smash-winners')!;
    this.statAccuracyEl = document.getElementById('stat-perfect-timing')!;
    this.resultTitleEl = document.getElementById('match-result-title')!;
    this.resultSubtitleEl = document.getElementById('match-result-subtitle')!;

    this.setupUIEvents();
    this.setupGameListeners();
  }

  private setupUIEvents(): void {
    // Difficulty selector buttons
    const diffButtons = document.querySelectorAll<HTMLButtonElement>('.diff-btn');
    diffButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        diffButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDifficulty = btn.dataset.diff as Difficulty;
        this.cpuNameEl.textContent = `CPU (${this.selectedDifficulty.toUpperCase()})`;
      });
    });

    // Sensitivity Slider Synchronization
    const handleSensInput = (val: number) => {
      const formatted = `${val.toFixed(1)}x`;
      this.sensValEl.textContent = formatted;
      this.menuSensValEl.textContent = formatted;
      this.sensitivitySliderEl.value = String(val);
      this.menuSensitivitySliderEl.value = String(val);
      if (this.onSensitivityChange) {
        this.onSensitivityChange(val);
      }
    };

    this.sensitivitySliderEl.addEventListener('input', (e) => {
      handleSensInput(parseFloat((e.target as HTMLInputElement).value));
    });

    this.menuSensitivitySliderEl.addEventListener('input', (e) => {
      handleSensInput(parseFloat((e.target as HTMLInputElement).value));
    });

    // Webcam toggle triggers
    const triggerWebcam = () => {
      if (this.onToggleWebcam) {
        this.onToggleWebcam();
      }
    };

    this.webcamToggleBtn.addEventListener('click', triggerWebcam);
    this.menuWebcamToggleBtn.addEventListener('click', triggerWebcam);
    this.webcamCloseBtn.addEventListener('click', triggerWebcam);

    this.startBtn.addEventListener('click', () => {
      this.hideMainMenu();
      if (this.onStartMatch) this.onStartMatch(this.selectedDifficulty);
    });

    this.resumeBtn.addEventListener('click', () => {
      this.showPauseMenu(false);
      if (this.onResume) this.onResume();
    });

    this.pauseRestartBtn.addEventListener('click', () => {
      this.showPauseMenu(false);
      if (this.onRematch) this.onRematch();
    });

    this.pauseMenuBtn.addEventListener('click', () => {
      this.showPauseMenu(false);
      this.showMainMenu();
      if (this.onReturnToMenu) this.onReturnToMenu();
    });

    this.rematchBtn.addEventListener('click', () => {
      this.hideGameOver();
      if (this.onRematch) this.onRematch();
    });

    this.menuBtn.addEventListener('click', () => {
      this.hideGameOver();
      this.showMainMenu();
      if (this.onReturnToMenu) this.onReturnToMenu();
    });
  }

  private setupGameListeners(): void {
    this.eventBus.on('score:updated', (score) => {
      this.updateScore(score);
    });

    this.eventBus.on('ball:hit', (shot) => {
      if (shot.hitter === 'PLAYER') {
        this.showShotFeedback(shot);
      }
    });

    this.eventBus.on('match:over', ({ winner, score }) => {
      this.showGameOver(winner, score);
    });
  }

  public setWebcamActive(active: boolean): void {
    if (active) {
      this.webcamPipEl.classList.add('active');
      this.webcamToggleBtn.classList.add('active');
      this.menuWebcamToggleBtn.classList.add('active');
    } else {
      this.webcamPipEl.classList.remove('active');
      this.webcamToggleBtn.classList.remove('active');
      this.menuWebcamToggleBtn.classList.remove('active');
    }
  }

  public setWebcamStatus(statusText: string, isError: boolean = false): void {
    this.webcamStatusBadgeEl.textContent = statusText;
    if (isError) {
      this.webcamStatusBadgeEl.classList.add('error');
    } else {
      this.webcamStatusBadgeEl.classList.remove('error');
    }
  }

  public getWebcamElements(): { video: HTMLVideoElement; overlay: HTMLCanvasElement } {
    return {
      video: this.webcamVideoEl,
      overlay: this.webcamOverlayCanvas
    };
  }

  public showMainMenu(): void {
    this.mainMenuEl.classList.add('active');
    this.servePromptEl.classList.remove('active');
  }

  public hideMainMenu(): void {
    this.mainMenuEl.classList.remove('active');
  }

  public showPauseMenu(show: boolean): void {
    if (show) {
      this.pauseMenuEl.classList.add('active');
    } else {
      this.pauseMenuEl.classList.remove('active');
    }
  }

  public isPauseMenuOpen(): boolean {
    return this.pauseMenuEl.classList.contains('active');
  }

  public showServePrompt(show: boolean): void {
    if (show) {
      this.servePromptEl.classList.add('active');
    } else {
      this.servePromptEl.classList.remove('active');
    }
  }

  public updateScore(score: MatchScore): void {
    if (this.playerScoreEl.textContent !== String(score.player)) {
      this.playerScoreEl.textContent = String(score.player);
      this.triggerBump(this.playerScoreEl);
    }
    if (this.cpuScoreEl.textContent !== String(score.cpu)) {
      this.cpuScoreEl.textContent = String(score.cpu);
      this.triggerBump(this.cpuScoreEl);
    }

    if (score.server === 'PLAYER') {
      this.playerCardEl.classList.add('serving');
      this.cpuCardEl.classList.remove('serving');
    } else {
      this.cpuCardEl.classList.add('serving');
      this.playerCardEl.classList.remove('serving');
    }

    this.rallyCounterEl.textContent = `RALLY: ${score.rallyCount}`;

    if (score.player >= 10 && score.cpu >= 10) {
      this.matchInfoEl.textContent = 'DEUCE (WIN BY 2)';
    } else if (score.player >= 10 || score.cpu >= 10) {
      this.matchInfoEl.textContent = 'MATCH POINT';
    } else {
      this.matchInfoEl.textContent = 'FIRST TO 11';
    }
  }

  private triggerBump(el: HTMLElement): void {
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 220);
  }

  public showShotFeedback(shot: ShotInfo): void {
    if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);

    let text = '';
    let cls = '';

    switch (shot.rating) {
      case 'ACE':
        text = '⚡ ACE!';
        cls = 'feedback-perfect';
        break;
      case 'SMASH':
        text = '💥 SMASH!';
        cls = 'feedback-smash';
        break;
      case 'PERFECT':
        text = '★ PERFECT!';
        cls = 'feedback-perfect';
        break;
      case 'GOOD':
        text = 'NICE SHOT!';
        cls = 'feedback-good';
        break;
      case 'EARLY':
        text = 'EARLY (CROSS)';
        cls = 'feedback-early';
        break;
      case 'LATE':
        text = 'LATE (LINE)';
        cls = 'feedback-late';
        break;
    }

    this.feedbackBannerEl.textContent = text;
    this.feedbackBannerEl.className = `feedback-banner show ${cls}`;

    this.feedbackTimeout = window.setTimeout(() => {
      this.feedbackBannerEl.classList.remove('show');
    }, 700);
  }

  public showCallout(text: string, duration: number = 1200): void {
    if (this.calloutTimeout) clearTimeout(this.calloutTimeout);

    this.calloutBannerEl.textContent = text;
    this.calloutBannerEl.classList.add('show');

    this.calloutTimeout = window.setTimeout(() => {
      this.calloutBannerEl.classList.remove('show');
    }, duration);
  }

  public showGameOver(winner: PlayerId, score: MatchScore): void {
    const isPlayerWin = winner === 'PLAYER';
    this.resultTitleEl.textContent = isPlayerWin ? 'VICTORY!' : 'DEFEAT';
    this.resultTitleEl.className = `result-title ${isPlayerWin ? 'victory' : 'defeat'}`;
    this.resultSubtitleEl.textContent = isPlayerWin
      ? 'Spectacular match! You dominated the table!'
      : 'Tough match! Hone your timing and challenge again!';

    this.statFinalScoreEl.textContent = `${score.player} - ${score.cpu}`;
    this.statLongestRallyEl.textContent = String(score.longestRally);
    this.statSmashWinnersEl.textContent = String(score.smashWinners);

    const accuracy = score.totalPlayerShots > 0
      ? Math.round((score.goodOrBetterShots / score.totalPlayerShots) * 100)
      : 0;
    this.statAccuracyEl.textContent = `${accuracy}%`;

    this.gameOverEl.classList.add('active');
  }

  public hideGameOver(): void {
    this.gameOverEl.classList.remove('active');
  }
}
