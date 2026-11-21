import { Difficulty, MatchScore, PlayerId, ShotInfo, MultiplayerRole, LobbyRoom, GameModeType } from '../types';
import { EventBus } from '../core/EventBus';
import { NetworkManager } from '../network/NetworkManager';
import { DeviceDetector } from '../utils/DeviceDetector';
import { TiltController } from '../controllers/TiltController';
import { ArenaSize, CurveArenaSettings, DEFAULT_ARENA_SETTINGS, describeArena, sanitizeArenaSettings } from '../core/CurveArena';

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
  private onlineCountEl: HTMLElement | null = null;
  private pongGamesCountEl: HTMLElement | null = null;
  private curveGamesCountEl: HTMLElement | null = null;

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
  private lobbyBrowserBtn: HTMLElement | null = null;
  private resumeBtn: HTMLElement;
  private pauseRestartBtn: HTMLElement;
  private pauseMenuBtn: HTMLElement;
  private rematchBtn: HTMLElement;
  private menuBtn: HTMLElement;

  // Lobby Modal Elements
  private lobbyModalEl: HTMLElement | null = null;
  private closeLobbyBtn: HTMLElement | null = null;
  private exitLobbyBtn: HTMLElement | null = null;
  private lobbyRefreshBtn: HTMLElement | null = null;
  private lobbyOpenCreateBtn: HTMLElement | null = null;
  private lobbyCancelCreateBtn: HTMLElement | null = null;
  private lobbySubmitCreateBtn: HTMLElement | null = null;
  private lobbyCreatePanelEl: HTMLElement | null = null;
  private lobbyHostingViewEl: HTMLElement | null = null;
  private lobbyCancelHostBtn: HTMLElement | null = null;
  private hostingRoomCodeEl: HTMLElement | null = null;
  private hostingRoomTitleEl: HTMLElement | null = null;
  private lobbyRoomsBodyEl: HTMLElement | null = null;
  private createRoomNameInput: HTMLInputElement | null = null;
  private createRoomScoreSelect: HTMLSelectElement | null = null;
  private createModePongBtn: HTMLElement | null = null;
  private createModeCurveBtn: HTMLElement | null = null;
  private lobbyOnlineValEl: HTMLElement | null = null;
  private lobbyLookingValEl: HTMLElement | null = null;
  private lobbyPlayingValEl: HTMLElement | null = null;
  private lobbyPongValEl: HTMLElement | null = null;
  private lobbyCurveValEl: HTMLElement | null = null;
  private lobbyFilter: 'ALL' | 'PONG' | 'CURVE' = 'ALL';
  private lobbyPollTimer: number | null = null;
  private currentCreateMode: GameModeType = 'PONG';

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
  public selectedGameMode: 'PONG' | 'CURVE' = 'PONG';
  private localRematchRequested: boolean = false;
  private remoteRematchRequested: boolean = false;
  private matchmakingSession: number = 0;
  private mmTitleEl: HTMLElement;
  private isStartingMatch: boolean = false;
  private lobbyWsUnsubscribe: (() => void) | null = null;

  // Touch controls for Curve
  private curveTouchControlsEl: HTMLElement | null = null;
  private curveLeftBtn: HTMLElement | null = null;
  private curveRightBtn: HTMLElement | null = null;

  // Callbacks
  public onStartMatch: ((diff: Difficulty) => void) | null = null;
  public onStartMultiplayerMatch: ((role: MultiplayerRole, remoteUsername: string) => void) | null = null;
  public onGameModeSelect: ((mode: 'PONG' | 'CURVE') => void) | null = null;
  public onCurveSteer: ((dir: -1 | 0 | 1) => void) | null = null;
  public onResume: (() => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onReturnToMenu: (() => void) | null = null;
  public onSensitivityChange: ((val: number) => void) | null = null;
  public onToggleWebcam: (() => void) | null = null;
  public onPauseRequest: (() => void) | null = null;
  public onToggleTilt: (() => void) | null = null;

  /** Curve Battle arena for bot matches and for matches this player hosts. */
  public curveSettings: CurveArenaSettings = { ...DEFAULT_ARENA_SETTINGS };

  private tiltToggleBtns: HTMLElement[] = [];
  private tiltActive: boolean = false;
  private curveControlsWanted: boolean = false;

  private curveTargetScore: number = 5;

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

    // Curve Touch Controls
    this.curveTouchControlsEl = document.getElementById('curve-touch-controls');
    this.curveLeftBtn = document.getElementById('curve-left-btn');
    this.curveRightBtn = document.getElementById('curve-right-btn');

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
    this.lobbyBrowserBtn = document.getElementById('lobby-browser-btn');
    this.resumeBtn = document.getElementById('resume-btn')!;
    this.pauseRestartBtn = document.getElementById('pause-restart-btn')!;
    this.pauseMenuBtn = document.getElementById('pause-menu-btn')!;
    this.rematchBtn = document.getElementById('rematch-btn')!;
    this.menuBtn = document.getElementById('menu-btn')!;

    // Online & Mode breakdown counters
    this.onlineCountEl = document.getElementById('online-count');
    this.pongGamesCountEl = document.getElementById('pong-games-count');
    this.curveGamesCountEl = document.getElementById('curve-games-count');

    // Lobby Modal Elements
    this.lobbyModalEl = document.getElementById('lobby-modal');
    this.closeLobbyBtn = document.getElementById('close-lobby-btn');
    this.exitLobbyBtn = document.getElementById('exit-lobby-btn');
    this.lobbyRefreshBtn = document.getElementById('lobby-refresh-btn');
    this.lobbyOpenCreateBtn = document.getElementById('lobby-open-create-btn');
    this.lobbyCancelCreateBtn = document.getElementById('lobby-cancel-create-btn');
    this.lobbySubmitCreateBtn = document.getElementById('lobby-submit-create-btn');
    this.lobbyCreatePanelEl = document.getElementById('lobby-create-panel');
    this.lobbyHostingViewEl = document.getElementById('lobby-hosting-view');
    this.lobbyCancelHostBtn = document.getElementById('lobby-cancel-host-btn');
    this.hostingRoomCodeEl = document.getElementById('hosting-room-code');
    this.hostingRoomTitleEl = document.getElementById('hosting-room-title');
    this.lobbyRoomsBodyEl = document.getElementById('lobby-rooms-body');
    this.createRoomNameInput = document.getElementById('create-room-name') as HTMLInputElement | null;
    this.createRoomScoreSelect = document.getElementById('create-room-score') as HTMLSelectElement | null;
    this.createModePongBtn = document.getElementById('create-mode-pong');
    this.createModeCurveBtn = document.getElementById('create-mode-curve');
    this.lobbyOnlineValEl = document.getElementById('lobby-online-val');
    this.lobbyLookingValEl = document.getElementById('lobby-looking-val');
    this.lobbyPlayingValEl = document.getElementById('lobby-playing-val');
    this.lobbyPongValEl = document.getElementById('lobby-pong-val');
    this.lobbyCurveValEl = document.getElementById('lobby-curve-val');

    // Matchmaking Modal
    this.mmModalEl = document.getElementById('matchmaking-modal')!;
    this.mmTitleEl = document.getElementById('mm-title')!;
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
    // Game Mode Selector (Classic Pong vs Curve Battle)
    const pongBtn = document.getElementById('mode-pong-btn');
    const curveBtn = document.getElementById('mode-curve-btn');
    const diffBox = document.getElementById('difficulty-picker-box');

    if (pongBtn && curveBtn) {
      pongBtn.addEventListener('click', () => {
        pongBtn.classList.add('active');
        curveBtn.classList.remove('active');
        this.selectedGameMode = 'PONG';
        if (diffBox) diffBox.style.display = 'flex';
        this.updateArenaPickerVisibility();
        this.updateControlsHint();
        if (this.onGameModeSelect) this.onGameModeSelect('PONG');
      });

      curveBtn.addEventListener('click', () => {
        curveBtn.classList.add('active');
        pongBtn.classList.remove('active');
        this.selectedGameMode = 'CURVE';
        if (diffBox) diffBox.style.display = 'flex'; // Allow choosing Novice, Pro, or Champion bot
        this.updateArenaPickerVisibility();
        this.updateControlsHint();
        if (this.onGameModeSelect) this.onGameModeSelect('CURVE');
      });
    }

    // Curve arena settings (size / obstacles / portals): every copy of the controls stays in sync
    document.querySelectorAll<HTMLButtonElement>('[data-arena-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setCurveSettings({ ...this.curveSettings, size: btn.dataset.arenaSize as ArenaSize });
      });
    });
    document.querySelectorAll<HTMLButtonElement>('[data-arena-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.arenaToggle === 'portals' ? 'portals' : 'obstacles';
        this.setCurveSettings({ ...this.curveSettings, [key]: !this.curveSettings[key] });
      });
    });
    this.setCurveSettings(this.loadCurveSettings(), false);


    // Touch Steering Zones
    if (this.curveLeftBtn && this.curveRightBtn) {
      const startLeft = (e: Event) => {
        e.preventDefault();
        if (this.onCurveSteer) this.onCurveSteer(-1);
      };
      const stopLeft = (e: Event) => {
        e.preventDefault();
        if (this.onCurveSteer) this.onCurveSteer(0);
      };
      const startRight = (e: Event) => {
        e.preventDefault();
        if (this.onCurveSteer) this.onCurveSteer(1);
      };
      const stopRight = (e: Event) => {
        e.preventDefault();
        if (this.onCurveSteer) this.onCurveSteer(0);
      };

      this.curveLeftBtn.addEventListener('pointerdown', startLeft);
      this.curveLeftBtn.addEventListener('pointerup', stopLeft);
      this.curveLeftBtn.addEventListener('pointercancel', stopLeft);

      this.curveRightBtn.addEventListener('pointerdown', startRight);
      this.curveRightBtn.addEventListener('pointerup', stopRight);
      this.curveRightBtn.addEventListener('pointercancel', stopRight);
    }

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

    // Tilt (gyro) toggles: only offered on touch devices with motion sensor support
    this.tiltToggleBtns = ['menu-tilt-toggle-btn', 'tilt-toggle-btn']
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const offerTilt = TiltController.isSupported() && this.deviceDetector.info.isTouchDevice;
    this.tiltToggleBtns.forEach(btn => {
      btn.hidden = !offerTilt;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onToggleTilt) this.onToggleTilt();
      });
    });

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

    // Lobby Browser Button
    if (this.lobbyBrowserBtn) {
      this.lobbyBrowserBtn.addEventListener('click', () => {
        this.openLobbyBrowser();
      });
    }

    // Lobby Controls
    if (this.closeLobbyBtn) {
      this.closeLobbyBtn.addEventListener('click', () => this.closeLobbyBrowser());
    }
    if (this.exitLobbyBtn) {
      this.exitLobbyBtn.addEventListener('click', () => this.closeLobbyBrowser());
    }
    if (this.lobbyRefreshBtn) {
      this.lobbyRefreshBtn.addEventListener('click', () => this.refreshLobbyRooms());
    }

    // Lobby Mode Filter Buttons
    const filterBtns = document.querySelectorAll<HTMLButtonElement>('.lobby-filter-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const f = btn.getAttribute('data-lobby-filter') as 'ALL' | 'PONG' | 'CURVE';
        this.lobbyFilter = f || 'ALL';
        this.refreshLobbyRooms();
      });
    });

    // Lobby Create Room Panel Toggling
    if (this.lobbyOpenCreateBtn) {
      this.lobbyOpenCreateBtn.addEventListener('click', () => {
        if (this.lobbyCreatePanelEl) {
          this.lobbyCreatePanelEl.style.display = 'block';
          if (this.createRoomNameInput) {
            this.createRoomNameInput.value = `${this.network.localUsername}'s Game`;
            this.createRoomNameInput.focus();
          }
        }
      });
    }

    if (this.lobbyCancelCreateBtn) {
      this.lobbyCancelCreateBtn.addEventListener('click', () => {
        if (this.lobbyCreatePanelEl) this.lobbyCreatePanelEl.style.display = 'none';
      });
    }

    // Game Mode selection pills in Create Form
    if (this.createModePongBtn && this.createModeCurveBtn) {
      this.createModePongBtn.addEventListener('click', () => {
        this.createModePongBtn!.classList.add('active');
        this.createModeCurveBtn!.classList.remove('active');
        this.currentCreateMode = 'PONG';
        if (this.createRoomScoreSelect) this.createRoomScoreSelect.value = '11';
        const arenaField = document.getElementById('create-arena-field');
        if (arenaField) arenaField.hidden = true;
      });

      this.createModeCurveBtn.addEventListener('click', () => {
        this.createModeCurveBtn!.classList.add('active');
        this.createModePongBtn!.classList.remove('active');
        this.currentCreateMode = 'CURVE';
        if (this.createRoomScoreSelect) this.createRoomScoreSelect.value = '5';
        const arenaField = document.getElementById('create-arena-field');
        if (arenaField) arenaField.hidden = false;
      });
    }

    // Submit Create Room
    if (this.lobbySubmitCreateBtn) {
      this.lobbySubmitCreateBtn.addEventListener('click', async () => {
        await this.handleLobbyRoomCreation();
      });
    }

    // Cancel Active Host
    if (this.lobbyCancelHostBtn) {
      this.lobbyCancelHostBtn.addEventListener('click', async () => {
        await this.handleLobbyCancelHost();
      });
    }

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
      if (!code || code === '------' || code === '...' || code === 'OFFLINE') return;
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;

      // Phones/tablets: open the native share sheet (Messages, WhatsApp, ...)
      if (this.canNativeShare()) {
        try {
          await navigator.share({
            title: 'Spin Pong 3D',
            text: `Play me in Spin Pong 3D! Room code ${code}`,
            url
          });
          return;
        } catch (err) {
          // User closed the sheet: done. Anything else: fall back to copying.
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }

      try {
        await navigator.clipboard.writeText(url);
        this.copyLinkBtn.innerHTML = '<span>✅ Copied Invite Link!</span>';
        setTimeout(() => this.resetInviteButtonLabel(), 2200);
      } catch {
        prompt('Copy room link:', url);
      }
    });
    this.resetInviteButtonLabel();

    // Join Room Button
    this.joinRoomBtn.addEventListener('click', async () => {
      let code = this.joinRoomInput.value.trim().toUpperCase();
      code = code.replace(/^SP3D-?/i, '').replace(/[^A-Z0-9]/g, '');
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

    // In-game pause button (the only way to pause/quit on touch devices)
    document.getElementById('hud-pause-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).blur();
      if (this.onPauseRequest) this.onPauseRequest();
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

    this.eventBus.on('curve:round_start', ({ roundNumber }) => {
      this.rallyCounterEl.textContent = `ROUND ${roundNumber}`;
      this.matchInfoEl.textContent = `FIRST TO ${this.curveTargetScore}`;
      this.showCallout(`ROUND ${roundNumber}`, 1100);
      this.setCurveTouchControls(true);
    });

    this.eventBus.on('curve:score', (score) => {
      this.curveTargetScore = score.targetScore;
      this.playerScoreEl.textContent = String(score.player);
      this.cpuScoreEl.textContent = String(score.cpu);
      this.matchInfoEl.textContent = `FIRST TO ${score.targetScore}`;
      // Curve has no serves; clear any leftover Pong serve highlight
      this.playerCardEl.classList.remove('serving');
      this.cpuCardEl.classList.remove('serving');
    });

    this.eventBus.on('curve:crash', ({ victim }) => {
      if (victim === 'PLAYER') {
        this.showCallout('YOU CRASHED!', 1200);
      } else {
        const oppName = this.currentMode === 'MULTIPLAYER' ? this.network.remoteUsername.toUpperCase() : 'BOT';
        this.showCallout(`${oppName} CRASHED!`, 1200);
      }
    });

    this.eventBus.on('curve:match_over', ({ winner, score }) => {
      this.setCurveTouchControls(false);
      const rounds = score.player + score.cpu;
      this.showGameOver(winner, null, [
        { value: `${score.player} - ${score.cpu}`, label: 'Final Score' },
        { value: String(rounds), label: 'Rounds Played' },
        { value: String(score.player), label: 'Rounds Survived' },
        { value: `${rounds > 0 ? Math.round((score.player / rounds) * 100) : 0}%`, label: 'Survival Rate' }
      ]);
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
    this.eventBus.on('presence:updated', (data) => {
      this.queueCountEl.textContent = String(data.lookingCount || 0);
      this.playingCountEl.textContent = String(data.playingCount || 0);
      if (this.onlineCountEl && data.onlineCount !== undefined) {
        this.onlineCountEl.textContent = String(data.onlineCount);
      }
      if (this.pongGamesCountEl && data.pongGamesCount !== undefined) {
        this.pongGamesCountEl.textContent = String(data.pongGamesCount);
      }
      if (this.curveGamesCountEl && data.curveGamesCount !== undefined) {
        this.curveGamesCountEl.textContent = String(data.curveGamesCount);
      }

      // Update Lobby modal stats strip if present
      if (this.lobbyOnlineValEl && data.onlineCount !== undefined) {
        this.lobbyOnlineValEl.textContent = String(data.onlineCount);
      }
      if (this.lobbyLookingValEl) {
        this.lobbyLookingValEl.textContent = String(data.lookingCount || 0);
      }
      if (this.lobbyPlayingValEl) {
        this.lobbyPlayingValEl.textContent = String(data.playingCount || 0);
      }
      if (this.lobbyPongValEl && data.pongGamesCount !== undefined) {
        this.lobbyPongValEl.textContent = String(data.pongGamesCount);
      }
      if (this.lobbyCurveValEl && data.curveGamesCount !== undefined) {
        this.lobbyCurveValEl.textContent = String(data.curveGamesCount);
      }

      if (data.rooms && this.lobbyModalEl?.classList.contains('active')) {
        this.renderLobbyRooms(data.rooms);
      }
    });

    // Network connection status
    this.eventBus.on('network:status', ({ status, role, remoteUsername, message, gameMode, targetScore }) => {
      if (status === 'connected') {
        this.mmStatusTitleEl.textContent = 'Opponent Connected!';
        this.mmStatusSubEl.textContent = `Matched with ${remoteUsername} (Direct P2P)`;
        this.hudPingBadgeEl.style.display = 'flex';
        this.currentMode = 'MULTIPLAYER';

        // Synchronize HUD game mode if passed from network handshake
        if (gameMode && this.onGameModeSelect && gameMode !== this.selectedGameMode) {
          this.selectedGameMode = gameMode;
          this.onGameModeSelect(gameMode);
        }

        if (targetScore) {
          this.matchInfoEl.textContent = `FIRST TO ${targetScore}`;
        }

        this.setOpponentName(remoteUsername ? remoteUsername.toUpperCase() : 'OPPONENT');
        this.setPlayerName(this.network.localUsername.toUpperCase());

        if (this.isStartingMatch) return;
        this.isStartingMatch = true;

        setTimeout(() => {
          this.closeMatchmaking();
          this.closeLobbyBrowser(); // DISMISS LOBBY MODAL ON HOST & JOINER!
          this.hideMainMenu();
          if (this.onStartMultiplayerMatch) {
            this.onStartMultiplayerMatch(role || 'CLIENT', remoteUsername || 'Opponent');
          }
        }, 400);
      } else if (status === 'disconnected') {
        this.isStartingMatch = false;
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
    let room = params.get('room');
    if (room) {
      room = room.trim().toUpperCase().replace(/^SP3D-?/i, '').replace(/[^A-Z0-9]/g, '');
      if (room.length >= 3) {
        this.openMatchmaking('friend');
        this.joinRoomInput.value = room;
        this.showCallout(`JOINING ROOM ${room}...`, 1500);
        setTimeout(() => {
          this.joinRoomBtn.click();
        }, 400);
      }
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
    const wasOpen = this.mmModalEl.classList.contains('active');
    this.matchmakingSession++; // cancels any running quick-match loop
    this.network.isSearching = false;
    this.isStartingMatch = false;
    this.mmModalEl.classList.remove('active');
    if (wasOpen && !this.network.isConnected) {
      // Player backed out: take any quick-match room off the public list
      void this.network.closeLobbyRoom();
      this.network.reportPresence('menu');
    }
  }

  private async startQuickMatchmaking(): Promise<void> {
    const session = ++this.matchmakingSession;
    // If we end up hosting, our arena settings apply; joining someone else's room uses theirs
    this.network.hostedCurveSettings = { ...this.curveSettings };
    this.isStartingMatch = false;
    this.mmPingValEl.textContent = '-- ms';
    const modeLabel = this.selectedGameMode === 'CURVE' ? 'Curve Battle' : 'Classic Pong';
    this.mmTitleEl.textContent = `QUICK MATCH · ${modeLabel.toUpperCase()}`;

    const isCancelled = () => session !== this.matchmakingSession || !this.mmModalEl.classList.contains('active');
    await this.network.quickMatch(
      this.selectedGameMode,
      (title, sub) => {
        if (isCancelled()) return;
        this.mmStatusTitleEl.textContent = title;
        this.mmStatusSubEl.textContent = sub;
      },
      isCancelled
    );
  }

  private async startFriendRoomHosting(): Promise<void> {
    this.mmTitleEl.textContent = 'PLAY WITH A FRIEND';
    this.displayRoomCodeEl.textContent = '...';
    // A private room hosts whichever mode is selected in the main menu
    this.network.activeGameMode = this.selectedGameMode;
    this.network.hostedTargetScore = this.selectedGameMode === 'CURVE' ? 5 : 11;
    this.network.hostedCurveSettings = { ...this.curveSettings };
    try {
      const code = await this.network.initPeer();
      this.displayRoomCodeEl.textContent = code.toUpperCase();
    } catch {
      this.displayRoomCodeEl.textContent = 'OFFLINE';
      this.showCallout('COULD NOT REACH THE MATCH SERVER', 2200);
    }
  }

  private updateControlsHint(): void {
    if (!this.controlsHintEl) return;
    if (this.tiltActive) {
      this.controlsHintEl.innerHTML = this.selectedGameMode === 'CURVE'
        ? `<div class="hint-item"><span class="key">📱 Tilt ← →</span> Steer</div>
           <div class="hint-item"><span class="key">Jump Gaps</span> Survive!</div>`
        : `<div class="hint-item"><span class="key">📱 Tilt</span> Move</div>
           <div class="hint-item"><span class="key">Tap</span> or <span class="key">Flick phone</span> Swing</div>
           <div class="hint-item"><span class="key">Swipe ↑ ↓</span> Spin</div>`;
      return;
    }
    if (this.selectedGameMode === 'CURVE') {
      if (this.deviceDetector.info.isTouchDevice) {
        this.controlsHintEl.innerHTML = `
          <div class="hint-item"><span class="key">Left Zone</span> Turn Left</div>
          <div class="hint-item"><span class="key">Right Zone</span> Turn Right</div>
          <div class="hint-item"><span class="key">Avoid Trails</span> Survive!</div>
        `;
      } else {
        this.controlsHintEl.innerHTML = `
          <div class="hint-item"><span class="key">A</span> / <span class="key">←</span> Turn Left</div>
          <div class="hint-item"><span class="key">D</span> / <span class="key">→</span> Turn Right</div>
          <div class="hint-item"><span class="key">Jump Gaps</span> Survive!</div>
        `;
      }
    } else {
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
  }


  private generateRandomNickname(): string {
    const adjectives = ['Apex', 'Vortex', 'Spin', 'Cyber', 'Sonic', 'Flash', 'Hyper', 'Turbo', 'Neon'];
    const nouns = ['Master', 'Ace', 'Paddle', 'Striker', 'Hero', 'Wizard', 'King', 'Legend', 'Champ'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}`;
  }

  // --- Curve arena settings ---
  private loadCurveSettings(): CurveArenaSettings {
    try {
      const raw = localStorage.getItem('spinpong_curve_arena');
      return raw ? sanitizeArenaSettings(JSON.parse(raw)) : { ...DEFAULT_ARENA_SETTINGS };
    } catch {
      return { ...DEFAULT_ARENA_SETTINGS };
    }
  }

  private setCurveSettings(settings: CurveArenaSettings, save: boolean = true): void {
    this.curveSettings = sanitizeArenaSettings(settings);
    // Matches this player hosts use these settings (a joining client adopts the host's in the handshake)
    if (!this.network.isConnected) {
      this.network.hostedCurveSettings = { ...this.curveSettings };
    }
    document.querySelectorAll<HTMLElement>('[data-arena-size]').forEach(btn => {
      const on = btn.dataset.arenaSize === this.curveSettings.size;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', String(on));
    });
    document.querySelectorAll<HTMLElement>('[data-arena-toggle]').forEach(btn => {
      const on = btn.dataset.arenaToggle === 'portals' ? this.curveSettings.portals : this.curveSettings.obstacles;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    if (save) {
      try {
        localStorage.setItem('spinpong_curve_arena', JSON.stringify(this.curveSettings));
      } catch {
        // storage unavailable
      }
    }
  }

  private updateArenaPickerVisibility(): void {
    const box = document.getElementById('arena-picker-box');
    if (box) box.hidden = this.selectedGameMode !== 'CURVE';
  }

  private canNativeShare(): boolean {
    return typeof navigator.share === 'function' && this.deviceDetector.info.isTouchDevice;
  }

  private resetInviteButtonLabel(): void {
    this.copyLinkBtn.innerHTML = this.canNativeShare()
      ? '<span>📤 Share Invite Link</span>'
      : '<span>📋 Copy Invite Link</span>';
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
    this.controlsSidebarEl.classList.remove('open');
    // Drop focus from the (now hidden) menu button so Space doesn't "click" it again mid-match
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /** `isOnline`: the match keeps running for the opponent, so the menu must not claim the game is paused. */
  public showPauseMenu(show: boolean, isOnline: boolean = false): void {
    this.pauseMenuEl.classList.toggle('active', show);
    if (!show) return;
    const tagline = document.getElementById('pause-tagline');
    if (tagline) {
      tagline.textContent = isOnline
        ? 'Online match is still running — press ESC to return'
        : 'Game is paused — press ESC to resume';
    }
    const title = this.pauseMenuEl.querySelector('.result-title');
    if (title) title.textContent = isOnline ? 'MENU' : 'PAUSED';
    // Restarting an online match needs both players, which the game-over rematch flow handles
    this.pauseRestartBtn.style.display = isOnline ? 'none' : '';
    this.pauseMenuBtn.textContent = isOnline ? 'LEAVE MATCH' : 'MAIN MENU';
  }

  public setCurveTouchControls(show: boolean): void {
    this.curveControlsWanted = show;
    if (this.curveTouchControlsEl) {
      // Tilt replaces the on-screen steering buttons
      const visible = show && this.deviceDetector.info.isTouchDevice && !this.tiltActive;
      this.curveTouchControlsEl.style.display = visible ? 'flex' : 'none';
    }
  }

  public setTiltActive(active: boolean): void {
    this.tiltActive = active;
    this.tiltToggleBtns.forEach(btn => btn.classList.toggle('active', active));
    this.setCurveTouchControls(this.curveControlsWanted);
    this.updateControlsHint();
  }

  public isPauseMenuOpen(): boolean {
    return this.pauseMenuEl.classList.contains('active');
  }

  public showServePrompt(show: boolean): void {
    if (show) {
      const isTouch = this.deviceDetector.info.isTouchDevice;
      const text = this.servePromptEl.querySelector('.serve-text');
      const sub = this.servePromptEl.querySelector('.serve-subtext');
      if (text) text.textContent = isTouch ? 'TAP TO SERVE' : 'CLICK OR PRESS SPACE TO SERVE';
      if (sub) {
        sub.textContent = this.tiltActive
          ? 'or flick your phone'
          : isTouch ? 'Swipe up for a topspin serve' : 'Flick or swipe upward for topspin serve';
      }
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

    const matchPointAt = score.targetScore - 1;
    if (score.player >= matchPointAt && score.cpu >= matchPointAt) {
      this.matchInfoEl.textContent = score.player === score.cpu ? 'DEUCE (WIN BY 2)' : 'ADVANTAGE';
    } else if (score.player >= matchPointAt || score.cpu >= matchPointAt) {
      this.matchInfoEl.textContent = 'MATCH POINT';
    } else {
      this.matchInfoEl.textContent = `FIRST TO ${score.targetScore}`;
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

  /** Pass a Pong `score`, or `null` plus four custom stat tiles (used by Curve Battle). */
  public showGameOver(winner: PlayerId, score: MatchScore | null, customStats?: Array<{ value: string; label: string }>): void {
    const isPlayerWin = winner === 'PLAYER';
    const isCurve = score === null;
    this.resultTitleEl.textContent = isPlayerWin ? 'VICTORY!' : 'DEFEAT';
    this.resultTitleEl.className = `result-title ${isPlayerWin ? 'victory' : 'defeat'}`;
    this.resultSubtitleEl.textContent = isCurve
      ? (isPlayerWin ? 'Last one standing! Your lines held the arena.' : 'Boxed in! Watch the gaps and try again.')
      : (isPlayerWin ? 'Spectacular match! You dominated the table!' : 'Tough match! Hone your timing and challenge again!');

    let stats: Array<{ value: string; label: string }>;
    if (score) {
      const accuracy = score.totalPlayerShots > 0
        ? Math.round((score.goodOrBetterShots / score.totalPlayerShots) * 100)
        : 0;
      stats = [
        { value: `${score.player} - ${score.cpu}`, label: 'Final Score' },
        { value: String(score.longestRally), label: 'Longest Rally' },
        { value: String(score.smashWinners), label: 'Winners' },
        { value: `${accuracy}%`, label: 'Timing Accuracy' }
      ];
    } else {
      stats = customStats ?? [];
    }
    const valueEls = [this.statFinalScoreEl, this.statLongestRallyEl, this.statSmashWinnersEl, this.statAccuracyEl];
    valueEls.forEach((el, i) => {
      el.textContent = stats[i]?.value ?? '-';
      const labelEl = el.parentElement?.querySelector('.stat-lbl');
      if (labelEl && stats[i]) labelEl.textContent = stats[i].label;
    });

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

  // ================= LOBBY BROWSER SYSTEM =================

  public async openLobbyBrowser(): Promise<void> {
    if (!this.lobbyModalEl) return;
    this.lobbyModalEl.classList.add('active');

    // Refresh immediately
    await this.refreshLobbyRooms();

    // Subscribe to real-time pubsub WebSocket updates
    if (this.lobbyWsUnsubscribe) {
      this.lobbyWsUnsubscribe();
    }
    this.lobbyWsUnsubscribe = this.network.subscribeToLobbyUpdates((rooms) => {
      this.renderLobbyRooms(rooms);
    });

    // Slow safety-net poll while the browser is open (the WebSocket above delivers changes live)
    if (this.lobbyPollTimer !== null) clearInterval(this.lobbyPollTimer);
    this.lobbyPollTimer = window.setInterval(async () => {
      if (!this.lobbyModalEl?.classList.contains('active')) {
        if (this.lobbyPollTimer !== null) {
          clearInterval(this.lobbyPollTimer);
          this.lobbyPollTimer = null;
        }
        return;
      }
      await this.refreshLobbyRooms();
    }, 15000);
  }

  public async closeLobbyBrowser(): Promise<void> {
    if (!this.lobbyModalEl) return;
    this.lobbyModalEl.classList.remove('active');
    if (this.lobbyWsUnsubscribe) {
      this.lobbyWsUnsubscribe();
      this.lobbyWsUnsubscribe = null;
    }
    if (this.lobbyPollTimer !== null) {
      clearInterval(this.lobbyPollTimer);
      this.lobbyPollTimer = null;
    }
    if (this.lobbyCreatePanelEl) {
      this.lobbyCreatePanelEl.style.display = 'none';
    }
    // Leaving the lobby while still waiting for a challenger cancels the hosted room
    if (!this.network.isConnected && this.network.hostedRoomId) {
      await this.network.closeLobbyRoom();
    }
    if (this.lobbyHostingViewEl) {
      this.lobbyHostingViewEl.style.display = 'none';
    }
  }

  public async refreshLobbyRooms(): Promise<void> {
    try {
      const data = await this.network.fetchLobbyRooms();
      if (data && data.rooms) {
        this.renderLobbyRooms(data.rooms);
      }
    } catch (e) {
      console.warn('[HUD] Error refreshing lobby rooms:', e);
    }
  }

  private renderLobbyRooms(rooms: LobbyRoom[]): void {
    if (!this.lobbyRoomsBodyEl) return;

    // Filter rooms by mode
    let filtered = rooms || [];
    if (this.lobbyFilter !== 'ALL') {
      filtered = filtered.filter(r => r.gameMode === this.lobbyFilter);
    }

    if (filtered.length === 0) {
      this.lobbyRoomsBodyEl.innerHTML = `
        <tr class="lobby-empty-row">
          <td colspan="6">
            ${this.lobbyFilter === 'ALL' ? 'No open rooms at the moment.' : `No open ${this.lobbyFilter} rooms.`}
            <br/><span style="font-size: 11px; opacity: 0.7;">Click <strong>➕ CREATE ROOM</strong> above to host one!</span>
          </td>
        </tr>
      `;
      return;
    }

    const escapeHtml = (str: string): string => {
      return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const currentPeerId = this.network.peer?.id;

    this.lobbyRoomsBodyEl.innerHTML = filtered.map(room => {
      const isMyRoom = currentPeerId && (room.roomId === currentPeerId || room.roomId.includes(currentPeerId));
      const isFullOrPlaying = room.status === 'playing' || room.playerCount >= 2;
      const safeRoomName = escapeHtml(room.roomName || 'Arena');
      const safeHostName = escapeHtml(room.hostName || 'Player');
      const safeRoomId = escapeHtml(room.roomId);
      const modeBadge = room.gameMode === 'CURVE'
        ? `<span class="badge-mode badge-mode-curve">🐍 CURVE</span>`
        : `<span class="badge-mode badge-mode-pong">🏓 PONG</span>`;
      const statusBadge = room.status === 'waiting'
        ? `<span class="badge-status badge-status-waiting">🟢 OPEN (${room.playerCount}/2)</span>`
        : `<span class="badge-status badge-status-playing">🔵 IN MATCH (${room.playerCount}/2)</span>`;

      return `
        <tr data-room-id="${safeRoomId}" data-room-mode="${room.gameMode}">
          <td><strong style="color: #fff;">${safeRoomName}</strong>${room.gameMode === 'CURVE' && room.curveArena
            ? `<div class="lobby-room-sub">${escapeHtml(describeArena(room.curveArena))}</div>` : ''}</td>
          <td>${modeBadge}</td>
          <td>${safeHostName}</td>
          <td>First to ${room.targetScore}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            ${isMyRoom ? `
              <span style="font-size: 11px; color: var(--arcade-cyan); font-weight: 700;">YOUR ROOM</span>
            ` : `
              <button class="lobby-join-btn" ${isFullOrPlaying ? 'disabled' : ''} data-join-id="${safeRoomId}" data-join-mode="${room.gameMode}">
                ${isFullOrPlaying ? 'FULL' : 'JOIN'}
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Attach click listeners to join buttons
    const joinBtns = this.lobbyRoomsBodyEl.querySelectorAll<HTMLButtonElement>('.lobby-join-btn');
    joinBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const roomId = target.getAttribute('data-join-id');
        const mode = (target.getAttribute('data-join-mode') || 'PONG') as GameModeType;
        if (roomId) {
          await this.joinLobbyRoom(roomId, mode, target);
        }
      });
    });
  }

  private async joinLobbyRoom(roomId: string, mode: GameModeType, btnEl: HTMLButtonElement): Promise<void> {
    btnEl.textContent = 'Connecting...';
    btnEl.disabled = true;

    // Set active game mode before connecting
    this.selectedGameMode = mode;
    if (this.onGameModeSelect) {
      this.onGameModeSelect(mode);
    }

    const cleanId = roomId.replace(/^SP3D-?/i, '');
    const connected = await this.network.connectToPeer(cleanId);
    if (!connected) {
      btnEl.textContent = 'JOIN';
      btnEl.disabled = false;
      this.showCallout('COULD NOT CONNECT TO ROOM', 2000);
    } else {
      await this.closeLobbyBrowser();
    }
  }

  private async handleLobbyRoomCreation(): Promise<void> {
    const rawName = this.createRoomNameInput?.value.trim() || `${this.network.localUsername}'s Arena`;
    const scoreVal = parseInt(this.createRoomScoreSelect?.value || '11', 10);
    const mode = this.currentCreateMode;

    if (this.lobbySubmitCreateBtn) {
      this.lobbySubmitCreateBtn.textContent = 'Creating...';
      this.lobbySubmitCreateBtn.setAttribute('disabled', 'true');
    }

    // Set HUD active mode
    this.selectedGameMode = mode;
    if (this.onGameModeSelect) {
      this.onGameModeSelect(mode);
    }

    this.network.hostedCurveSettings = { ...this.curveSettings };
    const code = await this.network.createLobbyRoom(mode, rawName, scoreVal);

    if (this.lobbyCreatePanelEl) {
      this.lobbyCreatePanelEl.style.display = 'none';
    }
    if (this.lobbySubmitCreateBtn) {
      this.lobbySubmitCreateBtn.textContent = 'HOST & WAIT FOR OPPONENT';
      this.lobbySubmitCreateBtn.removeAttribute('disabled');
    }

    // Show hosting banner in lobby
    if (this.lobbyHostingViewEl) {
      this.lobbyHostingViewEl.style.display = 'block';
    }
    if (this.hostingRoomCodeEl) {
      this.hostingRoomCodeEl.textContent = code.toUpperCase();
    }
    if (this.hostingRoomTitleEl) {
      this.hostingRoomTitleEl.textContent = `HOSTING ${rawName.toUpperCase()}`;
    }

    // Trigger immediate refresh so host sees their own room
    await this.refreshLobbyRooms();
  }

  private async handleLobbyCancelHost(): Promise<void> {
    await this.network.closeLobbyRoom();
    if (this.lobbyHostingViewEl) {
      this.lobbyHostingViewEl.style.display = 'none';
    }
    await this.refreshLobbyRooms();
  }
}

