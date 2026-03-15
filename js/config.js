// ============================================================
// Drupal Drop Fighter — Configuration & Constants
// ============================================================

// --- Screen ---
export const SCREEN = {
    WIDTH: 1024,
    HEIGHT: 576,       // 16:9
    FLOOR_Y: 460,      // y-position of the floor line
    LEFT_BOUND: 40,
    RIGHT_BOUND: 984,
    PIXEL_SCALE: 4,    // canvas resolution multiplier for crisp sprites
};

// --- Colors ---
export const COLORS = {
    // Drupal Drop
    DRUPAL_BLUE: '#0678BE',
    DRUPAL_BLUE_LIGHT: '#29A3E0',
    DRUPAL_BLUE_GLOW: '#5BC0F8',
    DRUPAL_BODY: '#3A3A3A',
    DRUPAL_BELT: '#222222',
    DRUPAL_BOOTS: '#1A1A1A',
    DRUPAL_NECK_STUMP: '#0678BE',

    // Monolith
    MONOLITH_DARK: '#2A2A2A',
    MONOLITH_MID: '#3D3D3D',
    MONOLITH_LIGHT: '#555555',
    MONOLITH_EYES: '#FF2222',
    MONOLITH_WARNING: '#FF6600',
    MONOLITH_CRACK: '#1A1A1A',

    // Effects
    HIT_FLASH: '#FFFFFF',
    BLOCK_FLASH: '#88CCFF',
    KO_RED: '#FF0000',
    SPECIAL_BLUE: '#00AAFF',
    SPECIAL_RED: '#FF4400',
    ERROR_RED: '#FF0033',

    // Environment
    BG_DARK: '#0A0A12',
    BG_MID: '#111122',
    BG_FLOOR: '#1A1A2E',
    BG_ACCENT_BLUE: '#0678BE',
    BG_ACCENT_RED: '#CC2200',
    LED_GREEN: '#00FF66',
    LED_RED: '#FF2200',
    LED_AMBER: '#FFAA00',

    // HUD
    HUD_HEALTH_GREEN: '#00CC44',
    HUD_HEALTH_YELLOW: '#CCCC00',
    HUD_HEALTH_RED: '#CC2200',
    HUD_HEALTH_BG: '#222222',
    HUD_TIMER_TEXT: '#FFFFFF',
    HUD_ROUND_DOT_ON: '#FFCC00',
    HUD_ROUND_DOT_OFF: '#333333',
    HUD_ANNOUNCE_TEXT: '#FFFFFF',
    HUD_ANNOUNCE_SHADOW: '#000000',
};

// --- Fighter Dimensions ---
export const FIGHTER = {
    WIDTH: 100,
    HEIGHT: 190,
    CROUCH_HEIGHT: 120,

    // Physics
    WALK_SPEED: 3.5,
    JUMP_FORCE: -15,
    GRAVITY: 0.72,
    KNOCKBACK_FORCE: 6,
    KNOCKBACK_HEAVY: 10,
    PUSH_APART_SPEED: 2,

    // State timings (in frames at 60fps)
    HITSTUN_LIGHT: 12,
    HITSTUN_MEDIUM: 18,
    HITSTUN_HEAVY: 24,
    BLOCKSTUN: 8,
    KNOCKDOWN_DURATION: 45,
    WAKEUP_INVULN: 15,
    KO_DURATION: 90,

    // Health
    MAX_HP: 100,

    // Starting positions
    P1_START_X: 280,
    P2_START_X: 744,
    START_Y_OFFSET: 0,  // offset from FLOOR_Y
};

