// Story missions: prologue "A 26" and Act 1 "Entlassung" (missions 1–5 so far).
import type { MissionDef, MissionCtx } from './runner';
import type { CharLook } from '../render/charSprites';
import type { Character } from '../game/character';
import type { Vehicle } from '../game/vehicle';
import { RNG } from '../core/rng';
import { D } from '../world/types';
import { GANGS } from '../game/gangs';
import { lanePoint, sidewalkNear, shopFronts, playgroundNear, parkingNear, canalBridge, type Spot } from './places';

/** sprite palettes for the story cast (match the comic portraits) */
export const CAST: Record<string, CharLook> = {
  dende: { skin: 0xeac2a0, hair: 0xc8302a, top: 0x3a7a3a, bottom: 0x2e3a5a, shoes: 0xe8e8e8, accent: 0xe8c040 },
  gul: { skin: 0xc89070, hair: 0x2a1a14, top: 0xf2f2ea, bottom: 0x6a2a3a, shoes: 0x1a1a1a, accent: 0xc83a2a },
  herbie: { skin: 0xe8bca0, hair: 0x5a4a3a, top: 0x7a5a3a, bottom: 0x4a4a52, shoes: 0x3a2a1e, accent: 0xd8d0c0 },
  uschi: { skin: 0xe8b898, hair: 0xe8d090, top: 0xd8a820, bottom: 0xd8a820, shoes: 0xe8e8e8, accent: 0xc82a2a },
  wirt: { skin: 0xeab898, hair: 0x8a6a4a, top: 0xe8e8e8, bottom: 0x3a3a3a, shoes: 0x3a2a1e, accent: 0x8a6a4a },
  tuersteher: { skin: 0x9a6444, hair: 0x1a1a1a, top: 0x151515, bottom: 0x151515, shoes: 0x0e0e0e, accent: 0xe8c040 },
  mehlhorn: { skin: 0xf0c0a0, hair: 0xd8c8a0, top: 0x8a2a2a, bottom: 0x2a2a2e, shoes: 0x3a2a1e, accent: 0xe8c040 },
  thug: { skin: 0xd8a07a, hair: 0x2a2a2a, top: 0x3a3a3e, bottom: 0x2a2a2e, shoes: 0x1a1a1a, accent: 0x8a8a8a },
  mikki: { skin: 0xf2cdb0, hair: 0x6a4a2a, top: 0x3a3a5a, bottom: 0x2a2a2e, shoes: 0xe8e8e8, accent: 0x5a5a8a },
};

function poi(m: MissionCtx, id: string): Spot {
  const p = m.g.city.pois.get(id);
  if (!p) throw new Error(`missing POI ${id}`);
  return { x: p.x, y: p.y };
}

function near(m: MissionCtx, r: number, x: number, y: number): boolean {
  return Math.hypot(m.g.player.x - x, m.g.player.y - y) < r;
}

/** make sure the player sits in a car; returns it */
async function needCar(m: MissionCtx, text = 'Besorg dir ein Auto'): Promise<Vehicle> {
  if (m.g.player.vehicle) return m.g.player.vehicle;
  m.objective(text);
  await m.until(() => !!m.g.player.vehicle);
  return m.g.player.vehicle!;
}

function thugs(m: MissionCtx, look: () => CharLook, at: Spot, n: number, weapons: (string | null)[], opts: { health?: number; accuracy?: number; fleeAt?: number; gang?: number } = {}): Character[] {
  const list: Character[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = at.x + Math.cos(a) * 2.2;
    const y = at.y + Math.sin(a) * 2.2;
    const c = m.char(look(), x, y, 'gang');
    m.g.npcs.add(c, {
      mode: 'attack',
      target: m.g.player.char,
      weapon: (weapons[i % weapons.length] as never) ?? null,
      health: opts.health,
      accuracy: opts.accuracy ?? 0.45,
      fleeAt: opts.fleeAt ?? 0.25,
      gang: opts.gang ?? -1,
    });
    list.push(c);
  }
  return list;
}

