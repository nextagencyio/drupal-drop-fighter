// ============================================================
// Drupal Drop Fighter — Base Fighter Class
// ============================================================
// Handles physics, state machine, hitboxes, damage, and animation.
// Extended by Player and Enemy.

import { FIGHTER, FIGHTER_STATE, SCREEN, ANIM, DAMAGE, HITBOXES, MOVE } from './config.js';

export class Fighter {
    constructor(x, y, facing) {
        // Position & physics
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.facing = facing;  // 1 = right, -1 = left

        // State
        this.state = FIGHTER_STATE.IDLE;
        this.hp = FIGHTER.MAX_HP;
        this.alive = true;

        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.stateTimer = 0;     // frames in current state

        // Attack
        this.currentMove = MOVE.NONE;
        this.attackFrame = 0;    // frames into current attack
        this.hitboxActive = false;
        this.hasHitThisAttack = false;  // prevent multi-hit

        // Defense
        this.isBlocking = false;
        this.blockstunTimer = 0;

        // Hitstun / knockdown
        this.hitstunTimer = 0;
        this.knockdownTimer = 0;
        this.invulnTimer = 0;

        // Visual
        this.flashTimer = 0;    // hit flash frames remaining
        this.shakeOffset = { x: 0, y: 0 };

        // Round tracking
        this.wins = 0;
    }

    // ---------------------------------------------------------
    // Collision Boxes
    // ---------------------------------------------------------

    /**
     * Get the push box (body collision) in world coordinates.
     * Used for preventing fighter overlap.
     */
    getPushBox() {
        const w = FIGHTER.WIDTH;
        const h = this.state === FIGHTER_STATE.CROUCH ? FIGHTER.CROUCH_HEIGHT : FIGHTER.HEIGHT;
        return {
            x: this.x - w / 2,
            y: this.y - h,
            w: w,
            h: h,
        };
    }

    /**
     * Get the hurt box (where this fighter can be hit) in world coordinates.
     * Slightly smaller than push box so near-misses feel fair.
     */
    getHurtBox() {
        const pb = this.getPushBox();
        return {
            x: pb.x + 5,
            y: pb.y + 5,
            w: pb.w - 10,
            h: pb.h - 10,
        };
    }

    /**
     * Get active hit box (attack area) in world coordinates,
     * or null if no active attack hitbox.
     */
    getHitBox() {
        if (!this.hitboxActive || this.currentMove === MOVE.NONE) return null;

        const hbData = this.getHitBoxData();
        if (!hbData) return null;

        // Flip x offset for left-facing fighters
        return {
            x: this.x + hbData.x * this.facing - (this.facing === -1 ? hbData.w : 0),
            y: this.y + hbData.y,
            w: hbData.w,
            h: hbData.h,
        };
    }

    /**
     * Map currentMove to a HITBOXES config entry.
     * Override in subclass for character-specific moves.
     */
    getHitBoxData() {
        return null;
    }

    /**
     * Get damage value for current move.
     * Override in subclass.
     */
    getMoveDamage() {
        return 0;
    }

    /**
     * Get hitstun frames for current move.
     * Override in subclass.
     */
    getMoveHitstun() {
        return FIGHTER.HITSTUN_LIGHT;
    }

    /**
     * Get knockback force for current move.
     * Override in subclass for per-move tuning.
     */
    getMoveKnockback() {
        return FIGHTER.KNOCKBACK_FORCE;
    }

    /**
     * Whether current move causes knockdown.
     * Override in subclass.
     */
    getMoveKnockdown() {
        return false;
    }

    // ---------------------------------------------------------
    // Main Update Loop
    // ---------------------------------------------------------

