import { GameState, MatchScore, PlayerId, ShotInfo } from '../types';
import { EventBus } from './EventBus';

export class StateMachine {
  public state: GameState = 'MENU';
  public score: MatchScore;
  private eventBus: EventBus;

  // Rally validation state
  private lastHitter: PlayerId | null = null;
  private hasBouncedOnStrikerSide: boolean = false; // For service
  private hasBouncedOnReceiverSide: boolean = false;
  private isServicePhase: boolean = false;
  private pointResolved: boolean = false;

  constructor() {
    this.eventBus = EventBus.get();
    this.score = this.createInitialScore();
    this.setupListeners();
  }

  private createInitialScore(): MatchScore {
    return {
      player: 0,
      cpu: 0,
      server: 'PLAYER',
      consecutiveServes: 0,
      rallyCount: 0,
      longestRally: 0,
      smashWinners: 0,
      totalPlayerShots: 0,
      goodOrBetterShots: 0
    };
  }

  public resetMatch(): void {
    this.score = this.createInitialScore();
    this.eventBus.emit('score:updated', { ...this.score });
    this.setState('SERVE_WAIT');
  }

  public setState(newState: GameState): void {
    const oldState = this.state;
    this.state = newState;
    this.eventBus.emit('state:changed', { from: oldState, to: newState });
  }

  private setupListeners(): void {
    this.eventBus.on('ball:hit', (shot: ShotInfo) => {
      this.handleBallHit(shot);
    });

    this.eventBus.on('ball:bounce', (bounce) => {
      this.handleBallBounce(bounce.surface);
    });
  }

  public prepareService(): void {
    this.isServicePhase = true;
    this.pointResolved = false;
    this.lastHitter = null;
    this.hasBouncedOnStrikerSide = false;
    this.hasBouncedOnReceiverSide = false;
    this.score.rallyCount = 0;
    this.eventBus.emit('score:updated', { ...this.score });
    this.setState('SERVE_WAIT');
  }

  private handleBallHit(shot: ShotInfo): void {
    if (this.state === 'GAME_OVER') return;

    this.pointResolved = false;
    this.lastHitter = shot.hitter;

    if (shot.hitter === 'PLAYER') {
      this.score.totalPlayerShots++;
      if (shot.rating === 'PERFECT' || shot.rating === 'GOOD' || shot.rating === 'SMASH') {
        this.score.goodOrBetterShots++;
      }
    }

    if (this.state === 'SERVE_WAIT' || this.isServicePhase) {
      this.hasBouncedOnStrikerSide = false;
      this.hasBouncedOnReceiverSide = false;
      this.setState('RALLY');
    } else {
      // Regular rally hit
      this.score.rallyCount++;
      if (this.score.rallyCount > this.score.longestRally) {
        this.score.longestRally = this.score.rallyCount;
      }
      this.eventBus.emit('score:updated', { ...this.score });
      this.hasBouncedOnReceiverSide = false;
    }
  }

  private handleBallBounce(surface: 'player_table' | 'cpu_table' | 'floor' | 'net'): void {
    if (this.state !== 'RALLY' || this.pointResolved) return;

    if (surface === 'net') {
      // Net cord handled by physics. If in service and it lands on opponent table later, could be Let.
      return;
    }

    if (this.isServicePhase) {
      this.handleServiceBounce(surface);
      return;
    }

    // --- Regular Rally Rules ---
    const opponentSide = this.lastHitter === 'PLAYER' ? 'cpu_table' : 'player_table';
    const ownSide = this.lastHitter === 'PLAYER' ? 'player_table' : 'cpu_table';

    if (surface === opponentSide) {
      if (!this.hasBouncedOnReceiverSide) {
        // Legal bounce on opponent's table
        this.hasBouncedOnReceiverSide = true;
      } else {
        // Double bounce on opponent table -> Opponent failed to return in time!
        const winner = this.lastHitter!;
        this.awardPoint(winner, 'DOUBLE BOUNCE');
      }
    } else if (surface === ownSide) {
      // Ball bounced back onto striker's own table -> Fault!
      const winner = this.lastHitter === 'PLAYER' ? 'CPU' : 'PLAYER';
      this.awardPoint(winner, 'FAULT');
    } else if (surface === 'floor') {
      // Ball hit the floor
      if (this.hasBouncedOnReceiverSide) {
        // Bounced on receiver's table, receiver failed to hit before floor -> striker wins!
        const winner = this.lastHitter!;
        this.awardPoint(winner, 'WINNER');
      } else {
        // Struck ball went straight out to floor without landing on opponent table -> striker loses!
        const winner = this.lastHitter === 'PLAYER' ? 'CPU' : 'PLAYER';
        this.awardPoint(winner, 'OUT');
      }
    }
  }

  private handleServiceBounce(surface: 'player_table' | 'cpu_table' | 'floor' | 'net'): void {
    const serverSide = this.score.server === 'PLAYER' ? 'player_table' : 'cpu_table';
    const receiverSide = this.score.server === 'PLAYER' ? 'cpu_table' : 'player_table';

    if (!this.hasBouncedOnStrikerSide) {
      // First bounce must be on server's own table side
      if (surface === serverSide) {
        this.hasBouncedOnStrikerSide = true;
      } else {
        // Failed to bounce on own table first -> Service fault!
        const winner = this.score.server === 'PLAYER' ? 'CPU' : 'PLAYER';
        this.awardPoint(winner, 'SERVICE FAULT');
      }
    } else if (!this.hasBouncedOnReceiverSide) {
      // Second bounce must be on receiver's table side
      if (surface === receiverSide) {
        this.hasBouncedOnReceiverSide = true;
        this.isServicePhase = false; // Successfully in active rally!
      } else {
        const winner = this.score.server === 'PLAYER' ? 'CPU' : 'PLAYER';
        this.awardPoint(winner, 'SERVICE OUT');
      }
    }
  }

  public awardPoint(winner: PlayerId, reason: string): void {
    if (this.pointResolved) return;
    this.pointResolved = true;

    if (winner === 'PLAYER') {
      this.score.player++;
      if (reason === 'SMASH' || this.score.rallyCount > 4) {
        this.score.smashWinners++;
      }
    } else {
      this.score.cpu++;
    }

    this.eventBus.emit('point:scored', { winner, reason });
    this.eventBus.emit('score:updated', { ...this.score });

    // Check Match Over (11 points & win by 2)
    const p = this.score.player;
    const c = this.score.cpu;
    const isDeuce = p >= 10 && c >= 10;
    const lead = Math.abs(p - c);

    if ((p >= 11 || c >= 11) && lead >= 2) {
      this.setState('GAME_OVER');
      this.eventBus.emit('match:over', { winner, score: { ...this.score } });
      return;
    }

    // Rotate server: every 2 points, or every point if deuce
    this.score.consecutiveServes++;
    const serveCycle = isDeuce ? 1 : 2;
    if (this.score.consecutiveServes >= serveCycle) {
      this.score.consecutiveServes = 0;
      this.score.server = this.score.server === 'PLAYER' ? 'CPU' : 'PLAYER';
      this.eventBus.emit('serve:ready', { server: this.score.server });
    }

    // Delay before next serve
    setTimeout(() => {
      if (this.state !== 'GAME_OVER') {
        this.prepareService();
      }
    }, 1200);
  }
}
