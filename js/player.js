// ============================================================
// Drupal Drop Fighter — Player Class (Drupal Drop)
// ============================================================
// Player-controlled hero character. Extends Fighter with input
// handling, move mappings, head-throw projectile, and special
// move physics (Shoryuken rise, Spin Kick lunge).

import { Fighter } from './fighter.js';
import {
    FIGHTER, FIGHTER_STATE, MOVE, DAMAGE, HITBOXES, PROJECTILE,
} from './config.js';

export class Player extends Fighter {
    constructor(x, y, facing) {
        super(x, y, facing);

        // Head-throw projectile state
        this.headProjectile = null;
        this.headDetached = false;
    }

    // ---------------------------------------------------------
    // Move Data Overrides
    // ---------------------------------------------------------

    /** Map currentMove to the matching HITBOXES entry. */
    getHitBoxData() {
        switch (this.currentMove) {
            case MOVE.JAB:        return HITBOXES.JAB;
            case MOVE.KICK:       return HITBOXES.KICK;
            case MOVE.UPPERCUT:   return HITBOXES.UPPERCUT;
            case MOVE.SWEEP:      return HITBOXES.SWEEP;
            case MOVE.HOOK:       return HITBOXES.HOOK;
            case MOVE.SHORYUKEN:  return HITBOXES.SHORYUKEN;
            case MOVE.HEAD_THROW: return { x: 0, y: 0, w: 0, h: 0, startup: 5, active: 3, recovery: 12 };
            case MOVE.SPIN_KICK:  return HITBOXES.SPIN_KICK;
            default:              return null;
        }
    }

    /** Map currentMove to its damage value. */
    getMoveDamage() {
        switch (this.currentMove) {
            case MOVE.JAB:        return DAMAGE.JAB;
            case MOVE.KICK:       return DAMAGE.KICK;
            case MOVE.UPPERCUT:   return DAMAGE.UPPERCUT;
            case MOVE.SWEEP:      return DAMAGE.SWEEP;
            case MOVE.HOOK:       return DAMAGE.HOOK;
            case MOVE.HEAD_THROW: return DAMAGE.HEAD_THROW;
            case MOVE.SHORYUKEN:  return DAMAGE.SHORYUKEN;
            case MOVE.SPIN_KICK:  return DAMAGE.SPIN_KICK;
            default:              return 0;
        }
    }

    /** Map currentMove to hitstun frames. */
    getMoveHitstun() {
        switch (this.currentMove) {
            case MOVE.JAB:
                return FIGHTER.HITSTUN_LIGHT;
            case MOVE.KICK:
            case MOVE.HOOK:
            case MOVE.SWEEP:
                return FIGHTER.HITSTUN_MEDIUM;
            case MOVE.UPPERCUT:
            case MOVE.SHORYUKEN:
            case MOVE.SPIN_KICK:
                return FIGHTER.HITSTUN_HEAVY;
            default:
                return FIGHTER.HITSTUN_LIGHT;
        }
    }

    /** Whether currentMove causes a knockdown. */
    getMoveKnockdown() {
        return this.currentMove === MOVE.SWEEP;
    }

    /** Knockback force — specials hit harder. */
    getMoveKnockback() {
        switch (this.currentMove) {
            case MOVE.SHORYUKEN:
            case MOVE.SWEEP:
            case MOVE.HEAD_THROW:
            case MOVE.SPIN_KICK:
                return FIGHTER.KNOCKBACK_HEAVY;
            default:
                return FIGHTER.KNOCKBACK_FORCE;
        }
    }

    // ---------------------------------------------------------
    // Input Handling
    // ---------------------------------------------------------

