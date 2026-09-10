import { Difficulty, MatchScore, PlayerId, ShotInfo } from '../types';
import { EventBus } from '../core/EventBus';

export class HUD {
  private eventBus: EventBus;

  // DOM Elements
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

  private mainMenuEl: HTMLElement;
  private gameOverEl: HTMLElement;
  private startBtn: HTMLElement;
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

  public onStartMatch: ((diff: Difficulty) => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onReturnToMenu: (() => void) | null = null;

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

    this.mainMenuEl = document.getElementById('main-menu')!;
    this.gameOverEl = document.getElementById('game-over-screen')!;
    this.startBtn = document.getElementById('start-btn')!;
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

    this.startBtn.addEventListener('click', () => {
      this.hideMainMenu();
      if (this.onStartMatch) this.onStartMatch(this.selectedDifficulty);
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

  public showMainMenu(): void {
    this.mainMenuEl.classList.add('active');
    this.servePromptEl.classList.remove('active');
  }

  public hideMainMenu(): void {
    this.mainMenuEl.classList.remove('active');
  }

  public showServePrompt(show: boolean): void {
    if (show) {
      this.servePromptEl.classList.add('active');
    } else {
      this.servePromptEl.classList.remove('active');
    }
  }

  public updateScore(score: MatchScore): void {
    // Check score bump
    if (this.playerScoreEl.textContent !== String(score.player)) {
      this.playerScoreEl.textContent = String(score.player);
      this.triggerBump(this.playerScoreEl);
    }
    if (this.cpuScoreEl.textContent !== String(score.cpu)) {
      this.cpuScoreEl.textContent = String(score.cpu);
      this.triggerBump(this.cpuScoreEl);
    }

    // Serve indicators
    if (score.server === 'PLAYER') {
      this.playerCardEl.classList.add('serving');
      this.cpuCardEl.classList.remove('serving');
    } else {
      this.cpuCardEl.classList.add('serving');
      this.playerCardEl.classList.remove('serving');
    }

    // Rally Counter
    this.rallyCounterEl.textContent = `RALLY: ${score.rallyCount}`;

    // Deuce / Match Point text
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
