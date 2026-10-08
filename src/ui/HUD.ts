import { Difficulty, MatchScore, PlayerId, ShotInfo, MultiplayerRole, LobbyRoom, GameModeType } from '../types';
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
  private matchmakingPollTimer: number | null = null;
  private isStartingMatch: boolean = false;

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
        this.updateControlsHint();
        if (this.onGameModeSelect) this.onGameModeSelect('PONG');
      });

      curveBtn.addEventListener('click', () => {
        curveBtn.classList.add('active');
        pongBtn.classList.remove('active');
        this.selectedGameMode = 'CURVE';
        if (diffBox) diffBox.style.display = 'flex'; // Allow choosing Novice, Pro, or Champion bot
        this.updateControlsHint();
        if (this.onGameModeSelect) this.onGameModeSelect('CURVE');
      });
    }


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
      });

      this.createModeCurveBtn.addEventListener('click', () => {
        this.createModeCurveBtn!.classList.add('active');
        this.createModePongBtn!.classList.remove('active');
        this.currentCreateMode = 'CURVE';
        if (this.createRoomScoreSelect) this.createRoomScoreSelect.value = '5';
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
      this.matchInfoEl.textContent = 'FIRST TO 5';
      this.showCallout(`ROUND ${roundNumber}`, 1100);
      if (this.deviceDetector.info.isTouchDevice) {
        if (this.curveTouchControlsEl) this.curveTouchControlsEl.style.display = 'flex';
      }
    });


    this.eventBus.on('curve:score', (score) => {
      this.playerScoreEl.textContent = String(score.player);
      this.cpuScoreEl.textContent = String(score.cpu);
      this.matchInfoEl.textContent = `FIRST TO ${score.targetScore}`;
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
      if (this.curveTouchControlsEl) this.curveTouchControlsEl.style.display = 'none';
      const fakeMatchScore: MatchScore = {
        player: score.player,
        cpu: score.cpu,
        server: 'PLAYER',
        consecutiveServes: 0,
        rallyCount: 0,
        longestRally: Math.max(score.player, score.cpu),
        smashWinners: 0,
        totalPlayerShots: score.player + score.cpu,
        goodOrBetterShots: score.player
      };
      this.showGameOver(winner, fakeMatchScore);
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
    this.eventBus.on('network:status', ({ status, role, remoteUsername, message }) => {
      if (status === 'connected') {
        this.mmStatusTitleEl.textContent = 'Opponent Connected!';
        this.mmStatusSubEl.textContent = `Matched with ${remoteUsername} (Direct P2P)`;
        this.hudPingBadgeEl.style.display = 'flex';
        this.currentMode = 'MULTIPLAYER';

        this.setOpponentName(remoteUsername ? remoteUsername.toUpperCase() : 'OPPONENT');
        this.setPlayerName(this.network.localUsername.toUpperCase());

        if (this.isStartingMatch) return;
        this.isStartingMatch = true;

        setTimeout(() => {
          this.closeMatchmaking();
          this.hideMainMenu();
          if (this.onStartMultiplayerMatch) {
            this.onStartMultiplayerMatch(role || 'CLIENT', remoteUsername || 'Opponent');
          }
        }, 500);
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
    if (this.matchmakingPollTimer !== null) {
      clearInterval(this.matchmakingPollTimer);
      this.matchmakingPollTimer = null;
    }
    this.network.isSearching = false;
    this.isStartingMatch = false;
    this.mmModalEl.classList.remove('active');
    if (!this.network.isConnected) {
      this.network.reportPresence('menu');
    }
  }

  private async startQuickMatchmaking(): Promise<void> {
    if (this.matchmakingPollTimer !== null) {
      clearInterval(this.matchmakingPollTimer);
      this.matchmakingPollTimer = null;
    }

    this.network.isSearching = true;
    this.isStartingMatch = false;
    this.mmStatusTitleEl.textContent = 'Connecting to P2P network...';
    this.mmStatusSubEl.textContent = 'Initializing PeerJS room...';
    this.mmPingValEl.textContent = '-- ms';

    // 1. Initialize peer FIRST so this.network.peer has its real ID
    const myCode = await this.network.initPeer();
    if (!this.mmModalEl.classList.contains('active')) return;

    // 2. Announce locally via BroadcastChannel for multi-tab testing
    this.network.broadcastLocalSearch();

    // 3. Register real peer ID with presence queue
    this.mmStatusTitleEl.textContent = 'Scanning for opponents...';
    this.mmStatusSubEl.textContent = 'Looking for active players...';
    const presenceData = await this.network.reportPresence('searching');

    // 4. Try candidates if any exist
    const myPeerId = this.network.peer?.id;
    const candidates = (presenceData?.candidates || []).filter(c => c.peerId !== myPeerId);

    if (candidates.length > 0) {
      this.mmStatusSubEl.textContent = `Found ${candidates.length} candidate(s). Connecting...`;
      const matched = await this.network.findBestCandidateMatch(candidates);
      if (matched) {
        this.mmStatusTitleEl.textContent = 'Opponent Found!';
        this.mmStatusSubEl.textContent = 'Opening direct WebRTC channel...';
        return;
      }
    }

    // 5. If no candidates, host and poll
    this.mmStatusTitleEl.textContent = 'Waiting for Challenger...';
    this.mmStatusSubEl.textContent = `Hosting room [${myCode.toUpperCase()}]. Waiting for match...`;

    // Start polling presence while waiting
    this.matchmakingPollTimer = window.setInterval(async () => {
      if (this.network.isConnected || !this.mmModalEl.classList.contains('active')) {
        if (this.matchmakingPollTimer !== null) {
          clearInterval(this.matchmakingPollTimer);
          this.matchmakingPollTimer = null;
        }
        return;
      }

      this.network.broadcastLocalSearch();
      const updated = await this.network.reportPresence('searching');
      const newCandidates = (updated?.candidates || []).filter(c => c.peerId !== this.network.peer?.id);
      if (newCandidates.length > 0 && !this.network.isConnected) {
        const matched = await this.network.findBestCandidateMatch(newCandidates);
        if (matched && this.matchmakingPollTimer !== null) {
          clearInterval(this.matchmakingPollTimer);
          this.matchmakingPollTimer = null;
        }
      }
    }, 2000);
  }

  private async startFriendRoomHosting(): Promise<void> {
    this.displayRoomCodeEl.textContent = '...';
    const code = await this.network.initPeer();
    this.displayRoomCodeEl.textContent = code.toUpperCase();
  }

  private updateControlsHint(): void {
    if (!this.controlsHintEl) return;
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

  // ================= LOBBY BROWSER SYSTEM =================

  public async openLobbyBrowser(): Promise<void> {
    if (!this.lobbyModalEl) return;
    this.lobbyModalEl.classList.add('active');

    // Refresh immediately
    await this.refreshLobbyRooms();

    // Start 3-second polling interval while browser is open
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
    }, 3000);
  }

  public async closeLobbyBrowser(): Promise<void> {
    if (!this.lobbyModalEl) return;
    this.lobbyModalEl.classList.remove('active');
    if (this.lobbyPollTimer !== null) {
      clearInterval(this.lobbyPollTimer);
      this.lobbyPollTimer = null;
    }
    if (this.lobbyCreatePanelEl) {
      this.lobbyCreatePanelEl.style.display = 'none';
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

    const currentPeerId = this.network.peer?.id;

    this.lobbyRoomsBodyEl.innerHTML = filtered.map(room => {
      const isMyRoom = currentPeerId && (room.roomId === currentPeerId || room.roomId.includes(currentPeerId));
      const isFullOrPlaying = room.status === 'playing' || room.playerCount >= 2;
      const modeBadge = room.gameMode === 'CURVE'
        ? `<span class="badge-mode badge-mode-curve">🐍 CURVE</span>`
        : `<span class="badge-mode badge-mode-pong">🏓 PONG</span>`;
      const statusBadge = room.status === 'waiting'
        ? `<span class="badge-status badge-status-waiting">🟢 OPEN (${room.playerCount}/2)</span>`
        : `<span class="badge-status badge-status-playing">🔵 IN MATCH (${room.playerCount}/2)</span>`;

      return `
        <tr data-room-id="${room.roomId}" data-room-mode="${room.gameMode}">
          <td><strong style="color: #fff;">${room.roomName}</strong></td>
          <td>${modeBadge}</td>
          <td>${room.hostName}</td>
          <td>First to ${room.targetScore}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            ${isMyRoom ? `
              <span style="font-size: 11px; color: var(--arcade-cyan); font-weight: 700;">YOUR ROOM</span>
            ` : `
              <button class="lobby-join-btn" ${isFullOrPlaying ? 'disabled' : ''} data-join-id="${room.roomId}" data-join-mode="${room.gameMode}">
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