    /**
     * Main update — call once per frame.
     * Handles physics, timers, attack progression, and animation.
     */
    update() {
        this.stateTimer++;
        this.animTimer++;

        // --- Physics: gravity ---
        if (this.y < SCREEN.FLOOR_Y) {
            this.vy += FIGHTER.GRAVITY;
        }

        // --- Apply velocity ---
        this.x += this.vx;
        this.y += this.vy;

        // --- Floor collision ---
        if (this.y >= SCREEN.FLOOR_Y) {
            this.y = SCREEN.FLOOR_Y;
            this.vy = 0;

            // Land from jump
            if (this.state === FIGHTER_STATE.JUMP) {
                this.setState(FIGHTER_STATE.IDLE);
            }
        }

        // --- Screen bounds ---
        this.x = Math.max(SCREEN.LEFT_BOUND, Math.min(SCREEN.RIGHT_BOUND, this.x));

        // --- Decrement timers ---
        if (this.flashTimer > 0) this.flashTimer--;
        if (this.invulnTimer > 0) this.invulnTimer--;

        if (this.blockstunTimer > 0) {
            this.blockstunTimer--;
            if (this.blockstunTimer <= 0) {
                this.setState(FIGHTER_STATE.IDLE);
            }
        }

        // --- Hitstun ---
        if (this.hitstunTimer > 0) {
            this.hitstunTimer--;
            if (this.hitstunTimer <= 0) {
                this.setState(FIGHTER_STATE.IDLE);
            }
        }

        // --- Knockdown recovery ---
        if (this.knockdownTimer > 0) {
            this.knockdownTimer--;
            if (this.knockdownTimer <= 0) {
                // KO fighters don't recover
                if (this.state === FIGHTER_STATE.KO) {
                    // Stay in KO — game.js handles round transition
                    return;
                }
                this.invulnTimer = FIGHTER.WAKEUP_INVULN;
                this.setState(FIGHTER_STATE.IDLE);
            }
        }

        // --- Attack frame progression ---
        if (this.isAttacking()) {
            this.attackFrame++;
            const hbData = this.getHitBoxData();
            if (hbData) {
                // Activate hitbox during the active window
                this.hitboxActive = (
                    this.attackFrame >= hbData.startup &&
                    this.attackFrame < hbData.startup + hbData.active
                );

                // Attack finished (startup + active + recovery elapsed)
                const totalFrames = hbData.startup + hbData.active + hbData.recovery;
                if (this.attackFrame >= totalFrames) {
                    this.finishAttack();
                }
            }
        }

        // --- Friction ---
        if (this.state === FIGHTER_STATE.HIT_STUN || this.state === FIGHTER_STATE.KNOCKDOWN) {
            this.vx *= 0.9;
        }

        if (this.state === FIGHTER_STATE.IDLE) {
            this.vx *= 0.8;
        }

        // Clamp near-zero velocity to prevent drift
        if (Math.abs(this.vx) < 0.1) this.vx = 0;

        // --- Animation frame cycling ---
        if (this.animTimer >= this.getAnimSpeed()) {
            this.animTimer = 0;
            this.animFrame++;

            // Wrap animation frames based on state
            const maxFrames = this.getAnimFrameCount();
            if (maxFrames > 0) {
                this.animFrame = this.animFrame % maxFrames;
            }
        }
    }

    // ---------------------------------------------------------
    // State Machine
    // ---------------------------------------------------------

    /**
     * Set state and reset relevant timers.
     * Guards against redundant state changes.
     */
    setState(newState) {
        if (this.state === newState) return;

        const prevState = this.state;
        this.state = newState;
        this.stateTimer = 0;
        this.animFrame = 0;
        this.animTimer = 0;

        // Reset attack state when leaving an attack
        if (!this.isAttacking()) {
            this.currentMove = MOVE.NONE;
            this.attackFrame = 0;
            this.hitboxActive = false;
            this.hasHitThisAttack = false;
        }

        // Stop horizontal movement on certain states
        if (newState === FIGHTER_STATE.IDLE ||
            newState === FIGHTER_STATE.HIT_STUN ||
            newState === FIGHTER_STATE.KO) {
            this.vx = 0;
        }

        // Clear blocking when leaving block state
        if (prevState === FIGHTER_STATE.BLOCKING && newState !== FIGHTER_STATE.BLOCKING) {
            this.isBlocking = false;
        }
    }

    // ---------------------------------------------------------
    // Attack System
    // ---------------------------------------------------------

    /**
     * Start an attack move.
     * Maps the move type to the appropriate fighter state.
     */
    startAttack(move) {
        if (!this.canAttack()) return;

        this.currentMove = move;
        this.attackFrame = 0;
        this.hitboxActive = false;
        this.hasHitThisAttack = false;

        // Map move to state
        switch (move) {
            case MOVE.JAB:
            case MOVE.HOOK:
            case MOVE.UPPERCUT:
                this.setState(FIGHTER_STATE.PUNCH);
                break;
            case MOVE.KICK:
            case MOVE.SWEEP:
                this.setState(FIGHTER_STATE.KICK);
                break;
            case MOVE.HEAD_THROW:
            case MOVE.SHORYUKEN:
            case MOVE.SPIN_KICK:
                this.setState(FIGHTER_STATE.SPECIAL);
                break;
            default:
                // Unknown move — don't change state
                this.currentMove = MOVE.NONE;
                return;
        }
    }

