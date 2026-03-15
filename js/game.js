// ============================================================
// Drupal Drop Fighter — Game Engine
// ============================================================
// State machine, round flow, collision detection, effects.

import {
    SCREEN, FIGHTER, GAME_STATE, FIGHTER_STATE, ROUND, MOVE,
    DAMAGE, HITBOXES, PROJECTILE, FX, ROUND_THEMES, WIN_QUOTES,
} from './config.js';
import { Fighter } from './fighter.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';

export class Game {
    constructor(hud, audio, input) {
        this.hud = hud;
        this.audio = audio;
        this.input = input;

        // Fighters
        this.player = new Player(FIGHTER.P1_START_X, SCREEN.FLOOR_Y, 1);
        this.enemy = new Enemy(FIGHTER.P2_START_X, SCREEN.FLOOR_Y, -1);

        // State
        this.state = GAME_STATE.ATTRACT;
        this.stateTimer = 0;

        // Attract / demo mode — AI controls both fighters
        this.attractMode = true;

        // Round tracking
        this.currentRound = 0;   // 0-indexed
        this.roundTimer = ROUND.TIMER_SECONDS * 60; // in frames

        // Effects
        this.particles = [];
        this.screenShake = { x: 0, y: 0, timer: 0, intensity: 0 };

        // Paused
        this.paused = false;

        // Trash talk timers (offset so they don't fire simultaneously)
        this._trashTalkTimer = 0;
        this._playerTrashTalkTimer = 0;

        // Hitstop — main.js reads this
        this._hitstopRequest = 0;
    }

    // ---------------------------------------------------------
    // Main Update (called once per frame)
    // ---------------------------------------------------------

    update() {
        if (this.paused) return;

        this.stateTimer++;

        switch (this.state) {
            case GAME_STATE.ATTRACT:
                this.updateAttract();
                break;
            case GAME_STATE.INTRO:
                this.updateIntro();
                break;
            case GAME_STATE.ROUND_INTRO:
                this.updateRoundIntro();
                break;
            case GAME_STATE.FIGHT_FLASH:
                this.updateFightFlash();
                break;
            case GAME_STATE.FIGHTING:
                this.updateFighting();
                break;
            case GAME_STATE.ROUND_OVER:
                this.updateRoundOver();
                break;
            case GAME_STATE.MATCH_OVER:
                // Static — waiting for player input via HUD
                break;
        }

        // Always update particles
        this.updateParticles();
        this.updateScreenShake();
    }

    // ---------------------------------------------------------
    // State: Attract (demo mode — AI vs AI)
    // ---------------------------------------------------------

    updateAttract() {
        // Brief pause before the demo battle begins
        if (this.stateTimer >= 30) {
            this.startAttractBattle();
        }
    }

    startAttractBattle() {
        this.player.resetFull(FIGHTER.P1_START_X);
        this.enemy.resetFull(FIGHTER.P2_START_X);
        delete this.player._atDecTimer;
        delete this.player._atAction;
        this.currentRound = 0;
        this.particles = [];
        this.hud.reset();
        this.startRound();
    }

    /** Transition from attract mode to a real player-controlled match. */
    startFromAttract() {
        if (!this.attractMode) return;
        this.attractMode = false;
        this.audio.init();
        this.audio.stopMenuMusic();
        this.audio.stopFightMusic();
        this.hud.hideAnnouncement();
        this.player.resetFull(FIGHTER.P1_START_X);
        delete this.player._atDecTimer;
        delete this.player._atAction;
        this.enemy.resetFull(FIGHTER.P2_START_X);
        this.currentRound = 0;
        this.particles = [];
        this.screenShake = { x: 0, y: 0, timer: 0, intensity: 0 };
        this.hud.reset();
        this.startRound();
    }

