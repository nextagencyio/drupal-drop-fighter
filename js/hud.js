// ============================================================
// Drupal Drop Fighter — HUD Module
// DOM-based overlay that sits on top of the game canvas.
// All HUD elements already exist in index.html; this module
// caches references and manipulates them at runtime.
// ============================================================

import { COLORS, ROUND, WIN_QUOTES, ROUND_THEMES } from './config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value between min and max. */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/** Return a linear-gradient CSS string for a health bar at the given percentage. */
function healthGradient(pct) {
    if (pct > 60) {
        return 'linear-gradient(180deg, #ffee44 0%, #ddaa00 30%, #cc8800 60%, #aa6600 100%)';
    }
    if (pct > 30) {
        return 'linear-gradient(180deg, #ffaa00 0%, #dd7700 30%, #cc5500 60%, #aa3300 100%)';
    }
    return 'linear-gradient(180deg, #ff4400 0%, #dd2200 30%, #cc1100 60%, #880800 100%)';
}

/** Pick a random element from an array. */
function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// HUD Class
// ---------------------------------------------------------------------------

export class HUD {
    constructor() {
        // --- Health bars ---
        this.p1Health = document.getElementById('p1-health');
        this.p2Health = document.getElementById('p2-health');

        // --- Timer ---
        this.timer = document.getElementById('timer');

        // --- Round dots ---
        this.p1Dots = document.getElementById('p1-dots');
        this.p2Dots = document.getElementById('p2-dots');

        // --- Announcement ---
        this.announcement = document.getElementById('announcement');

        // --- Win screen ---
        this.winScreen  = document.getElementById('win-screen');
        this.winTitle   = document.getElementById('win-title');
        this.winQuote   = document.getElementById('win-quote');
        this.restartBtn = document.getElementById('restart-btn');

        // --- Intro screen ---
        this.introScreen = document.getElementById('intro-screen');
        this.startBtn    = document.getElementById('start-btn');

        // --- Move announcement (enemy trash talk) ---
        this.moveAnnouncement = document.getElementById('move-announcement');

        // --- Player trash talk ---
        this.playerTrashTalk = document.getElementById('player-trash-talk');

        // Internal: active timeouts we may need to cancel
        this._announcementTimer = null;
        this._moveTimer = null;
        this._flashTimers = { 1: null, 2: null };

        // Bound keydown handler reference so we can remove it later
        this._introKeyHandler = null;
    }

    // ===================================================================
    // Health Bars
    // ===================================================================

    /**
     * Set health bar width for a player.
     * @param {1|2} player  — Player index.
     * @param {number} hp   — Current HP.
     * @param {number} maxHp — Maximum HP.
     */
    setHealth(player, hp, maxHp) {
        const bar = player === 1 ? this.p1Health : this.p2Health;
        if (!bar) return;

        const pct = clamp((hp / maxHp) * 100, 0, 100);
        bar.style.width = `${pct}%`;
        bar.style.background = healthGradient(pct);
    }

    /**
     * Flash a health bar white briefly on damage, then restore the
     * appropriate gradient colour.
     * @param {1|2} player
     */
    flashHealth(player) {
        const bar = player === 1 ? this.p1Health : this.p2Health;
        if (!bar) return;

        // Cancel any in-flight flash for this bar
        if (this._flashTimers[player]) {
            clearTimeout(this._flashTimers[player]);
        }

        // Capture current width so we can derive the percentage for colour
        const currentWidth = parseFloat(bar.style.width) || 100;

        bar.style.background = COLORS.HIT_FLASH;

        this._flashTimers[player] = setTimeout(() => {
            bar.style.background = healthGradient(currentWidth);
            this._flashTimers[player] = null;
        }, 100);
    }

    // ===================================================================
    // Timer
    // ===================================================================

    /**
     * Display remaining seconds as a zero-padded two-digit string.
     * When the timer drops to 10 or below, add a pulsing red style.
     * @param {number} seconds
     */
    setTimer(seconds) {
        if (!this.timer) return;

        const clamped = clamp(Math.floor(seconds), 0, ROUND.TIMER_SECONDS);
        this.timer.textContent = String(clamped).padStart(2, '0');

        if (clamped <= 10) {
            this.timer.classList.add('urgent');
        } else {
            this.timer.classList.remove('urgent');
        }
    }

    // ===================================================================
    // Round Dots
    // ===================================================================