    /**
     * End the current attack and return to idle (if grounded).
     */
    finishAttack() {
        this.hitboxActive = false;
        this.currentMove = MOVE.NONE;
        this.attackFrame = 0;
        this.hasHitThisAttack = false;
        if (this.y >= SCREEN.FLOOR_Y) {
            this.setState(FIGHTER_STATE.IDLE);
        }
    }

    // ---------------------------------------------------------
    // Damage System
    // ---------------------------------------------------------

    /**
     * Apply damage to this fighter.
     * @param {number} amount - Raw damage
     * @param {number} knockback - Horizontal knockback force
     * @param {number} hitstun - Hitstun frames
     * @param {boolean} causesKnockdown - Whether this hit causes a knockdown
     * @returns {string} Result: 'blocked', 'hit', 'knockdown', 'ko', or 'immune'
     */
    takeDamage(amount, knockback, hitstun, causesKnockdown) {
        // Invulnerability check (wakeup, etc.)
        if (this.invulnTimer > 0) return 'immune';

        // Already KO'd fighters can't be hit again
        if (this.state === FIGHTER_STATE.KO) return 'immune';

        // Check if blocking
        if (this.isBlocking) {
            // Chip damage (rounded up so 0-damage specials still deal 1 chip)
            const chipDamage = Math.ceil(amount * DAMAGE.CHIP_MULTIPLIER);
            this.hp = Math.max(0, this.hp - chipDamage);
            this.blockstunTimer = FIGHTER.BLOCKSTUN;
            this.setState(FIGHTER_STATE.BLOCKING);
            this.vx = -this.facing * (knockback * 0.3);
            this.flashTimer = ANIM.HIT_FLASH_FRAMES;

            // Check for chip KO
            if (this.hp <= 0) {
                this.hp = 0;
                this.alive = false;
                this.setState(FIGHTER_STATE.KO);
                this.vx = -this.facing * FIGHTER.KNOCKBACK_HEAVY;
                this.knockdownTimer = FIGHTER.KO_DURATION;
                return 'ko';
            }

            return 'blocked';
        }

        // Full damage
        this.hp -= amount;
        this.flashTimer = ANIM.HIT_FLASH_FRAMES;

        // KO check
        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
            this.setState(FIGHTER_STATE.KO);
            this.vx = -this.facing * FIGHTER.KNOCKBACK_HEAVY;
            this.knockdownTimer = FIGHTER.KO_DURATION;
            return 'ko';
        }

        // Knockdown
        if (causesKnockdown) {
            this.setState(FIGHTER_STATE.KNOCKDOWN);
            this.knockdownTimer = FIGHTER.KNOCKDOWN_DURATION;
            this.vx = -this.facing * knockback;
            return 'knockdown';
        }