    /**
     * Simple AI controller used for the player fighter during attract mode.
     * Mirrors the structure of Enemy.aiUpdate() with basic fight behaviour.
     */
    _attractAiUpdate(fighter, opponent) {
        if (fighter.isIncapacitated() || fighter.isInCinematic()) return;
        fighter.faceOpponent(opponent);

        if (fighter._atDecTimer === undefined) {
            fighter._atDecTimer = 0;
            fighter._atAction = 'idle';
        }

        fighter._atDecTimer--;
        const dist = fighter.distanceTo(opponent);

        // Execute current behaviour while timer is running
        if (fighter._atDecTimer > 0) {
            if (!fighter.canMove()) return;
            switch (fighter._atAction) {
                case 'approach': fighter.walkForward(); break;
                case 'retreat': fighter.startBlocking(); fighter.walkBack(); break;
                case 'jump': fighter.jump(); break;
                default: fighter.idle(); break;
            }
            return;
        }

        // Make a new decision
        fighter.stopBlocking();
        fighter._atDecTimer = 12 + Math.floor(Math.random() * 18);

        const isHero = fighter === this.player;

        if (isHero) {
            // Hero is a zoner — stay at 150-250px and spam head throws
            const idealMin = 150, idealMax = 260;
            if (dist < idealMin) {
                // Too close — back up
                fighter._atAction = 'retreat';
            } else if (dist > idealMax) {
                // Too far — walk in a bit
                fighter._atAction = 'approach';
            } else {
                // Sweet spot — fire head throw (must use _startSpecialMove to launch the projectile)
                if (fighter.canAttack()) {
                    fighter._startSpecialMove(MOVE.HEAD_THROW);
                }
                fighter._atAction = 'idle';
            }
        } else {
            if (dist > 280) {
                fighter._atAction = 'approach';
            } else if (dist < 90) {
                if (fighter.canAttack()) {
                    const r = Math.random();
                    if (r < 0.35)      { fighter.startAttack(MOVE.JAB); }
                    else if (r < 0.6)  { fighter.startAttack(MOVE.KICK); }
                    else if (r < 0.75) { fighter.startAttack(MOVE.UPPERCUT); }
                    else if (r < 0.85) { fighter.jump(); }
                    else               { fighter._atAction = 'retreat'; return; }
                    fighter._atAction = 'idle';
                } else {
                    fighter._atAction = Math.random() < 0.5 ? 'retreat' : 'idle';
                }
            } else {
                const roll = Math.random();
                if (roll < 0.4)      { fighter._atAction = 'approach'; }
                else if (roll < 0.65 && fighter.canAttack()) { fighter.startAttack(Math.random() < 0.5 ? MOVE.JAB : MOVE.KICK); fighter._atAction = 'idle'; }
                else if (roll < 0.82) { fighter._atAction = 'retreat'; }
                else if (roll < 0.92) { fighter._atAction = 'jump'; }
                else                  { fighter._atAction = 'idle'; }
            }
        }

        // Execute newly chosen action
        if (!fighter.canMove()) return;
        switch (fighter._atAction) {
            case 'approach': fighter.walkForward(); break;
            case 'retreat': fighter.startBlocking(); fighter.walkBack(); break;
            case 'jump': fighter.jump(); break;
            default: fighter.idle(); break;
        }
    }

    // ---------------------------------------------------------
    // State: Intro
    // ---------------------------------------------------------

    updateIntro() {
        // Intro screen is handled by HUD — waiting for start button
        // start() is called by main.js when player clicks start
    }

    start() {
        this.audio.init();
        this.audio.stopMenuMusic();
        this.hud.hideIntroScreen();
        this.startRound();
    }

    // ---------------------------------------------------------
    // State: Round Intro
    // ---------------------------------------------------------

    startRound() {
        // Reset fighters for this round
        this.player.resetForRound(FIGHTER.P1_START_X);
        this.enemy.resetForRound(FIGHTER.P2_START_X);
        this.enemy.setRound(this.currentRound);
        this.input.reset();

        // Reset round timer
        this.roundTimer = ROUND.TIMER_SECONDS * 60;

        // Clear particles and stagger trash talk timers
        this.particles = [];
        this._playerTrashTalkTimer = 210; // player talks first ~3.5s in
        this._trashTalkTimer = 420;       // enemy responds ~7s in

        // Update HUD
        this.hud.setHealth(1, this.player.hp, FIGHTER.MAX_HP);
        this.hud.setHealth(2, this.enemy.hp, FIGHTER.MAX_HP);
        this.hud.setTimer(ROUND.TIMER_SECONDS);

        // Show round intro
        const theme = ROUND_THEMES[this.currentRound];
        this.hud.showRoundIntro(this.currentRound + 1, theme.name);

        // Set fighters to intro walk
        this.player.setState(FIGHTER_STATE.INTRO_WALK);
        this.enemy.setState(FIGHTER_STATE.INTRO_WALK);

        this.changeState(GAME_STATE.ROUND_INTRO);
    }