    /**
     * Mark a specific round dot as "won" for a player.
     * @param {1|2} player
     * @param {number} round — 0-based round index (0, 1, or 2).
     */
    setRoundWon(player, round) {
        const container = player === 1 ? this.p1Dots : this.p2Dots;
        if (!container) return;

        const dots = container.querySelectorAll('.dot');
        if (dots[round]) {
            dots[round].classList.add('won');
        }
    }

    /** Reset all round dots to their default (unlit) state. */
    resetRoundDots() {
        const allDots = document.querySelectorAll('.dot');
        allDots.forEach(dot => dot.classList.remove('won'));
    }

    // ===================================================================
    // Announcements
    // ===================================================================

    /**
     * Show a centre-screen announcement.
     * @param {string} text      — Main text line.
     * @param {string} [subtitle] — Optional smaller subtitle line.
     * @param {number} [duration] — Ms before auto-hide (0 = stay visible).
     */
    showAnnouncement(text, subtitle, duration) {
        if (!this.announcement) return;

        // Cancel any pending auto-hide
        if (this._announcementTimer) {
            clearTimeout(this._announcementTimer);
            this._announcementTimer = null;
        }

        // Build inner HTML
        let html = `<span class="main">${text}</span>`;
        if (subtitle) {
            html += `<span class="sub">${subtitle}</span>`;
        }
        this.announcement.innerHTML = html;
        this.announcement.classList.add('visible');

        if (duration && duration > 0) {
            this._announcementTimer = setTimeout(() => {
                this.hideAnnouncement();
            }, duration);
        }
    }

    /** Hide the centre announcement. */
    hideAnnouncement() {
        if (!this.announcement) return;

        if (this._announcementTimer) {
            clearTimeout(this._announcementTimer);
            this._announcementTimer = null;
        }

        this.announcement.classList.remove('visible');
    }

    /**
     * Show "ROUND X" announcement with theme subtitle.
     * Stays visible until explicitly hidden.
     * @param {number} roundNum   — 1-based round number.
     * @param {string} themeName  — Theme name string (e.g. "SLOW PERFORMANCE").
     */
    showRoundIntro(roundNum, themeName) {
        this.showAnnouncement(`ROUND ${roundNum}`, themeName, 0);
    }

    /**
     * Show "FIGHT!" flash that auto-hides after 500 ms.
     */
    showFightFlash() {
        if (!this.announcement) return;

        // Temporarily bump font size for extra impact
        this.announcement.style.fontSize = '64px';
        this.showAnnouncement('FIGHT!', null, 500);

        // Restore default size after the flash hides
        setTimeout(() => {
            if (this.announcement) {
                this.announcement.style.fontSize = '';
            }
        }, 550);
    }

    /**
     * Show round-end text ("K.O.!" or "TIME!").
     * Stays visible until explicitly hidden.
     * @param {string} text — "K.O.!" or "TIME!"
     */
    showRoundEnd(text) {
        if (!this.announcement) return;

        this.announcement.style.fontSize = '56px';
        this.showAnnouncement(text, null, 0);

        // Restore default size once the caller eventually hides it
        // (we stash a one-shot listener-like cleanup on the next hide)
        const origHide = this.hideAnnouncement.bind(this);
        this.hideAnnouncement = () => {
            if (this.announcement) {
                this.announcement.style.fontSize = '';
            }
            this.hideAnnouncement = origHide;
            origHide();
        };
    }

    // ===================================================================
    // Player Hit Callouts (marketing points)
    // ===================================================================

    showPlayerHitCallout() {
        const el = document.getElementById('player-callout');
        if (!el) return;
        if (this._calloutTimer) clearTimeout(this._calloutTimer);

        const callouts = [
            'FAST DEPLOYS!',
            'HEADLESS CMS!',
            'API-FIRST!',
            'ZERO DOWNTIME!',
            'GRAPHQL READY!',
            'EDGE CACHED!',
            'DECOUPLED!',
            'WEBHOOK POWERED!',
            'CDN OPTIMIZED!',
            'OPEN SOURCE!',
            'COMPOSABLE!',
            'JAMSTACK READY!',
            'MICROSERVICES!',
            'CLOUD NATIVE!',
            'REAL-TIME PREVIEW!',
        ];
        el.textContent = callouts[Math.floor(Math.random() * callouts.length)];
        el.classList.remove('visible');
        void el.offsetWidth; // force reflow for re-trigger
        el.classList.add('visible');

        this._calloutTimer = setTimeout(() => {
            el.classList.remove('visible');
            this._calloutTimer = null;
        }, 700);
    }