/** targets: red arrows over each enemy that is still in the fight */
async function defeat(m: MissionCtx, list: Character[], text: string): Promise<void> {
  m.objective(text);
  const targets = list.map((c) =>
    m.target({ x: () => c.x, y: () => c.y, kind: 'arrow', color: 'red', z: 1.6, gps: false }),
  );
  const out = (c: Character): boolean => c.dead || !m.g.chars.includes(c) || (c.ai as { mode?: string } | null)?.mode === 'flee';
  try {
    while (!list.every(out)) {
      await m.until(() => list.some((c, i) => out(c) && targets[i].blip) || list.every(out));
      list.forEach((c, i) => {
        if (out(c) && targets[i].blip) {
          targets[i].blip = false;
          m.untarget(targets[i]);
        }
      });
    }
  } finally {
    for (const t of targets) m.untarget(t);
  }
}

// =============================================================================================
// Prologue
// =============================================================================================
export const PROLOGUE: MissionDef = {
  id: 'prolog',
  title: 'A 26',
  giver: 'kai',
  reward: 0,
  noFail: true,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const hbf = poi(m, 'hbf');
    const start = lanePoint(city, hbf.x + 40, hbf.y + 30, 80) ?? lanePoint(city, hbf.x, hbf.y, 150)!;
    g.setClock(1.4);
    g.setRain(1);
    const car = m.vehicle('b5', start.x, start.y, start.h, { paint: 0x1a1c20, tag: 'prolog' });
    car.health = car.maxHealth = 400;
    g.seatPlayer(car);
    m.passenger(CAST.mikki, car);
    const pc = g.player.char;
    pc.maxHealth = pc.health = 600;
    car.body.setLinearVelocity({ x: Math.cos(start.h) * 14, y: Math.sin(start.h) * 14 });
    await m.say([
      { who: 'caption', text: 'Sechs Jahre früher. Eine Regennacht in Neuhafen. Irgendwo hinter dem Hauptbahnhof.' },
      { who: 'jansen', text: 'Fahr, Falke! FAHR!' },
      { who: 'mikki', text: 'Die waren schon da! Die Bullen standen da, bevor wir überhaupt ausgestiegen sind!' },
      { who: 'kai', text: 'Anschnallen. Und Klappe halten.' },
      { who: 'jansen', text: 'Runter zum Hafenkanal. Herbie sagt, auf der anderen Seite wartet der Container.' },
    ]);
    g.wanted.atLeast(4, car.x, car.y);
    g.hud.hint(g.isTouch ? 'Links lenken · GAS / BREMSE · HANDBREMSE = Drift' : 'W/S = Gas/Bremse · A/D = Lenken · Leertaste = Handbremse', 5);
    const bridge = canalBridge(city, car.x, car.y);
    m.objective('Häng die Polizei ab – runter zum Hafenkanal!');
    const t = m.target({ x: () => bridge.x, y: () => bridge.y, r: 9, color: 'red', gps: true });
    await m.until(() => near(m, 30, bridge.x, bridge.y) || g.prologCaught || m.time > 170);
    m.untarget(t);
    if (!g.prologCaught && near(m, 40, bridge.x, bridge.y)) {
      await m.say([
        { who: 'mikki', text: 'Die Brücke … die Brücke ist OBEN!' },
        { who: 'kai', text: 'Festhalten.' },
      ]);
    }
    // the crash
    g.slowMo(0.25, 1.2);
    g.camera.addShake(1.4);
    g.sound.play('crash_heavy', undefined, undefined, 1);
    g.sound.play('glass', undefined, undefined, 0.8);
    g.flash(0.6);
    await m.wait(0.5);
    await g.fade(true, 0.8);
    g.endPrologue();
    await m.wait(0.3);
    await m.title('6 JAHRE SPÄTER', 'JVA Neuhafen', 3);
    await g.fade(false, 1.0);
  },
};