    /**
     * Process player input each frame.
     * @param {InputManager} inputManager
     */
    handleInput(inputManager) {
        // Skip all input when incapacitated or in a cinematic
        if (this.isIncapacitated() || this.isInCinematic()) return;

        // ── 0. Single-key specials (C, V, B) ──
        if (inputManager.special1Pressed && this.canAttack()) {
            this._startSpecialMove(MOVE.HEAD_THROW);
            return;
        }
        if (inputManager.special2Pressed && this.canAttack()) {
            this._startSpecialMove(MOVE.SHORYUKEN);
            return;
        }
        if (inputManager.special3Pressed && this.canAttack()) {
            this._startSpecialMove(MOVE.SPIN_KICK);
            return;
        }


        // Determine facing-relative directions
        const forwardHeld = this.facing === 1 ? inputManager.isRight : inputManager.isLeft;
        const backHeld    = this.facing === 1 ? inputManager.isLeft  : inputManager.isRight;

        // ── 3. Normal attacks (only when an attack button was just pressed) ──
        if (inputManager.punchPressed || inputManager.kickPressed) {
            if (this.state === FIGHTER_STATE.CROUCH || inputManager.isDown) {
                if (inputManager.punchPressed) {
                    this.startAttack(MOVE.UPPERCUT);
                    return;
                }
                if (inputManager.kickPressed) {
                    this.startAttack(MOVE.SWEEP);
                    return;
                }
            }

            if (forwardHeld && inputManager.punchPressed) {
                this.startAttack(MOVE.HOOK);
                return;
            }

            if (inputManager.punchPressed) {
                this.startAttack(MOVE.JAB);
                return;
            }

            if (inputManager.kickPressed) {
                this.startAttack(MOVE.KICK);
                return;
            }
        }

        // ── 3. Movement (only if the fighter can move) ──
        if (!this.canMove()) return;

        // Blocking: holding back direction
        if (backHeld) {
            this.startBlocking();
            this.walkBack();
        } else {
            this.stopBlocking();

            if (inputManager.isDown) {
                this.crouch();
            } else if (forwardHeld) {
                this.walkForward();
            } else if (inputManager.isUp) {
                this.jump();
            } else {
                this.idle();
            }
        }
    }

    // ---------------------------------------------------------
    // Special Move Activation
    // ---------------------------------------------------------

    /**
     * Start a special move, applying any physics unique to it.
     * @param {string} move  A MOVE constant
     */
    _startSpecialMove(move) {
        if (!this.canAttack()) return;

        this.startAttack(move);

        switch (move) {
            case MOVE.HEAD_THROW:
                this._launchHead();
                break;

            case MOVE.SHORYUKEN:
                // Rising uppercut — upward velocity + slight forward
                this.vy = FIGHTER.JUMP_FORCE * 0.8;
                this.vx = FIGHTER.WALK_SPEED * 0.5 * this.facing;
                break;

            case MOVE.SPIN_KICK:
                // Lunging spin kick — forward dash
                this.vx = FIGHTER.WALK_SPEED * 2.2 * this.facing;
                break;


        }
    }

    // ---------------------------------------------------------
    // Head Throw Projectile
    // ---------------------------------------------------------

    /** Launch the detachable head as a projectile. */
    _launchHead() {
        this.headDetached = true;
        this.headProjectile = {
            x: this.x,
            y: this.y - 60,
            vx: PROJECTILE.HEAD_THROW_SPEED * this.facing,
            active: true,
            returning: false,
            distanceTraveled: 0,
        };
    }

    /** Update the head projectile each frame. */
    updateProjectile() {
        if (!this.headProjectile || !this.headProjectile.active) return;

        const proj = this.headProjectile;

        if (!proj.returning) {
            // Outbound travel
            proj.x += proj.vx;
            proj.distanceTraveled += Math.abs(proj.vx);

            if (proj.distanceTraveled >= PROJECTILE.MAX_DISTANCE) {
                proj.returning = true;
            }
        } else {
            // Return to player
            const dx = this.x - proj.x;
            const dy = (this.y - 60) - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= 30) {
                // Head has returned
                this.headProjectile = null;
                this.headDetached = false;
                return;
            }

            // Normalize direction and apply return speed
            const nx = dx / dist;
            const ny = dy / dist;
            proj.x += nx * PROJECTILE.RETURN_SPEED;
            proj.y += ny * PROJECTILE.RETURN_SPEED;
        }
    }

    /**
     * Get the hitbox rect for the projectile, or null if inactive.
     * @returns {{ x: number, y: number, w: number, h: number } | null}
     */
    getProjectileHitBox() {
        if (!this.headProjectile || !this.headProjectile.active || this.headProjectile.returning) {
            return null;
        }

        return {
            x: this.headProjectile.x - HITBOXES.PROJECTILE.w / 2,
            y: this.headProjectile.y - HITBOXES.PROJECTILE.h / 2,
            w: HITBOXES.PROJECTILE.w,
            h: HITBOXES.PROJECTILE.h,
        };
    }

    // ---------------------------------------------------------
    // Frame Update
    // ---------------------------------------------------------

    /** Main per-frame update — physics, timers, then projectile. */
    update() {
        super.update();
        this.updateProjectile();
    }

    // ---------------------------------------------------------
    // Render Data
    // ---------------------------------------------------------

    /** Extend base sprite options with head-throw state. */
    getSpriteOptions() {
        const opts = super.getSpriteOptions();
        opts.headDetached = this.headDetached;
        opts.headProjectile = this.headProjectile;
        return opts;
    }

    // ---------------------------------------------------------
    // Round Reset
    // ---------------------------------------------------------

    /** Reset for a new round — clear projectile state. */
    resetForRound(startX) {
        super.resetForRound(startX);
        this.headProjectile = null;
        this.headDetached = false;
    }
}