    // ===================================================================
    // Move Announcements (enemy attack names)
    // ===================================================================

    showMoveAnnouncement(line) {
        if (!this.moveAnnouncement) return;
        if (this._moveTimer) clearTimeout(this._moveTimer);

        this.moveAnnouncement.textContent = `"${line}"`;
        this.moveAnnouncement.classList.add('visible');

        this._moveTimer = setTimeout(() => {
            this.moveAnnouncement.classList.remove('visible');
            this._moveTimer = null;
        }, 3500);
    }

    showPlayerTrashTalk(line) {
        if (!this.playerTrashTalk) return;
        if (this._playerTrashTimer) clearTimeout(this._playerTrashTimer);

        this.playerTrashTalk.textContent = `"${line}"`;
        this.playerTrashTalk.classList.add('visible');

        this._playerTrashTimer = setTimeout(() => {
            this.playerTrashTalk.classList.remove('visible');
            this._playerTrashTimer = null;
        }, 3500);
    }

    // ===================================================================
    // Win Screen
    // ===================================================================

    /**
     * Show the win/lose screen.
     * @param {'player'|'enemy'} winner
     * @param {string} quote — Display quote on the screen.
     */
    showWinScreen(winner, quote) {
        if (!this.winScreen) return;

        if (this.winTitle) {
            this.winTitle.textContent = winner === 'player' ? 'YOU WIN!' : 'YOU LOSE';
        }

        if (this.winQuote) {
            this.winQuote.textContent = `"${quote}"`;
        }

        this.winScreen.classList.add('visible');
    }

    /** Hide the win/lose screen. */
    hideWinScreen() {
        if (!this.winScreen) return;
        this.winScreen.classList.remove('visible');
    }

    // ===================================================================
    // Intro Screen
    // ===================================================================

    /**
     * Show the intro screen and wire up the start callback.
     * Both clicking the start button and pressing any key will trigger it.
     * @param {Function} onStart — Called once when the player starts.
     */
    showIntroScreen(onStart) {
        if (!this.introScreen) return;

        this.introScreen.classList.remove('hidden');

        // Ensure we don't double-bind
        this._removeIntroListeners();

        let started = false;
        const trigger = () => {
            if (started) return;
            started = true;
            this._removeIntroListeners();
            this.hideIntroScreen();
            if (typeof onStart === 'function') onStart();
        };

        // Button click
        if (this.startBtn) {
            this.startBtn.addEventListener('click', trigger, { once: true });
        }

        // Any key press
        this._introKeyHandler = trigger;
        window.addEventListener('keydown', this._introKeyHandler, { once: true });
    }

    /** Hide the intro screen. */
    hideIntroScreen() {
        if (!this.introScreen) return;
        this.introScreen.classList.add('hidden');
    }

    /** Remove intro-related event listeners to prevent leaks. */
    _removeIntroListeners() {
        if (this._introKeyHandler) {
            window.removeEventListener('keydown', this._introKeyHandler);
            this._introKeyHandler = null;
        }

        // Remove click from start button by cloning (safe noop if already cleaned up)
        // We use removeEventListener only if we still have a reference — in this
        // implementation the { once: true } option handles the click path, but
        // we clean the key handler manually because both paths should cancel each
        // other.
    }

    // ===================================================================
    // Restart
    // ===================================================================

    /**
     * Register a callback for the restart button.
     * @param {Function} callback
     */
    onRestart(callback) {
        if (!this.restartBtn) return;

        // Remove previous listener by replacing the node (simple & bulletproof)
        const fresh = this.restartBtn.cloneNode(true);
        this.restartBtn.parentNode.replaceChild(fresh, this.restartBtn);
        this.restartBtn = fresh;

        this.restartBtn.addEventListener('click', () => {
            if (typeof callback === 'function') callback();
        });
    }

    // ===================================================================
    // Full Reset
    // ===================================================================

    /** Reset every HUD element back to its initial state. */
    reset() {
        // Health bars
        this.setHealth(1, 100, 100);
        this.setHealth(2, 100, 100);

        // Timer
        this.setTimer(ROUND.TIMER_SECONDS);

        // Round dots
        this.resetRoundDots();

        // Announcements
        this.hideAnnouncement();
        if (this.announcement) {
            this.announcement.style.fontSize = '';
        }

        // Win screen
        this.hideWinScreen();
    }
}
