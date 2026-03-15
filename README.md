# Drupal Drop Fighter

A browser-based arcade fighting game built with vanilla JavaScript and the Canvas API. No dependencies, no build step — just open and play.

## Play

👉 **[game.decoupled.io](https://game.decoupled.io)**

## Controls

| Key | Action |
|-----|--------|
| `←` `→` | Move |
| `↑` | Jump |
| `↓` | Crouch |
| Hold `←` | Block |
| `X` | Punch |
| `Z` | Kick |
| `C` | Head Throw (projectile) |
| `V` | Shoryuken (rising uppercut) |

## Features

- Attract / demo mode on load — AI vs AI with the hero winning every round
- Press **Enter** (or click the canvas) to start your own match
- 3-round best-of match with KO, time-out, and win screen
- Procedural audio — all sound effects and music generated via Web Audio API (no audio files)
- Procedural sprites — all characters drawn with Canvas 2D (no image assets)
- Screen shake, hitstop freeze frames, particles, and scanline overlay
- Trash talk from both fighters during combat

## Tech

- Vanilla JS (ES modules)
- Canvas 2D API
- Web Audio API
- No framework, no bundler, no dependencies

## Development

Serve from any static file server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
