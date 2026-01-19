# SynthSnow - Progress Notes

## Project Overview
A game where you control a synth with hand gestures (via webcam) and use musical parameters to "resonate" with different parts of a snow-covered tree, knocking snow off. Goal: clear all the snow from the tree.

## Tech Stack
- **Three.js** - 3D rendering
- **@dgreenheck/ez-tree** - Procedural tree generation
- **Tone.js** - Audio synthesis
- **MediaPipe Hands** - Hand tracking via webcam
- **Vite** - Dev server/bundler

## Project Location
```
/Users/jonathanmann/SongADAO Dropbox/Jonathan Mann/projects/games/SynthSnow/snow-tree/
```

## How to Run
```bash
cd snow-tree
npm run dev
# Opens at http://localhost:5173/
```

---

## What's Been Built

### 1. Hand-Controlled Synth (carried over from earlier prototype)
**Left Hand:**
- Y position (height) → chord selection (8 chords: Eb, Bb, Cm, Ab across 2 octaves)
- Thumb-index pinch → triggers bass note
- Pinch X position → which bass note (Eb, Ab, Bb across octaves - the I, IV, V)

**Right Hand:**
- Y position (height) → volume
- Thumb-index spread distance → filter cutoff (80Hz - 12kHz)

**Audio Chain:**
- Pad synth: Sawtooth → Volume → Filter → Reverb (fixed 35%) → Compressor → Limiter
- Bass synth: Fat sawtooth (3 detuned oscillators) → Filter → Reverb → 8th note delay (120 BPM) → Compressor → Limiter

### 2. Three.js Scene (`src/scene.js`)
- Dark blue night sky background with fog (30-120 units)
- Moonlight + ambient lighting (cold blue tint)
- Large snow-covered ground plane (500x500 units)
- Ambient falling snow particles (2000 particles)
- OrbitControls for camera with zoom limits (5-100 units)
- Default camera position: zoomed out view of tree (-31.91, 23.62, 37.31)
- Console logs camera values when you stop moving (for finding good defaults)

### 3. Tree with Snow (`src/tree.js`)
- Uses ez-tree library to generate procedural tree
- `tree.options.seed = 12345` for reproducibility
- Leaves set to count=0, size=0 (winter look)

**Snow System (Performance Optimized):**
- Uses **InstancedMesh** for all snow - single draw call for hundreds of snow pieces
- Extracts branch segments from tree mesh geometry using index buffer edges
- Snow pieces are elongated boxes with dome-shaped tops (vertex-modified geometry)
- Shared geometry and material across all instances
- Per-instance transforms via matrix updates

**Falling Snow (Performance Optimized):**
- Uses separate **InstancedMesh** for falling snow animation
- Capacity matches total snow count - no limit on simultaneous falls
- Physics: gravity, tumbling rotation, drift
- Hidden via scale=0 when below ground

**Visual Feedback:**
- **Color glow**: Snow lerps from white to bright cyan (0.6, 1.5, 2.0) as resonance builds
- **Progressive shake**: Shake intensity increases with resonance progress
- Per-instance colors via `setColorAt()` on InstancedMesh

**Resonance Clusters:**
- Nearby snow pieces (within 2.5 units) are grouped into clusters
- Each cluster has random musical parameters:
  - chord: Eb, Bb, Cm, or Ab
  - volume: low, mid, or high
  - filter: dark, medium, or bright
  - bassNote: Eb, Ab, or Bb
- All snow in a cluster shakes/glows together when resonating
- All snow in a cluster falls together when cleared

### 4. Hand Tracking (`src/hands.js`)
- Loads MediaPipe scripts dynamically
- Processes left and right hands separately
- Draws hand skeleton + pinch indicators on video overlay
- Outputs params object with hand positions and pinch states

### 5. Game Logic (`src/game.js`)
- Checks if current musical params match any cluster's requirements
- Resonance strength calculated as matches/totalChecks
- Cluster resonates if strength > 0.6 (60% match)
- **After 5 seconds of sustained resonance**, cluster clears (snow falls)
- Timer decays at 2x rate when not resonating (partial progress preserved briefly)
- Progress bar shows percentage of snow cleared
- Passes resonance progress to tree for visual feedback

### 6. UI (`index.html`)
- Video overlay in bottom-right showing webcam + hand tracking
- Left panel showing current musical params (chord, volume, filter, bass)
- Progress bar for snow cleared percentage
- Instructions panel

---

## Performance Optimizations Made

### InstancedMesh for Static Snow
- **Before:** Hundreds of individual meshes = hundreds of draw calls
- **After:** Single InstancedMesh = 1 draw call
- Matrix-based transforms for position/rotation/scale
- Per-instance colors for glow effect

### InstancedMesh for Falling Snow
- **Before:** Pool of 50 meshes, extras would disappear
- **After:** InstancedMesh with capacity = total snow count
- No limit on simultaneous falling pieces
- Reuses temp objects to avoid allocations

### Shared Resources
- Single geometry (vertex-modified unit cube)
- Single material for all instances
- Temp objects reused each frame (Matrix4, Vector3, Quaternion, Color)

---

## Known Issues

### 1. Leaves Still Visible
- Setting leaves.count=0 doesn't fully hide them
- Could manually hide the leaves mesh after generation
- Or just cover with enough snow that it doesn't matter

---

## File Structure
```
snow-tree/
├── index.html          # Main HTML with UI styling
├── package.json        # npm config (type: module)
├── PROGRESS.md         # This file
└── src/
    ├── main.js         # Entry point, ties modules together
    ├── scene.js        # Three.js scene setup
    ├── tree.js         # Tree generation + snow system (InstancedMesh)
    ├── audio.js        # Tone.js synth setup
    ├── hands.js        # MediaPipe hand tracking
    └── game.js         # Resonance matching + win logic
```

---

## Original Synth Prototype
There's also an earlier standalone synth prototype (without the tree) at:
```
/Users/jonathanmann/SongADAO Dropbox/Jonathan Mann/projects/games/SynthSnow/
├── index.html
└── app.js
```
This was the hand-controlled synth we built first before adding the tree game.

---

## Next Steps
1. Add win celebration when all snow is cleared
2. Consider adding hints showing what params each cluster needs
3. Add visual indicator for which clusters are close to clearing
4. Consider adding background forest (attempted but removed - needs better approach)
5. Hide leaves mesh programmatically after tree generation
