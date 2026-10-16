# HAFENGOLD — Game Design Document

Working title: **HAFENGOLD** (German: "harbour gold", street slang for the cocaine that comes in through the port).
Tagline: *Autos. Kohle. Verrat.* (Cars. Money. Betrayal.)

A mobile-first (Android), fully offline, top-down 2.5D crime action game set in **Neuhafen**, a fictional
modern-day German port city. Inspired by the classic top-down GTA games (GTA 1, GTA 2) and
GTA: Chinatown Wars — but with an original city, story, characters, vehicles, art and audio.

---

## 1. Reference analysis (what the footage shows)

Sources studied: the GTA 2 videos you linked (YouTube blocks downloads from this environment, so I used
a public 7.4 h GTA 2 PC longplay on the Internet Archive, sampled at 8 points through the game at 2 fps
plus two 10 fps motion sequences), and Chinatown Wars footage (feature clips on dealing, hotwiring and
rampages, the iPhone touch-control trailer, PSP and DS reviews, a game guide).

### GTA 2 (1999)
* **Camera**: straight down, always north-up, perspective projection. Buildings are real 3D blocks, so
  their walls "lean out" toward the screen edges — the signature 2.5D look. The camera rises (zooms
  out) with vehicle speed and drops low on foot. At normal driving zoom the screen height covers
  roughly 8 car lengths; that is tight, which is why fast driving north/south feels dangerous.
* **Lighting** carries the mood: dark streets, pools of sodium-orange street light, green/purple
  ambient zones per district, traffic lights that throw red/green light on the asphalt, explosions that
  flash the surroundings.
* **Roads**: wide multi-lane avenues with dashed white lane lines, yellow edge lines, grass medians,
  zebra crossings at every junction, painted words and turn arrows on the asphalt, traffic-light posts on
  the corners, elevated rail lines crossing over streets.
* **Feedback layer**: district-name banner slides in at the top when you enter an area; a vehicle-name
  banner when you get in a car; score pop-ups (big translucent numbers) at the spot where you earned
  them; weapon-pickup names in red text; skid marks stay on the road.
* **Mission flow**: you walk up to a ringing phone (colour-coded per gang); the brief appears as
  **non-blocking text at the bottom of the screen with a portrait** while you already drive. Missions are
  short and varied: steal/deliver a vehicle, drive a (rigged / remote-control / hot-dog / bus) vehicle
  somewhere, kill a target, survive a frenzy with a tank, etc.
* **Respect system**: three gangs per district with respect meters (top-left). Working for one gang
  raises its respect and lowers its rival's. Low respect = that gang shoots at you on sight and their
  phones are closed to you.
* **Score / money** is the progression gate: reach the money target to finish a district.
* **Wanted level**: cop heads 1–6 (police → SWAT → FBI → army). Respray shops clear it.
* **Physics feel**: arcade — cars accelerate hard, turn tightly at low speed, slide when cornering fast,
  handbrake swings the rear out. Collisions are bouncy and cars pile up into satisfying wrecks.
  Articulated vehicles (tow truck with car) swing behind you.

### GTA: Chinatown Wars (2009, DS/PSP/iOS)
* **Camera**: angled 3D top-down (not straight down), cel-shaded with thick black outlines, mostly
  north-up. Strong comic-book identity.
* **Comic-panel cutscenes**: characters appear as illustrated portraits with captions — cheap to produce,
  very stylish, perfect for mobile.
* **Drug dealing as the economic core**: six drug types, every dealer has different prices, prices react
  to supply/demand, dealers e-mail tips ("I'm overstocked, come quick"), stash at safehouses, police
  stings and busts confiscate your goods. A weekly trading graph shows how you did.
* **Wanted system twist**: you lose heat by **wrecking pursuing police cars** (takedowns) — turns
  escaping into an aggressive driving mini-game instead of passive hiding.
* **Touch mini-games** woven into actions: hotwiring (screwdriver + wires), filling Molotov bottles at a
  gas pump, tattoo tracing, scratch cards, assembling a sniper rifle, smashing windows.
