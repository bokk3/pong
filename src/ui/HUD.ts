import { Difficulty, MatchScore, PlayerId, ShotInfo, MultiplayerRole } from '../types';
import { EventBus } from '../core/EventBus';
import { NetworkManager } from '../network/NetworkManager';
import { DeviceDetector } from '../utils/DeviceDetector';

export class HUD {
  private eventBus: EventBus;
  private network: NetworkManager;
  private deviceDetector: DeviceDetector;

  // DOM Elements - Scoreboard
  private playerScoreEl: HTMLElement;
  private cpuScoreEl: HTMLElement;
  private playerCardEl: HTMLElement;
  private cpuCardEl: HTMLElement;
  private playerHudNameEl: HTMLElement;
  private cpuNameEl: HTMLElement;
  private rallyCounterEl: HTMLElement;
  private matchInfoEl: HTMLElement;
  private feedbackBannerEl: HTMLElement;
  private calloutBannerEl: HTMLElement;
  private servePromptEl: HTMLElement;
  private hudPingBadgeEl: HTMLElement;
  private hudPingValEl: HTMLElement;

  // Presence Counter Elements
  private queueCountEl: HTMLElement;
  private playingCountEl: HTMLElement;

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

  // Menu Overlays & Buttons
  private mainMenuEl: HTMLElement;
  private pauseMenuEl: HTMLElement;
  private gameOverEl: HTMLElement;
  private controlsHintEl: HTMLElement;
  private controlsSidebarEl: HTMLElement;
  private mobileGuideBtn: HTMLElement | null = null;
  private sidebarCloseBtn: HTMLElement | null = null;
  private startBtn: HTMLElement;
  private findMatchBtn: HTMLElement;
  private playFriendBtn: HTMLElement;
  private resumeBtn: HTMLElement;
  private pauseRestartBtn: HTMLElement;
  private pauseMenuBtn: HTMLElement;
  private rematchBtn: HTMLElement;
  private menuBtn: HTMLElement;

  // Matchmaking Modal Elements
  private mmModalEl: HTMLElement;
  private closeMmBtn: HTMLElement;
  private cancelMmBtn: HTMLElement;
  private nicknameInput: HTMLInputElement;
  private randomNameBtn: HTMLElement;
  private mmQuickViewEl: HTMLElement;
  private mmFriendViewEl: HTMLElement;
  private mmStatusTitleEl: HTMLElement;
  private mmStatusSubEl: HTMLElement;
  private mmPingValEl: HTMLElement;
  private displayRoomCodeEl: HTMLElement;
  private copyLinkBtn: HTMLElement;
  private joinRoomInput: HTMLInputElement;
  private joinRoomBtn: HTMLElement;

  // Game Over Actions (Singleplayer vs Multiplayer)
  private singleplayerActionsEl: HTMLElement;
  private multiplayerRematchBoxEl: HTMLElement;
  private multiRematchBtn: HTMLElement;
  private multiNewMatchBtn: HTMLElement;
  private multiExitBtn: HTMLElement;
  private rematchStatusTextEl: HTMLElement;

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
  private currentMode: 'BOT' | 'MULTIPLAYER' = 'BOT';
  private localRematchRequested: boolean = false;
  private remoteRematchRequested: boolean = false;

