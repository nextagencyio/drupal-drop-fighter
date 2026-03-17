// ============================================================
// Drupal Drop Fighter — Enemy Class ("The Monolith")
// ============================================================
// AI-controlled opponent that extends the base Fighter class.
// Each of 3 rounds features a different problem theme with
// unique move names, damage values, and escalating difficulty.

import { Fighter } from './fighter.js';
import {
    FIGHTER, FIGHTER_STATE, SCREEN, DAMAGE, HITBOXES, MOVE,
    AI, PROJECTILE, ROUND_THEMES,
} from './config.js';

// ---------------------------------------------------------
// Difficulty tuning per round (0-indexed)
// ---------------------------------------------------------
const ROUND_DIFFICULTY = [
    {
        // Round 0: Slow Performance — aggressive from the start
        decisionIntervalExtra: 4,
        grabWeight: 0.25,
        attackBias: 0.70,
        walkSpeedMultiplier: 0.90,
    },
    {
        // Round 1: Vendor Lock-In — fast, relentless grabs
        decisionIntervalExtra: -2,
        grabWeight: 0.40,
        attackBias: 0.80,
        walkSpeedMultiplier: 1.0,
    },
    {
        // Round 2: Twig Debugging — brutal boss fight
        decisionIntervalExtra: -10,
        grabWeight: 0.35,
        attackBias: 0.90,
        walkSpeedMultiplier: 1.15,
    },
];

// ---------------------------------------------------------
// Damage lookup per round, keyed by move
// ---------------------------------------------------------
const ROUND_DAMAGE = [
    // Round 0: Slow Performance
    {
        [MOVE.JAB]:       DAMAGE.LAG_SPIKE,
        [MOVE.KICK]:      DAMAGE.CACHE_MISS,
        [MOVE.HEAD_THROW]: DAMAGE.BUFFERING_BLAST,
        [MOVE.SHORYUKEN]: DAMAGE.TIMEOUT_SLAM,
    },
    // Round 1: Vendor Lock-In
    {
        [MOVE.JAB]:       DAMAGE.CONTRACT_BIND,
        [MOVE.KICK]:      DAMAGE.PROPRIETARY_HOOK,
        [MOVE.HEAD_THROW]: DAMAGE.LICENSE_WALL,
        [MOVE.SHORYUKEN]: DAMAGE.MIGRATION_BLOCK,
    },
    // Round 2: Twig Debugging
    {
        [MOVE.JAB]:       DAMAGE.TEMPLATE_ERROR,
        [MOVE.KICK]:      DAMAGE.STACK_TRACE_SLAM,
        [MOVE.HEAD_THROW]: DAMAGE.SYNTAX_EXCEPTION,
        [MOVE.SHORYUKEN]: DAMAGE.WSOD_ATTACK,
    },
];

// ---------------------------------------------------------
// Enemy Class
// ---------------------------------------------------------
export class Enemy extends Fighter {
    constructor(x, y, facing) {
        super(x, y, facing);

        // Round & AI state
        this.currentRound = 0;
        this.decisionTimer = 0;
        this.aiState = 'idle';  // 'idle' | 'approach' | 'retreat' | 'attack' | 'special'

        // Projectile system
        this.projectile = null;

        // Cached difficulty params (set via setRound)
        this._difficulty = ROUND_DIFFICULTY[0];
    }

    // =====================================================
    // Hitbox Override
    // =====================================================

    /**
     * Map current move to enemy-specific hitbox data.
     *   JAB        -> ENEMY_PUNCH
     *   KICK       -> ENEMY_KICK
     *   HEAD_THROW -> ENEMY_SPECIAL  (projectile-launching special)
     *   SHORYUKEN  -> ENEMY_GRAB     (grab attacks)
     */
    getHitBoxData() {
        switch (this.currentMove) {
            case MOVE.JAB:        return HITBOXES.ENEMY_PUNCH;
            case MOVE.KICK:       return HITBOXES.ENEMY_KICK;
            case MOVE.HEAD_THROW: return HITBOXES.ENEMY_SPECIAL;
            case MOVE.SHORYUKEN:  return HITBOXES.ENEMY_GRAB;
            default:              return null;
        }
    }

    // =====================================================
    // Damage Override
    // =====================================================

    /**
     * Return damage for the current move, varying by round theme.
     */
    getMoveDamage() {
        const table = ROUND_DAMAGE[this.currentRound] || ROUND_DAMAGE[0];
        return table[this.currentMove] || 0;
    }

    // =====================================================
    // Hitstun Override
    // =====================================================