// =============================================================================================
// Act 1
// =============================================================================================
const freigang: MissionDef = {
  id: 'freigang',
  title: 'Freigang',
  giver: 'dende',
  reward: 200,
  async run(m) {
    const g = m.g;
    const gisela = g.ensureGisela();
    m.keep(gisela);
    const dende = m.char(CAST.dende, gisela.x + 1.2, gisela.y + 2.8, 'story', -Math.PI / 2);
    await m.wait(0.6);
    await m.say([
      { who: 'caption', text: 'JVA Neuhafen. Sechs Jahre, vier Monate, elf Tage.' },
      { who: 'dende', text: 'FALKE! Alter! Sechs Jahre, und du siehst immer noch aus wie ein Bankberater mit Schlafproblemen.' },
      { who: 'kai', text: 'Dende.' },
      { who: 'dende', text: 'Komm her, Mann. … Lena wollte nicht mitkommen. Sie redet nicht über dich. Gar nicht.' },
      { who: 'kai', text: 'Hab ich verdient.' },
      { who: 'dende', text: 'Egal. Gisela wartet! Mein Lappen ist weg, also fährst du. Und wenn du ihr einen Kratzer machst, ess ich dich.' },
      { who: 'kai', text: 'Wohin?' },
      { who: 'dende', text: 'Betonhausen. Gül hat dir oben über dem Grill ein Zimmer gemacht. Deine Mutter hätte das gewollt.' },
    ]);
    g.removeChar(dende);
    m.passenger(CAST.dende, gisela);
    m.failIf(() => gisela.dead || gisela.burning > 0, 'Gisela ist Schrott. Dende wird dir das nie verzeihen.');
    await m.enter(gisela, 'Steig in Gisela');
    g.hud.hint('Das Radio läuft: Motorik 4. Dende hört nichts anderes.', 3);
    const safe = poi(m, 'safehouse');
    await m.goTo(safe.x, safe.y - 4, "Fahr zu Gül's Grill in Betonhausen", { r: 7, vehicle: gisela, stop: true });
    const gul = m.char(CAST.gul, safe.x + 1.5, safe.y + 1, 'story', -Math.PI / 2);
    void gul;
    await m.say([
      { who: 'gul', text: 'Kai Falkner. Lass dich ansehen. Deine Mutter hätte geweint – erst vor Freude, dann vor Wut.' },
      { who: 'kai', text: 'Danke, Gül. Für alles.' },
      { who: 'gul', text: 'Das Zimmer oben gehört dir. Miete zahlst du, wenn du kannst. Und du isst. Du bist dünn wie ein Dönerspieß am Sonntagabend.' },
      { who: 'dende', text: 'Ich hab morgen ein paar Lieferungen in der Siedlung … nur Kleinkram. Hilfst du mir?' },
      { who: 'kai', text: 'Wir sehen.' },
    ]);
    g.unlockSafehouse();
  },
};

const altesRevier: MissionDef = {
  id: 'revier',
  title: 'Altes Revier',
  giver: 'dende',
  start: 'safehouse',
  reward: 300,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(202);
    const safe = poi(m, 'safehouse');
    const dende = m.char(CAST.dende, safe.x + 1.5, safe.y + 1.5, 'story', -Math.PI / 2);
    await m.say([
      { who: 'dende', text: 'Drei Kunden in Betonhausen. Rein, raus, Kohle. Wie früher. Nur … legal-ish.' },
      { who: 'kai', text: 'Was ist drin?' },
      { who: 'dende', text: 'Kräutertee. Sehr, sehr entspannender Kräutertee. Ich sitz hinten, du fährst.' },
    ]);
    const car = await needCar(m, 'Hol ein Auto – Gisela oder irgendwas mit vier Rädern');
    g.removeChar(dende);
    const passenger = m.passenger(CAST.dende, car);
    m.failIf(() => passenger.vehicle !== null && passenger.vehicle.dead, 'Dende saß im Auto, als es in die Luft ging …');
    g.hud.hint('Dende steigt ein.', 1.6);
    const stops: Spot[] = [];
    for (let i = 0; i < 3; i++) {
      const prev = stops[i - 1] ?? safe;
      const s = sidewalkNear(city, prev.x, prev.y, 90, 220, rng, D.Platte) ?? sidewalkNear(city, safe.x, safe.y, 60, 260, rng)!;
      stops.push(s);
    }
    let paid = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      await m.goTo(s.x, s.y, `Lieferung ${i + 1}/3: Halt am Marker`, { r: 6, stop: true });
      m.objective('Dende liefert …');
      g.hud.hint(['Dende: „Zwei Tütchen, wie immer, Frau Kowalski."', 'Dende: „Nee, Rabatt gibt\'s nicht, Kevin."', 'Dende: „Grüß deine Oma!"'][i], 2.4);
      await m.wait(2.2);
      paid += 60;
      g.giveMoney(60);
    }
    const play = playgroundNear(city, safe.x, safe.y, D.Platte) ?? sidewalkNear(city, safe.x, safe.y, 80, 200, rng)!;
    await m.say([{ who: 'dende', text: 'Einer noch. Der Spielplatz hinter Block 7. Da wartet Ronny … glaub ich.' }]);
    await m.goTo(play.x, play.y, 'Fahr zum Spielplatz hinter Block 7', { r: 12 });
    const enemies = thugs(m, () => GANGS.neon.look(rng), { x: play.x + 6, y: play.y + 6 }, 3, [null, 'bat', null], { fleeAt: 0.3, gang: 3 });
    await m.say([
      { who: 'neon', text: 'Das hier ist jetzt NEON-Gebiet, Opa. In Betonhausen verkauft nur noch Lenny.' },
      { who: 'dende', text: 'Falke … Falke, die meinen das ernst!' },
      { who: 'kai', text: 'Bleib im Auto.' },
    ]);
    await defeat(m, enemies, 'Verjag die NEON-Typen');
    g.respect.add('neon', -10, false);
    await m.say([
      { who: 'dende', text: 'Seit wann verprügeln Pillen-Hipster Leute auf dem Spielplatz?!' },
      { who: 'kai', text: 'Seit wann verkaufst du auf dem Spielplatz?' },
      { who: 'dende', text: '… Touché. Hier, deine Hälfte. Und Onkel Herbie will dich sehen. Er hat schon dreimal angerufen.' },
    ]);
    void paid;
  },
};

