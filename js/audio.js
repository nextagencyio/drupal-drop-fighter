// ============================================================
// Drupal Drop Fighter — Procedural Audio (Web Audio API)
// ============================================================
// All sounds are generated procedurally — no audio files needed.
// Uses oscillators, noise buffers, and filters for SNES-style SFX
// and chiptune music.
// ============================================================

export class AudioManager {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;

        /** @type {AudioBuffer|null} - Reusable white noise buffer */
        this._noiseBuffer = null;

        /** @type {GainNode|null} - Master output gain */
        this._masterGain = null;

        /** @type {GainNode|null} - SFX bus */
        this._sfxGain = null;

        /** @type {GainNode|null} - Music bus */
        this._musicGain = null;

        /** @type {number} - Master volume 0-1 */
        this._volume = 0.5;

        /** @type {boolean} */
        this._muted = false;

        /** @type {number|null} - Fight music interval ID */
        this._fightMusicInterval = null;

        /** @type {number|null} - Menu music interval ID */
        this._menuMusicInterval = null;

        /** @type {OscillatorNode[]} - Active music oscillators for cleanup */
        this._musicOscillators = [];

        /** @type {GainNode[]} - Active music gain nodes for cleanup */
        this._musicGains = [];

        /** @type {boolean} - Whether fight music is currently playing */
        this._fightMusicPlaying = false;

        /** @type {boolean} - Whether menu music is currently playing */
        this._menuMusicPlaying = false;

        /** @type {number} - Fight music beat index */
        this._fightBeat = 0;

        /** @type {number} - Menu music beat index */
        this._menuBeat = 0;

        /** @type {number} - Next scheduled fight music time */
        this._fightNextBeatTime = 0;

        /** @type {number} - Next scheduled menu music time */
        this._menuNextBeatTime = 0;

        /** @type {number} - Fight music scheduling RAF id */
        this._fightSchedulerId = null;