* **Rampages** with chain multipliers ("2X CHAIN … 6X CHAIN") and bronze/silver/gold targets.
* **iPhone controls**: virtual stick bottom-left, round action buttons bottom-right, circular radar
  top-left, clock + weapon/health top-right, GPS route drawn on the map.
* **Side content**: ambulance/fire/taxi/vigilante jobs, store-damage and "carnage" meters, stunt jumps
  with jump-distance read-out, collectables (CCTV cameras), trophies for dealing milestones.

### What we keep, what we change
| Keep (core of the fun) | Change / modernise |
|---|---|
| North-up 2.5D perspective camera with leaning walls, speed-based zoom | Add **look-ahead** in driving direction so phones in landscape can see where they go |
| Arcade driving with handbrake slides, skid marks, bouncy crashes | Proper tire model: grip limit, weight transfer, FWD/RWD/AWD differences, drift assist for touch |
| Non-blocking mission text + short comic cutscenes with portraits | Retry from checkpoint, autosave after missions |
| Gang respect between rival gangs | Respect also unlocks gang side-jobs and backup in the finale |
| CTW dealing economy (light version) | Fewer goods (5), clear UI, dealer tips via in-game phone |
| CTW police takedowns to lose heat | Combined with German specifics: Lackiererei respray, SEK, helicopter |
| District banners, vehicle banners, money pop-ups | German place names and parody brands |
| Mood lighting per district, day/night | Rain showers (it's Germany) |

---

## 2. Design pillars
1. **Driving first.** Every vehicle must feel good with a thumb. Responsive steering, readable slides,
   weight, and big satisfying crashes. If driving isn't fun, nothing else matters.
2. **A story worth finishing.** A three-act crime drama with real characters, betrayal and consequences
   — not just a sandbox.
3. **Unmistakably German.** Parody versions of German cars, Polizei/Feuerwehr/Rettungsdienst
   vehicles, Plattenbau, Altbau, Fachwerk, Späti, Döner, Pfandflaschen, Autobahn without speed limit,
   Baustellen everywhere.
4. **Short sessions, long arc.** Missions take 2–6 minutes; side activities are bite-sized; everything
   pays into one money & respect economy.
5. **Offline & respectful.** No network permission, no ads, no tracking, small download.

---

## 3. Core gameplay loop
```
          ┌──────────────── explore Neuhafen (steal cars, chaos, discover) ───────────────┐
          │                                                                               │
          ▼                                                                               │
  pick up work ──► story missions (phone booths / contacts)  ──► money, respect, story ───┤
          │        gang side jobs (rival gangs)                    unlocks: districts,    │
          │        dealing runs (buy low, sell high)               weapons, safehouses,   │
          │        side activities (taxi, Döner delivery, races)   vehicles, upgrades     │
          ▼                                                                               │
   heat builds (Fahndungsstufe) ──► escape: takedowns, Lackiererei, hide ─────────────────┘
```
* **Minute-to-minute**: drive, dodge, crash, shoot, escape.
* **Session (5–15 min)**: 1–3 missions or a dealing run plus a side job.
* **Long-term**: three acts, three city zones unlocked by story, gang respect, collectables
  (50 Pfandflaschen), safehouses, weapon unlocks, tuning.

---

## 4. Systems

### 4.1 Driving
* 2D rigid body (planck.js / Box2D) per vehicle with a custom **two-axle tire model**: slip angles at
  front/rear axle, lateral force saturating at μ·load, load transfer under braking/acceleration,
  engine force curve with automatic gearbox, aerodynamic drag, rolling resistance.
* Drive layouts: FWD (understeer), RWD (power oversteer), AWD (stable fast).
* **Handbrake** drops rear grip → controlled drifts. **Drift assist** auto-counter-steers a bit when
  touch players release steering mid-slide.
* Speed-sensitive steering lock, steering smoothing; reverse with the brake pedal.
* Damage model: health per vehicle, smoke at 40 %, fire at 15 %, explosion; dents/dirt shading;
  broken lights. Impacts produce sparks, sounds, camera shake.
* Skid marks, tire smoke, engine sound per engine type (4-cyl, 6-cyl, V8, boxer, diesel, two-stroke
  moped, electric), gear changes, tire screech.

### 4.2 On foot
* Twin-mode: floating virtual stick to move; sprint; enter/exit vehicles (pull drivers out, CTW-style
  hotwire for parked cars); punch/shoot with auto-aim cone; lock-on cycling.

### 4.3 Combat & weapons
Fists, Baseballschläger, Pistole, MP (SMG), Schrotflinte, Sturmgewehr, Molotow, Granate, later a
rocket launcher. Auto-aim in the facing cone; drive-by fires at the nearest target.

### 4.4 Wanted level — *Fahndungsstufe* (shown as blue lights)
| Level | Response |
|---|---|
| 1 | Streifenwagen (patrol cars) investigate, cops on foot try to arrest |
| 2 | More patrols, ramming |
| 3 | Roadblocks (Straßensperren), spike strips |
| 4 | SEK vans (SWAT) + police helicopter |
| 5 | BKA unmarked cars, heavy roadblocks |
| 6 | Federal special unit (fictional "BSE-9") — armoured vans |

Lose heat by: breaking line of sight long enough, **takedowns** (wreck pursuing police cars — each
takedown knocks heat down), **Lackiererei** respray (costs money), or getting busted/wasted
(*FESTGENOMMEN* / *KRANKENHAUS*).

### 4.5 Gangs & respect
Four gangs in rival pairs, respect −100…+100 each:
* **Die Lotsen** (harbour smugglers) ⇄ **Eisenwölfe MC** (biker meth & car-smuggling)
* **Kiez-Kompanie** (red-light district) ⇄ **NEON** (techno-club pill syndicate)

Work for a gang → its respect up, rival's down. Respect > 25: their side jobs open, members are friendly.
Respect < −25: members attack on sight in their turf. Respect determines who backs you in the finale.

### 4.6 Economy
Money (€) from missions, dealing, side jobs, car export, collectables. Spend on weapons
("Kalle's Kleinkaliber" — back-room arms dealer), armour, Lackiererei, safehouses, vehicle upgrades
(Tuning-Werkstatt), bail.

### 4.7 Mini-games (kept small, only where they make sense)
1. **Ticken (dealing)** — light CTW-style trading: 5 goods (Gras, Pillen, Koks, Crystal, Ket),
   dealers with different prices, tips on the phone, police stings. *The money engine.*
2. **Kurzschließen (hotwire)** — 2-second touch mini-game when stealing a *parked* car. Can be turned off.
3. **Straßenrennen (street races)** — checkpoint races against AI racers; uses the driving model.
4. **Döner-Lieferdienst** — deliver hot Döner on a moped before they get cold; streak bonuses.
5. **Tresor knacken (safe cracking)** — only inside heist missions.

Side activities: Taxi (ivory diesel sedan), Rettungsdienst (ambulance), Feuerwehr (fire truck),
car export (Autoschieber list for the Eisenwölfe), 50 hidden **Pfandflaschen**, stunt jumps,
Randale (rampage) challenges with chain multipliers.

### 4.8 Feedback layer
District banners, vehicle-name banners, money pop-ups in the world, big centred status words
(**AUFTRAG ERLEDIGT**, **FESTGENOMMEN**, **KRANKENHAUS**), takedown counters, chain multipliers,
skid marks, sparks, debris, decals.

---

## 5. Controls (mobile-first, landscape)
**On foot**: floating stick (left half) · *Angriff* (attack, big) · *Einsteigen* (enter car) · *Sprint* ·
weapon switch by tapping the weapon icon.
**In vehicle**: steering on the left (analog drag or ◀ ▶ buttons — setting) · *Gas* (big) · *Bremse /
Rückwärts* · *Handbremse* · *Aussteigen* · *Hupe* · *Feuer* (drive-by) · radio button.
All buttons ≥ 64 dp, semi-transparent, re-positionable later; haptics on crashes and hits.
Keyboard (testing): WASD/arrows, Space = handbrake, F = enter/exit, J/Ctrl = fire, Q/E = weapons,
H = horn, R = radio, M = map, Esc = pause. Gamepads via the Gamepad API.

---

## 6. Art direction
* **2.5D perspective, north-up**, straight-down camera with leaning building walls (GTA 2), low-poly
  3D vehicles with clean outlines and procedural liveries (CTW), procedural textures for everything —
  no external art assets, generated in code at load time.
* **German city kit**: Altbau with mansard/gabled roofs and courtyards (Hinterhöfe), GDR Plattenbau
  slabs with coloured balcony panels, Fachwerk old town with red tile roofs, red-brick Speicherstadt
  warehouses, container terminal with gantry cranes, glass bank towers, villas with pools, solar
  panels on roofs, cobblestones, white road markings (German style), zebra crossings, yellow phone
  booths, Litfaßsäulen, Späti kiosks, Döner shops.
* **Vehicles** (parody brands, inspired by German design language, no real logos):
  Volksflitzer *Golfo* (hatchback), *Passant* (estate), Bayernwerk *B5* (sports saloon),
  Mercator *E-Klasse Taxi* (ivory diesel), Mercator *Sprinto* (van), Porzer *911er*-like coupé,
  Audax *Quadro* (AWD estate), Trabbi-style *Rennpappe*, Simson-style *Schwalbe* moped, e-scooter,
  MAN-style truck, BVG-style yellow bus, orange garbage truck, **Polizei** patrol cars (blue/silver with
  neon-yellow), **SEK** vans, **Feuerwehr** fire trucks (red, white stripes, ladder), **Rettungswagen**
  (white with red-orange reflective stripes), yellow "Pannenhilfe" breakdown truck, yellow parcel van.
* **Lighting**: day/night cycle; at night: lit windows, street-light pools, headlight cones, blue-light
  flashes painting the street; rain with wet roads.
* **UI**: bold condensed type, comic-panel cutscenes with illustrated portraits (drawn in code as vector
  art), circular radar, blue-light wanted indicator.

## 7. Audio direction
All synthesized offline in Python (numpy) and encoded to Ogg Vorbis: engine loops per engine type,
tire screech, impacts, glass, gunshots, explosions, German two-tone siren (*Martinshorn*), horn, doors,
footsteps, UI. Radio stations with procedurally composed loops (Berlin techno, Deutschrap-style beats,
Schlager-disco parody, Krautrock motorik, Neue-Deutsche-Welle synth pop).

## 8. Technical architecture
* **Game**: TypeScript, bundled with esbuild; rendering with **Three.js** (WebGL2); physics with
  **planck.js**; WebAudio; HTML/CSS overlay for HUD and menus.
* **Android shell**: minimal Java Activity hosting a WebView; game files served from the APK via
  `WebViewAssetLoader` (`https://appassets.androidplatform.net/`). **No INTERNET permission** —
  offline by construction. Immersive full-screen, landscape, keep-screen-on, native bridge for saves,
  haptics and back button.
* **World**: 400 × 400 tiles (4 m per tile → 1.6 km × 1.6 km), generated deterministically from a
  hand-authored macro layout (districts, river, canal, arterials) + procedural blocks/buildings. Chunked
  rendering (16 × 16-tile chunks built lazily), lane graph for traffic, sidewalk rings for pedestrians.
* **Testing**: Playwright + Chromium (the same engine as Android's WebView) for automated play-tests
  and screenshots; headless physics tests in Node; APK checks with the Android SDK tools.

## 9. Roadmap
| Version | Content |
|---|---|
| 0.1 | City + 2.5D renderer, German cars, driving physics, on foot, enter/exit, touch controls, basic traffic & pedestrians, core SFX |
| 0.2 | Lane traffic with lights, pedestrian AI, Polizei & wanted system, weapons, damage/explosions, HUD/radar, radio |
| 0.3 | Mission system, Act 1 story, comic cutscenes, gangs/respect, dealing, hotwiring, saves |
| 0.4 | Acts 2–3, side activities, races, Döner delivery, collectables |
| 1.0 | Polish, German/English localisation, performance tiers, Play Store release build (AAB) |