    updateRoundIntro() {
        // Fighters walk to starting positions during intro
        const introProg = Math.min(this.stateTimer / ROUND.INTRO_DURATION, 1);

        // Smoothly move fighters to start positions
        this.player.x = SCREEN.LEFT_BOUND + (FIGHTER.P1_START_X - SCREEN.LEFT_BOUND) * introProg;
        this.enemy.x = SCREEN.RIGHT_BOUND - (SCREEN.RIGHT_BOUND - FIGHTER.P2_START_X) * introProg;

        if (this.stateTimer >= ROUND.INTRO_DURATION) {
            // Snap to positions
            this.player.x = FIGHTER.P1_START_X;
            this.enemy.x = FIGHTER.P2_START_X;
            this.player.setState(FIGHTER_STATE.IDLE);
            this.enemy.setState(FIGHTER_STATE.IDLE);

            this.hud.hideAnnouncement();
            this.hud.showFightFlash();
            this.audio.playRoundStart();

            this.changeState(GAME_STATE.FIGHT_FLASH);
        }
    }

    // ---------------------------------------------------------
    // State: Fight Flash
    // ---------------------------------------------------------

    updateFightFlash() {
        if (this.stateTimer >= ROUND.FIGHT_FLASH_DURATION) {
            this.audio.startFightMusic();
            this.changeState(GAME_STATE.FIGHTING);
        }
    }

    // ---------------------------------------------------------
    // State: Fighting
    // ---------------------------------------------------------

    updateFighting() {
        // --- Input ---
        this.input.update();
        if (this.attractMode) {
            this._attractAiUpdate(this.player, this.enemy);
        } else {
            this.player.handleInput(this.input);
        }

        // --- AI ---
        if (this.attractMode) {
            this._attractAiUpdate(this.enemy, this.player);
        } else {
            this.enemy.aiUpdate(this.player);
        }

        // --- Auto-face ---
        this.player.faceOpponent(this.enemy);
        this.enemy.faceOpponent(this.player);

        // --- Update fighters ---
        this.player.update();
        this.enemy.update();

        // --- Push box resolution ---
        Fighter.resolvePushBoxes(this.player, this.enemy);

        // --- Hit detection: player attacks enemy ---
        this.checkHit(this.player, this.enemy);

        // --- Hit detection: enemy attacks player ---
        this.checkHit(this.enemy, this.player);

        // --- Enemy trash talk ---
        this.updateTrashTalk();

        // --- Projectile collisions ---
        this.checkProjectiles();

        // --- Update HUD ---
        this.hud.setHealth(1, this.player.hp, FIGHTER.MAX_HP);
        this.hud.setHealth(2, this.enemy.hp, FIGHTER.MAX_HP);

        // --- Round timer ---
        this.roundTimer--;
        const seconds = Math.max(0, Math.ceil(this.roundTimer / 60));
        this.hud.setTimer(seconds);

        // --- Check round end conditions ---
        if (!this.enemy.alive) {
            this.endRound('player');
        } else if (!this.player.alive || this.roundTimer <= 0) {
            // In attract mode hero always wins; in real game use health
            if (this.attractMode || this.player.hp >= this.enemy.hp) {
                this.endRound('player');
            } else {
                this.endRound('enemy');
            }
        }
    }

    // ---------------------------------------------------------
    // Hit Detection
    // ---------------------------------------------------------

    checkHit(attacker, defender) {
        if (!attacker.checkHit(defender)) return;

        // Register the hit so it won't trigger again for this attack
        attacker.registerHit();

        const damage = attacker.getMoveDamage();
        const knockback = attacker.getMoveKnockback();
        const hitstun = attacker.getMoveHitstun();
        const causesKnockdown = attacker.getMoveKnockdown();

        const result = defender.takeDamage(damage, knockback, hitstun, causesKnockdown);

        // Trigger effects based on result
        this.onHitResult(result, attacker, defender);
    }