const onkelHerbie: MissionDef = {
  id: 'herbie',
  title: 'Onkel Herbie',
  giver: 'herbie',
  start: 'herbie',
  reward: 1000,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(303);
    const shop = poi(m, 'herbie');
    const herbie = m.char(CAST.herbie, shop.x, shop.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'herbie', text: 'Kai, mein Junge! Komm rein, komm rein. Lass dich drücken. Ich hab jeden Tag an dich gedacht. Jeden. Tag.' },
      { who: 'kai', text: 'Das Geld, Herbie. Mein Anteil.' },
      { who: 'herbie', text: 'Die Bullen, Kai. Haben alles kassiert. Bis auf den letzten Schein. Glaub mir, ich hab genauso geblutet wie du.' },
      { who: 'herbie', text: 'Aber hier. Für alte Zeiten. Liegt seit sechs Jahren in meinem Tresor und wartet auf dich.' },
    ]);
    g.player.char.arsenal?.give('pistol', 36, true);
    g.hud.pickupText('PISTOLE +36');
    g.sound.play('pickup', undefined, undefined, 0.8);
    const lot = parkingNear(city, shop.x, shop.y, 120, 320, rng) ?? sidewalkNear(city, shop.x, shop.y, 120, 300, rng)!;
    await m.say([
      { who: 'herbie', text: 'Und damit du wieder auf die Beine kommst: Mehlhorn, der Gebrauchtwagenhändler. Schuldet mir zweitausend. Hol sie ab. Höflich. Erstmal.' },
    ]);
    g.removeChar(herbie);
    g.hud.hint('Tipp: ANGRIFF zielt automatisch auf den nächsten Gegner. Auf den Waffennamen tippen wechselt die Waffe.', 4.5);
    await m.goTo(lot.x, lot.y, 'Fahr zu Mehlhorns Gebrauchtwagenplatz', { r: 10 });
    // a few cars for sale
    for (let i = 0; i < 3; i++) m.vehicle(['passant', 'golfo', 'mercator'][i], lot.x - 6 + i * 4, lot.y + 7, Math.PI / 2, { tag: 'deko' });
    const mehl = m.char(CAST.mehlhorn, lot.x + 1, lot.y + 3, 'story', -Math.PI / 2);
    await m.say([
      { who: 'mehlhorn', text: 'Herbies neuer Laufbursche? Sag dem alten Sack, er kriegt nix. Der Markt ist hart, Kumpel.' },
      { who: 'kai', text: 'Zweitausend, Mehlhorn.' },
      { who: 'mehlhorn', text: 'Jungs! Zeigt dem Herrn den Ausgang.' },
    ]);
    g.npcs.add(mehl, { mode: 'flee', target: g.player.char });
    const goons = thugs(m, () => CAST.thug, { x: lot.x + 4, y: lot.y - 2 }, 3, ['bat', 'pistol', 'bat'], { fleeAt: 0.2 });
    await defeat(m, goons, 'Erledige Mehlhorns Schläger');
    const bag = { x: mehl.x, y: mehl.y };
    g.hud.hint('Mehlhorn hat die Geldtasche fallen lassen.', 2.5);
    await m.goTo(bag.x, bag.y, 'Schnapp dir die Geldtasche', { r: 2.2, color: 'green', gps: false });
    g.hud.pickupText('GELDTASCHE', '#7ce07c');
    g.sound.play('money', undefined, undefined, 0.8);
    await m.goTo(shop.x, shop.y + 2, 'Bring das Geld zu Herbie', { r: 5, stop: true });
    m.char(CAST.herbie, shop.x, shop.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'herbie', text: 'Mehlhorn ist weggerannt? Mit fünfundsechzig? Hah! Die Hälfte gehört dir, Junge. Siehst du? Wir sind wieder im Geschäft.' },
      { who: 'kai', text: 'Wir.' },
      { who: 'herbie', text: 'Wir. Wie früher. Komm morgen wieder, ich hab da was mit einem Abschlepphof.' },
    ]);
  },
};