        // Regular hitstun
        this.setState(FIGHTER_STATE.HIT_STUN);
        this.hitstunTimer = hitstun;
        this.vx = -this.facing * knockback;
        return 'hit';
    }

    // ---------------------------------------------------------
    // State Queries
    // ---------------------------------------------------------

    /**
     * Can this fighter perform an attack right now?
     * Must be in a neutral, actionable state on the ground.
     */
    canAttack() {
        return (
            this.state === FIGHTER_STATE.IDLE ||
            this.state === FIGHTER_STATE.WALK_FORWARD ||
            this.state === FIGHTER_STATE.WALK_BACK ||
            this.state === FIGHTER_STATE.CROUCH
        );
    }

    /**
     * Can this fighter move (walk/jump/crouch)?
     * Same conditions as canAttack — if you can attack, you can move.
     */
    canMove() {
        return this.canAttack();
    }

    /**
     * Is fighter currently in an attack animation?
     */
    isAttacking() {
        return (
            this.state === FIGHTER_STATE.PUNCH ||
            this.state === FIGHTER_STATE.KICK ||
            this.state === FIGHTER_STATE.SPECIAL
        );
    }

    /**
     * Is fighter on the ground?
     */
    isGrounded() {
        return this.y >= SCREEN.FLOOR_Y;
    }

    /**
     * Is fighter in a state where they cannot act at all?
     * Useful for AI and input processing to skip logic.
     */
    isIncapacitated() {
        return (
            this.state === FIGHTER_STATE.HIT_STUN ||
            this.state === FIGHTER_STATE.KNOCKDOWN ||
            this.state === FIGHTER_STATE.KO ||
            this.state === FIGHTER_STATE.BLOCKING
        );
    }

    /**
     * Is fighter in a non-interactive cinematic state?
     */
    isInCinematic() {
        return (
            this.state === FIGHTER_STATE.INTRO_WALK ||
            this.state === FIGHTER_STATE.WIN_POSE
        );
    }

    /**
     * Is fighter airborne?
     */
    isAirborne() {
        return this.y < SCREEN.FLOOR_Y;
    }

    // ---------------------------------------------------------
    // Animation Helpers
    // ---------------------------------------------------------

    /**
     * Get animation speed (ticks per frame) for current state.
     */
    getAnimSpeed() {
        if (this.isAttacking()) return ANIM.ATTACK_SPEED;
        if (this.state === FIGHTER_STATE.WALK_FORWARD ||
            this.state === FIGHTER_STATE.WALK_BACK) {
            return ANIM.WALK_SPEED;
        }
        return ANIM.IDLE_SPEED;
    }

    /**
     * Get the number of animation frames for the current state.
     * Used to wrap animFrame correctly.
     */
    getAnimFrameCount() {
        switch (this.state) {
            case FIGHTER_STATE.IDLE:
                return ANIM.IDLE_FRAMES;
            case FIGHTER_STATE.WALK_FORWARD:
            case FIGHTER_STATE.WALK_BACK:
                return ANIM.WALK_FRAMES;
            case FIGHTER_STATE.KNOCKDOWN:
                return ANIM.KNOCKDOWN_FRAMES;
            case FIGHTER_STATE.KO:
                return ANIM.KO_FRAMES;
            default:
                // Attacks and other states don't loop
                return 0;
        }
    }

    // ---------------------------------------------------------
    // Collision Helpers
    // ---------------------------------------------------------

    /**
     * AABB overlap test between two rectangles.
     * Both rects must have { x, y, w, h }.
     */
    static boxOverlap(a, b) {
        if (!a || !b) return false;
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    /**
     * Get the horizontal distance between this fighter's center
     * and another fighter's center.
     */
    distanceTo(other) {
        return Math.abs(this.x - other.x);
    }

    /**
     * Determine if the other fighter is in front of this one.
     */
    isFacing(other) {
        if (this.facing === 1) return other.x >= this.x;
        return other.x <= this.x;
    }

    /**
     * Auto-face toward the opponent.
     * Should be called each frame during neutral states so
     * fighters always face each other.
     */
    faceOpponent(other) {
        if (this.isAttacking() || this.isIncapacitated() || this.isInCinematic()) return;
        this.facing = other.x >= this.x ? 1 : -1;
    }

    // ---------------------------------------------------------
    // Push Box Resolution
    // ---------------------------------------------------------

    /**
     * Resolve push box overlap between two fighters.
     * Each fighter is pushed apart equally.
     * Call from game.js each frame after both fighters update.
     */
    static resolvePushBoxes(fighterA, fighterB) {
        const a = fighterA.getPushBox();
        const b = fighterB.getPushBox();

        if (!Fighter.boxOverlap(a, b)) return;

        // Calculate overlap on x-axis
        const overlapLeft = (a.x + a.w) - b.x;
        const overlapRight = (b.x + b.w) - a.x;
        const overlap = Math.min(overlapLeft, overlapRight);

        if (overlap <= 0) return;

        const pushAmount = Math.min(overlap / 2, FIGHTER.PUSH_APART_SPEED);

        if (fighterA.x < fighterB.x) {
            fighterA.x -= pushAmount;
            fighterB.x += pushAmount;
        } else {
            fighterA.x += pushAmount;
            fighterB.x -= pushAmount;
        }

        // Re-clamp to screen bounds
        fighterA.x = Math.max(SCREEN.LEFT_BOUND, Math.min(SCREEN.RIGHT_BOUND, fighterA.x));
        fighterB.x = Math.max(SCREEN.LEFT_BOUND, Math.min(SCREEN.RIGHT_BOUND, fighterB.x));
    }

    // ---------------------------------------------------------
    // Hit Detection
    // ---------------------------------------------------------

    /**
     * Check if this fighter's active hitbox overlaps the other
     * fighter's hurtbox. Returns true if a hit lands.
     * Does NOT apply damage — that is game.js's responsibility
     * so it can trigger effects, sounds, etc.
     */
    checkHit(other) {
        if (this.hasHitThisAttack) return false;
        if (!this.hitboxActive) return false;

        const hitBox = this.getHitBox();
        const hurtBox = other.getHurtBox();

        return Fighter.boxOverlap(hitBox, hurtBox);
    }

    /**
     * Mark that this attack has already connected.
     * Prevents multi-hit from a single attack.
     */
    registerHit() {
        this.hasHitThisAttack = true;
    }

    // ---------------------------------------------------------
    // Movement Helpers
    // ---------------------------------------------------------

    /**
     * Walk forward (toward the opponent side).
     */
    walkForward() {
        if (!this.canMove()) return;
        this.vx = FIGHTER.WALK_SPEED * this.facing;
        if (this.state !== FIGHTER_STATE.WALK_FORWARD) {
            this.setState(FIGHTER_STATE.WALK_FORWARD);
        }
    }

    /**
     * Walk backward (away from the opponent).
     */
    walkBack() {
        if (!this.canMove()) return;
        this.vx = -FIGHTER.WALK_SPEED * this.facing;
        if (this.state !== FIGHTER_STATE.WALK_BACK) {
            this.setState(FIGHTER_STATE.WALK_BACK);
        }
    }

    /**
     * Jump. Can only jump from the ground.
     */
    jump() {
        if (!this.canMove()) return;
        if (!this.isGrounded()) return;
        this.vy = FIGHTER.JUMP_FORCE;
        this.setState(FIGHTER_STATE.JUMP);
    }

    /**
     * Crouch.
     */
    crouch() {
        if (!this.canMove()) return;
        if (!this.isGrounded()) return;
        if (this.state !== FIGHTER_STATE.CROUCH) {
            this.setState(FIGHTER_STATE.CROUCH);
        }
    }

    /**
     * Return to idle (e.g., when releasing all movement keys).
     */
    idle() {
        if (this.state === FIGHTER_STATE.WALK_FORWARD ||
            this.state === FIGHTER_STATE.WALK_BACK ||
            this.state === FIGHTER_STATE.CROUCH) {
            this.setState(FIGHTER_STATE.IDLE);
        }
    }

    /**
     * Start blocking. Called when holding back direction.
     * Blocking is a flag checked during takeDamage, not a
     * full state transition — the fighter can be in IDLE or
     * WALK_BACK while blocking. The BLOCKING state is only
     * entered when actually absorbing a hit (blockstun).
     */
    startBlocking() {
        this.isBlocking = true;
    }

    /**
     * Stop blocking. Called when releasing back direction.
     */
    stopBlocking() {
        this.isBlocking = false;
    }

    // ---------------------------------------------------------
    // Round / Match Reset
    // ---------------------------------------------------------

    /**
     * Reset for a new round. Preserves win count.
     */
    resetForRound(startX) {
        this.x = startX;
        this.y = SCREEN.FLOOR_Y;
        this.vx = 0;
        this.vy = 0;
        this.hp = FIGHTER.MAX_HP;
        this.alive = true;
        this.state = FIGHTER_STATE.IDLE;
        this.currentMove = MOVE.NONE;
        this.attackFrame = 0;
        this.hitboxActive = false;
        this.hasHitThisAttack = false;
        this.isBlocking = false;
        this.blockstunTimer = 0;
        this.hitstunTimer = 0;
        this.knockdownTimer = 0;
        this.invulnTimer = 0;
        this.flashTimer = 0;
        this.animFrame = 0;
        this.animTimer = 0;
        this.stateTimer = 0;
        this.shakeOffset = { x: 0, y: 0 };
    }

    /**
     * Full reset (new match). Clears win count too.
     */
    resetFull(startX) {
        this.resetForRound(startX);
        this.wins = 0;
    }

    // ---------------------------------------------------------
    // Render Data
    // ---------------------------------------------------------

    /**
     * Get sprite render options object.
     * Passed to sprites.js draw function for rendering.
     */
    getSpriteOptions() {
        return {
            x: this.x,
            y: this.y,
            facing: this.facing,
            state: this.state,
            move: this.currentMove,
            hp: this.hp,
            animFrame: this.animFrame,
            attackFrame: this.attackFrame,
            flashTimer: this.flashTimer,
            blocking: this.isBlocking,
            crouching: this.state === FIGHTER_STATE.CROUCH,
            invulnerable: this.invulnTimer > 0,
            alive: this.alive,
            shakeOffset: this.shakeOffset,
        };
    }

    /**
     * Get a debug-friendly representation of the fighter's state.
     * Useful during development for on-screen debug overlay.
     */
    getDebugInfo() {
        return {
            pos: `(${Math.round(this.x)}, ${Math.round(this.y)})`,
            vel: `(${this.vx.toFixed(1)}, ${this.vy.toFixed(1)})`,
            state: this.state,
            hp: this.hp,
            move: this.currentMove,
            attackFrame: this.attackFrame,
            hitboxActive: this.hitboxActive,
            hitstun: this.hitstunTimer,
            blockstun: this.blockstunTimer,
            knockdown: this.knockdownTimer,
            invuln: this.invulnTimer,
        };
    }
}