    checkProjectiles() {
        // Player head throw vs enemy
        if (this.player.headProjectile && this.player.headProjectile.active && !this.player.headProjectile.returning) {
            const phb = this.player.getProjectileHitBox();
            if (phb && Fighter.boxOverlap(phb, this.enemy.getHurtBox())) {
                const result = this.enemy.takeDamage(
                    DAMAGE.HEAD_THROW,
                    FIGHTER.KNOCKBACK_HEAVY,
                    FIGHTER.HITSTUN_HEAVY,
                    false
                );
                // Start returning after hit
                this.player.headProjectile.returning = true;
                this.onHitResult(result, this.player, this.enemy);
            }
        }

        // Enemy projectile vs player
        if (this.enemy.projectile && this.enemy.projectile.active) {
            const ehb = this.enemy.getProjectileHitBox();
            if (ehb && Fighter.boxOverlap(ehb, this.player.getHurtBox())) {
                const damage = this.enemy.getMoveDamage();
                const result = this.player.takeDamage(
                    damage || 14, // fallback
                    FIGHTER.KNOCKBACK_FORCE,
                    FIGHTER.HITSTUN_MEDIUM,
                    false
                );
                this.enemy.projectile.active = false;
                this.onHitResult(result, this.enemy, this.player);
            }
        }

        // Projectile vs projectile clash
        if (this.player.headProjectile && this.player.headProjectile.active &&
            this.enemy.projectile && this.enemy.projectile.active) {
            const phb = this.player.getProjectileHitBox();
            const ehb = this.enemy.getProjectileHitBox();
            if (phb && ehb && Fighter.boxOverlap(phb, ehb)) {
                // Both destroyed
                this.player.headProjectile.returning = true;
                this.enemy.projectile.active = false;
                // Clash particles
                const cx = (this.player.headProjectile.x + this.enemy.projectile.x) / 2;
                const cy = (this.player.headProjectile.y + this.enemy.projectile.y) / 2;
                this.spawnParticles(cx, cy, 'special', 8);
                this.audio.playBlock();
            }
        }
    }

    // ---------------------------------------------------------
    // Hit Effects
    // ---------------------------------------------------------

    onHitResult(result, attacker, defender) {
        if (!result || result === 'immune') return;

        // Screen position for particles
        const px = defender.x;
        const py = defender.y - FIGHTER.HEIGHT / 2;

        switch (result) {
            case 'hit':
                this.audio.playHitLight();
                this.spawnParticles(px, py, 'hit', FX.PARTICLE_COUNT_HIT);
                this.triggerScreenShake(FX.SCREEN_SHAKE_LIGHT);
                this.hud.flashHealth(defender === this.player ? 1 : 2);
                this._hitstopRequest = 3; // brief freeze
                break;

            case 'knockdown':
                this.audio.playHitHeavy();
                this.spawnParticles(px, py, 'hit', FX.PARTICLE_COUNT_HIT + 4);
                this.triggerScreenShake(FX.SCREEN_SHAKE_HEAVY);
                this.hud.flashHealth(defender === this.player ? 1 : 2);
                this._hitstopRequest = 6; // longer freeze for drama
                break;

            case 'blocked':
                this.audio.playBlock();
                this.spawnParticles(px, py, 'block', 4);
                this.triggerScreenShake(FX.SCREEN_SHAKE_LIGHT);
                this._hitstopRequest = 2;
                break;

            case 'ko':
                this.audio.playKO();
                this.spawnParticles(px, py, 'ko', FX.PARTICLE_COUNT_KO);
                this.triggerScreenShake(FX.SCREEN_SHAKE_HEAVY);
                this.hud.flashHealth(defender === this.player ? 1 : 2);
                this._hitstopRequest = 10; // big freeze on KO
                break;
        }
    }

    // ---------------------------------------------------------
    // Round End
    // ---------------------------------------------------------

    endRound(winner) {
        this.audio.stopFightMusic();

        // Show round end text
        if (!this.player.alive || !this.enemy.alive) {
            this.hud.showRoundEnd('K.O.!');
            this.audio.playKO();
        } else {
            this.hud.showRoundEnd('TIME!');
        }

        // Award win
        if (winner === 'player') {
            this.player.wins++;
            this.hud.setRoundWon(1, this.currentRound);
            this.player.setState(FIGHTER_STATE.WIN_POSE);
        } else {
            this.enemy.wins++;
            this.hud.setRoundWon(2, this.currentRound);
            this.enemy.setState(FIGHTER_STATE.WIN_POSE);
        }

        // KO freeze then transition
        this.changeState(GAME_STATE.ROUND_OVER);
    }

