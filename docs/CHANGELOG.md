# Changelog

## v0.3.0 — the story begins
**New**
- **Prologue „A 26"**: six years earlier, a rainy night, a getaway in a black B5 with four stars on
  your tail – ending at the raised canal bridge. Then: *6 Jahre später*.
- **Act 1, missions 1–5**: *Freigang* (Dende and Gisela pick Kai up at the prison), *Altes Revier*
  (deliveries in Betonhausen, NEON pushers at the playground), *Onkel Herbie* (a pistol for old times'
  sake and a debt to collect), *Abschleppdienst* (steal a car out of the police impound lot and lose
  the cops) and *Die Faust von Sankt Paula* (collect protection money for Uschi – one landlord runs,
  one sends his bouncers, one pays in deposit bottles).
- **Comic-style dialogue** with drawn portraits for the whole cast, tap to continue, skip button.
- **Mission system**: objectives, glowing markers, **GPS route on the radar**, arrow to off-screen
  targets, mission timer, „AUFTRAG ERLEDIGT / GESCHEITERT", contacts shown as letters on the radar.
- **Saving**: Gül's Grill is your safehouse (white circle = save + heal), autosave after every mission,
  title screen with *Weiterspielen* / *Neues Spiel*.
- **Rain** (used in the prologue).

**Fixed (from your test report)**
- *Leaving the car often failed*: the free-spot check used the physics engine's rough bounding boxes,
  so a car standing at an angle blocked its own doors. Now exact shapes, more exit spots, and Kai
  always gets out.
- *Cars exploding at random*: traffic drove into the closed canal/river bridges, crashed, caught fire
  and set off chain reactions. Lanes leading onto closed bridges are now avoided (traffic, police
  and GPS). Crash damage is gentler (your own car takes 35 % less), explosions ignite fewer neighbours,
  burning cars warn you and take longer to blow up.
- *„Lightning"*: every explosion flashed the whole screen, even far away. Now only nearby blasts do.
- *Handling*: much more grip (sharper turns in city junctions), a slide assist that stops spin-outs
  outside of handbrake drifts, traction/stability help for rear-wheel-drive cars, smoother touch
  steering with a small dead zone and finer control at speed.
- Gangsters and cops hit you less hard, fewer knock-downs.


## v0.2.0 — weapons, police, radio
**New**
- **Weapons**: fists, baseball bat, pistol, SMG, shotgun, assault rifle, Molotov cocktails and grenades.
  Auto-aim on foot (aims where the stick points), **drive-by shooting** with pistol/SMG out of the car
  window, tracers, muzzle flashes, burning people, fire spreading from Molotovs, bouncing grenades.
- **71 pickups** around the city: weapon crates (different per district), health, armour (Schutzweste),
  police bribes (−1 star); victims drop cash. Tap the weapon name to switch weapons.
- **Police & Fahndungsstufe 1–6**: crimes count when cops see them (or a witness calls them in).
  Patrol cars, pursuits that route through the streets and ram you, cops on foot who arrest you
  (**FESTGENOMMEN** = fine + weapons gone) and shoot from 2–3 stars, roadblocks with **spike strips**
  (flat tyres!), SEK vans, unmarked BKA cars, BSE-9 armoured vans and a **police helicopter** with a
  night searchlight.
- **Takedowns** (like Chinatown Wars): wreck pursuing police cars to lower your wanted level, with a
  short slow-motion. Or lose them out of sight, or use a **Lackiererei** (paint shop, green on the radar,
  300 €).
- **Radio**: 5 stations with original, procedurally composed music — NEON 101 (techno), Kiez FM 93,1
  (boom-bap beats), Heimatwelle 98,4 (Schlager-disco), Motorik 4 (Krautrock), Welle 80 (synth pop).
  Every car has its own preset (Gisela only plays Motorik 4). ♫ button / R switches.
- **Pause menu** (Android back button), **settings** (volumes, stick or ◀ ▶ steering, vibration,
  graphics quality, FPS display — saved on the phone), **controls help** and a **full-screen city map**
  (tap the radar or M; drag and pinch).
- Characters drawn larger for small screens; copper-beech trees instead of orange ones.

**Fixes**: quick taps on touch buttons are never lost; hints no longer cover buttons; radio button no
longer overlaps the money display.


## v0.1.0 — first playable (driving slice)
**New**
- Neuhafen generated: 1.6 × 1.6 km with 12 districts (Plattenbau, Kiez, Bahnhofsviertel, harbour,
  steel works, old town, bank towers, villas, uni, park, airport site), river, canal, harbour basins,
  bridges, 490 junctions with German traffic lights (incl. red+yellow phase), zebra crossings.
- GTA 2-style 2.5D camera: straight down, buildings lean out, zooms out with speed and leads in
  the driving direction.
- Day/night cycle (1 game minute per second) with lit windows, street-light pools and Kiez neon.
- 21 German-inspired vehicles (Golfo, Passant, B5, E 300 + Taxi, Elfer, Quadro, Rennpappe, Mantis,
  Smartie, Stromer, Sprinto, parcel van, Polizei, SEK, Rettungswagen, Feuerwehr, truck, bus,
  garbage truck) with liveries, working lights, light bars and steerable front wheels.
- Driving model: tyre slip with grip limits, weight transfer, FWD/RWD/AWD, handbrake drifts, drift
  assist and a light stability control, automatic gearbox, surface grip (grass, cobbles, sand).
- On foot: walk/run/sprint, punch, enter cars from either side, pull drivers out, bail out at speed.
- Traffic AI on the lane graph (stops at red lights, yields, keeps distance, unsticks itself),
  parked cars, pedestrians walking sidewalks, dodging cars and fleeing from violence.
- Damage: crashes, smoke at low health, fire, explosions; cars sink in water.
- Synthesized audio: 8 engine types, tyre screech, crashes, horn, siren, explosion, footsteps.
- Touch controls (floating stick, slide-between buttons, quick taps always register), keyboard &
  gamepad, HUD with radar, first-time control hints. Android back button opens/closes pause.

**Known gaps (next builds)**: no police/wanted system yet, no weapons, no missions/story yet, no
saving, no settings menu.