  // Callbacks
  public onStartMatch: ((diff: Difficulty) => void) | null = null;
  public onStartMultiplayerMatch: ((role: MultiplayerRole, remoteUsername: string) => void) | null = null;
  public onResume: (() => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onReturnToMenu: (() => void) | null = null;
  public onSensitivityChange: ((val: number) => void) | null = null;
  public onToggleWebcam: (() => void) | null = null;

  constructor() {
    this.eventBus = EventBus.get();
    this.network = NetworkManager.get();
    this.deviceDetector = DeviceDetector.get();

    // Scoreboard
    this.playerScoreEl = document.getElementById('player-score')!;
    this.cpuScoreEl = document.getElementById('cpu-score')!;
    this.playerCardEl = document.getElementById('player-score-card')!;
    this.cpuCardEl = document.getElementById('cpu-score-card')!;
    this.playerHudNameEl = document.getElementById('player-hud-name')!;
    this.cpuNameEl = document.getElementById('cpu-name')!;
    this.rallyCounterEl = document.getElementById('rally-counter')!;
    this.matchInfoEl = document.getElementById('match-info')!;
    this.feedbackBannerEl = document.getElementById('feedback-banner')!;
    this.calloutBannerEl = document.getElementById('callout-banner')!;
    this.servePromptEl = document.getElementById('serve-prompt')!;
    this.hudPingBadgeEl = document.getElementById('hud-ping-badge')!;
    this.hudPingValEl = document.getElementById('hud-ping-val')!;
    this.controlsHintEl = document.getElementById('controls-hint')!;
    this.controlsSidebarEl = document.getElementById('controls-sidebar')!;
    this.mobileGuideBtn = document.getElementById('mobile-guide-btn');
    this.sidebarCloseBtn = document.getElementById('sidebar-close-btn');

    // Presence
    this.queueCountEl = document.getElementById('queue-count')!;
    this.playingCountEl = document.getElementById('playing-count')!;

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

    // Menus
    this.mainMenuEl = document.getElementById('main-menu')!;
    this.pauseMenuEl = document.getElementById('pause-menu')!;
    this.gameOverEl = document.getElementById('game-over-screen')!;
    this.startBtn = document.getElementById('start-btn')!;
    this.findMatchBtn = document.getElementById('find-match-btn')!;
    this.playFriendBtn = document.getElementById('play-friend-btn')!;
    this.resumeBtn = document.getElementById('resume-btn')!;
    this.pauseRestartBtn = document.getElementById('pause-restart-btn')!;
    this.pauseMenuBtn = document.getElementById('pause-menu-btn')!;
    this.rematchBtn = document.getElementById('rematch-btn')!;
    this.menuBtn = document.getElementById('menu-btn')!;

    // Matchmaking Modal
    this.mmModalEl = document.getElementById('matchmaking-modal')!;
    this.closeMmBtn = document.getElementById('close-mm-btn')!;
    this.cancelMmBtn = document.getElementById('cancel-mm-btn')!;
    this.nicknameInput = document.getElementById('player-nickname') as HTMLInputElement;
    this.randomNameBtn = document.getElementById('random-name-btn')!;
    this.mmQuickViewEl = document.getElementById('mm-quick-view')!;
    this.mmFriendViewEl = document.getElementById('mm-friend-view')!;
    this.mmStatusTitleEl = document.getElementById('mm-status-title')!;
    this.mmStatusSubEl = document.getElementById('mm-status-sub')!;
    this.mmPingValEl = document.getElementById('mm-ping-val')!;
    this.displayRoomCodeEl = document.getElementById('display-room-code')!;
    this.copyLinkBtn = document.getElementById('copy-link-btn')!;
    this.joinRoomInput = document.getElementById('join-room-code-input') as HTMLInputElement;
    this.joinRoomBtn = document.getElementById('join-room-btn')!;

    // Rematch Elements
    this.singleplayerActionsEl = document.getElementById('singleplayer-actions')!;
    this.multiplayerRematchBoxEl = document.getElementById('multiplayer-rematch-box')!;
    this.multiRematchBtn = document.getElementById('multi-rematch-btn')!;
    this.multiNewMatchBtn = document.getElementById('multi-new-match-btn')!;
    this.multiExitBtn = document.getElementById('multi-exit-btn')!;
    this.rematchStatusTextEl = document.getElementById('rematch-status-text')!;

    // Stats
    this.statFinalScoreEl = document.getElementById('stat-final-score')!;
    this.statLongestRallyEl = document.getElementById('stat-longest-rally')!;
    this.statSmashWinnersEl = document.getElementById('stat-smash-winners')!;
    this.statAccuracyEl = document.getElementById('stat-perfect-timing')!;
    this.resultTitleEl = document.getElementById('match-result-title')!;
    this.resultSubtitleEl = document.getElementById('match-result-subtitle')!;

    // Init username
    this.nicknameInput.value = this.network.localUsername;
    this.setPlayerName(this.network.localUsername.toUpperCase());

    this.setupUIEvents();
    this.setupGameListeners();
    this.setupNetworkListeners();
    this.checkUrlRoomParameter();
    this.updateControlsHint();
  }

  private setupUIEvents(): void {
    // Mobile How-to-Play Guide Drawer
    if (this.mobileGuideBtn) {
      this.mobileGuideBtn.addEventListener('click', () => {
        this.controlsSidebarEl.classList.add('open');
      });
    }

    if (this.sidebarCloseBtn) {
      this.sidebarCloseBtn.addEventListener('click', () => {
        this.controlsSidebarEl.classList.remove('open');
      });
    }
    // Difficulty selector buttons
    const diffButtons = document.querySelectorAll<HTMLButtonElement>('.diff-btn');
    diffButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        diffButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedDifficulty = btn.dataset.diff as Difficulty;
        if (this.currentMode === 'BOT') {
          this.cpuNameEl.textContent = `CPU (${this.selectedDifficulty.toUpperCase()})`;
        }
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

    // Bot Match Button
    this.startBtn.addEventListener('click', () => {
      this.currentMode = 'BOT';
      this.hudPingBadgeEl.style.display = 'none';
      this.hideMainMenu();
      if (this.onStartMatch) this.onStartMatch(this.selectedDifficulty);
    });

    // Multiplayer Buttons
    this.findMatchBtn.addEventListener('click', () => {
      this.openMatchmaking('quick');
    });

    this.playFriendBtn.addEventListener('click', () => {
      this.openMatchmaking('friend');
    });

    // Matchmaking Modal Controls
    this.closeMmBtn.addEventListener('click', () => this.closeMatchmaking());
    this.cancelMmBtn.addEventListener('click', () => this.closeMatchmaking());

    // Nickname Editing
    this.nicknameInput.addEventListener('input', () => {
      const val = this.nicknameInput.value.trim();
      if (val.length > 0) {
        this.network.setUsername(val);
        this.setPlayerName(val.toUpperCase());
      }
    });

    this.randomNameBtn.addEventListener('click', () => {
      const randomName = this.generateRandomNickname();
      this.nicknameInput.value = randomName;
      this.network.setUsername(randomName);
      this.setPlayerName(randomName.toUpperCase());
    });

    // Copy Invite Link Button
    this.copyLinkBtn.addEventListener('click', async () => {
      const code = this.displayRoomCodeEl.textContent?.trim();
      if (!code || code === '------') return;
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      try {
        await navigator.clipboard.writeText(url);
        this.copyLinkBtn.innerHTML = '<span>✅ Copied Invite Link!</span>';
        setTimeout(() => {
          this.copyLinkBtn.innerHTML = '<span>📋 Copy Invite Link</span>';
        }, 2200);
      } catch {
        prompt('Copy room link:', url);
      }
    });

    // Join Room Button
    this.joinRoomBtn.addEventListener('click', async () => {
      const code = this.joinRoomInput.value.trim().toUpperCase();
      if (!code || code.length < 3) return;
      this.joinRoomBtn.textContent = 'Connecting...';
      this.joinRoomBtn.setAttribute('disabled', 'true');
      const connected = await this.network.connectToPeer(code);
      if (!connected) {
        this.joinRoomBtn.textContent = 'JOIN';
        this.joinRoomBtn.removeAttribute('disabled');
        this.showCallout('COULD NOT CONNECT TO ROOM', 2000);
      }
    });

    this.joinRoomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.joinRoomBtn.click();
      }
    });

    // Pause Menu Handlers
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

    // Single Player Game Over Handlers
    this.rematchBtn.addEventListener('click', () => {
      this.hideGameOver();
      if (this.onRematch) this.onRematch();
    });

    this.menuBtn.addEventListener('click', () => {
      this.hideGameOver();
      this.showMainMenu();
      if (this.onReturnToMenu) this.onReturnToMenu();
    });

    // Multiplayer Rematch Handlers
    this.multiRematchBtn.addEventListener('click', () => {
      this.localRematchRequested = true;
      this.multiRematchBtn.setAttribute('disabled', 'true');
      this.multiRematchBtn.classList.remove('rematch-pulse');
      this.rematchStatusTextEl.textContent = 'Waiting for opponent response...';

      if (this.remoteRematchRequested) {
        // Both agreed!
        this.rematchStatusTextEl.textContent = 'Rematch accepted! Starting...';
        this.network.send({ type: 'REMATCH_REQUEST', status: 'accepted' });
        setTimeout(() => {
          this.hideGameOver();
          if (this.onRematch) this.onRematch();
        }, 500);
      } else {
        this.network.send({ type: 'REMATCH_REQUEST', status: 'requested' });
      }
    });

    this.multiNewMatchBtn.addEventListener('click', () => {
      this.hideGameOver();
      this.network.disconnect();
      this.openMatchmaking('quick');
    });

    this.multiExitBtn.addEventListener('click', () => {
      this.hideGameOver();
      this.network.disconnect();
      this.showMainMenu();
      if (this.onReturnToMenu) this.onReturnToMenu();
    });

    // Corner Quick Settings Toggle
    const hudSettingsBtn = document.getElementById('hud-settings-btn');
    const hudSettingsCloseBtn = document.getElementById('hud-settings-close-btn');
    const hudSettingsDropdown = document.getElementById('hud-settings-dropdown');

    if (hudSettingsBtn && hudSettingsDropdown) {
      hudSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hudSettingsDropdown.classList.toggle('active');
      });

      hudSettingsCloseBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        hudSettingsDropdown.classList.remove('active');
      });

      document.addEventListener('click', (e) => {
        if (!hudSettingsDropdown.contains(e.target as Node) && e.target !== hudSettingsBtn) {
          hudSettingsDropdown.classList.remove('active');
        }
      });
    }
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

    this.eventBus.on('device:resize', () => {
      this.updateControlsHint();
    });
  }

  private setupNetworkListeners(): void {
    // Ping listener
    this.eventBus.on('network:ping', ({ pingMs }) => {
      this.updatePing(pingMs);
    });

    // Presence update listener
    this.eventBus.on('presence:updated', ({ lookingCount, playingCount }) => {
      this.queueCountEl.textContent = String(lookingCount);
      this.playingCountEl.textContent = String(playingCount);
    });

    // Network connection status
    this.eventBus.on('network:status', ({ status, role, remoteUsername, message }) => {
      if (status === 'connected') {
        this.mmStatusTitleEl.textContent = 'Opponent Connected!';
        this.mmStatusSubEl.textContent = `Matched with ${remoteUsername} (Direct P2P)`;
        this.hudPingBadgeEl.style.display = 'flex';
        this.currentMode = 'MULTIPLAYER';

        this.setOpponentName(remoteUsername ? remoteUsername.toUpperCase() : 'OPPONENT');
        this.setPlayerName(this.network.localUsername.toUpperCase());

        setTimeout(() => {
          this.closeMatchmaking();
          this.hideMainMenu();
          if (this.onStartMultiplayerMatch) {
            this.onStartMultiplayerMatch(role || 'CLIENT', remoteUsername || 'Opponent');
          }
        }, 600);
      } else if (status === 'disconnected') {
        this.hudPingBadgeEl.style.display = 'none';
        this.rematchStatusTextEl.textContent = 'Opponent disconnected.';
        this.multiRematchBtn.setAttribute('disabled', 'true');
        this.multiRematchBtn.classList.remove('rematch-pulse');
        if (this.currentMode === 'MULTIPLAYER') {
          this.showCallout(message || 'OPPONENT DISCONNECTED', 2000);
        }
      }
    });

    // Rematch coordination
    this.eventBus.on('multiplayer:rematch', ({ from, status }) => {
      if (from === 'remote') {
        if (status === 'requested') {
          this.remoteRematchRequested = true;
          this.rematchStatusTextEl.textContent = 'Opponent requested a rematch! Click Rematch to accept.';
          this.multiRematchBtn.removeAttribute('disabled');
          this.multiRematchBtn.classList.add('rematch-pulse');
          this.showCallout('OPPONENT WANTS REMATCH!', 1500);

          if (this.localRematchRequested) {
            // Both ready!
            this.network.send({ type: 'REMATCH_REQUEST', status: 'accepted' });
            this.rematchStatusTextEl.textContent = 'Rematch accepted! Starting...';
            setTimeout(() => {
              this.hideGameOver();
              if (this.onRematch) this.onRematch();
            }, 500);
          }
        } else if (status === 'accepted') {
          this.rematchStatusTextEl.textContent = 'Rematch accepted! Starting...';
          setTimeout(() => {
            this.hideGameOver();
            if (this.onRematch) this.onRematch();
          }, 500);
        }
      }
    });
  }

  private checkUrlRoomParameter(): void {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && room.trim().length >= 3) {
      this.openMatchmaking('friend');
      this.joinRoomInput.value = room.trim().toUpperCase();
      this.showCallout(`JOINING ROOM ${room.toUpperCase()}...`, 1500);
      setTimeout(() => {
        this.joinRoomBtn.click();
      }, 300);
    }
  }

  // --- Matchmaking Management ---
  public async openMatchmaking(view: 'quick' | 'friend'): Promise<void> {
    this.mmModalEl.classList.add('active');
    this.nicknameInput.value = this.network.localUsername;

    if (view === 'quick') {
      this.mmQuickViewEl.style.display = 'block';
      this.mmFriendViewEl.style.display = 'none';
      await this.startQuickMatchmaking();
    } else {
      this.mmQuickViewEl.style.display = 'none';
      this.mmFriendViewEl.style.display = 'block';
      this.startFriendRoomHosting();
    }
  }

  public closeMatchmaking(): void {
    this.mmModalEl.classList.remove('active');
    if (!this.network.isConnected) {
      this.network.reportPresence('menu');
    }
  }

  private async startQuickMatchmaking(): Promise<void> {
    this.mmStatusTitleEl.textContent = 'Scanning for opponents...';
    this.mmStatusSubEl.textContent = 'Querying lowest-latency players first';
    this.mmPingValEl.textContent = '-- ms';

    // 1. Report searching status to edge presence
    const presenceData = await this.network.reportPresence('searching');
    const candidates = presenceData?.candidates || [];

    // 2. If candidate peers are waiting, probe for lowest latency
    if (candidates.length > 0) {
      this.mmStatusSubEl.textContent = `Testing ping for ${candidates.length} active challengers...`;
      const bestRoomId = await this.network.findBestCandidateMatch(candidates);
      if (bestRoomId) {
        this.mmStatusTitleEl.textContent = 'Match Found!';
        this.mmStatusSubEl.textContent = 'Connecting to best latency opponent...';
        return;
      }
    }

    // 3. Fallback: Host and wait for challenger
    this.mmStatusTitleEl.textContent = 'Waiting for Challenger...';
    const code = await this.network.initPeer();
    this.mmStatusSubEl.textContent = `Hosting room [${code.toUpperCase()}]. Probing incoming connections...`;
  }

  private async startFriendRoomHosting(): Promise<void> {
    this.displayRoomCodeEl.textContent = '...';
    const code = await this.network.initPeer();
    this.displayRoomCodeEl.textContent = code.toUpperCase();
  }

  private updateControlsHint(): void {
    if (!this.controlsHintEl) return;
    if (this.deviceDetector.info.isTouchDevice) {
      this.controlsHintEl.innerHTML = `
        <div class="hint-item"><span class="key">Slide</span> Move</div>
        <div class="hint-item"><span class="key">Swipe ↑</span> Topspin</div>
        <div class="hint-item"><span class="key">Swipe ↓</span> Slice</div>
        <div class="hint-item"><span class="key">Tap</span> Hit / Serve</div>
      `;
    } else {
      this.controlsHintEl.innerHTML = `
        <div class="hint-item"><span class="key">Mouse Flick</span> or <span class="key">Space</span> Swing</div>
        <div class="hint-item"><span class="key">↑ Flick</span> / <span class="key">J</span> Topspin</div>
        <div class="hint-item"><span class="key">↓ Flick</span> / <span class="key">K</span> Slice</div>
        <div class="hint-item"><span class="key">L</span> Smash</div>
      `;
    }
  }

  private generateRandomNickname(): string {
    const adjectives = ['Apex', 'Vortex', 'Spin', 'Cyber', 'Sonic', 'Flash', 'Hyper', 'Turbo', 'Neon'];
    const nouns = ['Master', 'Ace', 'Paddle', 'Striker', 'Hero', 'Wizard', 'King', 'Legend', 'Champ'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}`;
  }

  // --- Public Display Setters ---
  public setPlayerName(name: string): void {
    if (this.playerHudNameEl) {
      this.playerHudNameEl.textContent = name;
    }
  }

  public setOpponentName(name: string): void {
    if (this.cpuNameEl) {
      this.cpuNameEl.textContent = name;
    }
  }

  public updatePing(ms: number): void {
    const formatted = `${ms}ms`;
    if (this.hudPingValEl) this.hudPingValEl.textContent = formatted;
    if (this.mmPingValEl) this.mmPingValEl.textContent = `${ms} ms`;

    const color = ms < 60 ? '#00ff88' : ms < 120 ? '#ffcc00' : '#ff3b30';
    if (this.hudPingBadgeEl) {
      this.hudPingBadgeEl.style.borderColor = color;
    }
    if (this.hudPingValEl) {
      this.hudPingValEl.style.color = color;
    }
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
    this.network.reportPresence('menu');
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

    // Toggle Singleplayer vs Multiplayer Action buttons
    if (this.currentMode === 'MULTIPLAYER') {
      this.singleplayerActionsEl.style.display = 'none';
      this.multiplayerRematchBoxEl.style.display = 'flex';
      this.localRematchRequested = false;
      this.remoteRematchRequested = false;
      this.multiRematchBtn.removeAttribute('disabled');
      this.multiRematchBtn.classList.remove('rematch-pulse');
      this.rematchStatusTextEl.textContent = 'Challenge opponent to a rematch?';
    } else {
      this.singleplayerActionsEl.style.display = 'flex';
      this.multiplayerRematchBoxEl.style.display = 'none';
    }

    this.gameOverEl.classList.add('active');
  }

  public hideGameOver(): void {
    this.gameOverEl.classList.remove('active');
  }
}