    updateRoundOver() {
        if (this.stateTimer >= ROUND.ROUND_OVER_DURATION) {
            this.hud.hideAnnouncement();

            // Check for match over
            if (this.player.wins >= ROUND.WINS_NEEDED) {
                this.matchOver('player');
            } else if (this.enemy.wins >= ROUND.WINS_NEEDED) {
                this.matchOver('enemy');
            } else {
                // Next round
                this.currentRound++;
                this.startRound();
            }
        }
    }

    // ---------------------------------------------------------
    // Match Over
    // ---------------------------------------------------------

    matchOver(winner) {
        // In attract mode: loop the demo
        if (this.attractMode) {
            this.changeState(GAME_STATE.ATTRACT);
            return;
        }

        this.changeState(GAME_STATE.MATCH_OVER);

        if (winner === 'player') {
            const quote = WIN_QUOTES[Math.floor(Math.random() * WIN_QUOTES.length)];
            this.hud.showWinScreen('player', quote);
            this.audio.playWin();
        } else {
            const theme = ROUND_THEMES[this.currentRound];
            this.hud.showWinScreen('enemy', theme.loseQuote);
        }

        this.hud.onRestart(() => this.restart());
    }

    restart() {
        this.player.resetFull(FIGHTER.P1_START_X);
        this.enemy.resetFull(FIGHTER.P2_START_X);
        this.currentRound = 0;
        this.particles = [];
        this.screenShake = { x: 0, y: 0, timer: 0, intensity: 0 };

        this.hud.hideWinScreen();
        this.hud.reset();

        this.startRound();
    }

    // ---------------------------------------------------------
    // Particles
    // ---------------------------------------------------------

    spawnParticles(x, y, type, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = FX.PARTICLE_SPEED * (0.5 + Math.random());
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2, // slight upward bias
                type,
                life: 1,
                decay: 1 / (FX.PARTICLE_LIFETIME * (0.5 + Math.random())),
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2; // gravity
            p.life -= p.decay;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    // ---------------------------------------------------------
    // Screen Shake
    // ---------------------------------------------------------

    triggerScreenShake(intensity) {
        this.screenShake.intensity = intensity;
        this.screenShake.timer = FX.SCREEN_SHAKE_DURATION;
    }

    updateScreenShake() {
        if (this.screenShake.timer > 0) {
            this.screenShake.timer--;
            const t = this.screenShake.timer / FX.SCREEN_SHAKE_DURATION;
            const i = this.screenShake.intensity * t;
            this.screenShake.x = (Math.random() - 0.5) * i * 2;
            this.screenShake.y = (Math.random() - 0.5) * i * 2;
        } else {
            this.screenShake.x = 0;
            this.screenShake.y = 0;
        }
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------

    updateTrashTalk() {
        const interval = () => 330 + Math.floor(Math.random() * 150);

        // Enemy trash talk
        this._trashTalkTimer--;
        if (this._trashTalkTimer <= 0) {
            this._trashTalkTimer = interval();
            const lines = [
                'You will debug Twig templates and you will like it!',
                'Security patches available. Manual update required. Good luck.',
                'Include my jQuery library or suffer the consequences!',
            ];
            this.hud.showMoveAnnouncement(lines[Math.floor(Math.random() * lines.length)]);
        }

        // Player trash talk
        this._playerTrashTalkTimer--;
        if (this._playerTrashTalkTimer <= 0) {
            this._playerTrashTalkTimer = interval();
            const lines = [
                'Work smarter, not harder — that\'s what MCP is for!',
                'Zero maintenance. Zero headaches. You\'re welcome.',
                'I built a full site while you were still planning.',
                'Building apps is fun again. You should try it.',
                'Automated updates. Maybe you\'ve heard of them?',
            ];
            this.hud.showPlayerTrashTalk(lines[Math.floor(Math.random() * lines.length)]);
        }
    }

    changeState(newState) {
        this.state = newState;
        this.stateTimer = 0;
    }

    getScreenShake() {
        return this.screenShake;
    }
}
