// ============================================================
// Drupal Drop Fighter — Sprite Drawing Module (SF2 Visual Overhaul)
// Arcade-quality procedural canvas sprites with rich detail,
// gradients, glow effects, crowd, and atmosphere.
// ============================================================

import { SCREEN, COLORS, FIGHTER, ANIM, FX } from './config.js';

// ============================================================
// Cached gradients / offscreen canvases for performance
// ============================================================
let _bgCache = null;
let _bgCacheFrame = -1;
const BG_CACHE_INTERVAL = 2; // re-render static BG every N frames

// ============================================================
// Helper: Drupal drop head (teardrop shape) — enhanced with
// gradients, inner highlights, and configurable glow aura
// ============================================================
function drawDrupalHead(ctx, cx, cy, size, glowIntensity = 0.6) {
    ctx.save();

    // Outer glow aura
    if (glowIntensity > 0) {
        ctx.save();
        const auraGrad = ctx.createRadialGradient(cx, cy, size * 0.3, cx, cy, size * 1.4);
        auraGrad.addColorStop(0, `rgba(91,192,248,${0.25 * glowIntensity})`);
        auraGrad.addColorStop(0.6, `rgba(6,120,190,${0.1 * glowIntensity})`);
        auraGrad.addColorStop(1, 'rgba(6,120,190,0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Main teardrop shape with gradient fill
    const tipY = cy - size * 0.9;
    const bottomY = cy + size * 0.55;
    const midY = cy - size * 0.1;
    const halfW = size * 0.55;

    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.bezierCurveTo(cx + size * 0.1, cy - size * 0.5, cx + halfW, midY, cx + halfW, midY + size * 0.15);
    ctx.bezierCurveTo(cx + halfW, bottomY, cx + size * 0.15, bottomY + size * 0.15, cx, bottomY + size * 0.05);
    ctx.bezierCurveTo(cx - size * 0.15, bottomY + size * 0.15, cx - halfW, bottomY, cx - halfW, midY + size * 0.15);
    ctx.bezierCurveTo(cx - halfW, midY, cx - size * 0.1, cy - size * 0.5, cx, tipY);
    ctx.closePath();

    // Gradient fill
    const headGrad = ctx.createLinearGradient(cx - halfW, tipY, cx + halfW, bottomY);
    headGrad.addColorStop(0, '#29A3E0');
    headGrad.addColorStop(0.3, COLORS.DRUPAL_BLUE);
    headGrad.addColorStop(1, '#045A8D');
    ctx.fillStyle = headGrad;

    if (glowIntensity > 0) {
        ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW;
        ctx.shadowBlur = 10 * glowIntensity;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner highlight (specular)
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#5BC0F8';
    ctx.beginPath();
    ctx.ellipse(cx - size * 0.12, cy - size * 0.2, size * 0.18, size * 0.25, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Small bright dot highlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(cx - size * 0.14, cy - size * 0.28, size * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// ============================================================
// Helper: draw a rounded rectangle
// ============================================================
function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ============================================================
// Helper: draw a limb segment with gradient (arm/leg)
// ============================================================
function drawLimb(ctx, x, y, w, h, baseColor, highlightColor, radius = 3) {
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, highlightColor);
    grad.addColorStop(0.4, baseColor);
    grad.addColorStop(1, highlightColor);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
}

// ============================================================
// Helper: draw hand wrap markings
// ============================================================
function drawHandWraps(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(200,200,200,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const wy = y + 1 + i * (h / 3);
        ctx.beginPath();
        ctx.moveTo(x, wy);
        ctx.lineTo(x + w, wy);
        ctx.stroke();
    }
    ctx.restore();
}

// ============================================================
// Helper: motion blur lines behind a moving limb
// ============================================================
function drawMotionLines(ctx, x, y, length, angle, count = 3) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 5;
        ctx.globalAlpha = 0.15 + (count - i) * 0.05;
        ctx.beginPath();
        ctx.moveTo(0, offset);
        ctx.lineTo(-length, offset);
        ctx.stroke();
    }
    ctx.restore();
}

// ============================================================
// 1. drawDrupalDrop — THE HERO (redesigned)
// ============================================================
export function drawDrupalDrop(ctx, x, y, facing, frame, options = {}) {
    const { state = 'idle', move = '', hp = 100, headDetached = false, flashTimer = 0, attackFrame = 0 } = options;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    const S = FIGHTER.HEIGHT / 110;
    ctx.scale(S, S);

    const breathe = Math.sin(frame * 0.08) * 1.5;
    const walk = Math.floor(frame / ANIM.WALK_SPEED) % ANIM.WALK_FRAMES;
    const walkSin = Math.sin(walk * Math.PI * 2 / ANIM.WALK_FRAMES);

    // State-driven animation params
    let ox = 0, oy = 0, lean = 0, crouch = 0;
    let rArmAng = -0.4, rArmExt = 0, lArmAng = 0.5;
    let legSpr = 0.3, lKick = 0, rKick = 0, squash = 1;

    const atkPhase = (dur) => { const p = Math.min(attackFrame / dur, 1); return p < 0.3 ? p / 0.3 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4; };

    switch (state) {
        case 'idle': oy = breathe; lean = -0.05; break;
        case 'walk_forward': oy = Math.abs(walkSin) * 3; lean = -0.08; legSpr = 0.2 + walkSin * 0.3; rArmAng = -0.3 + Math.sin(walk * Math.PI / 2) * 0.2; break;
        case 'walk_back': oy = Math.abs(walkSin) * 3; lean = 0.08; legSpr = 0.2 + walkSin * 0.3; break;
        case 'crouch': crouch = 0.35; lean = -0.1; legSpr = 0.5; break;
        case 'jump': oy = -5; squash = 1.1; rArmAng = -0.5; break;
        case 'punch': { const ph = atkPhase(10); rArmExt = ph; rArmAng = -1.0 * ph; lean = -0.15 * ph; ox = 6 * ph; break; }
        case 'kick': { const ph = atkPhase(12); lKick = ph; lean = 0.1 * ph; ox = -3 * ph; legSpr = 0.2; break; }
        case 'special':
            if (move === 'head_throw') { const ph = Math.min(attackFrame / 15, 1); lean = -0.2 * ph; ox = 8 * ph; lArmAng = 0.4 - ph * 1.5; legSpr = 0.4; }
            else if (move === 'shoryuken') { const sp = Math.min(attackFrame / 20, 1); oy = -30 * Math.sin(sp * Math.PI); rArmAng = -1.3; rArmExt = 0.9; lean = -0.3; squash = 1.15; }
            else if (move === 'spin_kick') { const a = (attackFrame / 18) * Math.PI * 2; lean = Math.sin(a) * 0.3; lKick = Math.abs(Math.sin(a)); }
            break;
        case 'hit_stun': { const p = Math.min(attackFrame / 12, 1); lean = 0.25; ox = -8 * (1 - p); oy = -3 * Math.sin(p * Math.PI); break; }
        case 'knockdown': { const p = Math.min(attackFrame / ANIM.KNOCKDOWN_FRAMES, 1); lean = 0.3 + p * 1.2; oy = p * 30; ox = -p * 15; squash = 1 - p * 0.3; break; }
        case 'blocking': lean = 0.15; ox = -3; rArmAng = 0.3; lArmAng = 0.3; legSpr = 0.35; crouch = 0.1; break;
        case 'ko': { const p = Math.min(attackFrame / ANIM.KO_FRAMES, 1); lean = 0.3 + p * 1.3; oy = p * 40; ox = -p * 20; squash = 1 - p * 0.4; break; }
        case 'win_pose': oy = Math.sin(frame * 0.05) * 2; rArmAng = -1.5; rArmExt = 0.6; lean = -0.1; lArmAng = -1.2; break;
        case 'celebrate': {
            // Repeatedly jump up and down with arms raised
            const t = frame * 0.18;
            const bounce = Math.abs(Math.sin(t)) * 30;
            oy = -bounce;
            squash = bounce > 20 ? 1.15 : bounce < 4 ? 0.85 : 1;
            legSpr = 0.3 + Math.abs(Math.sin(t)) * 0.4;
            rArmAng = -1.4 - Math.abs(Math.sin(t)) * 0.4;
            lArmAng = -1.2 - Math.abs(Math.sin(t)) * 0.4;
            rArmExt = 0.5;
            lean = Math.sin(t * 0.5) * 0.08;
            break;
        }
        case 'intro_walk': oy = Math.abs(walkSin) * 3; legSpr = 0.2 + walkSin * 0.3; break;
        case 'wakeup': { const p = Math.min(attackFrame / 15, 1); lean = 1.5 * (1 - p); oy = 40 * (1 - p); ox = -20 * (1 - p); break; }
    }

    const crouchY = crouch * 40;
    const tY = oy + crouchY;

    // ---- LEGS ----
    ctx.save();
    ctx.translate(ox, tY);
    const legLen = 40 - crouchY * 0.4;

    // Helper to draw one leg
    const drawLeg = (lx, kick, mirror) => {
        ctx.save();
        if (kick > 0) { ctx.translate(lx, -legLen); ctx.rotate((mirror ? 1 : -1) * kick * 1.2); ctx.translate(-lx, legLen); }

        // JEANS — thigh
        const jg = ctx.createLinearGradient(lx - 8, 0, lx + 8, 0);
        jg.addColorStop(0, '#2a3d68'); jg.addColorStop(0.4, '#3a5488'); jg.addColorStop(1, '#2a3d68');
        ctx.fillStyle = jg;
        roundRect(ctx, lx - 8, -legLen, 16, legLen * 0.55, 3);
        ctx.fill();
        // Pocket stitch on front leg
        if (mirror) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
            roundRect(ctx, lx - 1, -legLen + 4, 8, 7, 2); ctx.stroke();
            ctx.restore();
        }
        // JEANS — shin (continuous denim)
        ctx.fillStyle = '#304e80';
        roundRect(ctx, lx - 7, -legLen * 0.45, 14, legLen * 0.45, 2);
        ctx.fill();
        // Fade seam at knee
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(ctx, lx - 7, -legLen * 0.5, 14, 5, 2); ctx.fill();

        // SNEAKER — main body (off-white)
        ctx.fillStyle = '#E2E2DA';
        roundRect(ctx, lx - 10, -12, 21, 10, 4);
        ctx.fill();
        // Sneaker toe cap
        ctx.fillStyle = '#F0F0E8';
        roundRect(ctx, lx + 4, -12, 7, 7, 3); ctx.fill();
        // Sole
        ctx.fillStyle = '#252525';
        roundRect(ctx, lx - 10, -4, 21, 4, 2); ctx.fill();
        // Drupal blue side stripe
        ctx.fillStyle = COLORS.DRUPAL_BLUE;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(lx - 9, -9, 13, 2);
        ctx.globalAlpha = 1;
        // Lace dots
        ctx.fillStyle = '#AAAAAA';
        for (let d = 0; d < 3; d++) {
            ctx.beginPath(); ctx.arc(lx - 5 + d * 4, -11, 1, 0, Math.PI * 2); ctx.fill();
        }

        if (kick > 0.5) drawMotionLines(ctx, lx, -legLen * 0.3, 25, Math.PI + 0.3, 4);
        ctx.restore();
    };
    drawLeg(-6 - legSpr * 12, lKick, false);
    drawLeg(6 + legSpr * 12, rKick, true);
    ctx.restore();

    // ---- BODY ----
    ctx.save();
    ctx.translate(ox, tY);
    ctx.rotate(lean);
    ctx.scale(1, squash);

    const tw = 38, th = 48;
    const tTop = -(40 + th);
    const sY = tTop + 4;
    const hY = tTop + th;

    // ---- SHIRT BODY ----
    const shirtGrad = ctx.createLinearGradient(-tw / 2, tTop, tw / 2, hY);
    shirtGrad.addColorStop(0, '#2a3a5c');
    shirtGrad.addColorStop(1, '#1e2b44');
    ctx.fillStyle = shirtGrad;
    roundRect(ctx, -tw / 2, tTop, tw, th, 3);
    ctx.fill();

    // Drupal logo on chest — small glowing teardrop icon
    ctx.save();
    ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW;
    ctx.shadowBlur = 10;
    const logoPulse = 0.55 + Math.sin(frame * 0.09) * 0.18;
    // teardrop tip
    ctx.fillStyle = `rgba(91,192,248,${logoPulse * 0.9})`;
    ctx.beginPath();
    ctx.moveTo(0, tTop + 12);
    ctx.bezierCurveTo(3, tTop + 15, 5, tTop + 19, 5, tTop + 20);
    ctx.bezierCurveTo(5, tTop + 24, -5, tTop + 24, -5, tTop + 20);
    ctx.bezierCurveTo(-5, tTop + 19, -3, tTop + 15, 0, tTop + 12);
    ctx.fill();
    // bright inner dot
    ctx.fillStyle = `rgba(255,255,255,${logoPulse * 0.6})`;
    ctx.beginPath(); ctx.arc(0, tTop + 20, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // ---- HEAD ----
    const headSz = 26;
    if (!headDetached) {
        // Crew neck
        ctx.fillStyle = '#243350';
        roundRect(ctx, -6, tTop - 6, 12, 8, 3); ctx.fill();

        const headY = tTop - headSz - 6;
        const bob = state === 'idle' ? breathe * 0.4 : 0;
        const glow = state === 'special' ? 1.0 : state === 'punch' ? 0.8 : 0.4 + Math.sin(frame * 0.08) * 0.15;
        drawDrupalHead(ctx, 0, headY + bob, headSz, glow);

        // Face
        const ey = headY + bob + headSz * 0.05;
        const esp = 6;
        // Eyes - white with colored pupil
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(-esp, ey, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(esp, ey, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        // Pupils
        const pOff = state === 'hit_stun' ? -2 : state === 'ko' ? 0 : 1.2;
        ctx.fillStyle = '#0678BE';
        ctx.beginPath(); ctx.arc(-esp + pOff, ey + 0.5, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(esp + pOff, ey + 0.5, 2.2, 0, Math.PI * 2); ctx.fill();
        // Inner pupil
        ctx.fillStyle = '#034';
        ctx.beginPath(); ctx.arc(-esp + pOff + 0.3, ey + 0.5, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(esp + pOff + 0.3, ey + 0.5, 1, 0, Math.PI * 2); ctx.fill();
        // Eye shine
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(-esp - 1, ey - 1, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(esp - 1, ey - 1, 1, 0, Math.PI * 2); ctx.fill();

        // Eyebrows — fierce
        ctx.strokeStyle = '#045080'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-esp - 4, ey - 5); ctx.lineTo(-esp + 3, ey - 6.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(esp - 3, ey - 6.5); ctx.lineTo(esp + 4, ey - 5); ctx.stroke();

        // Mouth
        if (state === 'punch' || state === 'kick' || state === 'special') {
            ctx.fillStyle = '#034'; ctx.beginPath(); ctx.ellipse(0, ey + 9, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#023'; ctx.beginPath(); ctx.ellipse(0, ey + 9, 3, 2, 0, 0, Math.PI); ctx.fill();
        } else if (state === 'hit_stun' || state === 'ko') {
            ctx.strokeStyle = '#045'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-3, ey + 9); ctx.lineTo(3, ey + 8); ctx.stroke();
        } else {
            // Confident smirk
            ctx.strokeStyle = '#045080'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(-3, ey + 8); ctx.quadraticCurveTo(0, ey + 10, 4, ey + 7); ctx.stroke();
        }
    } else {
        // Headless — glowing stump
        ctx.save();
        const np = 0.7 + Math.sin(frame * 0.12) * 0.3;
        ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW; ctx.shadowBlur = 15;
        ctx.fillStyle = `rgba(91,192,248,${0.4 * np})`;
        ctx.beginPath(); ctx.arc(0, tTop - 6, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.DRUPAL_BLUE;
        roundRect(ctx, -7, tTop - 12, 14, 14, 4); ctx.fill();
        for (let i = 0; i < 4; i++) {
            const a = frame * 0.3 + i * 1.6;
            ctx.strokeStyle = COLORS.DRUPAL_BLUE_GLOW; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0, tTop - 8);
            ctx.lineTo(Math.cos(a) * 10, tTop - 8 + Math.sin(a) * 7); ctx.stroke();
        }
        ctx.restore();
    }

    // Hit flash
    if (flashTimer > 0) {
        ctx.save();
        ctx.shadowColor = '#FFF'; ctx.shadowBlur = 35;
        ctx.globalAlpha = Math.min(flashTimer / ANIM.HIT_FLASH_FRAMES, 0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath(); ctx.ellipse(0, tTop + th / 2, 30, 50, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // ---- RIGHT ARM ----
    ctx.save();
    const armLen = 32 + rArmExt * 26;
    const aw = 10;
    ctx.translate(tw / 2 + 4, sY + 8);
    ctx.rotate(rArmAng);
    // Sleeve (matches shirt)
    ctx.fillStyle = '#243350';
    roundRect(ctx, -aw / 2, 0, aw, armLen * 0.5, 4); ctx.fill();
    // Forearm
    ctx.fillStyle = '#7a96b8';
    roundRect(ctx, -aw / 2 + 1, armLen * 0.46, aw - 2, armLen * 0.5, 3); ctx.fill();
    // Fist
    ctx.fillStyle = '#6a86a8';
    roundRect(ctx, -5, armLen - 2, 10, 11, 3); ctx.fill();
    // Glowing punch effect
    if (state === 'punch' && rArmExt > 0.5) {
        ctx.save();
        ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW; ctx.shadowBlur = 22;
        ctx.fillStyle = `rgba(91,192,248,${rArmExt * 0.6})`;
        ctx.beginPath(); ctx.arc(0, armLen + 7, 12, 0, Math.PI * 2); ctx.fill();
        if (rArmExt > 0.8) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(0, armLen + 7, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        drawMotionLines(ctx, 0, armLen * 0.3, 28, Math.PI + rArmAng, 5);
    }
    ctx.restore();

    // ---- LEFT ARM ----
    ctx.save();
    const la = 28;
    ctx.translate(-tw / 2 - 4, sY + 8);
    ctx.rotate(lArmAng);
    // Sleeve
    ctx.fillStyle = '#243350';
    roundRect(ctx, -aw / 2, 0, aw, la * 0.5, 4); ctx.fill();
    // Forearm
    ctx.fillStyle = '#7a96b8';
    roundRect(ctx, -aw / 2 + 1, la * 0.46, aw - 2, la * 0.5, 3); ctx.fill();
    // Fist
    ctx.fillStyle = '#6a86a8';
    roundRect(ctx, -5, la - 2, 10, 11, 3); ctx.fill();
    ctx.restore();

    // ---- BLOCKING SHIELD ----
    if (state === 'blocking') {
        ctx.save();
        const sp = 0.5 + Math.sin(frame * 0.3) * 0.2;
        ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW; ctx.shadowBlur = 20;
        ctx.strokeStyle = COLORS.DRUPAL_BLUE_LIGHT; ctx.lineWidth = 3; ctx.globalAlpha = sp;
        ctx.beginPath(); ctx.ellipse(8, tTop + th / 2, 32, 50, 0, 0, Math.PI * 2); ctx.stroke();
        const sg = ctx.createRadialGradient(8, tTop + th / 2, 5, 8, tTop + th / 2, 45);
        sg.addColorStop(0, 'rgba(91,192,248,0.15)'); sg.addColorStop(1, 'rgba(6,120,190,0)');
        ctx.fillStyle = sg; ctx.fill();
        ctx.restore();
    }

    // ---- SPECIALS ----
    if (state === 'special') {
        if (move === 'shoryuken') {
            ctx.save(); ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW; ctx.shadowBlur = 25;
            for (let i = 0; i < 5; i++) { ctx.globalAlpha = Math.max(0, 0.3 - i * 0.05); ctx.fillStyle = COLORS.DRUPAL_BLUE_LIGHT; ctx.beginPath(); ctx.arc(0, tTop + th / 2 + i * 16 + attackFrame * 3, 14 - i * 2, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = 0.15; ctx.fillStyle = COLORS.DRUPAL_BLUE_GLOW; ctx.fillRect(-15, tTop - 20, 30, th + 30);
            ctx.restore();
        } else if (move === 'spin_kick') {
            ctx.save(); ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW; ctx.shadowBlur = 15; ctx.strokeStyle = COLORS.DRUPAL_BLUE_LIGHT; ctx.lineWidth = 5;
            const sa = (attackFrame / 18) * Math.PI * 2;
            for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.4 - i * 0.12; ctx.beginPath(); ctx.arc(0, -50, 40 + i * 5, sa - 1.8 + i * 0.3, sa - i * 0.2, false); ctx.stroke(); }
            ctx.restore();
        }
    }

    ctx.restore(); // body group
    ctx.restore(); // scale
    ctx.restore(); // main
}


// ============================================================
// 2. drawMonolith — THE ENEMY
// ============================================================
export function drawMonolith(ctx, x, y, facing, frame, options = {}) {
    const {
        state = 'idle',
        move = '',
        hp = 100,
        flashTimer = 0,
        attackFrame = 0,
        round = 1,
    } = options;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);

    // Scale up to match FIGHTER.HEIGHT
    const monolithScale = FIGHTER.HEIGHT / 110;
    ctx.scale(monolithScale, monolithScale);

    const idleCycle = Math.floor(frame / ANIM.IDLE_SPEED) % ANIM.IDLE_FRAMES;
    const walkCycle = Math.floor(frame / ANIM.WALK_SPEED) % ANIM.WALK_FRAMES;
    const crackIntensity = 1 - (hp / 100);

    let bodyOffsetX = 0, bodyOffsetY = 0;
    let torsoLean = 0, crouchAmount = 0;
    let punchExtend = 0, kickExtend = 0;
    let shakeMag = 0, crumbleProgress = 0;

    switch (state) {
        case 'idle':
            bodyOffsetY = Math.sin(idleCycle * Math.PI * 2 / ANIM.IDLE_FRAMES) * 1.5;
            break;
        case 'walk_forward':
            bodyOffsetY = Math.abs(Math.sin(walkCycle * Math.PI * 2 / ANIM.WALK_FRAMES)) * 2;
            bodyOffsetX = Math.sin(walkCycle * Math.PI / 2) * 2;
            torsoLean = -0.03;
            break;
        case 'walk_back':
            bodyOffsetY = Math.abs(Math.sin(walkCycle * Math.PI * 2 / ANIM.WALK_FRAMES)) * 2;
            bodyOffsetX = -Math.sin(walkCycle * Math.PI / 2) * 2;
            torsoLean = 0.03;
            break;
        case 'crouch':
            crouchAmount = 0.3;
            break;
        case 'jump':
            bodyOffsetY = -5;
            break;
        case 'punch': {
            const p = Math.min(attackFrame / 12, 1);
            const phase = p < 0.35 ? p / 0.35 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
            punchExtend = phase;
            torsoLean = -0.1 * phase;
            bodyOffsetX = 6 * phase;
            break;
        }
        case 'kick': {
            const p = Math.min(attackFrame / 14, 1);
            const phase = p < 0.35 ? p / 0.35 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
            kickExtend = phase;
            bodyOffsetX = -4 * phase;
            torsoLean = 0.08 * phase;
            break;
        }
        case 'special': {
            const p = Math.min(attackFrame / 18, 1);
            shakeMag = 3 * (1 - p);
            torsoLean = -0.05;
            bodyOffsetY = -2;
            break;
        }
        case 'hit_stun': {
            const p = Math.min(attackFrame / 14, 1);
            torsoLean = 0.2;
            bodyOffsetX = -10 * (1 - p);
            shakeMag = 4 * (1 - p);
            break;
        }
        case 'knockdown': {
            const p = Math.min(attackFrame / ANIM.KNOCKDOWN_FRAMES, 1);
            torsoLean = 0.3 + p * 1.1;
            bodyOffsetY = p * 35;
            bodyOffsetX = -p * 18;
            break;
        }
        case 'blocking':
            torsoLean = 0.1;
            bodyOffsetX = -4;
            crouchAmount = 0.08;
            break;
        case 'ko': {
            const p = Math.min(attackFrame / ANIM.KO_FRAMES, 1);
            crumbleProgress = p;
            torsoLean = p * 0.5;
            bodyOffsetY = p * 45;
            break;
        }
        case 'win_pose':
            bodyOffsetY = Math.sin(frame * 0.04) * 2;
            break;
        case 'intro_walk':
            bodyOffsetY = Math.abs(Math.sin(walkCycle * Math.PI * 2 / ANIM.WALK_FRAMES)) * 2;
            break;
        case 'wakeup': {
            const p = Math.min(attackFrame / 15, 1);
            torsoLean = 1.4 * (1 - p);
            bodyOffsetY = 45 * (1 - p);
            bodyOffsetX = -18 * (1 - p);
            break;
        }
    }

    const shakeX = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag : 0;
    const shakeY = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag : 0;
    ctx.translate(bodyOffsetX + shakeX, bodyOffsetY + shakeY);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 2, 38, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const crouchY = crouchAmount * 25;

    ctx.save();
    ctx.rotate(torsoLean);

    const totalH = 120 - crouchY;
    const bodyW = 56;
    const sectionCount = 4;
    const sectionH = totalH / sectionCount;
    const bodyTop = -totalH;

    // ---- BODY SECTIONS ----
    for (let i = 0; i < sectionCount; i++) {
        ctx.save();
        const secY = bodyTop + i * sectionH;
        let secOffX = 0, secOffY = 0, secRot = 0;

        if (crumbleProgress > 0) {
            const delay = i * 0.15;
            const sP = Math.max(0, Math.min((crumbleProgress - delay) / (1 - delay), 1));
            secOffX = (i % 2 === 0 ? -1 : 1) * sP * 22 * (i + 1);
            secOffY = sP * sP * 35 * (sectionCount - i);
            secRot = (i % 2 === 0 ? -1 : 1) * sP * 0.5;
        }
        ctx.translate(secOffX, secOffY);
        ctx.rotate(secRot);

        const secW = bodyW - i * 2;

        // Main section gradient
        const secGrad = ctx.createLinearGradient(-secW / 2, secY, secW / 2, secY + sectionH);
        if (i % 2 === 0) {
            secGrad.addColorStop(0, '#333');
            secGrad.addColorStop(0.5, '#2A2A2A');
            secGrad.addColorStop(1, '#222');
        } else {
            secGrad.addColorStop(0, '#444');
            secGrad.addColorStop(0.5, '#3D3D3D');
            secGrad.addColorStop(1, '#333');
        }
        ctx.fillStyle = secGrad;
        roundRect(ctx, -secW / 2, secY, secW, sectionH - 1, 2);
        ctx.fill();

        // Top edge highlight
        ctx.fillStyle = '#555';
        ctx.fillRect(-secW / 2 + 1, secY, secW - 2, 2);
        // Bottom edge shadow
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(-secW / 2 + 1, secY + sectionH - 2, secW - 2, 1);

        // Panel lines (horizontal rack detail)
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 0.5;
        for (let p = 1; p < 3; p++) {
            const py = secY + (sectionH / 3) * p;
            ctx.beginPath();
            ctx.moveTo(-secW / 2 + 4, py);
            ctx.lineTo(secW / 2 - 4, py);
            ctx.stroke();
        }

        // Ventilation grille (small horizontal slits on sides)
        ctx.fillStyle = '#1A1A1A';
        for (let v = 0; v < 3; v++) {
            const vy = secY + 4 + v * (sectionH / 4);
            // Left grille
            ctx.fillRect(-secW / 2 + 2, vy, 5, 1.5);
            ctx.fillRect(-secW / 2 + 2, vy + 3, 5, 1.5);
            // Right grille
            ctx.fillRect(secW / 2 - 7, vy, 5, 1.5);
            ctx.fillRect(secW / 2 - 7, vy + 3, 5, 1.5);
        }

        // Screws/bolts at corners
        ctx.fillStyle = '#666';
        const boltR = 1.5;
        const boltInset = 5;
        [[- secW / 2 + boltInset, secY + boltInset], [secW / 2 - boltInset, secY + boltInset],
         [-secW / 2 + boltInset, secY + sectionH - boltInset], [secW / 2 - boltInset, secY + sectionH - boltInset]].forEach(([bx, by]) => {
            ctx.beginPath();
            ctx.arc(bx, by, boltR, 0, Math.PI * 2);
            ctx.fill();
        });

        // Data port slots (mid section detail)
        if (i === 1 || i === 2) {
            ctx.fillStyle = '#181818';
            ctx.fillRect(-8, secY + sectionH / 2 - 2, 16, 4);
            // Port indicator light
            ctx.save();
            const portLed = ((frame + i * 20) % 60) < 40;
            if (portLed) {
                ctx.shadowColor = COLORS.LED_GREEN;
                ctx.shadowBlur = 3;
                ctx.fillStyle = COLORS.LED_GREEN;
            } else {
                ctx.fillStyle = '#333';
            }
            ctx.fillRect(10, secY + sectionH / 2 - 1, 2, 2);
            ctx.restore();
        }

        // LED warning lights (more detailed)
        if (crumbleProgress < 0.5) {
            const ledColors = [COLORS.LED_GREEN, COLORS.LED_RED, COLORS.LED_AMBER, COLORS.LED_GREEN, COLORS.LED_RED];
            for (let j = 0; j < 5; j++) {
                const ledOn = ((frame + i * 13 + j * 7) % 30) < 20;
                if (ledOn) {
                    ctx.save();
                    const lc = ledColors[(i + j) % ledColors.length];
                    ctx.shadowColor = lc;
                    ctx.shadowBlur = 4;
                    ctx.fillStyle = lc;
                    const ledX = -secW / 2 + 10 + j * 7;
                    const ledY = secY + sectionH - 6;
                    ctx.fillRect(ledX, ledY, 2, 2);
                    ctx.restore();
                }
            }
        }

        // Glowing red core visible in chest section
        if (i === 1 && crumbleProgress < 0.8) {
            ctx.save();
            const corePulse = 0.5 + Math.sin(frame * 0.1) * 0.3;
            const coreGrad = ctx.createRadialGradient(0, secY + sectionH / 2, 2, 0, secY + sectionH / 2, 14);
            coreGrad.addColorStop(0, `rgba(255,34,34,${0.6 * corePulse})`);
            coreGrad.addColorStop(0.5, `rgba(255,34,34,${0.2 * corePulse})`);
            coreGrad.addColorStop(1, 'rgba(255,34,34,0)');
            ctx.fillStyle = coreGrad;
            ctx.fillRect(-14, secY + 2, 28, sectionH - 4);
            ctx.restore();
        }

        // Cracks with electrical sparks
        if (crackIntensity > 0.1) {
            ctx.save();
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1 + crackIntensity * 1.5;
            ctx.globalAlpha = crackIntensity;

            const seed = i * 31 + 7;
            const numCracks = Math.floor(crackIntensity * 4) + 1;
            for (let c = 0; c < numCracks; c++) {
                const cx1 = -secW / 2 + ((seed + c * 37) % secW);
                const cy1 = secY + ((seed + c * 23) % Math.floor(sectionH));
                ctx.beginPath();
                ctx.moveTo(cx1, cy1);
                ctx.lineTo(cx1 + ((seed + c * 11) % 18) - 9, cy1 + ((seed + c * 19) % 14));
                ctx.lineTo(cx1 + ((seed + c * 7) % 14) - 7, cy1 + ((seed + c * 29) % 12) + 5);
                ctx.stroke();

                // Electrical sparks on cracks when damaged
                if (crackIntensity > 0.4 && ((frame + c * 7) % 12) < 3) {
                    ctx.save();
                    ctx.shadowColor = '#FFAA00';
                    ctx.shadowBlur = 6;
                    ctx.strokeStyle = '#FFDD44';
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.8;
                    const sparkX = cx1 + ((seed + c * 3) % 10) - 5;
                    const sparkY = cy1 + ((seed + c * 5) % 8);
                    ctx.beginPath();
                    ctx.moveTo(sparkX, sparkY);
                    ctx.lineTo(sparkX + 4, sparkY - 3);
                    ctx.lineTo(sparkX + 2, sparkY + 2);
                    ctx.lineTo(sparkX + 6, sparkY - 1);
                    ctx.stroke();
                    ctx.restore();
                }

                // Orange energy leaking from cracks
                if (crackIntensity > 0.6) {
                    ctx.save();
                    ctx.globalAlpha = crackIntensity * 0.3;
                    const leakGrad = ctx.createRadialGradient(cx1, cy1, 1, cx1, cy1, 8);
                    leakGrad.addColorStop(0, 'rgba(255,170,0,0.5)');
                    leakGrad.addColorStop(1, 'rgba(255,100,0,0)');
                    ctx.fillStyle = leakGrad;
                    ctx.beginPath();
                    ctx.arc(cx1, cy1, 8, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
            ctx.restore();
        }

        // KO crumble sparks
        if (crumbleProgress > 0.2) {
            const sparkCount = Math.floor(crumbleProgress * 4);
            for (let s = 0; s < sparkCount; s++) {
                const sp = ((frame * 3 + i * 17 + s * 31) % 100) / 100;
                if (sp < 0.3) {
                    ctx.save();
                    ctx.shadowColor = '#FFAA00';
                    ctx.shadowBlur = 5;
                    ctx.fillStyle = '#FFDD44';
                    ctx.globalAlpha = 0.7 * (1 - sp / 0.3);
                    const sx = -secW / 2 + sp * secW * 3;
                    const sy = secY + (s * 7) % Math.floor(sectionH);
                    ctx.fillRect(sx, sy, 2, 2);
                    ctx.restore();
                }
            }
        }

        ctx.restore(); // section
    }

    // ---- EYES (menacing visor) ----
    if (crumbleProgress < 0.7) {
        const eyeY = bodyTop + sectionH * 0.45;
        const eyeGlow = state === 'special' ? 1.0 : state === 'hit_stun' ? 0.3 : 0.7 + Math.sin(frame * 0.08) * 0.15;

        // Visor band
        ctx.save();
        ctx.fillStyle = '#1A1A1A';
        roundRect(ctx, -22, eyeY - 6, 44, 12, 3);
        ctx.fill();
        ctx.restore();

        // Eye glow auras
        ctx.save();
        const eyeAura = ctx.createRadialGradient(-11, eyeY, 1, -11, eyeY, 14);
        eyeAura.addColorStop(0, `rgba(255,34,34,${0.3 * eyeGlow})`);
        eyeAura.addColorStop(1, 'rgba(255,34,34,0)');
        ctx.fillStyle = eyeAura;
        ctx.beginPath();
        ctx.arc(-11, eyeY, 14, 0, Math.PI * 2);
        ctx.fill();
        const eyeAura2 = ctx.createRadialGradient(11, eyeY, 1, 11, eyeY, 14);
        eyeAura2.addColorStop(0, `rgba(255,34,34,${0.3 * eyeGlow})`);
        eyeAura2.addColorStop(1, 'rgba(255,34,34,0)');
        ctx.fillStyle = eyeAura2;
        ctx.beginPath();
        ctx.arc(11, eyeY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Eyes themselves
        ctx.save();
        ctx.shadowColor = COLORS.MONOLITH_EYES;
        ctx.shadowBlur = 10 * eyeGlow;
        ctx.fillStyle = COLORS.MONOLITH_EYES;

        const blinkFrame = frame % 180;
        const isBlinking = blinkFrame > 175;
        const eyeH = isBlinking ? 1 : 5;

        // Left eye
        roundRect(ctx, -16, eyeY - eyeH / 2, 10, eyeH, 1);
        ctx.fill();
        // Right eye
        roundRect(ctx, 6, eyeY - eyeH / 2, 10, eyeH, 1);
        ctx.fill();

        // Eye highlight (bright center)
        if (!isBlinking) {
            ctx.fillStyle = '#FF8888';
            ctx.globalAlpha = 0.5;
            ctx.fillRect(-14, eyeY - 1, 3, 2);
            ctx.fillRect(8, eyeY - 1, 3, 2);
        }
        ctx.restore();

        // KO: eyes flicker and die
        if (crumbleProgress > 0.3 && crumbleProgress < 0.7) {
            const flicker = Math.random() > 0.5;
            if (!flicker) {
                ctx.save();
                ctx.fillStyle = '#1A1A1A';
                ctx.fillRect(-16, eyeY - 3, 10, 6);
                ctx.fillRect(6, eyeY - 3, 10, 6);
                ctx.restore();
            }
        }
    }

    // ---- ARMS (piston-like with cable details) ----
    const armY = bodyTop + sectionH * 1.2;
    const armW = 16;
    const armH = 34;

    // Right arm (punch side)
    ctx.save();
    const rightArmX = bodyW / 2;
    if (punchExtend > 0) {
        ctx.translate(rightArmX, armY);
        ctx.rotate(-0.5 * punchExtend);
        ctx.translate(-rightArmX, -armY);
    }
    // Arm body with gradient
    const rArmGrad = ctx.createLinearGradient(rightArmX, armY, rightArmX + armW + punchExtend * 28, armY);
    rArmGrad.addColorStop(0, '#444');
    rArmGrad.addColorStop(0.5, '#3D3D3D');
    rArmGrad.addColorStop(1, '#333');
    ctx.fillStyle = rArmGrad;
    roundRect(ctx, rightArmX, armY + 2, armW + punchExtend * 28, armH - 4, 3);
    ctx.fill();

    // Piston joint detail
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(rightArmX + armW / 2, armY + armH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(rightArmX + armW / 2, armY + armH / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Cable bundles
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rightArmX + 3, armY + 4);
    ctx.quadraticCurveTo(rightArmX + armW / 2 + punchExtend * 10, armY - 2, rightArmX + armW + punchExtend * 20, armY + 6);
    ctx.stroke();

    // Fist block
    const fistGrad = ctx.createLinearGradient(rightArmX + armW + punchExtend * 24, armY - 3, rightArmX + armW + punchExtend * 24 + 14, armY + armH + 3);
    fistGrad.addColorStop(0, '#444');
    fistGrad.addColorStop(1, '#2A2A2A');
    ctx.fillStyle = fistGrad;
    roundRect(ctx, rightArmX + armW + punchExtend * 24, armY - 3, 14, armH + 6, 3);
    ctx.fill();

    if (state === 'punch' && punchExtend > 0.8) {
        ctx.save();
        ctx.shadowColor = COLORS.MONOLITH_WARNING;
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(255,102,0,0.5)';
        ctx.beginPath();
        ctx.arc(rightArmX + armW + punchExtend * 28 + 8, armY + armH / 2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawMotionLines(ctx, rightArmX + armW + punchExtend * 10, armY + armH / 2, 22, Math.PI, 3);
    }
    ctx.restore();

    // Left arm
    ctx.save();
    const lArmGrad = ctx.createLinearGradient(-bodyW / 2 - armW, armY, -bodyW / 2, armY);
    lArmGrad.addColorStop(0, '#333');
    lArmGrad.addColorStop(0.5, '#3D3D3D');
    lArmGrad.addColorStop(1, '#444');
    ctx.fillStyle = lArmGrad;
    roundRect(ctx, -bodyW / 2 - armW, armY + 2, armW, armH - 4, 3);
    ctx.fill();
    // Piston joint
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(-bodyW / 2 - armW / 2, armY + armH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-bodyW / 2 - armW / 2, armY + armH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    // Fist
    ctx.fillStyle = '#2A2A2A';
    roundRect(ctx, -bodyW / 2 - armW - 6, armY - 3, 8, armH + 6, 3);
    ctx.fill();
    ctx.restore();

    // ---- LEGS (hydraulic pillars) ----
    const legTopY = -crouchY;
    const legH = 26 + crouchY * 0.3;
    const legW = 18;
    const kickOffX = kickExtend * 35;

    // Left leg
    ctx.save();
    const llGrad = ctx.createLinearGradient(-bodyW / 2 + 4, legTopY - legH, -bodyW / 2 + 4 + legW, legTopY);
    llGrad.addColorStop(0, '#333');
    llGrad.addColorStop(1, '#2A2A2A');
    ctx.fillStyle = llGrad;
    roundRect(ctx, -bodyW / 2 + 4, legTopY - legH, legW, legH, 2);
    ctx.fill();
    // Hydraulic detail
    ctx.fillStyle = '#555';
    ctx.fillRect(-bodyW / 2 + 8, legTopY - legH + 4, 3, legH - 8);
    // Boot
    ctx.fillStyle = '#222';
    roundRect(ctx, -bodyW / 2 + 2, -8, legW + 4, 8, 2);
    ctx.fill();
    ctx.restore();

    // Right leg (kicking)
    ctx.save();
    if (kickExtend > 0) {
        ctx.translate(bodyW / 2 - 4, legTopY - legH);
        ctx.rotate(-kickExtend * 0.8);
        ctx.translate(-(bodyW / 2 - 4), -(legTopY - legH));
    }
    const rlGrad = ctx.createLinearGradient(bodyW / 2 - legW - 4, legTopY - legH, bodyW / 2 - 4, legTopY);
    rlGrad.addColorStop(0, '#2A2A2A');
    rlGrad.addColorStop(1, '#333');
    ctx.fillStyle = rlGrad;
    roundRect(ctx, bodyW / 2 - legW - 4, legTopY - legH, legW, legH, 2);
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillRect(bodyW / 2 - legW, legTopY - legH + 4, 3, legH - 8);
    ctx.fillStyle = '#222';
    roundRect(ctx, bodyW / 2 - legW - 6, -8, legW + 4, 8, 2);
    ctx.fill();
    ctx.restore();

    // ---- BLOCKING EFFECT ----
    if (state === 'blocking') {
        ctx.save();
        ctx.shadowColor = COLORS.MONOLITH_WARNING;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = COLORS.MONOLITH_WARNING;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.4 + Math.sin(frame * 0.25) * 0.2;
        ctx.beginPath();
        ctx.ellipse(5, bodyTop + totalH / 2, 40, 60, 0, 0, Math.PI * 2);
        ctx.stroke();
        const blockGrad = ctx.createRadialGradient(5, bodyTop + totalH / 2, 5, 5, bodyTop + totalH / 2, 50);
        blockGrad.addColorStop(0, 'rgba(255,102,0,0.1)');
        blockGrad.addColorStop(1, 'rgba(255,102,0,0)');
        ctx.fillStyle = blockGrad;
        ctx.beginPath();
        ctx.ellipse(5, bodyTop + totalH / 2, 40, 60, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ---- SPECIAL MOVE EFFECTS ----
    if (state === 'special') {
        ctx.save();
        ctx.shadowColor = COLORS.MONOLITH_WARNING;
        ctx.shadowBlur = 22;
        ctx.fillStyle = COLORS.MONOLITH_WARNING;
        ctx.globalAlpha = 0.3 + Math.sin(frame * 0.5) * 0.2;
        for (let i = 0; i < 6; i++) {
            const angle = (frame * 0.15 + i * Math.PI / 3);
            const radius = 45;
            const px = Math.cos(angle) * radius;
            const py = bodyTop + totalH / 2 + Math.sin(angle) * 55;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        // Inner warning glow
        ctx.globalAlpha = 0.1;
        const spGrad = ctx.createRadialGradient(0, bodyTop + totalH / 2, 5, 0, bodyTop + totalH / 2, 50);
        spGrad.addColorStop(0, COLORS.MONOLITH_WARNING);
        spGrad.addColorStop(1, 'rgba(255,102,0,0)');
        ctx.fillStyle = spGrad;
        ctx.fillRect(-50, bodyTop, 100, totalH);
        ctx.restore();
    }

    // ---- HIT STUN overlay ----
    if (state === 'hit_stun') {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = COLORS.MONOLITH_WARNING;
        ctx.fillRect(-bodyW / 2, bodyTop, bodyW, totalH);
        ctx.restore();
    }

    ctx.restore(); // torso rotation

    // ---- HIT FLASH (glow effect, no white box) ----
    if (flashTimer > 0) {
        ctx.save();
        ctx.shadowColor = '#FF4400';
        ctx.shadowBlur = 30;
        ctx.globalAlpha = Math.min(flashTimer / ANIM.HIT_FLASH_FRAMES, 0.5);
        ctx.fillStyle = 'rgba(255,100,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(0, -55, 35, 55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.restore(); // monolithScale
    ctx.restore(); // main transform
}


// ============================================================
// 3. drawProjectile — Enhanced projectile effects
// ============================================================
export function drawProjectile(ctx, x, y, type, frame) {
    ctx.save();
    ctx.translate(x, y);

    switch (type) {
        case 'head': {
            const wobble = Math.sin(frame * 0.4) * 0.15;
            ctx.rotate(wobble);

            // Outer energy spiral trail
            ctx.save();
            ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW;
            ctx.shadowBlur = 16;
            for (let i = 1; i <= 6; i++) {
                const trailAlpha = 0.2 - i * 0.03;
                ctx.globalAlpha = Math.max(0, trailAlpha);
                ctx.fillStyle = COLORS.DRUPAL_BLUE_LIGHT;
                const spiralY = Math.sin(frame * 0.3 + i * 0.8) * 4;
                ctx.beginPath();
                ctx.arc(-i * 9, spiralY, 12 - i * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Speed lines behind
            ctx.save();
            ctx.strokeStyle = 'rgba(91,192,248,0.3)';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 5; i++) {
                const ly = -8 + i * 4;
                ctx.globalAlpha = 0.15 + (5 - i) * 0.03;
                ctx.beginPath();
                ctx.moveTo(-12, ly);
                ctx.lineTo(-30 - i * 6, ly);
                ctx.stroke();
            }
            ctx.restore();

            // Lens flare glow at center
            ctx.save();
            const flareGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 24);
            flareGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
            flareGrad.addColorStop(0.3, 'rgba(91,192,248,0.2)');
            flareGrad.addColorStop(1, 'rgba(91,192,248,0)');
            ctx.fillStyle = flareGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // The head itself (larger)
            drawDrupalHead(ctx, 0, 0, 22, 1.0);

            // Spinning energy ring
            ctx.save();
            ctx.strokeStyle = COLORS.DRUPAL_BLUE_GLOW;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.6;
            ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(0, 0, 20, frame * 0.2, frame * 0.2 + Math.PI * 1.3);
            ctx.stroke();
            // Second ring
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(0, 0, 24, frame * -0.15, frame * -0.15 + Math.PI * 0.8);
            ctx.stroke();
            ctx.restore();
            break;
        }

        case 'buffering': {
            const segments = 10;
            const radius = 18;
            const rotAngle = frame * 0.15;

            // Outer glow
            ctx.save();
            const buffGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
            buffGlow.addColorStop(0, 'rgba(255,102,0,0.3)');
            buffGlow.addColorStop(1, 'rgba(255,102,0,0)');
            ctx.fillStyle = buffGlow;
            ctx.beginPath();
            ctx.arc(0, 0, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.shadowColor = COLORS.MONOLITH_WARNING;
            ctx.shadowBlur = 12;
            for (let i = 0; i < segments; i++) {
                const angle = rotAngle + (i * Math.PI * 2 / segments);
                const alpha = (segments - i) / segments;
                const segSize = 3 + (segments - i) / segments * 2;
                ctx.save();
                ctx.globalAlpha = alpha * 0.8;
                // Gradient segments
                const segGrad = ctx.createRadialGradient(
                    Math.cos(angle) * radius, Math.sin(angle) * radius, 0,
                    Math.cos(angle) * radius, Math.sin(angle) * radius, segSize
                );
                segGrad.addColorStop(0, '#FFCC44');
                segGrad.addColorStop(1, COLORS.MONOLITH_WARNING);
                ctx.fillStyle = segGrad;
                ctx.beginPath();
                ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, segSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();

            // Pulsing center orb
            const centerPulse = 0.7 + Math.sin(frame * 0.3) * 0.3;
            ctx.save();
            ctx.shadowColor = COLORS.MONOLITH_EYES;
            ctx.shadowBlur = 8;
            const centerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 5 * centerPulse);
            centerGrad.addColorStop(0, '#FF6644');
            centerGrad.addColorStop(1, COLORS.MONOLITH_EYES);
            ctx.fillStyle = centerGrad;
            ctx.beginPath();
            ctx.arc(0, 0, 5 * centerPulse, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            break;
        }

        case 'syntax': {
            const symbols = ['}', '%', '{', ';', '!', '<', '/', '>'];
            // Red glow aura
            ctx.save();
            const synGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 20);
            synGlow.addColorStop(0, 'rgba(255,0,51,0.25)');
            synGlow.addColorStop(1, 'rgba(255,0,51,0)');
            ctx.fillStyle = synGlow;
            ctx.beginPath();
            ctx.arc(0, 0, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.shadowColor = COLORS.ERROR_RED;
            ctx.shadowBlur = 10;
            ctx.font = 'bold 15px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < 7; i++) {
                const angle = (frame * 0.12 + i * Math.PI * 2 / 7);
                const dist = 10 + Math.sin(frame * 0.2 + i) * 5;
                const sx = Math.cos(angle) * dist;
                const sy = Math.sin(angle) * dist;
                ctx.save();
                ctx.globalAlpha = 0.6 + Math.sin(frame * 0.3 + i * 2) * 0.3;
                ctx.fillStyle = i % 2 === 0 ? COLORS.ERROR_RED : '#FF6644';
                // Glow trail per symbol
                ctx.shadowColor = i % 2 === 0 ? COLORS.ERROR_RED : '#FF4400';
                ctx.shadowBlur = 6;
                ctx.fillText(symbols[i % symbols.length], sx, sy);
                ctx.restore();
            }
            ctx.restore();
            break;
        }
    }

    ctx.restore();
}


// ============================================================
// 4. drawBackground — DATA CENTER ARENA (SF2-style)
// ============================================================
export function drawBackground(ctx, frame) {
    const W = SCREEN.WIDTH;
    const H = SCREEN.HEIGHT;

    // ======== LAYER 1: BACK WALL (y: 0-200) ========

    // Base dark gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 200);
    bgGrad.addColorStop(0, '#080810');
    bgGrad.addColorStop(1, '#0E0E1C');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, 200);

    // Ceiling fluorescent lighting panels
    for (let i = 0; i < 5; i++) {
        const lx = 60 + i * 210;
        const lw = 140;
        const flicker = 0.85 + Math.sin(frame * 0.07 + i * 1.3) * 0.1 + (Math.random() * 0.05);
        // Light panel body
        ctx.save();
        ctx.fillStyle = `rgba(200,210,230,${0.12 * flicker})`;
        ctx.fillRect(lx, 6, lw, 8);
        // Glow below the light
        const lightGrad = ctx.createLinearGradient(lx + lw / 2, 14, lx + lw / 2, 80);
        lightGrad.addColorStop(0, `rgba(180,200,240,${0.08 * flicker})`);
        lightGrad.addColorStop(1, 'rgba(180,200,240,0)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(lx - 20, 14, lw + 40, 66);
        ctx.restore();
    }

    // Ceiling cable trays with colored cables
    ctx.save();
    const cableColors = ['#1A2244', '#1A1A3A', '#221A2A', '#1A2A22', '#2A1A1A'];
    for (let p = 0; p < 4; p++) {
        const py = 16 + p * 6;
        ctx.strokeStyle = cableColors[p % cableColors.length];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, py);
        // Slight sag between support points
        for (let seg = 0; seg < 6; seg++) {
            const sx = (seg + 1) * (W / 6);
            const sag = 2 + Math.sin(seg * 0.8) * 1;
            ctx.quadraticCurveTo(sx - W / 12, py + sag, sx, py);
        }
        ctx.stroke();
    }
    // Vertical conduits
    ctx.strokeStyle = '#181830';
    ctx.lineWidth = 4;
    for (let v = 0; v < 7; v++) {
        const vx = 70 + v * 155;
        ctx.beginPath();
        ctx.moveTo(vx, 0);
        ctx.lineTo(vx, 40);
        ctx.stroke();
        // Conduit bracket
        ctx.fillStyle = '#222240';
        ctx.fillRect(vx - 6, 36, 12, 4);
    }
    ctx.restore();

    // Server rack cabinets in the back wall
    const rackCount = 11;
    const rackW = 72;
    const rackSpacing = (W + 60) / rackCount;
    for (let i = 0; i < rackCount; i++) {
        const rx = i * rackSpacing - 15;
        const rackH = 155 + (i % 3) * 20;
        const rackTop = 200 - rackH;

        // Rack body gradient
        const rackGrad = ctx.createLinearGradient(rx, rackTop, rx + rackW, rackTop);
        rackGrad.addColorStop(0, '#0F0F1E');
        rackGrad.addColorStop(0.1, '#141428');
        rackGrad.addColorStop(0.9, '#141428');
        rackGrad.addColorStop(1, '#0F0F1E');
        ctx.fillStyle = rackGrad;
        ctx.fillRect(rx, rackTop, rackW, rackH);

        // Rack edges
        ctx.fillStyle = '#1C1C34';
        ctx.fillRect(rx, rackTop, 2, rackH);
        ctx.fillRect(rx + rackW - 2, rackTop, 2, rackH);
        ctx.fillStyle = '#1A1A30';
        ctx.fillRect(rx, rackTop, rackW, 2);

        // Shelf lines and equipment
        const shelfCount = Math.floor(rackH / 22);
        for (let s = 0; s < shelfCount; s++) {
            const sy = rackTop + 4 + s * 22;
            ctx.fillStyle = '#181830';
            ctx.fillRect(rx + 4, sy, rackW - 8, 1);
            // Equipment face plate
            ctx.fillStyle = (s + i) % 3 === 0 ? '#16162C' : '#121226';
            ctx.fillRect(rx + 6, sy + 2, rackW - 12, 16);
        }

        // LEDs per rack
        for (let j = 0; j < 5; j++) {
            const ledSeed = i * 17 + j * 31;
            const ledPeriod = 30 + (ledSeed % 50);
            const ledOn = (frame + ledSeed) % ledPeriod < ledPeriod * 0.6;
            if (ledOn) {
                const ledType = (ledSeed + j) % 3;
                const ledColor = ledType === 0 ? COLORS.LED_GREEN : ledType === 1 ? COLORS.LED_RED : COLORS.LED_AMBER;
                const ledX = rx + 10 + (j % 3) * 10;
                const ledY = rackTop + 10 + j * 22 + (i % 2) * 8;
                if (ledY < 195 && ledY > rackTop) {
                    ctx.save();
                    ctx.shadowColor = ledColor;
                    ctx.shadowBlur = 3;
                    ctx.fillStyle = ledColor;
                    ctx.fillRect(ledX, ledY, 2, 2);
                    ctx.restore();
                }
            }
        }
    }

    // Wall-mounted monitors showing code/dashboards
    const monitorPositions = [
        { x: 120, y: 50, w: 70, h: 45 },
        { x: 380, y: 40, w: 65, h: 40 },
        { x: 620, y: 55, w: 70, h: 45 },
        { x: 860, y: 42, w: 65, h: 40 },
    ];
    for (const mon of monitorPositions) {
        // Monitor bezel
        ctx.fillStyle = '#1A1A2E';
        roundRect(ctx, mon.x - 3, mon.y - 3, mon.w + 6, mon.h + 6, 2);
        ctx.fill();
        // Screen
        const screenGrad = ctx.createLinearGradient(mon.x, mon.y, mon.x, mon.y + mon.h);
        screenGrad.addColorStop(0, '#0A1A2A');
        screenGrad.addColorStop(1, '#061218');
        ctx.fillStyle = screenGrad;
        ctx.fillRect(mon.x, mon.y, mon.w, mon.h);

        // Scrolling code lines
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.font = '5px monospace';
        const scrollOffset = (frame * 0.5) % 60;
        const isBlue = mon.x < W / 2;
        ctx.fillStyle = isBlue ? '#2288CC' : '#22CC66';
        for (let line = 0; line < 8; line++) {
            const ly = mon.y + 5 + line * 5 - scrollOffset % 5;
            if (ly > mon.y && ly < mon.y + mon.h - 2) {
                const textW = 15 + ((line * 7 + mon.x) % 30);
                ctx.fillRect(mon.x + 3, ly, textW, 2);
            }
        }
        ctx.restore();

        // Screen glow
        ctx.save();
        const monGlow = ctx.createRadialGradient(mon.x + mon.w / 2, mon.y + mon.h / 2, 5, mon.x + mon.w / 2, mon.y + mon.h / 2, 50);
        monGlow.addColorStop(0, isBlue ? 'rgba(30,100,180,0.06)' : 'rgba(30,180,80,0.06)');
        monGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = monGlow;
        ctx.fillRect(mon.x - 20, mon.y - 20, mon.w + 40, mon.h + 40);
        ctx.restore();
    }

    // "DECOUPLED.IO" neon sign
    ctx.save();
    const signX = W / 2;
    const signY = 30;
    const signPulse = 0.7 + Math.sin(frame * 0.04) * 0.2;
    ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW;
    ctx.shadowBlur = 12 * signPulse;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(91,192,248,${0.5 * signPulse})`;
    ctx.fillText('DECOUPLED.IO', signX, signY);
    // Double pass for glow
    ctx.fillStyle = `rgba(91,192,248,${0.3 * signPulse})`;
    ctx.fillText('DECOUPLED.IO', signX, signY);
    ctx.restore();

    // ======== Side accent lighting ========
    // Blue glow on left
    ctx.save();
    const blueGrad = ctx.createRadialGradient(0, H * 0.4, 10, 0, H * 0.4, 350);
    blueGrad.addColorStop(0, 'rgba(6,120,190,0.10)');
    blueGrad.addColorStop(1, 'rgba(6,120,190,0)');
    ctx.fillStyle = blueGrad;
    ctx.fillRect(0, 0, W / 2, H);
    ctx.restore();
    // Red glow on right
    ctx.save();
    const redGrad = ctx.createRadialGradient(W, H * 0.4, 10, W, H * 0.4, 350);
    redGrad.addColorStop(0, 'rgba(204,34,0,0.08)');
    redGrad.addColorStop(1, 'rgba(204,34,0,0)');
    ctx.fillStyle = redGrad;
    ctx.fillRect(W / 2, 0, W / 2, H);
    ctx.restore();

    // ======== LAYER 2: CROWD AREA (y: 200-380) ========

    // Crowd background fill
    const crowdBg = ctx.createLinearGradient(0, 200, 0, 380);
    crowdBg.addColorStop(0, '#0C0C18');
    crowdBg.addColorStop(1, '#0A0A14');
    ctx.fillStyle = crowdBg;
    ctx.fillRect(0, 200, W, 180);

    // Glass barrier / metallic railing at y=370
    const railY = 370;
    // Glass panel
    ctx.save();
    ctx.globalAlpha = 0.08;
    const glassGrad = ctx.createLinearGradient(0, 340, 0, railY);
    glassGrad.addColorStop(0, '#4488CC');
    glassGrad.addColorStop(0.5, '#88BBEE');
    glassGrad.addColorStop(1, '#4488CC');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(0, 340, W, railY - 340);
    ctx.restore();
    // Metal railing
    ctx.fillStyle = '#3A3A50';
    ctx.fillRect(0, railY, W, 4);
    ctx.fillStyle = '#4A4A60';
    ctx.fillRect(0, railY, W, 1);
    // Blue accent strip on railing
    ctx.save();
    ctx.shadowColor = COLORS.DRUPAL_BLUE;
    ctx.shadowBlur = 4;
    ctx.fillStyle = COLORS.DRUPAL_BLUE;
    ctx.globalAlpha = 0.3 + Math.sin(frame * 0.03) * 0.1;
    ctx.fillRect(0, railY + 3, W, 1);
    ctx.restore();
    // Railing posts
    for (let rp = 0; rp < 14; rp++) {
        const rpx = 20 + rp * 75;
        ctx.fillStyle = '#3A3A50';
        ctx.fillRect(rpx, 335, 4, railY - 335 + 4);
        ctx.fillStyle = '#4A4A60';
        ctx.fillRect(rpx, 335, 1, railY - 335 + 4);
    }

    // ---- CROWD: Back row (shorter, darker) ----
    const backRowSpectators = [
        { x: 55, h: 40, color: '#1A1A28', shirt: '#2A2244' },
        { x: 155, h: 36, color: '#1C1820', shirt: '#222240' },
        { x: 270, h: 42, color: '#18181E', shirt: '#2A2A3A' },
        { x: 400, h: 38, color: '#1A1820', shirt: '#302230' },
        { x: 530, h: 40, color: '#1C1C22', shirt: '#223022' },
        { x: 660, h: 36, color: '#1A1822', shirt: '#2A2030' },
        { x: 780, h: 42, color: '#181820', shirt: '#222244' },
        { x: 900, h: 38, color: '#1C1A20', shirt: '#302A22' },
    ];
    for (const sp of backRowSpectators) {
        const bobY = Math.sin(frame * 0.03 + sp.x * 0.01) * 1;
        const baseY = 290 + bobY;
        // Head
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, baseY - sp.h, 7, 0, Math.PI * 2);
        ctx.fill();
        // Body
        ctx.fillStyle = sp.shirt;
        ctx.fillRect(sp.x - 8, baseY - sp.h + 7, 16, sp.h - 7);
    }

    // ---- CROWD: Front row (larger, more detailed) ----
    const spectators = [
        { x: 75,  h: 55, skin: '#8D6E4C', shirt: '#2244AA', type: 'hoodie', hasGlasses: false, hasCap: true },
        { x: 160, h: 50, skin: '#C4A47A', shirt: '#AA2244', type: 'tee', hasGlasses: true, hasCap: false },
        { x: 250, h: 58, skin: '#6B4E35', shirt: '#22AA44', type: 'hoodie', hasGlasses: false, hasCap: false },
        { x: 340, h: 48, skin: '#D4A76A', shirt: '#4422AA', type: 'tee', hasGlasses: false, hasCap: true },
        { x: 430, h: 54, skin: '#A07050', shirt: '#AA6622', type: 'hoodie', hasGlasses: true, hasCap: false },
        { x: 530, h: 50, skin: '#C49A6A', shirt: '#2266AA', type: 'tee', hasGlasses: false, hasCap: false },
        { x: 620, h: 56, skin: '#7A5A3C', shirt: '#CC3344', type: 'hoodie', hasGlasses: false, hasCap: true },
        { x: 710, h: 48, skin: '#B08A60', shirt: '#33AA66', type: 'tee', hasGlasses: true, hasCap: false },
        { x: 800, h: 54, skin: '#9A7050', shirt: '#AA44AA', type: 'hoodie', hasGlasses: false, hasCap: false },
        { x: 890, h: 50, skin: '#C4A070', shirt: '#4488AA', type: 'tee', hasGlasses: false, hasCap: true },
        { x: 960, h: 52, skin: '#8A6A4A', shirt: '#AA8822', type: 'hoodie', hasGlasses: true, hasCap: false },
    ];

    for (let si = 0; si < spectators.length; si++) {
        const sp = spectators[si];
        const bobPhase = frame * 0.04 + si * 1.2;
        const bobY = Math.sin(bobPhase) * 1.5;
        const sway = Math.sin(bobPhase * 0.7 + si) * 1;

        // Cheering: some raise arms occasionally
        const cheerCycle = (frame + si * 47) % 180;
        const isCheering = cheerCycle < 20;
        const armRaise = isCheering ? Math.sin((cheerCycle / 20) * Math.PI) * 12 : 0;

        const baseY = 338 + bobY;
        const headY = baseY - sp.h;

        ctx.save();
        ctx.translate(sway, 0);

        // Body/torso
        const shirtGrad = ctx.createLinearGradient(sp.x - 10, headY + 10, sp.x + 10, baseY);
        shirtGrad.addColorStop(0, sp.shirt);
        shirtGrad.addColorStop(1, darkenColor(sp.shirt, 0.7));
        ctx.fillStyle = shirtGrad;
        // Hoodie has wider shoulders
        const shoulderW = sp.type === 'hoodie' ? 13 : 11;
        roundRect(ctx, sp.x - shoulderW, headY + 10, shoulderW * 2, sp.h - 10, 3);
        ctx.fill();

        // Hood detail for hoodies
        if (sp.type === 'hoodie') {
            ctx.fillStyle = darkenColor(sp.shirt, 0.8);
            ctx.beginPath();
            ctx.moveTo(sp.x - 6, headY + 10);
            ctx.lineTo(sp.x, headY + 16);
            ctx.lineTo(sp.x + 6, headY + 10);
            ctx.closePath();
            ctx.fill();
        }

        // Arms
        ctx.fillStyle = sp.type === 'hoodie' ? sp.shirt : sp.skin;
        // Left arm
        ctx.fillRect(sp.x - shoulderW - 4, headY + 12 - armRaise, 5, 18 + armRaise * 0.5);
        // Right arm
        ctx.fillRect(sp.x + shoulderW - 1, headY + 12 - armRaise * 0.5, 5, 18 + armRaise * 0.3);

        // Hands (if cheering, show them at top of arms)
        if (isCheering) {
            ctx.fillStyle = sp.skin;
            ctx.beginPath();
            ctx.arc(sp.x - shoulderW - 1, headY + 10 - armRaise, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(sp.x + shoulderW + 2, headY + 10 - armRaise * 0.5, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Phone recording (some spectators)
        const hasPhone = si % 4 === 2;
        if (hasPhone && !isCheering) {
            ctx.fillStyle = '#222';
            ctx.fillRect(sp.x + shoulderW, headY + 6, 4, 7);
            // Phone screen glow
            ctx.fillStyle = 'rgba(100,150,255,0.4)';
            ctx.fillRect(sp.x + shoulderW + 0.5, headY + 7, 3, 5);
        }

        // Head
        ctx.fillStyle = sp.skin;
        ctx.beginPath();
        ctx.arc(sp.x, headY, 9, 0, Math.PI * 2);
        ctx.fill();

        // Hair/top of head
        ctx.fillStyle = darkenColor(sp.skin, 0.5);
        ctx.beginPath();
        ctx.arc(sp.x, headY - 2, 9, Math.PI, Math.PI * 2);
        ctx.fill();

        // Cap
        if (sp.hasCap) {
            ctx.fillStyle = darkenColor(sp.shirt, 0.6);
            ctx.fillRect(sp.x - 10, headY - 6, 20, 5);
            ctx.fillRect(sp.x + 4, headY - 7, 10, 4);
        }

        // Glasses
        if (sp.hasGlasses) {
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(sp.x - 7, headY - 2, 6, 4);
            ctx.rect(sp.x + 1, headY - 2, 6, 4);
            ctx.moveTo(sp.x - 1, headY);
            ctx.lineTo(sp.x + 1, headY);
            ctx.stroke();
            // Lens glare
            ctx.fillStyle = 'rgba(150,200,255,0.15)';
            ctx.fillRect(sp.x - 6, headY - 1, 2, 2);
        }

        // Laptop (some spectators)
        const hasLaptop = si % 5 === 1;
        if (hasLaptop && !isCheering) {
            ctx.fillStyle = '#2A2A3A';
            ctx.fillRect(sp.x - 8, baseY - 8, 16, 3);
            // Screen
            ctx.fillStyle = 'rgba(60,120,180,0.3)';
            ctx.fillRect(sp.x - 7, baseY - 16, 14, 8);
        }

        ctx.restore();
    }

    // ======== Atmospheric haze between layers ========
    ctx.save();
    const hazeGrad = ctx.createLinearGradient(0, 200, 0, 380);
    hazeGrad.addColorStop(0, 'rgba(10,15,30,0.3)');
    hazeGrad.addColorStop(0.5, 'rgba(15,20,40,0.15)');
    hazeGrad.addColorStop(1, 'rgba(10,15,30,0.05)');
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(0, 200, W, 180);
    ctx.restore();

    // ======== LAYER 3: ARENA FLOOR (y: 380-460) ========

    // Floor base gradient
    const floorGrad = ctx.createLinearGradient(0, 380, 0, SCREEN.FLOOR_Y);
    floorGrad.addColorStop(0, '#141428');
    floorGrad.addColorStop(1, '#1A1A2E');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 380, W, SCREEN.FLOOR_Y - 380);

    // Diamond / checkered floor tiles with perspective feel
    ctx.save();
    const tileSize = 40;
    const rows = 3;
    for (let row = 0; row < rows; row++) {
        const rowY = 382 + row * ((SCREEN.FLOOR_Y - 382) / rows);
        const rowH = (SCREEN.FLOOR_Y - 382) / rows;
        // Perspective: tiles get slightly wider and taller toward bottom
        const scale = 1 + row * 0.15;
        const tileCols = Math.ceil(W / (tileSize * scale)) + 1;
        for (let col = 0; col < tileCols; col++) {
            const tileX = col * tileSize * scale - (row * 8);
            const isDark = (col + row) % 2 === 0;
            ctx.fillStyle = isDark ? '#14142A' : '#1A1A34';
            ctx.fillRect(tileX, rowY, tileSize * scale, rowH);
            // Tile edge line
            ctx.strokeStyle = '#1E1E38';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(tileX, rowY, tileSize * scale, rowH);
        }
    }
    ctx.restore();

    // Floor shine / reflection
    ctx.save();
    ctx.globalAlpha = 0.04;
    const shineGrad = ctx.createLinearGradient(W * 0.3, 380, W * 0.7, SCREEN.FLOOR_Y);
    shineGrad.addColorStop(0, '#6688CC');
    shineGrad.addColorStop(0.5, '#AABBEE');
    shineGrad.addColorStop(1, '#6688CC');
    ctx.fillStyle = shineGrad;
    ctx.fillRect(W * 0.2, 385, W * 0.6, SCREEN.FLOOR_Y - 390);
    ctx.restore();

    // Floor edge markings (stage boundary)
    ctx.save();
    // Left boundary
    ctx.fillStyle = 'rgba(6,120,190,0.15)';
    ctx.fillRect(SCREEN.LEFT_BOUND - 2, 382, 4, SCREEN.FLOOR_Y - 382);
    // Right boundary
    ctx.fillStyle = 'rgba(204,34,0,0.15)';
    ctx.fillRect(SCREEN.RIGHT_BOUND - 2, 382, 4, SCREEN.FLOOR_Y - 382);
    ctx.restore();

    // Blue accent strip lights in floor edges
    ctx.save();
    ctx.shadowColor = COLORS.DRUPAL_BLUE;
    ctx.shadowBlur = 5;
    ctx.fillStyle = COLORS.DRUPAL_BLUE;
    ctx.globalAlpha = 0.2 + Math.sin(frame * 0.05) * 0.08;
    ctx.fillRect(0, SCREEN.FLOOR_Y - 2, W, 2);
    ctx.restore();

    // Floor main line
    ctx.fillStyle = '#2A2A48';
    ctx.fillRect(0, SCREEN.FLOOR_Y, W, 2);

    // ======== LAYER 4: BELOW FLOOR (y: 460-576) ========

    const belowFloorGrad = ctx.createLinearGradient(0, SCREEN.FLOOR_Y, 0, H);
    belowFloorGrad.addColorStop(0, '#1A1A2E');
    belowFloorGrad.addColorStop(0.3, '#121224');
    belowFloorGrad.addColorStop(1, '#0A0A18');
    ctx.fillStyle = belowFloorGrad;
    ctx.fillRect(0, SCREEN.FLOOR_Y + 2, W, H - SCREEN.FLOOR_Y);

    // Under-floor cables visible through grating
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#333366';
    ctx.lineWidth = 2;
    for (let c = 0; c < 8; c++) {
        const cy = SCREEN.FLOOR_Y + 15 + c * 12;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        for (let seg = 0; seg < 10; seg++) {
            const sx = (seg + 1) * (W / 10);
            ctx.quadraticCurveTo(sx - W / 20, cy + Math.sin(seg + c) * 3, sx, cy);
        }
        ctx.stroke();
    }
    ctx.restore();

    // Floor reflection lines
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#4444AA';
    for (let fl = 0; fl < 6; fl++) {
        const flY = SCREEN.FLOOR_Y + 8 + fl * 18;
        ctx.fillRect(0, flY, W, 1);
    }
    ctx.restore();

    // ======== ATMOSPHERE: Dust motes ========
    ctx.save();
    for (let d = 0; d < 18; d++) {
        const seed = d * 73 + 11;
        const dx = (seed * 13 + frame * 0.2) % W;
        const dy = (seed * 7 + frame * 0.08 + Math.sin(frame * 0.02 + d) * 10) % (SCREEN.FLOOR_Y - 80) + 50;
        const brightness = 0.03 + Math.sin(frame * 0.03 + d * 2) * 0.015;
        ctx.globalAlpha = brightness;
        ctx.fillStyle = d < 9 ? '#6688CC' : '#AA8866';
        ctx.beginPath();
        ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// Helper: darken a hex color
function darkenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}


// ============================================================
// 5. drawParticle — Enhanced hit effects
// ============================================================
export function drawParticle(ctx, x, y, type, life) {
    const alpha = Math.max(0, Math.min(life, 1));
    const scale = 0.5 + life * 1.5;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    switch (type) {
        case 'hit': {
            // White-hot sparks with yellow/orange trails
            const sparkSize = scale * 6;
            ctx.save();
            // Outer glow
            ctx.shadowColor = '#FFFF88';
            ctx.shadowBlur = 10 * life;

            // Star-shaped spark (6-pointed)
            ctx.fillStyle = life > 0.6 ? '#FFFFFF' : life > 0.3 ? '#FFEE44' : '#FF8800';
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const outerR = sparkSize * (i % 2 === 0 ? 1 : 0.4);
                ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
            }
            ctx.closePath();
            ctx.fill();

            // Hot center
            ctx.fillStyle = '#FFF';
            ctx.globalAlpha = alpha * 0.8;
            ctx.beginPath();
            ctx.arc(0, 0, sparkSize * 0.25, 0, Math.PI * 2);
            ctx.fill();

            // Motion blur trail (draw a smear based on velocity direction)
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = '#FFAA44';
            ctx.beginPath();
            ctx.ellipse(sparkSize * 0.3, 0, sparkSize * 0.8, sparkSize * 0.15, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            break;
        }

        case 'block': {
            // Shield-like blue crescents
            const sparkSize = scale * 5;
            ctx.save();
            ctx.shadowColor = COLORS.DRUPAL_BLUE_GLOW;
            ctx.shadowBlur = 8 * life;

            // Crescent shape
            ctx.strokeStyle = life > 0.6 ? COLORS.BLOCK_FLASH : COLORS.DRUPAL_BLUE_LIGHT;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, sparkSize, -0.8, 0.8, false);
            ctx.stroke();

            // Inner glow fill
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = COLORS.DRUPAL_BLUE_GLOW;
            ctx.beginPath();
            ctx.arc(0, 0, sparkSize * 0.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            break;
        }

        case 'ko': {
            // Debris chunks + electrical sparks
            const sparkSize = scale * 7;
            ctx.save();
            const koColor = life > 0.5 ? '#FF4422' : '#FFAA00';
            ctx.shadowColor = koColor;
            ctx.shadowBlur = 10 * life;
            ctx.fillStyle = koColor;

            // Irregular debris chunk
            ctx.beginPath();
            ctx.moveTo(-sparkSize * 0.5, -sparkSize * 0.3);
            ctx.lineTo(sparkSize * 0.2, -sparkSize * 0.6);
            ctx.lineTo(sparkSize * 0.6, -sparkSize * 0.1);
            ctx.lineTo(sparkSize * 0.4, sparkSize * 0.4);
            ctx.lineTo(-sparkSize * 0.3, sparkSize * 0.5);
            ctx.lineTo(-sparkSize * 0.6, sparkSize * 0.1);
            ctx.closePath();
            ctx.fill();

            // Electrical spark overlay
            if (life > 0.3) {
                ctx.strokeStyle = '#FFEE88';
                ctx.lineWidth = 1;
                ctx.globalAlpha = alpha * 0.7;
                ctx.beginPath();
                ctx.moveTo(-sparkSize * 0.3, -sparkSize * 0.2);
                ctx.lineTo(sparkSize * 0.1, sparkSize * 0.1);
                ctx.lineTo(-sparkSize * 0.1, sparkSize * 0.3);
                ctx.lineTo(sparkSize * 0.3, sparkSize * 0.5);
                ctx.stroke();
            }

            // Hot ember core
            ctx.globalAlpha = alpha * 0.5;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(0, 0, sparkSize * 0.15, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            break;
        }

        case 'special': {
            // Blue energy particles with rings
            const sparkSize = scale * 4;
            ctx.save();
            ctx.shadowColor = COLORS.SPECIAL_BLUE;
            ctx.shadowBlur = 12 * life;

            // Gradient energy dot
            const spGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, sparkSize);
            spGrad.addColorStop(0, '#FFFFFF');
            spGrad.addColorStop(0.3, COLORS.DRUPAL_BLUE_GLOW);
            spGrad.addColorStop(1, 'rgba(91,192,248,0)');
            ctx.fillStyle = spGrad;
            ctx.beginPath();
            ctx.arc(0, 0, sparkSize * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Outer ring
            ctx.strokeStyle = COLORS.DRUPAL_BLUE_LIGHT;
            ctx.lineWidth = 1;
            ctx.globalAlpha = alpha * 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, sparkSize * 2, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
            break;
        }
    }

    ctx.restore();
}


// ============================================================
// 6. drawScanlines — CRT effect with vignette
// ============================================================
export function drawScanlines(ctx, width, height) {
    ctx.save();

    // Horizontal scanlines
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = FX.SCANLINE_ALPHA;
    for (let sy = 0; sy < height; sy += 4) {
        ctx.fillRect(0, sy, width, 2);
    }

    // CRT vignette (darker corners/edges)
    ctx.globalAlpha = 1;
    const vignetteGrad = ctx.createRadialGradient(
        width / 2, height / 2, Math.min(width, height) * 0.35,
        width / 2, height / 2, Math.max(width, height) * 0.75
    );
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle edge darkening for barrel distortion feel
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000';
    // Top edge
    const edgeGrad = ctx.createLinearGradient(0, 0, 0, 20);
    edgeGrad.addColorStop(0, 'rgba(0,0,0,1)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = edgeGrad;
    ctx.fillRect(0, 0, width, 20);
    // Bottom edge
    const edgeGrad2 = ctx.createLinearGradient(0, height - 20, 0, height);
    edgeGrad2.addColorStop(0, 'rgba(0,0,0,0)');
    edgeGrad2.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = edgeGrad2;
    ctx.fillRect(0, height - 20, width, 20);

    ctx.restore();
}
