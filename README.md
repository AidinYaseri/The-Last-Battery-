# THE LAST BATTERY

*"You have 5% remaining."*

A first-person mystery / horror game for the desktop browser, built with **Three.js + TypeScript** (Vite).

You wake up alone in a forest at night. Your phone has 5% battery. You don't remember how you got here,
and the phone is full of messages, photos and notes you don't remember making. Find your way home
before the phone dies... and find out why you've been here before.

Everything (geometry, textures, photographs, sound effects, voices and music) is generated
procedurally at runtime, so the game ships with no asset files.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Use a modern desktop browser (Chrome, Edge, Firefox, Safari) with WebGL. Headphones recommended.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint (stamina) |
| Mouse | Look |
| E | Interact |
| F | Flashlight (has its own batteries) |
| Tab | Phone (open/close) |
| I | Inventory |
| Esc | Pause |

On the phone: move the mouse to steer the on-screen cursor and click, or use `1`-`6` to open apps,
`T` for the torch, `Backspace` to go back. In the camera viewfinder, click / `E` / `Space` takes a photo.

## The battery

The phone battery is the core mechanic. It carries over between levels and never refills on its own.

| Action | Cost |
| --- | --- |
| Open phone | free |
| Check map | 0.2% |
| GPS | 1% / 30 s |
| Take photo | 1% |
| Phone torch | 1% / 60 s |
| Phone call | 1% / 10 s |
| Send message | 2% |
| Download area map | 1% |

Power banks, a car charger and a wall outlet can be found along the way. If an action would use the
last of your battery, the game asks you to confirm first. If the phone reaches 0%... you'll find out.

Some clues are only visible in photographs.

## Structure

Five levels: **The Forest**, **The Town**, **The Highway**, **The Cabin**, **The Truth**, and four
endings (Escape, Battery Death, Break the Loop, and a hidden one).

```
src/
  core/        Game loop, state, scene, input, settings, scheduler, events
  player/      Player, first-person camera, movement, flashlight
  levels/      LevelManager, BaseLevel, the five levels, menu background, shared cabin
  phone/       Phone logic, battery, Maps, Camera, Messages, Notes, Calls, Settings apps
  interaction/ Ray-cast interaction system
  story/       Story content, clues, dialogue/subtitles, objectives, endings
  inventory/   Inventory
  audio/       Procedural sound synthesis + WebAudio manager (3D audio, reverb, music)
  save/        localStorage save / checkpoints / meta progress
  ui/          HUD, phone UI, menus, modals (notes, keypads), transitions
  world/       Builder (props, buildings, vehicles, forests), textures, materials,
               collision, atmosphere, static batching, photo generation
```

The game autosaves to `localStorage` (level start, pickups, clues, every 20 s) and can be
continued from the main menu. Graphics quality (low / medium / high) is auto-detected and can be
changed in Settings.

### Debug URL parameters

- `?fps` shows an FPS / draw-call counter.
- `?debug&level=3` jumps straight to a level (exposes `window.__game`).
- `?nolock` disables the pointer-lock requirement (useful for automated testing).