const abschleppdienst: MissionDef = {
  id: 'abschlepp',
  title: 'Abschleppdienst',
  giver: 'herbie',
  start: 'herbie',
  reward: 1200,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const shop = poi(m, 'herbie');
    const herbie = m.char(CAST.herbie, shop.x, shop.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'herbie', text: 'Ein Kunde von mir hatte Pech. Sein Wagen steht im Abschlepphof neben der Polizeiwache. Schwarzer Mercator.' },
      { who: 'herbie', text: 'Im Kofferraum liegt etwas, das die Herren in Grün nicht finden sollten.' },
      { who: 'kai', text: 'Ich soll ein Auto aus einer Polizeiwache klauen.' },
      { who: 'herbie', text: 'Aus dem Hof daneben, Kai. Das ist was ganz anderes. Und bring ihn sauber her – keine Blaulichter vor meinem Laden.' },
    ]);
    g.removeChar(herbie);
    const st = g.policeStation();
    const lot = { x: st.lotX, y: st.lotY };
    // clear the spot and park the target car
    for (const v of [...g.vehicles]) if (v !== g.player.vehicle && Math.hypot(v.x - lot.x, v.y - lot.y) < 5) g.removeVehicle(v);
    const merc = m.vehicle('mercator', lot.x, lot.y, Math.PI / 2, { paint: 0x15171a, tag: 'merc' });
    merc.parked = true;
    m.failIf(() => merc.dead || merc.burning > 0, 'Der Mercator ist Schrott – und mit ihm, was im Kofferraum lag.');
    await m.goTo(lot.x, lot.y - 18, 'Fahr zum Abschlepphof der Polizeiwache', { r: 14 });
    await m.enter(merc, 'Klau den schwarzen Mercator');
    g.wanted.atLeast(2, merc.x, merc.y);
    g.hud.hint('Alarm! Häng die Polizei ab – oder ab in eine Lackiererei.', 3.5);
    // lose the cops in the Mercator
    for (;;) {
      if (g.player.vehicle !== merc) {
        await m.enter(merc, 'Steig wieder in den Mercator');
        continue;
      }
      m.objective(g.wanted.level > 0 ? 'Häng die Polizei ab (Lackiererei = grün auf dem Radar)' : 'Bring den Mercator zu Herbie');
      if (g.wanted.level === 0) break;
      await m.until(() => g.wanted.level === 0 || g.player.vehicle !== merc);
    }
    for (;;) {
      await m.goTo(shop.x, shop.y + 4, 'Bring den Mercator zu Herbie – ohne Blaulicht', { r: 6, vehicle: merc, stop: true });
      if (g.wanted.level === 0) break;
      g.hud.hint('Nicht mit den Bullen im Schlepptau!', 2);
      await m.until(() => g.wanted.level === 0);
    }
    m.char(CAST.herbie, shop.x + 1.5, shop.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'herbie', text: 'Sauber! Wie in alten Zeiten. Du warst immer der Beste hinterm Steuer, Kai.' },
      { who: 'kai', text: 'Was ist im Kofferraum?' },
      { who: 'herbie', text: 'Papiere. Langweilige Papiere. Hier, deine Prämie. Und hör zu: Uschi Brandt sucht jemanden mit ruhiger Hand. Ich hab dich empfohlen.' },
    ]);
    m.keep(merc);
    g.player.exit(merc, true);
    merc.locked = true;
    void city;
  },
};