// --- Damage Values ---
export const DAMAGE = {
    // Player moves
    JAB: 6,
    KICK: 8,
    UPPERCUT: 12,
    SWEEP: 10,
    HOOK: 10,
    HEAD_THROW: 18,
    SHORYUKEN: 20,
    SPIN_KICK: 15,

    // Enemy moves (Round 1)
    LAG_SPIKE: 8,
    CACHE_MISS: 7,
    BUFFERING_BLAST: 14,
    TIMEOUT_SLAM: 18,

    // Enemy moves (Round 2)
    CONTRACT_BIND: 9,
    PROPRIETARY_HOOK: 8,
    LICENSE_WALL: 0,  // barrier, no direct damage
    MIGRATION_BLOCK: 16,

    // Enemy moves (Round 3)
    TEMPLATE_ERROR: 10,
    STACK_TRACE_SLAM: 12,
    SYNTAX_EXCEPTION: 16,
    WSOD_ATTACK: 22,

    // Block chip damage multiplier
    CHIP_MULTIPLIER: 0.15,
};

// --- Hitbox Definitions ---
// x/y offsets relative to fighter origin, w/h = dimensions
// startup = frames before active, active = frames hitbox is live, recovery = frames after
export const HITBOXES = {
    // Player (scaled for 100x190 fighters)
    JAB:        { x: 60, y: -120, w: 70, h: 30, startup: 3, active: 4, recovery: 6 },
    KICK:       { x: 55, y: -70, w: 75, h: 30, startup: 5, active: 5, recovery: 8 },
    UPPERCUT:   { x: 40, y: -165, w: 55, h: 75, startup: 4, active: 6, recovery: 12 },
    SWEEP:      { x: 35, y: -18, w: 90, h: 25, startup: 6, active: 5, recovery: 14 },
    HOOK:       { x: 75, y: -115, w: 75, h: 35, startup: 7, active: 5, recovery: 10 },
    SHORYUKEN:  { x: 35, y: -175, w: 60, h: 90, startup: 3, active: 8, recovery: 18 },
    SPIN_KICK:  { x: 30, y: -90, w: 100, h: 60, startup: 8, active: 8, recovery: 14 },

    // Projectile (head throw / enemy specials)
    PROJECTILE: { w: 45, h: 45 },

    // Enemy (scaled for larger body)
    ENEMY_PUNCH:   { x: 65, y: -120, w: 75, h: 35, startup: 6, active: 5, recovery: 10 },
    ENEMY_KICK:    { x: 60, y: -70, w: 80, h: 35, startup: 7, active: 6, recovery: 12 },
    ENEMY_SPECIAL: { x: 40, y: -110, w: 85, h: 60, startup: 10, active: 8, recovery: 16 },
    ENEMY_GRAB:    { x: 45, y: -115, w: 60, h: 80, startup: 12, active: 6, recovery: 20 },
};

// --- Projectile ---
export const PROJECTILE = {
    SPEED: 7,
    HEAD_THROW_SPEED: 5,
    ENEMY_PROJECTILE_SPEED: 5,
    MAX_DISTANCE: 700,
    RETURN_SPEED: 10,  // head returning to player
};

// --- Round / Match ---
export const ROUND = {
    MAX_ROUNDS: 3,
    WINS_NEEDED: 2,
    TIMER_SECONDS: 60,
    INTRO_DURATION: 120,     // frames (2s)
    FIGHT_FLASH_DURATION: 30, // frames (0.5s)
    KO_FREEZE_DURATION: 30,
    ROUND_OVER_DURATION: 120,
    MATCH_OVER_DURATION: 180,
};

// --- Game States ---
export const GAME_STATE = {
    ATTRACT: 'attract',
    INTRO: 'intro',
    ROUND_INTRO: 'round_intro',
    FIGHT_FLASH: 'fight_flash',
    FIGHTING: 'fighting',
    ROUND_OVER: 'round_over',
    MATCH_CELEBRATION: 'match_celebration',
    MATCH_OVER: 'match_over',
};

// --- Fighter States ---
export const FIGHTER_STATE = {
    IDLE: 'idle',
    WALK_FORWARD: 'walk_forward',
    WALK_BACK: 'walk_back',
    CROUCH: 'crouch',
    JUMP: 'jump',
    PUNCH: 'punch',
    KICK: 'kick',
    SPECIAL: 'special',
    HIT_STUN: 'hit_stun',
    KNOCKDOWN: 'knockdown',
    BLOCKING: 'blocking',
    KO: 'ko',
    WAKEUP: 'wakeup',
    INTRO_WALK: 'intro_walk',
    WIN_POSE: 'win_pose',
    CELEBRATE: 'celebrate',
};