    /**
     * Punches inflict light hitstun, kicks medium, specials/grabs heavy.
     */
    getMoveHitstun() {
        switch (this.currentMove) {
            case MOVE.JAB:
                return FIGHTER.HITSTUN_LIGHT;
            case MOVE.KICK:
                return FIGHTER.HITSTUN_MEDIUM;
            case MOVE.HEAD_THROW:
            case MOVE.SHORYUKEN:
                return FIGHTER.HITSTUN_HEAVY;
            default:
                return FIGHTER.HITSTUN_LIGHT;
        }
    }

    // =====================================================
    // Knockback Override
    // =====================================================

    /**
     * Grabs and specials apply heavy knockback; others use default.
     */
    getMoveKnockback() {
        switch (this.currentMove) {
            case MOVE.SHORYUKEN:
            case MOVE.HEAD_THROW:
                return FIGHTER.KNOCKBACK_HEAVY;
            default:
                return FIGHTER.KNOCKBACK_FORCE;
        }
    }

    // =====================================================
    // Knockdown Override
    // =====================================================

    /**
     * Grab attacks (SHORYUKEN slot) cause knockdown.
     */
    getMoveKnockdown() {
        return this.currentMove === MOVE.SHORYUKEN;
    }

    // =====================================================
    // AI Core
    // =====================================================

    /**
     * Main AI entry point — called once per frame by game.js.
     * @param {Fighter} player - the human-controlled fighter
     */
    aiUpdate(player) {
        // Skip AI when incapacitated or in a cinematic state
        if (this.isIncapacitated() || this.isInCinematic()) return;

        // Always face the opponent during neutral states
        this.faceOpponent(player);

        // Tick down decision timer and execute ongoing behavior
        this.decisionTimer--;
        if (this.decisionTimer > 0) {
            this.executeCurrentBehavior(player);
            return;
        }

        // --- New decision ---
        const difficultyExtra = this._difficulty.decisionIntervalExtra;
        const jitter = Math.floor(Math.random() * 11) - 5; // -5 to +5
        this.decisionTimer = Math.max(5, AI.DECISION_INTERVAL + difficultyExtra + jitter);

        const distance = this.distanceTo(player);

        // --- Reaction to incoming attacks ---
        if (player.isAttacking() && distance < AI.REACT_DISTANCE_MID) {
            const blockChance = AI.BLOCK_CHANCE_BASE + (this.currentRound * AI.BLOCK_CHANCE_PER_ROUND);
            if (Math.random() < blockChance) {
                this.startBlocking();
                this.aiState = 'retreat';
                return;
            }
        }

        // --- Distance-based decisions ---
        if (distance > AI.REACT_DISTANCE_FAR) {
            // Far away — approach or throw projectile
            const specialChance = AI.SPECIAL_CHANCE_BASE + (this.currentRound * AI.SPECIAL_CHANCE_PER_ROUND);
            if (Math.random() < specialChance) {
                this.aiState = 'special';
            } else {
                this.aiState = 'approach';
            }
        } else if (distance > AI.REACT_DISTANCE_MID) {
            // Mid range — mix of approach, poke, retreat, special
            const roll = Math.random();
            if (roll < 0.4) {
                this.aiState = 'approach';
            } else if (roll < 0.7) {
                this.aiState = 'attack';
            } else if (roll < 0.85) {
                this.aiState = 'retreat';
            } else {
                this.aiState = 'special';
            }
        } else if (distance > AI.REACT_DISTANCE_CLOSE) {
            // Close range — attack, grab, or retreat
            const roll = Math.random();
            if (roll < 0.5) {
                this.aiState = 'attack';
            } else if (roll < 0.5 + this._difficulty.grabWeight) {
                // Grab attempt — uses the SHORYUKEN move slot
                this.startAttack(MOVE.SHORYUKEN);
                this.aiState = 'idle'; // wait for attack to finish
                return;
            } else {
                this.aiState = 'retreat';
            }
        } else {
            // Point blank — mostly attack
            if (Math.random() < this._difficulty.attackBias) {
                this.aiState = 'attack';
            } else {
                this.aiState = 'retreat';
            }
        }

        // Immediately begin executing the chosen behavior
        this.executeCurrentBehavior(player);
    }

    /**
     * Execute movement / actions for the current aiState.
     * Called each frame while decisionTimer > 0, and once
     * immediately after a new decision is made.
     * @param {Fighter} player
     */
    executeCurrentBehavior(player) {
        switch (this.aiState) {
            case 'idle':
                this.idle();
                this.stopBlocking();
                break;

            case 'approach':
                this.stopBlocking();
                this._walkForwardScaled();
                break;

            case 'retreat':
                this._walkBackScaled();
                this.startBlocking();
                break;

            case 'attack':
                if (this.canAttack()) {
                    // 60% jab, 40% kick
                    if (Math.random() < 0.6) {
                        this.startAttack(MOVE.JAB);
                    } else {
                        this.startAttack(MOVE.KICK);
                    }
                    // Return to idle after initiating an attack so we
                    // don't spam attacks every frame of the decision window
                    this.aiState = 'idle';
                }
                break;

            case 'special':
                if (this.canAttack()) {
                    this._fireProjectile();
                    this.startAttack(MOVE.HEAD_THROW);
                    this.aiState = 'idle';
                }
                break;
        }
    }