const faustSanktPaula: MissionDef = {
  id: 'faust',
  title: 'Die Faust von Sankt Paula',
  giver: 'uschi',
  start: 'knockout',
  reward: 1500,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(505);
    const club = poi(m, 'knockout');
    const uschi = m.char(CAST.uschi, club.x, club.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'uschi', text: 'Herbies Wunderknabe. Du bist kleiner, als ich dachte.' },
      { who: 'kai', text: 'Ich fahr auch nicht im Stehen.' },
      { who: 'uschi', text: 'Hah! Frech. Gefällt mir. Drei Läden auf dem Kiez sind mit der Miete hinterher. Schutzgeld, Junge. Hol\'s ab.' },
      { who: 'uschi', text: 'Und keiner wird verletzt, der nicht ausdrücklich darum bittet. Das ist Kiez-Ehre.' },
    ]);
    g.removeChar(uschi);
    const bars = shopFronts(city, D.Kiez, club, 420, 3, 70, rng);
    while (bars.length < 3) bars.push(sidewalkNear(city, club.x, club.y, 80, 260, rng, D.Kiez) ?? { x: club.x + 60 * bars.length, y: club.y });
    let collected = 0;
    // --- 1: the landlord runs
    {
      const b = bars[0];
      await m.goTo(b.x, b.y, 'Kneipe „Zum Anker": kassieren', { r: 6, stop: true });
      const wirt = m.char(CAST.wirt, b.x + 1.5, b.y + 1, 'story', 0);
      await m.say([
        { who: 'wirt', text: 'Uschi schickt dich? Sag ihr … sag ihr, ich hab gerade … ÄH – Lieferung!' },
      ]);
      const ai = g.npcs.add(wirt, { mode: 'flee', target: g.player.char });
      ai.speed = 4.4;
      m.objective('Schnapp dir den Wirt!');
      const t = m.target({ x: () => wirt.x, y: () => wirt.y, kind: 'arrow', color: 'red', z: 1.6, gps: false });
      m.failIf(() => wirt.dead, 'Tote zahlen keine Miete.');
      await m.until(() => wirt.isDown || wirt.health < wirt.maxHealth * 0.7);
      m.untarget(t);
      ai.mode = 'idle';
      await m.wait(0.8);
      await m.say([{ who: 'wirt', text: 'Schon gut! SCHON GUT! Hier – fünfhundert. Sag Uschi, ich zahl ab jetzt pünktlich!' }]);
      collected += 500;
    }
    // --- 2: the bouncers
    {
      const b = bars[1];
      await m.goTo(b.x, b.y, 'Bar „Pik Dame": kassieren', { r: 6, stop: true });
      await m.say([{ who: 'tuersteher', text: 'Schutzgeld? Wir SIND der Schutz, Freundchen.' }]);
      const goons = thugs(m, () => CAST.tuersteher, { x: b.x + 3, y: b.y + 2 }, 2, [null], { health: 140, fleeAt: 0.25 });
      await defeat(m, goons, 'Zeig den Türstehern, wer hier schützt');
      await m.say([{ who: 'wirt', name: 'Barchefin', text: 'Okay, okay … hier sind die achthundert. Und die Jungs kriegen morgen frei.' }]);
      collected += 800;
    }
    // --- 3: payment in deposit bottles
    {
      const b = bars[2];
      await m.goTo(b.x, b.y, 'Eckkneipe „Hafenklause": kassieren', { r: 6, stop: true });
      await m.say([
        { who: 'wirt', name: 'Hafenklausen-Wirt', text: 'Bargeld hab ich keins. Aber … ich hätte hundertachtzig Pfandflaschen.' },
        { who: 'kai', text: '…' },
        { who: 'wirt', name: 'Hafenklausen-Wirt', text: 'Das sind fünfundvierzig Euro! Plus der Sack! Der Sack ist gratis!' },
      ]);
      g.hud.pickupText('180 PFANDFLASCHEN', '#7ce07c');
      collected += 45;
    }
    await m.goTo(club.x, club.y + 3, 'Zurück zu Uschi in den Club Knockout', { r: 6, stop: true });
    m.char(CAST.uschi, club.x, club.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'uschi', text: `${collected} Euro und … Pfandflaschen. Ich glaub\'s nicht. Der Kiez geht vor die Hunde.` },
      { who: 'uschi', text: 'Aber du hast niemanden umgebracht und alle haben bezahlt. Das konnten die letzten drei nicht von sich behaupten.' },
      { who: 'uschi', text: 'Komm wieder, wenn du mehr willst, Falke. Die Kiez-Kompanie vergisst nicht.' },
    ]);
    g.respect.add('kiez', 20);
  },
};

export const ACT1: MissionDef[] = [freigang, altesRevier, onkelHerbie, abschleppdienst, faustSanktPaula];

/** the whole story in order */
export const STORY: MissionDef[] = [PROLOGUE, ...ACT1];
