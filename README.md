# 🏓 Spin Pong 3D — Arcade Table Tennis

A fast-paced **3D browser table tennis game** built with Three.js and TypeScript. Features arcade-style physics, an AI opponent, real-time webcam hand-swipe controls (beta), and zero external assets — everything is synthesized at runtime.

---

## ✨ Features

- **Authentic Physics** — 120 Hz fixed-step integrator with gravity, aerodynamic drag, and Magnus spin effects (topspin / backspin / sidespin)
- **Smart AI** — Three difficulty levels: Novice, Pro, Champion
- **Snappy Controls** — 140 ms input buffer, configurable sensitivity (0.5×–2.5×), adaptive flick threshold
- **🎥 Webcam Beta Mode** — Swipe your hand in front of your camera to hit the ball using frame-differencing motion detection
- **Arcade VFX** — Dynamic chase camera, FOV punch on impact, speed trails, bounce rings, slow-motion match points
- **Floating Accolades** — "NICE SHOT!", "PERFECT!", "ACE!" pop up at key moments
- **Synthesized Audio** — Web Audio API: ball impacts, table bounces, net hits, crowd ambience — no audio files needed
- **ITTF Rules** — Proper 11-point scoring, deuce, serve rotation every 2 points, service bounce validation

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

### Install & Run

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
```

Output goes to `dist/`. Serve it with any static file server.

---

## 🎮 Controls

| Action | Input |
|--------|-------|
| Move paddle left / right | `←` / `→` Arrow Keys |
| Move paddle forward / back | `↑` / `↓` Arrow Keys |
| **Hit / Swing** | `Space` |
| Apply topspin | `Z` (hold while swinging) |
| Apply backspin | `X` (hold while swinging) |
| Pause | `Escape` |

### Sensitivity

Use the **sensitivity slider** (0.5×–2.5×) in the quick-settings bar or the main menu to tune how aggressively the paddle follows your inputs. Higher values = snappier response.

### 🎥 Webcam Hand-Swipe (Beta)

1. Click **"WEBCAM (BETA)"** in the quick-settings bar or main menu
2. Grant camera access when prompted
3. **Swipe your hand** left or right in front of the camera to strike the ball — motion direction determines spin

The live camera feed appears in the bottom-right PIP overlay during a match.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D Rendering | [Three.js](https://threejs.org/) |
| Language | TypeScript (strict mode) |
| Bundler | [Vite](https://vitejs.dev/) |
| Physics | Custom 120 Hz Euler integrator (no physics library) |
| Audio | Web Audio API (fully synthesized) |
| Vision | WebRTC + Canvas frame differencing |

---

## 📁 Project Structure

```
src/
├── main.ts                   # Entry point
├── styles.css                # Global styles & UI theme
├── core/
│   ├── Game.ts               # Master coordinator
│   ├── EventBus.ts           # Typed pub/sub event system
│   └── StateMachine.ts       # Game state machine (ITTF rules)
├── entities/
│   ├── Ball.ts               # Ball mesh + spin visualisation
│   ├── Paddle.ts             # Player & CPU paddle meshes
│   ├── Table.ts              # ITTF regulation table
│   └── Stadium.ts            # Arena, bleachers, crowd, lighting
├── physics/
│   ├── BallPhysics.ts        # Integrator: gravity, drag, Magnus, CCD
│   └── Constants.ts          # Shared physics & game constants
├── controllers/
│   ├── PlayerController.ts   # Keyboard + buffered input + sensitivity
│   ├── AIController.ts       # AI with difficulty profiles
│   └── WebcamController.ts   # Webcam motion detection (beta)
├── ui/
│   └── HUD.ts                # Scoreboard, accolades, settings UI
└── types.ts                  # Shared TypeScript interfaces & events
```

---

## 🛠️ Development Notes

- Hot-module reload is enabled via Vite — changes to `src/` update instantly in the browser
- TypeScript is checked strictly; run `npm run build` to catch type errors before deploying
- All meshes are generated procedurally — no external 3D model files are required

---

## 📝 License

MIT — free to use, modify, and distribute.