    // =====================================================
    // Movement Helpers (difficulty-scaled)
    // =====================================================

    /** Walk forward with round-based speed scaling. */
    _walkForwardScaled() {
        if (!this.canMove()) return;
        this.vx = FIGHTER.WALK_SPEED * this.facing * this._difficulty.walkSpeedMultiplier;
        if (this.state !== FIGHTER_STATE.WALK_FORWARD) {
            this.setState(FIGHTER_STATE.WALK_FORWARD);
        }
    }

    /** Walk backward with round-based speed scaling. */
    _walkBackScaled() {
        if (!this.canMove()) return;
        this.vx = -FIGHTER.WALK_SPEED * this.facing * this._difficulty.walkSpeedMultiplier;
        if (this.state !== FIGHTER_STATE.WALK_BACK) {
            this.setState(FIGHTER_STATE.WALK_BACK);
        }
    }

    // =====================================================
    // Projectile System
    // =====================================================

    /**
     * Spawn a new projectile traveling toward the player.
     * The visual type depends on the current round.
     */
    _fireProjectile() {
        // Only one projectile at a time
        if (this.projectile && this.projectile.active) return;

        const type = this.currentRound >= 2 ? 'syntax' : 'buffering';

        this.projectile = {
            x: this.x + 30 * this.facing,
            y: this.y - FIGHTER.HEIGHT * 0.55,
            vx: PROJECTILE.ENEMY_PROJECTILE_SPEED * this.facing,
            active: true,
            type,
            startX: this.x, // for max-distance check
        };
    }

    /**
     * Advance projectile position each frame.
     * Deactivate when it leaves the screen or exceeds max distance.
     */
    updateProjectile() {
        if (!this.projectile || !this.projectile.active) return;

        const p = this.projectile;
        p.x += p.vx;

        // Off-screen or max distance
        if (p.x < SCREEN.LEFT_BOUND - 40 ||
            p.x > SCREEN.RIGHT_BOUND + 40 ||
            Math.abs(p.x - p.startX) > PROJECTILE.MAX_DISTANCE) {
            p.active = false;
        }
    }

    /**
     * Return the projectile hitbox as {x, y, w, h} or null.
     * Used by game.js for collision checks against the player.
     */
    getProjectileHitBox() {
        if (!this.projectile || !this.projectile.active) return null;

        const p = this.projectile;
        const hw = HITBOXES.PROJECTILE.w;
        const hh = HITBOXES.PROJECTILE.h;

        return {
            x: p.x - hw / 2,
            y: p.y - hh / 2,
            w: hw,
            h: hh,
        };
    }

    // =====================================================
    // Update Override
    // =====================================================

    /**
     * Per-frame update: run base class physics/timers, then
     * advance the projectile.
     */
    update() {
        super.update();
        this.updateProjectile();
    }

    // =====================================================
    // Render Data Override
    // =====================================================

    /**
     * Extend base sprite options with enemy-specific data:
     * projectile state and current round (for themed visuals).
     */
    getSpriteOptions() {
        const opts = super.getSpriteOptions();
        opts.round = this.currentRound;

        // Attach projectile info for sprites.js to render
        if (this.projectile && this.projectile.active) {
            opts.projectile = {
                x: this.projectile.x,
                y: this.projectile.y,
                type: this.projectile.type,
            };
        } else {
            opts.projectile = null;
        }

        return opts;
    }

    // =====================================================
    // Round / Match Reset
    // =====================================================

    /**
     * Reset fighter state for a new round. Preserves win count
     * and currentRound (set separately via setRound).
     */
    resetForRound(startX) {
        super.resetForRound(startX);

        // Reset AI-specific state
        this.projectile = null;
        this.decisionTimer = 0;
        this.aiState = 'idle';
    }

    /**
     * Configure the enemy for a specific round (0-indexed).
     * Called by game.js before each round begins.
     * @param {number} roundNum - 0, 1, or 2
     */
    setRound(roundNum) {
        this.currentRound = Math.max(0, Math.min(roundNum, ROUND_DIFFICULTY.length - 1));
        this._difficulty = ROUND_DIFFICULTY[this.currentRound];
    }

    // =====================================================
    // Debug
    // =====================================================

    getDebugInfo() {
        const info = super.getDebugInfo();
        info.aiState = this.aiState;
        info.decisionTimer = this.decisionTimer;
        info.round = this.currentRound;
        info.roundTheme = ROUND_THEMES[this.currentRound]?.name || '???';
        info.projectileActive = this.projectile ? this.projectile.active : false;
        return info;
    }
}
