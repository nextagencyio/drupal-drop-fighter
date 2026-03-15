// ============================================================
// Drupal Drop Fighter — Main Entry Point
// ============================================================
// Canvas setup, render loop, module wiring.

import { SCREEN, GAME_STATE, FIGHTER_STATE } from './config.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { AudioManager } from './audio.js';
import { InputManager } from './input.js';
import {
    drawDrupalDrop,
    drawMonolith,
    drawProjectile,
    drawBackground,
    drawParticle,
    drawScanlines,
} from './sprites.js';

// ---------------------------------------------------------
// Canvas Setup
// ---------------------------------------------------------

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

canvas.width = SCREEN.WIDTH;
canvas.height = SCREEN.HEIGHT;
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------
// Create Module Instances
// ---------------------------------------------------------

const hud = new HUD();
const audio = new AudioManager();
const input = new InputManager();
const game = new Game(hud, audio, input);

// ---------------------------------------------------------
// Attract Mode Setup
// ---------------------------------------------------------

// Hide player controls until a real game begins
const controlsBar = document.getElementById('controls-bar');
controlsBar.style.display = 'none';

// Hide HUD until demo starts
const hud_el = document.getElementById('hud');
hud_el.style.visibility = 'hidden';

// Title screen — shown until first click/keydown, satisfies browser autoplay policy
let titleActive = true;

function startDemo() {
    if (!titleActive) return;
    titleActive = false;
    hud_el.style.visibility = '';
    audio.init();
    audio.startMenuMusic();
}

function onInsertCoin() {
    if (titleActive) {
        startDemo();
        return;
    }
    if (!game.attractMode) return;
    game.startFromAttract();
    controlsBar.style.display = 'flex';
}

window.addEventListener('keydown', (e) => {
    if (titleActive) { startDemo(); return; }
    if (e.key === 'Enter') onInsertCoin();
});

document.getElementById('game-canvas').addEventListener('click', onInsertCoin);

// ---------------------------------------------------------
// Frame Counter & Hitstop
// ---------------------------------------------------------

let bgFrame = 0;
let hitstopFrames = 0;   // pause game for dramatic effect on big hits
let slowMotionFrames = 0; // slow-mo on KO
let slowMotionCounter = 0;
const SLOW_RATIO = 4;    // update every 4th frame = 25% speed

// ---------------------------------------------------------
// Game Loop
// ---------------------------------------------------------

function gameLoop() {
    requestAnimationFrame(gameLoop);

    bgFrame++;

    // Hitstop: freeze the game for a few frames on heavy hits
    if (hitstopFrames > 0) {
        hitstopFrames--;
        render(); // still render, just don't update
        return;
    }

    // Slow motion: update only every SLOW_RATIO real frames
    if (slowMotionFrames > 0) {
        slowMotionCounter++;
        if (slowMotionCounter < SLOW_RATIO) {
            render();
            return;
        }
        slowMotionCounter = 0;
        slowMotionFrames--;
    }

    // --- Update ---
    game.update();

    // Check for hitstop triggers
    if (game._hitstopRequest > 0) {
        hitstopFrames = game._hitstopRequest;
        game._hitstopRequest = 0;
    }

    // Check for slow motion trigger (KO)
    if (game._slowMotionRequest > 0) {
        slowMotionFrames = game._slowMotionRequest;
        game._slowMotionRequest = 0;
        slowMotionCounter = 0;
    }

    // --- Render ---
    render();
}

function render() {
    const shake = game.getScreenShake();

    ctx.save();

    // Apply screen shake offset
    if (shake.x || shake.y) {
        ctx.translate(Math.round(shake.x), Math.round(shake.y));
    }

    // --- Background ---
    drawBackground(ctx, bgFrame);

    // --- Ground shadows (behind fighters) ---
    drawGroundShadow(ctx, game.player.x, SCREEN.FLOOR_Y);
    drawGroundShadow(ctx, game.enemy.x, SCREEN.FLOOR_Y);

    // --- Projectiles (draw behind fighters) ---
    renderProjectiles();

    // --- Fighters (draw back-to-front based on y-position) ---
    renderFighter(game.player, 'player');
    renderFighter(game.enemy, 'enemy');

    // --- Particles ---
    for (const p of game.particles) {
        drawParticle(ctx, p.x, p.y, p.type, p.life);
    }

    // --- Scanlines ---
    drawScanlines(ctx, SCREEN.WIDTH, SCREEN.HEIGHT);

    // --- Title screen ---
    if (titleActive) {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, SCREEN.WIDTH, SCREEN.HEIGHT);

        // Game title
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f0a800';
        ctx.font = 'bold 42px "Courier New", monospace';
        ctx.fillText('DRUPAL DROP', SCREEN.WIDTH / 2, SCREEN.HEIGHT / 2 - 40);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.fillText('FIGHTER', SCREEN.WIDTH / 2, SCREEN.HEIGHT / 2 - 4);

        // Blinking prompt
        if (Math.floor(bgFrame / 30) % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.font = '14px "Courier New", monospace';
            ctx.fillText('CLICK OR PRESS ANY KEY TO START', SCREEN.WIDTH / 2, SCREEN.HEIGHT / 2 + 50);
        }
        ctx.restore();
        return;
    }

    // --- Attract mode hint ---
    if (game.attractMode) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '13px "Courier New", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillText('PRESS ENTER TO PLAY', SCREEN.WIDTH / 2, SCREEN.HEIGHT - 8);
        ctx.restore();
    }

    ctx.restore();
}

// ---------------------------------------------------------
// Ground Shadow
// ---------------------------------------------------------

function drawGroundShadow(ctx, x, floorY) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, floorY + 2, 40, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ---------------------------------------------------------
// Fighter Rendering
// ---------------------------------------------------------

function renderFighter(fighter, type) {
    const opts = fighter.getSpriteOptions();

    // Invulnerability blink
    if (opts.invulnerable && bgFrame % 4 < 2) return;

    if (type === 'player') {
        drawDrupalDrop(ctx, fighter.x, fighter.y, fighter.facing, fighter.animFrame, opts);
    } else {
        drawMonolith(ctx, fighter.x, fighter.y, fighter.facing, fighter.animFrame, opts);
    }
}

// ---------------------------------------------------------
// Projectile Rendering
// ---------------------------------------------------------

function renderProjectiles() {
    const playerOpts = game.player.getSpriteOptions();
    if (playerOpts.headProjectile && playerOpts.headProjectile.active) {
        const proj = playerOpts.headProjectile;
        drawProjectile(ctx, proj.x, proj.y, 'head', bgFrame);
    }

    const enemyOpts = game.enemy.getSpriteOptions();
    if (enemyOpts.projectile && enemyOpts.projectile.active) {
        const proj = enemyOpts.projectile;
        drawProjectile(ctx, proj.x, proj.y, proj.type || 'buffering', bgFrame);
    }
}

// ---------------------------------------------------------
// Start the loop
// ---------------------------------------------------------

gameLoop();