// --- Move Types (for mapping inputs to actions) ---
export const MOVE = {
    NONE: 'none',
    JAB: 'jab',
    KICK: 'kick',
    UPPERCUT: 'uppercut',
    SWEEP: 'sweep',
    HOOK: 'hook',
    HEAD_THROW: 'head_throw',
    SHORYUKEN: 'shoryuken',
    SPIN_KICK: 'spin_kick',
};

// --- Input ---
export const INPUT = {
    MOTION_BUFFER_FRAMES: 15,  // frames to complete a motion input
    DIRECTIONS: {
        NEUTRAL: 5,
        UP: 8,
        DOWN: 2,
        LEFT: 4,
        RIGHT: 6,
        UP_LEFT: 7,
        UP_RIGHT: 9,
        DOWN_LEFT: 1,
        DOWN_RIGHT: 3,
    },
};

// --- AI ---
export const AI = {
    DECISION_INTERVAL: 20,     // frames between AI decisions
    REACT_DISTANCE_FAR: 300,
    REACT_DISTANCE_MID: 150,
    REACT_DISTANCE_CLOSE: 80,
    BLOCK_CHANCE_BASE: 0.25,
    BLOCK_CHANCE_PER_ROUND: 0.1,
    SPECIAL_CHANCE_BASE: 0.08,
    SPECIAL_CHANCE_PER_ROUND: 0.06,
    APPROACH_CHANCE: 0.6,
    RETREAT_CHANCE: 0.15,
};

// --- Round Theme Data ---
export const ROUND_THEMES = [
    {
        name: 'SLOW PERFORMANCE',
        intro: 'Loading... Loading... FIGHT!',
        loseQuote: 'Connection timed out...',
        moves: { punch: 'Lag Spike', kick: 'Cache Miss', special: 'Buffering Blast', grab: 'Timeout Slam' },
    },
    {
        name: 'VENDOR LOCK-IN',
        intro: 'You can never leave!',
        loseQuote: 'Terms of service... violated...',
        moves: { punch: 'Contract Bind', kick: 'Proprietary Hook', special: 'License Wall', grab: 'Migration Block' },
    },
    {
        name: 'TWIG DEBUGGING',
        intro: '{{ undefined }} has entered the ring!',
        loseQuote: 'Fatal error on line 1...',
        moves: { punch: 'Template Error', kick: 'Stack Trace Slam', special: 'Syntax Exception', grab: 'WSOD Attack' },
    },
];

// --- Player Win Quotes ---
export const WIN_QUOTES = [
    'Your monolith has been decoupled.',
    'Headless. Fearless. Deployed.',
    '50GB CDN. Zero lag. Next round?',
    'git push origin victory',
];

// --- Animation Frames (for sprite drawing) ---
export const ANIM = {
    IDLE_FRAMES: 4,
    IDLE_SPEED: 10,        // ticks per frame
    WALK_FRAMES: 4,
    WALK_SPEED: 6,
    ATTACK_SPEED: 3,       // ticks per frame for attack anims
    HIT_FLASH_FRAMES: 3,
    KNOCKDOWN_FRAMES: 6,
    KO_FRAMES: 8,
};

// --- Visual Effects ---
export const FX = {
    SCREEN_SHAKE_LIGHT: 4,
    SCREEN_SHAKE_HEAVY: 12,
    SCREEN_SHAKE_DURATION: 10,
    PARTICLE_COUNT_HIT: 10,
    PARTICLE_COUNT_KO: 30,
    PARTICLE_SPEED: 5,
    PARTICLE_LIFETIME: 25,
    SCANLINE_ALPHA: 0.03,
};
