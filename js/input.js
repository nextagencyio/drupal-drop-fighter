// ============================================================
// Drupal Drop Fighter — Input Manager
// Keyboard + Mobile Touch Controls with Motion Input Detection
// ============================================================

import { MOVE, INPUT } from './config.js';

const DIR = INPUT.DIRECTIONS;

// Key-to-action mapping
const KEY_MAP = {
    ArrowLeft:  'left',
    ArrowRight: 'right',
    ArrowUp:    'up',
    ArrowDown:  'down',
    KeyX:       'punch',
    KeyZ:       'kick',
    KeyC:       'special1',
    KeyV:       'special3',
    x:          'punch',
    X:          'punch',
    z:          'kick',
    Z:          'kick',
    c:          'special1',
    C:          'special1',
    v:          'special3',
    V:          'special3',

};

// Directions that should prevent page scroll
const PREVENT_DEFAULT_KEYS = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
]);

export class InputManager {
    constructor() {
        // ── Raw held-state for each logical button ──
        this._held = {
            left: false, right: false, up: false, down: false,
            punch: false, kick: false,
            special1: false, special2: false, special3: false,
        };

        this._justPressed = { punch: false, kick: false, special1: false, special2: false, special3: false };
        this._prevHeld = { punch: false, kick: false, special1: false, special2: false, special3: false };

        // ── Motion input buffer ──
        // Stores { dir, frame } entries for the last N frames.
        this._motionBuffer = [];
        this._frameCount = 0;

        // ── Bind listeners ──
        this._boundKeyDown = this._onKeyDown.bind(this);
        this._boundKeyUp = this._onKeyUp.bind(this);
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);