        /** @type {number} - Menu music scheduling RAF id */
        this._menuSchedulerId = null;
    }

    // --------------------------------------------------------
    // Initialization
    // --------------------------------------------------------

    /**
     * Must be called on a user gesture (click / keypress) to unlock audio.
     * Safe to call multiple times — only initialises once.
     */
    init() {
        if (this.ctx) {
            // Already initialised — just make sure it's running
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            return;
        }

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Build routing graph: sources -> sfx/music buses -> master -> destination
        this._masterGain = this.ctx.createGain();
        this._masterGain.gain.value = this._volume;
        this._masterGain.connect(this.ctx.destination);

        this._sfxGain = this.ctx.createGain();
        this._sfxGain.gain.value = 1.0;
        this._sfxGain.connect(this._masterGain);

        this._musicGain = this.ctx.createGain();
        this._musicGain.gain.value = 0.35; // music quieter than SFX
        this._musicGain.connect(this._masterGain);

        // Pre-generate white noise buffer (2 seconds, mono)
        this._noiseBuffer = this._createNoiseBuffer(2);
    }

    // --------------------------------------------------------
    // Utility helpers
    // --------------------------------------------------------

    /**
     * Create a mono white noise AudioBuffer.
     * @param {number} durationSec
     * @returns {AudioBuffer}
     */
    _createNoiseBuffer(durationSec) {
        const length = this.ctx.sampleRate * durationSec;
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    /**
     * Create a noise source node from the shared buffer.
     * @returns {AudioBufferSourceNode}
     */
    _createNoise() {
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        src.loop = false;
        return src;
    }

    /**
     * Shorthand: create an oscillator with type and frequency.
     * @param {OscillatorType} type
     * @param {number} freq
     * @returns {OscillatorNode}
     */
    _osc(type, freq) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        return o;
    }

    /**
     * Shorthand: create a gain node with initial value.
     * @param {number} value
     * @returns {GainNode}
     */
    _gain(value) {
        const g = this.ctx.createGain();
        g.gain.value = value;
        return g;
    }

    /**
     * Shorthand: create a biquad filter.
     * @param {BiquadFilterType} type
     * @param {number} freq
     * @param {number} [Q=1]
     * @returns {BiquadFilterNode}
     */
    _filter(type, freq, Q = 1) {
        const f = this.ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = Q;
        return f;
    }

    /**
     * Safety wrapper — ensures ctx exists before playing.
     * @returns {boolean} true if audio is ready
     */
    _ready() {
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
    }

    // --------------------------------------------------------
    // SFX
    // --------------------------------------------------------

    /**
     * Quick, sharp tap — short noise burst + brief sine tone.
     */
    playHitLight() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Noise burst through highpass
        const noise = this._createNoise();
        const hpf = this._filter('highpass', 2000);
        const noiseGain = this._gain(0.5);
        noiseGain.gain.setValueAtTime(0.5, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noise.connect(hpf).connect(noiseGain).connect(this._sfxGain);
        noise.start(t);
        noise.stop(t + 0.06);

        // Short sine body
        const osc = this._osc('sine', 400);
        const oscGain = this._gain(0.3);
        oscGain.gain.setValueAtTime(0.3, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
        osc.connect(oscGain).connect(this._sfxGain);
        osc.start(t);
        osc.stop(t + 0.03);
    }

    /**
     * Deeper, longer thud — low-freq noise + low sine tone.
     */
    playHitHeavy() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Noise burst through lowpass
        const noise = this._createNoise();
        const lpf = this._filter('lowpass', 800);
        const noiseGain = this._gain(0.6);
        noiseGain.gain.setValueAtTime(0.6, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        noise.connect(lpf).connect(noiseGain).connect(this._sfxGain);
        noise.start(t);
        noise.stop(t + 0.16);

        // Low sine body
        const osc = this._osc('sine', 120);
        const oscGain = this._gain(0.4);
        oscGain.gain.setValueAtTime(0.4, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(oscGain).connect(this._sfxGain);
        osc.start(t);
        osc.stop(t + 0.12);
    }

    /**
     * Metallic clank — bandpass noise + high sine.
     */
    playBlock() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Noise through tight bandpass
        const noise = this._createNoise();
        const bpf = this._filter('bandpass', 3000, 5);
        const noiseGain = this._gain(0.4);
        noiseGain.gain.setValueAtTime(0.4, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        noise.connect(bpf).connect(noiseGain).connect(this._sfxGain);
        noise.start(t);
        noise.stop(t + 0.07);

        // Metallic sine
        const osc = this._osc('sine', 800);
        const oscGain = this._gain(0.25);
        oscGain.gain.setValueAtTime(0.25, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(oscGain).connect(this._sfxGain);
        osc.start(t);
        osc.stop(t + 0.05);

        // Second harmonic for metallic overtone
        const osc2 = this._osc('sine', 2400);
        const osc2Gain = this._gain(0.12);
        osc2Gain.gain.setValueAtTime(0.12, t);
        osc2Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        osc2.connect(osc2Gain).connect(this._sfxGain);
        osc2.start(t);
        osc2.stop(t + 0.04);
    }

    /**
     * Whoosh + energy charge — rising frequency sweep with noise layer.
     */
    playSpecial() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Rising sweep oscillator
        const osc = this._osc('sawtooth', 200);
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(2000, t + 0.3);
        const oscGain = this._gain(0.25);
        oscGain.gain.setValueAtTime(0.25, t);
        oscGain.gain.linearRampToValueAtTime(0.35, t + 0.15);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(oscGain).connect(this._sfxGain);
        osc.start(t);
        osc.stop(t + 0.36);

        // Noise layer with rising bandpass
        const noise = this._createNoise();
        const bpf = this._filter('bandpass', 500, 2);
        bpf.frequency.setValueAtTime(500, t);
        bpf.frequency.exponentialRampToValueAtTime(4000, t + 0.3);
        const noiseGain = this._gain(0.2);
        noiseGain.gain.setValueAtTime(0.2, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        noise.connect(bpf).connect(noiseGain).connect(this._sfxGain);
        noise.start(t);
        noise.stop(t + 0.36);
    }

    /**
     * Sustained whoosh — filtered noise sweep + subtle sine.
     */
    playProjectile() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Noise sweep
        const noise = this._createNoise();
        const bpf = this._filter('bandpass', 500, 3);
        bpf.frequency.setValueAtTime(500, t);
        bpf.frequency.exponentialRampToValueAtTime(3000, t + 0.2);
        const noiseGain = this._gain(0.3);
        noiseGain.gain.setValueAtTime(0.3, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        noise.connect(bpf).connect(noiseGain).connect(this._sfxGain);
        noise.start(t);
        noise.stop(t + 0.26);

        // Subtle sine undertone
        const osc = this._osc('sine', 180);
        const oscGain = this._gain(0.12);
        oscGain.gain.setValueAtTime(0.12, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(oscGain).connect(this._sfxGain);
        osc.start(t);
        osc.stop(t + 0.22);
    }

    /**
     * Dramatic crash — low boom + shatter noise.
     */
    playKO() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Low sine boom
        const boom = this._osc('sine', 60);
        const boomGain = this._gain(0.7);
        boomGain.gain.setValueAtTime(0.7, t);
        boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        boom.connect(boomGain).connect(this._sfxGain);
        boom.start(t);
        boom.stop(t + 0.42);

        // Sub-bass layer
        const sub = this._osc('sine', 35);
        const subGain = this._gain(0.5);
        subGain.gain.setValueAtTime(0.5, t);
        subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        sub.connect(subGain).connect(this._sfxGain);
        sub.start(t);
        sub.stop(t + 0.32);

        // Noise crash through lowpass
        const noise = this._createNoise();
        const lpf = this._filter('lowpass', 4000);
        lpf.frequency.setValueAtTime(4000, t);
        lpf.frequency.exponentialRampToValueAtTime(200, t + 0.5);
        const noiseGain = this._gain(0.5);
        noiseGain.gain.setValueAtTime(0.5, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        noise.connect(lpf).connect(noiseGain).connect(this._sfxGain);
        noise.start(t);
        noise.stop(t + 0.52);

        // High shatter layer
        const shatter = this._createNoise();
        const hpf = this._filter('highpass', 3000);
        const shatterGain = this._gain(0.25);
        shatterGain.gain.setValueAtTime(0.25, t + 0.02);
        shatterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        shatter.connect(hpf).connect(shatterGain).connect(this._sfxGain);
        shatter.start(t + 0.02);
        shatter.stop(t + 0.36);
    }

    /**
     * Quick ascending beeps (C5, E5, G5) then a lower "FIGHT" tone.
     */
    playRoundStart() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        // Note frequencies
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        const interval = 0.1;
        const noteDuration = 0.08;

        notes.forEach((freq, i) => {
            const start = t + i * interval;
            const osc = this._osc('square', freq);
            const g = this._gain(0.2);
            g.gain.setValueAtTime(0.2, start);
            g.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);
            osc.connect(g).connect(this._sfxGain);
            osc.start(start);
            osc.stop(start + noteDuration + 0.01);
        });

        // "FIGHT" tone — lower, slightly longer, more aggressive
        const fightStart = t + notes.length * interval + 0.05;
        const fightOsc = this._osc('square', 261.63); // C4
        const fightGain = this._gain(0.3);
        fightGain.gain.setValueAtTime(0.3, fightStart);
        fightGain.gain.linearRampToValueAtTime(0.3, fightStart + 0.05);
        fightGain.gain.exponentialRampToValueAtTime(0.001, fightStart + 0.2);
        fightOsc.connect(fightGain).connect(this._sfxGain);
        fightOsc.start(fightStart);
        fightOsc.stop(fightStart + 0.22);

        // Noise accent on the FIGHT tone
        const fightNoise = this._createNoise();
        const fightBpf = this._filter('bandpass', 2000, 1);
        const fnGain = this._gain(0.15);
        fnGain.gain.setValueAtTime(0.15, fightStart);
        fnGain.gain.exponentialRampToValueAtTime(0.001, fightStart + 0.12);
        fightNoise.connect(fightBpf).connect(fnGain).connect(this._sfxGain);
        fightNoise.start(fightStart);
        fightNoise.stop(fightStart + 0.14);
    }

    /**
     * Victory jingle — C major arpeggio on square wave (C4, E4, G4, C5).
     */
    playWin() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
        const noteDuration = 0.12;
        const noteGap = 0.1;

        notes.forEach((freq, i) => {
            const start = t + i * noteGap;
            const osc = this._osc('square', freq);
            const g = this._gain(0.2);
            g.gain.setValueAtTime(0.2, start);
            g.gain.setValueAtTime(0.2, start + noteDuration * 0.6);
            g.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);
            osc.connect(g).connect(this._sfxGain);
            osc.start(start);
            osc.stop(start + noteDuration + 0.01);
        });

        // Final sustain chord (C4 + E4 + G4 together)
        const chordStart = t + notes.length * noteGap + 0.05;
        const chordFreqs = [261.63, 329.63, 392.0];
        chordFreqs.forEach((freq) => {
            const osc = this._osc('square', freq);
            const g = this._gain(0.12);
            g.gain.setValueAtTime(0.12, chordStart);
            g.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.4);
            osc.connect(g).connect(this._sfxGain);
            osc.start(chordStart);
            osc.stop(chordStart + 0.42);
        });
    }

    /**
     * Click/beep for menu UI selection.
     */
    playMenuSelect() {
        if (!this._ready()) return;
        const t = this.ctx.currentTime;

        const osc = this._osc('square', 880); // A5
        const g = this._gain(0.15);
        g.gain.setValueAtTime(0.15, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(g).connect(this._sfxGain);
        osc.start(t);
        osc.stop(t + 0.07);
    }

    // --------------------------------------------------------
    // Music — Fight
    // --------------------------------------------------------

    // Musical constants for fight music (key of A minor, pentatonic)
    static FIGHT_BASS_NOTES = [
        110.00, 110.00, 130.81, 130.81,  // A2, A2, C3, C3
        146.83, 146.83, 130.81, 130.81,  // D3, D3, C3, C3
        110.00, 110.00, 164.81, 164.81,  // A2, A2, E3, E3
        146.83, 146.83, 130.81, 110.00,  // D3, D3, C3, A2
    ];

    static FIGHT_LEAD_NOTES = [
        440.00, 0, 523.25, 0, 587.33, 0, 523.25, 440.00,   // A4, -, C5, -, D5, -, C5, A4
        659.25, 0, 587.33, 0, 523.25, 440.00, 0, 392.00,   // E5, -, D5, -, C5, A4, -, G4
        440.00, 523.25, 0, 587.33, 659.25, 0, 587.33, 0,   // A4, C5, -, D5, E5, -, D5, -
        523.25, 440.00, 392.00, 0, 440.00, 0, 0, 0,         // C5, A4, G4, -, A4, -, -, -
    ];

    // Drum pattern: 1 = kick, 2 = snare, 3 = both, 0 = rest, 4 = hihat
    static FIGHT_DRUMS = [
        1, 4, 2, 4, 1, 4, 2, 4,
        1, 4, 2, 4, 1, 1, 2, 4,
        1, 4, 2, 4, 1, 4, 2, 4,
        1, 4, 2, 1, 3, 4, 2, 4,
    ];

    /**
     * Start procedural chiptune fight music. Aggressive and up-tempo (~140 BPM).
     * Uses lookahead scheduling for glitch-free playback.
     */
    startFightMusic() {
        if (!this._ready()) return;
        if (this._fightMusicPlaying) return;
        this._fightMusicPlaying = true;
        this._fightBeat = 0;

        // 140 BPM, 16th notes -> beat = 60 / 140 / 4 = ~0.107s
        const sixteenthNote = 60 / 140 / 4;
        const scheduleAhead = 0.1; // schedule 100ms ahead
        const lookInterval = 50;   // check every 50ms

        this._fightNextBeatTime = this.ctx.currentTime + 0.05;

        const schedule = () => {
            if (!this._fightMusicPlaying) return;

            while (this._fightNextBeatTime < this.ctx.currentTime + scheduleAhead) {
                this._scheduleFightBeat(this._fightNextBeatTime, this._fightBeat);
                this._fightNextBeatTime += sixteenthNote;
                this._fightBeat = (this._fightBeat + 1) % 32;
            }

            this._fightSchedulerId = setTimeout(schedule, lookInterval);
        };

        schedule();
    }

    /**
     * Schedule a single beat of fight music at precise time.
     * @param {number} time - AudioContext time to play at
     * @param {number} beat - Beat index (0-31)
     */
    _scheduleFightBeat(time, beat) {
        const bassNotes = AudioManager.FIGHT_BASS_NOTES;
        const leadNotes = AudioManager.FIGHT_LEAD_NOTES;
        const drums = AudioManager.FIGHT_DRUMS;

        const sixteenthNote = 60 / 140 / 4;

        // --- Bass (every other 16th = 8th notes) ---
        if (beat % 2 === 0) {
            const bassIdx = Math.floor(beat / 2) % bassNotes.length;
            const bassFreq = bassNotes[bassIdx];
            if (bassFreq > 0) {
                const osc = this._osc('square', bassFreq);
                const g = this._gain(0);
                g.gain.setValueAtTime(0.18, time);
                g.gain.setValueAtTime(0.18, time + sixteenthNote * 1.5);
                g.gain.linearRampToValueAtTime(0, time + sixteenthNote * 2 - 0.01);
                osc.connect(g).connect(this._musicGain);
                osc.start(time);
                osc.stop(time + sixteenthNote * 2);
            }
        }

        // --- Lead melody ---
        const leadIdx = beat % leadNotes.length;
        const leadFreq = leadNotes[leadIdx];
        if (leadFreq > 0) {
            const osc = this._osc('sawtooth', leadFreq);
            // Slight lowpass to tame harshness
            const lpf = this._filter('lowpass', 3500);
            const g = this._gain(0);
            g.gain.setValueAtTime(0.10, time);
            g.gain.setValueAtTime(0.10, time + sixteenthNote * 0.7);
            g.gain.linearRampToValueAtTime(0, time + sixteenthNote * 0.95);
            osc.connect(lpf).connect(g).connect(this._musicGain);
            osc.start(time);
            osc.stop(time + sixteenthNote);
        }

        // --- Drums ---
        const drumHit = drums[beat % drums.length];

        // Kick drum (low noise thump)
        if (drumHit === 1 || drumHit === 3) {
            const kickOsc = this._osc('sine', 150);
            kickOsc.frequency.setValueAtTime(150, time);
            kickOsc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
            const kickGain = this._gain(0);
            kickGain.gain.setValueAtTime(0.30, time);
            kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
            kickOsc.connect(kickGain).connect(this._musicGain);
            kickOsc.start(time);
            kickOsc.stop(time + 0.11);
        }

        // Snare (highpass noise)
        if (drumHit === 2 || drumHit === 3) {
            const snare = this._createNoise();
            const hpf = this._filter('highpass', 2000);
            const snareGain = this._gain(0);
            snareGain.gain.setValueAtTime(0.18, time);
            snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
            snare.connect(hpf).connect(snareGain).connect(this._musicGain);
            snare.start(time);
            snare.stop(time + 0.08);

            // Snare body tone
            const snareBody = this._osc('triangle', 200);
            const sbGain = this._gain(0);
            sbGain.gain.setValueAtTime(0.08, time);
            sbGain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
            snareBody.connect(sbGain).connect(this._musicGain);
            snareBody.start(time);
            snareBody.stop(time + 0.05);
        }

        // Hi-hat (very short highpass noise)
        if (drumHit === 4) {
            const hat = this._createNoise();
            const hpf = this._filter('highpass', 7000);
            const hatGain = this._gain(0);
            hatGain.gain.setValueAtTime(0.07, time);
            hatGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
            hat.connect(hpf).connect(hatGain).connect(this._musicGain);
            hat.start(time);
            hat.stop(time + 0.04);
        }
    }

    /**
     * Fade out and stop fight music.
     */
    stopFightMusic() {
        if (!this._fightMusicPlaying) return;
        this._fightMusicPlaying = false;

        if (this._fightSchedulerId !== null) {
            clearTimeout(this._fightSchedulerId);
            this._fightSchedulerId = null;
        }
    }

    // --------------------------------------------------------
    // Music — Menu
    // --------------------------------------------------------

    // Menu music: gentle A minor pad with arpeggio
    static MENU_CHORD_PROGRESSION = [
        [220.00, 261.63, 329.63],  // Am (A3, C4, E4)
        [196.00, 246.94, 293.66],  // G (G3, B3, D4)
        [174.61, 220.00, 261.63],  // F (F3, A3, C4)
        [196.00, 246.94, 329.63],  // Em/G (G3, B3, E4)
    ];

    static MENU_ARPEGGIO = [
        220.00, 261.63, 329.63, 440.00,  // Am up
        329.63, 261.63, 220.00, 164.81,  // Am down
        196.00, 246.94, 293.66, 392.00,  // G up
        293.66, 246.94, 196.00, 164.81,  // G down
        174.61, 220.00, 261.63, 349.23,  // F up
        261.63, 220.00, 174.61, 146.83,  // F down
        196.00, 246.94, 329.63, 392.00,  // Em/G up
        329.63, 246.94, 196.00, 164.81,  // Em/G down
    ];

    /**
     * Start atmospheric menu music. Slower, calmer, quieter.
     */
    startMenuMusic() {
        if (!this._ready()) return;
        if (this._menuMusicPlaying) return;
        this._menuMusicPlaying = true;
        this._menuBeat = 0;

        // ~80 BPM, 8th notes -> 60 / 80 / 2 = 0.375s per step
        const stepTime = 60 / 80 / 2;
        const scheduleAhead = 0.2;
        const lookInterval = 80;

        this._menuNextBeatTime = this.ctx.currentTime + 0.05;

        const schedule = () => {
            if (!this._menuMusicPlaying) return;

            while (this._menuNextBeatTime < this.ctx.currentTime + scheduleAhead) {
                this._scheduleMenuBeat(this._menuNextBeatTime, this._menuBeat);
                this._menuNextBeatTime += stepTime;
                this._menuBeat = (this._menuBeat + 1) % 32;
            }

            this._menuSchedulerId = setTimeout(schedule, lookInterval);
        };

        schedule();
    }

    /**
     * Schedule a single step of menu music.
     * @param {number} time - AudioContext time
     * @param {number} step - Step index (0-31)
     */
    _scheduleMenuBeat(time, step) {
        const chords = AudioManager.MENU_CHORD_PROGRESSION;
        const arpNotes = AudioManager.MENU_ARPEGGIO;
        const stepTime = 60 / 80 / 2;

        // --- Pad chord (sustained, changes every 8 steps) ---
        if (step % 8 === 0) {
            const chordIdx = Math.floor(step / 8) % chords.length;
            const chord = chords[chordIdx];
            const padDuration = stepTime * 8;

            chord.forEach((freq) => {
                const osc = this._osc('sawtooth', freq);
                const lpf = this._filter('lowpass', 800);
                const g = this._gain(0);
                g.gain.setValueAtTime(0, time);
                g.gain.linearRampToValueAtTime(0.06, time + 0.3);
                g.gain.setValueAtTime(0.06, time + padDuration - 0.4);
                g.gain.linearRampToValueAtTime(0, time + padDuration);
                osc.connect(lpf).connect(g).connect(this._musicGain);
                osc.start(time);
                osc.stop(time + padDuration + 0.01);
            });
        }

        // --- Arpeggio (every step) ---
        const arpIdx = step % arpNotes.length;
        const arpFreq = arpNotes[arpIdx];
        if (arpFreq > 0) {
            const osc = this._osc('triangle', arpFreq);
            const g = this._gain(0);
            g.gain.setValueAtTime(0.07, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + stepTime * 0.9);
            osc.connect(g).connect(this._musicGain);
            osc.start(time);
            osc.stop(time + stepTime);
        }

        // --- Subtle bass root (every 4 steps) ---
        if (step % 4 === 0) {
            const chordIdx = Math.floor(step / 8) % chords.length;
            const bassFreq = chords[chordIdx][0] / 2; // one octave down
            const osc = this._osc('sine', bassFreq);
            const g = this._gain(0);
            g.gain.setValueAtTime(0.08, time);
            g.gain.exponentialRampToValueAtTime(0.001, time + stepTime * 3.5);
            osc.connect(g).connect(this._musicGain);
            osc.start(time);
            osc.stop(time + stepTime * 4);
        }
    }

    /**
     * Fade out and stop menu music.
     */
    stopMenuMusic() {
        if (!this._menuMusicPlaying) return;
        this._menuMusicPlaying = false;

        if (this._menuSchedulerId !== null) {
            clearTimeout(this._menuSchedulerId);
            this._menuSchedulerId = null;
        }
    }

    // --------------------------------------------------------
    // Volume controls
    // --------------------------------------------------------

    /**
     * Set master volume (0-1).
     * @param {number} vol
     */
    setVolume(vol) {
        this._volume = Math.max(0, Math.min(1, vol));
        if (this._masterGain) {
            this._masterGain.gain.setValueAtTime(
                this._muted ? 0 : this._volume,
                this.ctx.currentTime
            );
        }
    }

    /**
     * Toggle mute on/off. Returns new mute state.
     * @returns {boolean} true if now muted
     */
    toggleMute() {
        this._muted = !this._muted;
        if (this._masterGain) {
            this._masterGain.gain.setValueAtTime(
                this._muted ? 0 : this._volume,
                this.ctx.currentTime
            );
        }
        return this._muted;
    }

    /**
     * Get current mute state.
     * @returns {boolean}
     */
    get muted() {
        return this._muted;
    }

    /**
     * Get current volume level.
     * @returns {number}
     */
    get volume() {
        return this._volume;
    }
}
