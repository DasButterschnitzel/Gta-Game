# HAFENGOLD

*Autos. Kohle. Verrat.* — a mobile-first, fully offline, top-down 2.5D crime action game for Android,
set in **Neuhafen**, a fictional modern-day German port city. Inspired by the classic top-down GTA
games (GTA 1/2) and GTA: Chinatown Wars, with its own city, story, characters, vehicles, art and audio.

* Game design & analysis of the reference games: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
* Story bible (characters, gangs, three-act arc, all missions): [`docs/STORY.md`](docs/STORY.md)
* Changes per test build: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## Repository layout

| Path | What |
|---|---|
| `game/` | The game: TypeScript + Three.js (WebGL2) + planck.js physics, bundled with esbuild |
| `game/src/world/` | Procedural city generator (districts, roads, lane graph, buildings, props) |
| `game/src/render/` | 2.5D renderer: chunked city, procedural textures, vehicle models, sprites, effects |
| `game/src/game/` | Gameplay: vehicles & tyre model, characters, player, traffic AI, pedestrians |
| `game/src/audio/` | WebAudio engine (engine voices, positional SFX) |
| `game/tools/` | Asset generators (`gen_audio.py` synthesizes every sound), map dump, physics tests |
| `game/tests/` | Automated Playwright play-tests and screenshot tools |
| `android/` | Minimal Android shell (WebView + `WebViewAssetLoader`, **no INTERNET permission**) |

Everything (textures, models, sounds) is generated in code — there are no third-party art assets.

## Build

Requirements: Node 20+, JDK 17+, Android SDK (platform 36, build-tools 36.1), Python 3 with
numpy/scipy + ffmpeg (only to regenerate sounds).

```bash
cd game
npm install
python3 tools/gen_audio.py public/audio   # optional: sounds are committed
node build.mjs --android                    # bundle game -> android/app/src/main/assets/www
cd ../android
./gradlew assembleDebug                     # -> app/build/outputs/apk/debug/app-debug.apk
```

Play in a desktop browser while developing: `cd game && node build.mjs --dev --serve` and open
<http://localhost:8765>. Keyboard: **WASD/arrows** drive/walk, **Space** handbrake, **F** enter/exit,
**J/Ctrl** attack, **H** horn, **Shift** sprint, **Esc** pause.

## Installing a test APK

Test APKs are signed with the shared test key in `android/keystore/` so each new build installs
over the previous one. Enable "install unknown apps" for your file manager/browser, open the APK
and install. The game needs no network connection.