        this._initTouchControls();
    }

    // ────────────────────────────────────────────
    // Keyboard events
    // ────────────────────────────────────────────

    _onKeyDown(e) {
        if (PREVENT_DEFAULT_KEYS.has(e.code)) {
            e.preventDefault();
        }

        // Try mapping by code first, then by key value
        const action = KEY_MAP[e.code] || KEY_MAP[e.key];
        if (action && !e.repeat) {
            this._held[action] = true;
        }
    }

    _onKeyUp(e) {
        const action = KEY_MAP[e.code] || KEY_MAP[e.key];
        if (action) {
            this._held[action] = false;
        }
    }

    // ────────────────────────────────────────────
    // Touch controls
    // ────────────────────────────────────────────

    _initTouchControls() {
        const container = document.getElementById('touch-controls');
        if (!container) return;

        const allDirs = ['up', 'down', 'left', 'right'];
        const allActions = ['punch', 'kick', 'special1', 'special2', 'special3'];

        // On every touch event, scan ALL active touch points to determine
        // which buttons are currently pressed. This handles finger slides,
        // lifted fingers, and multi-touch correctly.
        const syncTouches = (e) => {
            e.preventDefault();

            // Clear all touch-driven states
            for (const d of allDirs) this._held[d] = false;
            for (const a of allActions) this._held[a] = false;

            // Check each active touch point
            for (const touch of e.touches) {
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                if (!el) continue;

                // Check for d-pad direction (on the button or a child of it)
                const dirEl = el.closest('[data-dir]');
                if (dirEl) this._held[dirEl.getAttribute('data-dir')] = true;

                // Check for action button
                const actEl = el.closest('[data-action]');
                if (actEl) this._held[actEl.getAttribute('data-action')] = true;
            }
        };

        container.addEventListener('touchstart', syncTouches, { passive: false });
        container.addEventListener('touchmove', syncTouches, { passive: false });
        container.addEventListener('touchend', syncTouches, { passive: false });
        container.addEventListener('touchcancel', syncTouches, { passive: false });
    }

    // ────────────────────────────────────────────
    // Per-frame update — call once at the start of each game tick
    // ────────────────────────────────────────────

    update() {
        this._frameCount++;

        // ── Compute "just pressed" (rising edge) for attack buttons ──
        this._justPressed.punch    = this._held.punch    && !this._prevHeld.punch;
        this._justPressed.kick     = this._held.kick     && !this._prevHeld.kick;
        this._justPressed.special1 = this._held.special1 && !this._prevHeld.special1;
        this._justPressed.special2 = this._held.special2 && !this._prevHeld.special2;
        this._justPressed.special3 = this._held.special3 && !this._prevHeld.special3;

        this._prevHeld.punch    = this._held.punch;
        this._prevHeld.kick     = this._held.kick;
        this._prevHeld.special1 = this._held.special1;
        this._prevHeld.special2 = this._held.special2;
        this._prevHeld.special3 = this._held.special3;

        // ── Update motion buffer ──
        const currentDir = this.direction;

        // Only record a new entry when the direction changes from the last recorded
        // entry, to avoid flooding the buffer with repeated neutral or held directions.
        const lastEntry = this._motionBuffer[this._motionBuffer.length - 1];
        if (!lastEntry || lastEntry.dir !== currentDir) {
            this._motionBuffer.push({ dir: currentDir, frame: this._frameCount });
        }

        // Prune entries that are too old
        const cutoff = this._frameCount - INPUT.MOTION_BUFFER_FRAMES;
        while (this._motionBuffer.length > 0 && this._motionBuffer[0].frame < cutoff) {
            this._motionBuffer.shift();
        }
    }

    // ────────────────────────────────────────────
    // Direction queries
    // ────────────────────────────────────────────

    /** Returns an INPUT.DIRECTIONS value (numpad notation). */
    get direction() {
        const l = this._held.left;
        const r = this._held.right;
        const u = this._held.up;
        const d = this._held.down;

        // When opposing directions are both held, they cancel.
        const hx = (l && r) ? 0 : l ? -1 : r ? 1 : 0;  // -1 left, 0 neutral, 1 right
        const vy = (u && d) ? 0 : u ? -1 : d ? 1 : 0;   // -1 up, 0 neutral, 1 down

        // Map to numpad notation
        if (vy === -1) {
            // Up row
            if (hx === -1) return DIR.UP_LEFT;    // 7
            if (hx ===  1) return DIR.UP_RIGHT;   // 9
            return DIR.UP;                         // 8
        }
        if (vy === 1) {
            // Down row
            if (hx === -1) return DIR.DOWN_LEFT;   // 1
            if (hx ===  1) return DIR.DOWN_RIGHT;  // 3
            return DIR.DOWN;                        // 2
        }
        // Neutral row
        if (hx === -1) return DIR.LEFT;   // 4
        if (hx ===  1) return DIR.RIGHT;  // 6
        return DIR.NEUTRAL;                // 5
    }

    get isLeft()  { return this._held.left  && !this._held.right; }
    get isRight() { return this._held.right && !this._held.left; }
    get isUp()    { return this._held.up    && !this._held.down; }
    get isDown()  { return this._held.down  && !this._held.up; }

    // ────────────────────────────────────────────
    // Button queries
    // ────────────────────────────────────────────

    /** True only on the frame the punch button was first pressed. */
    get punchPressed() { return this._justPressed.punch; }

    /** True only on the frame the kick button was first pressed. */
    get kickPressed() { return this._justPressed.kick; }

    /** True every frame punch is held. */
    get punchHeld() { return this._held.punch; }

    /** True every frame kick is held. */
    get kickHeld() { return this._held.kick; }

    get special1Pressed() { return this._justPressed.special1; }
    get special2Pressed() { return this._justPressed.special2; }
    get special3Pressed() { return this._justPressed.special3; }

    // ────────────────────────────────────────────
    // Motion input detection
    // ────────────────────────────────────────────

    /**
     * Checks the motion buffer for completed special-move sequences.
     * Call this when punchPressed or kickPressed is true.
     *
     * @param {number} playerFacing  1 = facing right, -1 = facing left
     * @returns {string} A MOVE constant (MOVE.HEAD_THROW, MOVE.SHORYUKEN, MOVE.SPIN_KICK)
     *                   or MOVE.NONE if no motion was detected.
     */
    checkMotionInput(playerFacing) {
        // Only check on the frame an attack button is pressed.
        const punchJust = this._justPressed.punch;
        const kickJust  = this._justPressed.kick;

        if (!punchJust && !kickJust) return MOVE.NONE;

        // Build direction constants relative to facing.
        const forward      = playerFacing === 1 ? DIR.RIGHT      : DIR.LEFT;
        const back         = playerFacing === 1 ? DIR.LEFT        : DIR.RIGHT;
        const downForward  = playerFacing === 1 ? DIR.DOWN_RIGHT  : DIR.DOWN_LEFT;
        const downBack     = playerFacing === 1 ? DIR.DOWN_LEFT   : DIR.DOWN_RIGHT;

        // Extract just the direction sequence from the buffer (strip timestamps for matching).
        const dirs = this._motionBuffer.map(e => e.dir);

        // ── Punch + Kick together = HEAD_THROW ──
        if (punchJust && this._held.kick) {
            return MOVE.HEAD_THROW;
        }
        if (kickJust && this._held.punch) {
            return MOVE.HEAD_THROW;
        }

        return MOVE.NONE;
    }

    /**
     * Lenient subsequence matcher.
     * Returns true if `sequence` appears as a subsequence within `buffer`,
     * allowing other directions (like NEUTRAL) in between.
     * The final element of the sequence must appear at or near the end of the buffer
     * (within the last 3 entries) so we don't match stale motions.
     *
     * @param {number[]} buffer  Flat array of direction values from the motion buffer.
     * @param {number[]} sequence  Ordered directions to look for (e.g. [2,3,6]).
     * @returns {boolean}
     */
    _matchSequence(buffer, sequence) {
        if (buffer.length === 0 || sequence.length === 0) return false;

        const seqLen = sequence.length;
        const bufLen = buffer.length;

        // The final direction in the sequence must be among the last 3 buffer entries
        // to avoid matching motions completed too long ago.
        const tailSlice = buffer.slice(Math.max(0, bufLen - 3));
        if (!tailSlice.includes(sequence[seqLen - 1])) return false;

        // Walk through the buffer and try to match the sequence in order.
        let si = 0;
        for (let bi = 0; bi < bufLen && si < seqLen; bi++) {
            if (buffer[bi] === sequence[si]) {
                si++;
            }
        }

        return si === seqLen;
    }

    /**
     * Detect a double-tap of a direction in the recent buffer.
     * Matches: direction -> something else (neutral/other) -> direction again
     * The second tap must be in the last 3 entries.
     */
    _matchDoubleTap(buffer, direction) {
        if (buffer.length < 3) return false;

        // Second tap must be recent (last 3 entries)
        const tail = buffer.slice(Math.max(0, buffer.length - 3));
        if (!tail.includes(direction)) return false;

        // Find two occurrences of the direction with something different between them
        let firstIdx = -1;
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === direction) {
                if (firstIdx === -1) {
                    firstIdx = i;
                } else {
                    // Check there was a gap (non-direction) between the two taps
                    let hadGap = false;
                    for (let j = firstIdx + 1; j < i; j++) {
                        if (buffer[j] !== direction) { hadGap = true; break; }
                    }
                    if (hadGap) return true;
                }
            }
        }
        return false;
    }

    // ────────────────────────────────────────────
    // Reset (between rounds)
    // ────────────────────────────────────────────

    reset() {
        for (const k of Object.keys(this._held)) this._held[k] = false;
        for (const k of Object.keys(this._justPressed)) this._justPressed[k] = false;
        for (const k of Object.keys(this._prevHeld)) this._prevHeld[k] = false;

        this._motionBuffer = [];
    }

    // ────────────────────────────────────────────
    // Cleanup (if the input manager is ever destroyed)
    // ────────────────────────────────────────────

    destroy() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
    }
}
