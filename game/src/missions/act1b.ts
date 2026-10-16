// Act 1, missions 6–10: Ticken, Turbine, Rotlicht Blaulicht, Kiezkrieg, Schwesterherz.
import type { MissionDef, MissionCtx } from './runner';
import type { Character } from '../game/character';
import type { Chaser } from '../game/chasers';
import type { GangId } from '../game/gangs';
import { RNG } from '../core/rng';
import { D, Zone } from '../world/types';
import { GANGS } from '../game/gangs';
import { lanePoint, parkingNear, sidewalkNear, canalBridge, districtSpot, walkableNear } from './places';
import { CAST, poi, needCar, deliver, spawnChasers, defeatChasers, holdAt, routeLength } from './common';

/** evening for the club missions (only moves the clock forward within the same night) */
function evening(m: MissionCtx, h: number): void {
  const c = m.g.clock;
  if (c > 6 && c < h) m.g.setClock(h);
}

// =============================================================================================
// 6 · Ticken
// =============================================================================================
const ticken: MissionDef = {
  id: 'ticken',
  title: 'Ticken',
  giver: 'dende',
  start: 'safehouse',
  reward: 400,
  async run(m) {
    const g = m.g;
    const tr = g.trade;
    const safe = poi(m, 'safehouse');
    const dende = m.char(CAST.dende, safe.x + 1.5, safe.y + 1.5, 'story', -Math.PI / 2);
    await m.say([
      { who: 'dende', text: 'Falke. Du brauchst Kohle, ich brauch Kohle. Ich zeig dir, wie man tickt – ohne dass Lenny oder Uschi dir die Finger brechen.' },
      { who: 'kai', text: 'Ich bin Fahrer. Kein Dealer.' },
      { who: 'dende', text: 'Eben! Ein Dealer mit Auto ist ein Dealer mit Zukunft. Regel eins: billig einkaufen. Bodo in den Wallanlagen hat Gras wie Heu.' },
      { who: 'dende', text: 'Regel zwei: dort verkaufen, wo sie gut zahlen. Regel drei: nie mit den Bullen im Nacken. Wenn die dich schnappen, ist die Ware weg.' },
    ]);
    g.removeChar(dende);
    tr.allowInMission = true;
    if (g.money < 200) g.giveMoney(200 - Math.floor(g.money));
    const wall = tr.dealerSpot('wall')!;
    const platte = tr.dealerSpot('platte')!;
    await m.goTo(wall.x, wall.y, 'Fahr zu Bodo in die Wallanlagen (grüner Kreis)', { r: 22 });
    // buy
    const t1 = m.target({ x: () => wall.x, y: () => wall.y, r: 1.6, color: 'green', gps: false });
    m.objective('Geh zu Bodo und kauf mindestens 10× Gras');
    g.hud.hint('Zu Fuß in den grünen Kreis: Handelsmenü. „+5" kauft fünf Stück.', 4);
    await m.until(() => tr.dealing.carry.gras >= 10 && !g.shop.isOpen);
    m.untarget(t1);
    // the phone tip
    tr.dealing.tips.push({ dealer: 'platte', good: 'gras', factor: 2, until: g.time + 600, text: 'Ronny: Betonhausen trocken. Ich zahl das Doppelte für Gras!' });
    g.sound.play('sms', undefined, undefined, 0.8);
    g.hud.phone('Dende', 'Ronny in Betonhausen zahlt gerade doppelt für Gras. Lauf, Forrest!', 7);
    await m.wait(1.2);
    await m.goTo(platte.x, platte.y, 'Fahr nach Betonhausen zu Ronny', { r: 22 });
    const t2 = m.target({ x: () => platte.x, y: () => platte.y, r: 1.6, color: 'green', gps: false });
    m.objective('Verkauf dein Gras bei Ronny');
    await m.until(() => tr.dealing.carry.gras === 0 && !g.shop.isOpen);
    m.untarget(t2);
    m.char(CAST.dende, platte.x + 2, platte.y + 1.5, 'story', Math.PI);
    await m.say([
      { who: 'dende', text: 'Siehst du? Doppelt so viel raus wie rein. Das ist BWL, Alter.' },
      { who: 'dende', text: 'Fünf Sorten gibt\'s: Gras, Pillen, Ket, Crystal, Koks. Jeder Ticker hat seine Preise. Tipps kommen aufs Handy.' },
      { who: 'dende', text: 'Und pass auf Zivilfahnder auf. Manche Ticker sind Bullen in Jogginghosen.' },
      { who: 'kai', text: 'Und Kalle? Der mit den Waffen?' },
      { who: 'dende', text: 'Kleingärten hinter der Siedlung. Lila K auf dem Radar. Bei Kalle gibt\'s auch größere Taschen für mehr Ware.' },
    ]);
    tr.dealing.unlocked = true;
    tr.dealing.tipT = 45;
    g.hud.hint('Neu: Dealer (€ auf dem Radar). Billig kaufen, teuer verkaufen.', 5);
  },
};

// =============================================================================================
// 7 · Turbine
// =============================================================================================
const turbine: MissionDef = {
  id: 'turbine',
  title: 'Turbine',
  giver: 'lenny',
  start: 'turbine',
  reward: 1800,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(707);
    const club = poi(m, 'turbine');
    evening(m, 20.5);
    const lenny = m.char(CAST.lenny, club.x, club.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'lenny', text: 'Kai „Falke" Falkner. Der Mann, die Legende, der Fluchtwagen. Lennart. Founder. NEON.' },
      { who: 'kai', text: 'Dende sagt, du zahlst gut.' },
      { who: 'lenny', text: 'Ich zahle marktgerecht. Mein Problem: Die Lieferung steht in einer Garage im Bahnhofsviertel, und um elf öffnen die Türen.' },
      { who: 'lenny', text: 'Ohne Pillen ist meine Party nur ein sehr teures Kraftwerk. Und Uschis Leute schnüffeln seit Tagen herum. Also: schnell, sauber, skalierbar.' },
      { who: 'kai', text: 'Skalierbar.' },
      { who: 'lenny', text: 'Das sag ich zu allem. Los.' },
    ]);
    g.removeChar(lenny);
    const hbf = poi(m, 'hbf');
    const lot = parkingNear(city, hbf.x - 40, hbf.y - 10, 50, 220, rng) ?? sidewalkNear(city, hbf.x, hbf.y, 60, 220, rng)!;
    const spot = lanePoint(city, lot.x, lot.y, 40) ?? { x: lot.x, y: lot.y, h: 0 };
    for (const v of [...g.vehicles]) if (v !== g.player.vehicle && Math.hypot(v.x - spot.x, v.y - spot.y) < 6) g.removeVehicle(v);
    const van = m.vehicle('sprinto', spot.x, spot.y, spot.h, { paint: 0x15171a, tag: 'pillen' });
    van.health = van.maxHealth = 340;
    van.parked = true;
    m.failIf(() => van.dead || van.burning > 2, 'Die Ware ist in Rauch aufgegangen. Lenny wird das nicht mögen.');
    await m.goTo(spot.x, spot.y, 'Fahr zur Garage im Bahnhofsviertel', { r: 16 });
    await m.enter(van, 'Steig in den schwarzen Lieferwagen');
    const door = lanePoint(city, club.x, club.y - 6, 40) ?? { x: club.x, y: club.y - 6, h: 0 };
    const dist = routeLength(m, van.x, van.y, door.x, door.y);
    const timer = m.timer(Math.max(65, Math.round(dist / 10.5 + 18)), 'Türen öffnen in');
    g.hud.hint('Die Türen öffnen bald – Gas!', 2.5);
    // Uschi's people get wind of it
    let chasers: Chaser[] = [];
    void (async () => {
      await m.wait(6);
      g.sound.play('sms', undefined, undefined, 0.8);
      g.hud.phone('Lenny', 'Die Kiez-Kompanie ist hinter dir! Nicht anhalten!', 6);
      const kiez = GANGS.kiez;
      chasers = spawnChasers(m, 2, ['golfo', 'passant'], { crew: [kiez.look(rng), kiez.look(rng)], weapons: ['bat', 'pistol'], accuracy: 0.22, ram: true, gang: kiez.index, crewHealth: 70 }, rng);
      if (chasers[1]) chasers[1].ram = false;
    })().catch(() => {});
    await deliver(m, van, door.x, door.y, 'Bring die Pillen zur Turbine – bevor die Türen öffnen!', { r: 8, stop: true, back: 'Zurück in den Lieferwagen!' });
    timer.stop();
    for (const ch of chasers) if (ch.mode !== 'out') ch.mode = 'hold';
    m.char(CAST.lenny, club.x, club.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'lenny', text: 'Pünktlich wie ein Algorithmus! Hier, dein Anteil.' },
      { who: 'lenny', text: 'Und Falke – Uschi muss nicht wissen, wer gefahren ist. Diskretion ist unser Kernwert.' },
      { who: 'kai', text: 'Sie wird es rausfinden.' },
      { who: 'lenny', text: 'Dann haben wir ein Kommunikationsproblem. Die löse ich mit Geld.' },
    ]);
    g.respect.add('neon', 15);
    g.hud.hint('Kalle hat jetzt eine Maschinenpistole im Angebot.', 3.5);
  },
};

// =============================================================================================
// 8 · Rotlicht, Blaulicht
// =============================================================================================
const rotlicht: MissionDef = {
  id: 'rotlicht',
  title: 'Rotlicht, Blaulicht',
  giver: 'herbie',
  start: 'herbie',
  reward: 2000,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(808);
    const shop = poi(m, 'herbie');
    const herbie = m.char(CAST.herbie, shop.x, shop.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'herbie', text: 'Kai, mein Junge. Ein kleiner Botengang: Ein Kunde in Betonhausen wartet auf seinen Wagen. Ein Passant, frisch aus der Werkstatt.' },
      { who: 'herbie', text: 'Fahr ihn rüber, kassier zweitausend, fertig.' },
      { who: 'kai', text: 'Und der Haken?' },
      { who: 'herbie', text: 'Kein Haken. Nur ein alter Mann, der nicht mehr gern Auto fährt.' },
    ]);
    g.removeChar(herbie);
    const sp = lanePoint(city, shop.x + 8, shop.y + 10, 40) ?? { x: shop.x, y: shop.y + 8, h: 0 };
    for (const v of [...g.vehicles]) if (v !== g.player.vehicle && Math.hypot(v.x - sp.x, v.y - sp.y) < 6) g.removeVehicle(v);
    const car = m.vehicle('passant', sp.x, sp.y, sp.h, { paint: 0x7a1e22, tag: 'herbie' });
    car.parked = true;
    await m.enter(car, 'Steig in den roten Passant');
    const safe = poi(m, 'safehouse');
    const lot = parkingNear(city, safe.x + 30, safe.y - 40, 40, 170, rng) ?? sidewalkNear(city, safe.x, safe.y, 60, 180, rng)!;
    const dest = lanePoint(city, lot.x, lot.y, 40) ?? { x: lot.x, y: lot.y, h: 0 };
    for (;;) {
      await deliver(m, car, dest.x, dest.y, 'Bring den Passant zum Kunden nach Betonhausen', { r: 7, stop: true, back: 'Zurück in den Passant!' });
      if (g.wanted.level === 0) break;
      g.hud.hint('Erst die Polizei abhängen – der Kunde will keinen Ärger.', 2.5);
      await m.until(() => g.wanted.level === 0);
    }
    // the stop
    g.wanted.clear();
    car.body.setLinearVelocity({ x: 0, y: 0 });
    const behind = car.localToWorld(-car.def.length / 2 - 4.2, 0);
    const ahead = car.localToWorld(car.def.length / 2 + 4.4, 0.4);
    for (const v of [...g.vehicles]) if (v !== car && (Math.hypot(v.x - behind.x, v.y - behind.y) < 4 || Math.hypot(v.x - ahead.x, v.y - ahead.y) < 4)) g.removeVehicle(v);
    const cop1 = m.vehicle('polizei', behind.x, behind.y, car.angle, { tag: 'deko', locked: true });
    const cop2 = m.vehicle('zivil', ahead.x, ahead.y, car.angle + Math.PI * 0.85, { tag: 'deko', locked: true, paint: 0x22262c });
    cop1.sirenOn = cop2.sirenOn = true;
    cop1.lightsOn = cop2.lightsOn = true;
    g.sound.play('siren', car.x, car.y, 0.7);
    g.camera.addShake(0.2);
    await m.wait(0.8);
    g.player.exit(car, true);
    car.locked = true;
    const door = car.localToWorld(0.3, car.def.width / 2 + 1.6);
    const ruh = m.char(CAST.ruhland, door.x + 1.2, door.y + 0.6, 'story', car.angle - Math.PI / 2);
    m.char(CAST.cop, behind.x + 1.5, behind.y + 1.2, 'cop', car.angle);
    void ruh;
    await m.say([
      { who: 'cop', text: 'Allgemeine Verkehrskontrolle. Hände aufs Dach, bitte.' },
      { who: 'ruhland', text: 'Kai Falkner. Sechs Jahre drin, sechs Wochen draußen – und schon wieder unterwegs. Kriminalhauptkommissar Ruhland, LKA.' },
      { who: 'ruhland', text: 'Was haben wir denn da im Handschuhfach? Eine Pistole. Tsk. Artikel 2 Grundgesetz: Recht auf Leben und körperliche Unversehrtheit. Von Freiheit steht da nichts.' },
      { who: 'kai', text: 'Die gehört nicht mir.' },
      { who: 'ruhland', text: 'Sagen alle. Bewährungsverstoß plus Waffe, das sind fünf Jahre. Oder … wir werden Freunde.' },
      { who: 'kai', text: 'Was wollen Sie?' },
      { who: 'ruhland', text: 'Gleich verlässt ein Transporter den Hof der Polizeiwache. Beweismittel, auf dem Weg zur Staatsanwaltschaft. Die sollen dort nie ankommen.' },
      { who: 'ruhland', text: 'Sie bringen mir den Wagen zum Parkdeck am Hauptbahnhof, und ich vergesse die Pistole. Den Passant behalte ich. Als Pfand.' },
    ]);
    await g.fade(true, 0.5);
    g.removeVehicle(cop1);
    g.removeVehicle(cop2);
    g.removeVehicle(car);
    for (const c of [...g.chars]) if (c.role === 'cop' && Math.hypot(c.x - g.player.x, c.y - g.player.y) < 12 && !c.dead) g.removeChar(c);
    g.removeChar(ruh);
    await g.fade(false, 0.5);
    await m.say([{ who: 'caption', text: 'Woher wusste Ruhland, in welchem Auto Kai sitzt? … Das wusste nur einer.' }]);
    // the evidence van
    const st = g.policeStation();
    for (const v of [...g.vehicles]) if (v !== g.player.vehicle && Math.hypot(v.x - st.lotX, v.y - st.lotY) < 7) g.removeVehicle(v);
    const vanCh = m.chaser('beweis', st.lotX, st.lotY, Math.PI / 2, { crew: [CAST.cop, CAST.cop], mode: 'hold', hostile: false, bailAt: 0.7, ram: false, driveBy: false, role: 'cop', health: 180 });
    const van = vanCh.v;
    van.missionTag = 'beweis';
    van.lightsOn = true;
    // the prosecutor's office: the farthest of a few places across the Südstadt
    const cands = ['knockout', 'wallpark', 'paint1', 'herbie', 'hbf'].map((id) => g.city.pois.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    cands.sort((a, b) => Math.hypot(b.x - st.lotX, b.y - st.lotY) - Math.hypot(a.x - st.lotX, a.y - st.lotY));
    const goal = cands.find((p) => Math.hypot(p.x - st.lotX, p.y - st.lotY) < 650) ?? cands[0];
    const sta = lanePoint(city, goal.x + 20, goal.y + 18, 60) ?? { x: goal.x, y: goal.y, h: 0 };
    m.failIf(() => van.dead || van.burning > 3, 'Die Beweise sind verbrannt. Ruhland wird das gar nicht gefallen.');
    m.failIf(() => vanCh.arrived && g.player.vehicle !== van, 'Zu spät – der Transporter hat die Staatsanwaltschaft erreicht.');
    const vt = m.target({ x: () => van.x, y: () => van.y, kind: 'arrow', color: 'red', r: 3, gps: true });
    const leave = m.timer(Math.round(Math.max(45, routeLength(m, g.player.x, g.player.y, van.x, van.y) / 12 + 25)), 'Abfahrt in', false);
    m.objective('Besorg dir ein Auto und schnapp dir den Polizeitransporter');
    await m.until(() => leave.left() <= 0 || g.player.vehicle === van || Math.hypot(g.player.x - van.x, g.player.y - van.y) < 22);
    leave.stop();
    if (g.player.vehicle !== van) {
      g.chasers.goto(vanCh, sta.x, sta.y, 0.6);
      g.hud.hint('Der Transporter fährt los! Ramm ihn, bis der Fahrer aufgibt – oder zieh ihn raus.', 4);
      m.objective('Stopp den Transporter, bevor er die Staatsanwaltschaft erreicht!');
      const st2 = m.target({ x: () => sta.x, y: () => sta.y, r: 6, color: 'red', gps: false, primary: false });
      await m.until(() => g.player.vehicle === van);
      m.untarget(st2);
    }
    m.untarget(vt);
    g.wanted.atLeast(3, van.x, van.y);
    const deck = poi(m, 'ruhland');
    const park = lanePoint(city, deck.x, deck.y, 40) ?? { x: deck.x, y: deck.y, h: 0 };
    await deliver(m, van, park.x, park.y, 'Bring den Transporter zu Ruhland (Parkdeck am Hauptbahnhof)', { r: 8, stop: true, back: 'Zurück in den Transporter!' });
    g.player.exit(van, true);
    van.locked = true;
    m.char(CAST.ruhland, park.x + 2, park.y + 2, 'story', Math.PI);
    g.wanted.clear();
    await m.say([
      { who: 'ruhland', text: 'Pünktlich. Ich mag pünktliche Menschen. Die Kollegen haben übrigens gerade woanders zu tun.' },
      { who: 'kai', text: 'Und meine Pistole?' },
      { who: 'ruhland', text: 'Liegt in meiner Schublade. Neben Ihrer Akte. Wir hören voneinander, Falkner.' },
    ]);
    g.hud.hint('Ruhland hat die Fahndung abgeblasen. Bei Kalle gibt es jetzt Schrotflinten.', 4);
  },
};

// =============================================================================================
// 9 · Kiezkrieg
// =============================================================================================
const kiezkrieg: MissionDef = {
  id: 'kiezkrieg',
  title: 'Kiezkrieg',
  giver: 'ruhland',
  start: 'ruhland',
  reward: 2500,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(909);
    const deck = poi(m, 'ruhland');
    evening(m, 21);
    const ruh = m.char(CAST.ruhland, deck.x, deck.y + 1.2, 'story', -Math.PI / 2);
    await m.say([
      { who: 'ruhland', text: 'Falkner. Wir haben ein Problem mit dem Frieden auf dem Kiez. Er ist zu friedlich.' },
      { who: 'ruhland', text: 'In der Tüte sind NEON-Pillen. Grün, mit dem kleinen Blitz. Die verstecken Sie im Club Knockout, hinten beim Lieferanteneingang.' },
      { who: 'kai', text: 'Uschi bringt mich um.' },
      { who: 'ruhland', text: 'Uschi wird nie erfahren, dass es Sie gibt. Danach gibt es eine Razzia, und alle zeigen auf Lenny.' },
      { who: 'ruhland', text: 'Gewaltmonopol, Falkner. Ich verteile die Gewalt nur neu.' },
    ]);
    g.removeChar(ruh);
    g.hud.pickupText('NEON-PILLEN', '#2ad85a');
    const club = poi(m, 'knockout');
    const back = g.city.pois.get('knockout_back') ?? walkableNear(city, club.x, club.y + 30, 30)!;
    m.char(CAST.tuersteher, club.x - 1.5, club.y - 1, 'story', -Math.PI / 2);
    await m.goTo(back.x, back.y, 'Zum Hinterausgang vom Club Knockout – zu Fuß', { r: 2, foot: true, color: 'green' });
    await holdAt(m, back.x, back.y, 2.2, 2.2, 'Bleib am Hintereingang stehen', 'Pillen verstecken …');
    g.hud.pickupText('VERSTECKT', '#2ad85a');
    m.objective('Verschwinde vom Kiez');
    await m.until(() => Math.hypot(g.player.x - club.x, g.player.y - club.y) > 90);
    await m.say([{ who: 'caption', text: 'Zwei Stunden später. Blaulicht vor dem Club Knockout.' }]);
    g.setClock((g.clock + 2) % 24);
    await m.call([
      { who: 'ruhland', text: 'Razzia gelaufen. Uschi tobt, Lenny schwört auf seine Mutter. Und jetzt: Popcorn.' },
    ]);
    await m.wait(1.5);
    await m.call([
      { who: 'uschi', text: 'Falke! Diese NEON-Ratten haben mir Pillen in den Laden gelegt – die Bullen haben mir den Club dichtgemacht!' },
      { who: 'uschi', text: 'Und jetzt kommen Lennys Leute mit Molotows. Ich brauch jeden Mann. Hilfst du mir?' },
    ]);
    await m.call([
      { who: 'lenny', text: 'Falke. Uschi hat drei meiner Leute krankenhausreif geprügelt. Die Turbine ist ihr nächstes Ziel.' },
      { who: 'lenny', text: 'Ich brauche jemanden mit Erfahrung. Doppelter Tagessatz. Bist du dabei?' },
    ]);
    const pick = await m.choose({ who: 'kai', text: 'Zwei Anrufe. Eine Nacht. Auf wessen Seite stehst du?' }, ['Uschi helfen – Club Knockout verteidigen', 'Lenny helfen – die Turbine verteidigen']);
    const side: GangId = pick === 0 ? 'kiez' : 'neon';
    const enemy: GangId = side === 'kiez' ? 'neon' : 'kiez';
    const placeId = side === 'kiez' ? 'knockout' : 'turbine';
    const place = poi(m, placeId);
    await m.goTo(place.x, place.y - 2, side === 'kiez' ? 'Fahr zum Club Knockout' : 'Fahr zur Turbine', { r: 16 });
    // the defenders
    const allies: Character[] = [];
    for (let i = 0; i < 2; i++) {
      const c = m.char(GANGS[side].look(rng), place.x + (i ? 2.5 : -2.5), place.y - 1.5, 'gang', -Math.PI / 2);
      g.npcs.add(c, { mode: 'guard', target: null, weapon: i ? 'pistol' : 'bat', accuracy: 0.5, health: 160, aggro: 0, gang: GANGS[side].index });
      allies.push(c);
    }
    await m.say([
      { who: side === 'kiez' ? 'tuersteher' : 'neon', text: side === 'kiez' ? 'Der Falke! Uschi sagt, du bist einer von uns. Hier, zieh die Weste an – da kommen sie!' : 'Lenny meinte, du kommst. Respekt. Nimm dir die Weste – da vorne, sie kommen!' },
    ]);
    g.pickups.drop(place.x + 1.5, place.y - 3, 'armor', null, 100);
    g.pickups.drop(place.x - 1.5, place.y - 3, 'health', null, 50);
    // waves
    const eg = GANGS[enemy];
    const crewLook = (): ReturnType<typeof eg.look> => eg.look(rng);
    const all: Chaser[] = [];
    let alliesT = 0;
    const retarget = (): void => {
      const foes = all.flatMap((ch) => ch.crew).filter((c) => !c.dead && !c.hidden && g.chars.includes(c));
      for (const a of allies) {
        const ai = a.ai as { mode: string; target: Character | null } | null;
        if (!ai || a.dead || ai.mode === 'flee') continue;
        let best: Character | null = null;
        let bd = 26;
        for (const f of foes) {
          const d = Math.hypot(f.x - a.x, f.y - a.y);
          if (d < bd) {
            bd = d;
            best = f;
          }
        }
        if (best) {
          ai.mode = 'attack';
          ai.target = best;
          a.hostile = true;
        } else if (ai.mode === 'attack') {
          ai.mode = 'guard';
          ai.target = null;
        }
      }
    };
    void (async () => {
      for (;;) {
        await m.wait(0.5);
        alliesT += 0.5;
        retarget();
      }
    })().catch(() => {});
    const opts = { gang: eg.index, accuracy: 0.24, ram: false, crewHealth: 80 };
    all.push(...spawnChasers(m, 2, enemy === 'neon' ? ['golfo', 'mantis'] : ['passant', 'b5'], { ...opts, crew: [crewLook(), crewLook()], weapons: ['molotov', enemy === 'neon' ? 'smg' : 'pistol'] }, rng, 60, 110));
    await defeatChasers(m, all, [], side === 'kiez' ? 'Verteidige den Club Knockout!' : 'Verteidige die Turbine!');
    g.pickups.drop(place.x, place.y - 3.5, 'health', null, 50);
    g.hud.hint('Durchatmen – Erste-Hilfe-Kasten am Eingang. Gleich kommt noch ein Wagen!', 3);
    await m.wait(5);
    const wave2 = spawnChasers(m, 1, ['quadro'], { ...opts, crew: [crewLook(), crewLook(), crewLook()], weapons: ['bat', 'molotov', enemy === 'neon' ? 'smg' : 'pistol'] }, rng, 60, 110);
    all.push(...wave2);
    await defeatChasers(m, wave2, [], 'Erledige den Rest!');
    void alliesT;
    g.respect.add(side, 20);
    g.respect.add(enemy, -8, false);
    g.flags.add('gangwar');
    g.flags.add(side === 'kiez' ? 'side_kiez' : 'side_neon');
    await m.say(
      side === 'kiez'
        ? [{ who: 'uschi', text: 'Hab alles gesehen, Falke. Das vergisst dir der Kiez nicht. Und Lenny … Lenny ist ab heute Freiwild.' }]
        : [{ who: 'lenny', text: 'Deal closed. Willkommen im Board, Falke. Uschis Zeit ist vorbei – das ist jetzt unser Markt.' }],
    );
    await m.call([
      { who: 'ruhland', text: 'Krieg ist gut fürs Geschäft, Falkner. Ab jetzt schießen die sich gegenseitig ab, und ich schreibe die Berichte.' },
      { who: 'kai', text: 'Und wenn ich auspacke?' },
      { who: 'ruhland', text: 'Dann packe ich die Pistole aus. Gute Nacht.' },
    ]);
    await m.wait(2);
    await m.call([
      { who: 'lena', text: '… Kai? Ich bin\'s.' },
      { who: 'kai', text: 'Lena.' },
      { who: 'lena', text: 'Sag nichts. Ich rufe nicht an, weil ich dir verziehen habe. Ich brauche einen Fahrer, der den Mund hält.' },
      { who: 'lena', text: 'Lauterblick-Redaktion, Bahnhofsviertel. Komm, wenn du kannst.' },
      { who: 'kai', text: 'Ich bin da.' },
    ]);
    g.hud.hint('Auf dem Kiez herrscht jetzt Krieg: Kiez-Kompanie und NEON gehen aufeinander los.', 4.5);
  },
};

// =============================================================================================
// 10 · Schwesterherz
// =============================================================================================
const schwesterherz: MissionDef = {
  id: 'schwester',
  title: 'Schwesterherz',
  giver: 'lena',
  start: 'lauterblick',
  reward: 3000,
  async run(m) {
    const g = m.g;
    const city = g.city;
    const rng = new RNG(1010);
    const office = poi(m, 'lauterblick');
    evening(m, 21.5);
    const lenaC = m.char(CAST.lena, office.x, office.y + 1, 'story', -Math.PI / 2);
    await m.say([
      { who: 'lena', text: 'Du siehst alt aus.' },
      { who: 'kai', text: 'Danke. Du … nicht.' },
      { who: 'lena', text: 'Spar dir das. Ich treffe einen Informanten aus dem Hafen. Er hat Unterlagen über „Hafenkrone" – das Prestigeprojekt von Dr. Achterberg.' },
      { who: 'lena', text: 'Weil die Kanalbrücken seit Monaten hochgeklappt sind, kommt er mit dem Boot. Du fährst, ich rede, und du stellst keine Fragen.' },
      { who: 'kai', text: 'Wie früher.' },
      { who: 'lena', text: 'Früher hast du mich zur Schule gefahren. Dann warst du weg. Und Mama auch.' },
    ]);
    const car = await needCar(m, 'Hol ein Auto für dich und Lena');
    g.removeChar(lenaC);
    const lena = m.passenger(CAST.lena, car);
    g.hud.hint('Lena steigt ein.', 1.6);
    m.failIf(() => car.dead, 'Lena saß im Auto …');
    m.failIf(() => lena.dead, 'Lena ist tot.');
    const br = canalBridge(city, office.x, office.y);
    // on the canal road west of the bridge, heading towards it (the escape goes straight across)
    const meet = lanePoint(city, br.x - 48, br.y + 24, 30, 0) ?? lanePoint(city, br.x, br.y + 30, 60)!;
    await deliver(m, car, meet.x, meet.y, 'Fahr zum Treffpunkt am Hafenkanal', { r: 9, stop: true, back: 'Zurück zu Lena ins Auto!' });
    await m.wait(1.2);
    await m.say([
      { who: 'lena', text: 'Hier sollte er sein. Da hinten, am Kai …' },
      { who: 'kai', text: 'Kein Boot.' },
    ]);
    // the ambush
    const crew = (): typeof CAST.kronwache => ({ ...CAST.kronwache, skin: rng.pick([0xf2d0b6, 0xe0b090, 0xc08060, 0x9a6444]) });
    const kw = { crew: [crew(), crew()], weapons: ['pistol', 'smg'] as ('pistol' | 'smg')[], accuracy: 0.2, ram: true, health: 240, crewHealth: 110, bailAt: 0.25 };
    const suvs = spawnChasers(m, 2, ['kronwache'], kw, rng, 60, 110);
    if (suvs[1]) suvs[1].ram = false;
    await m.wait(2.5);
    await m.say([
      { who: 'kronwache', text: 'Frau Falkner. Herr Dr. Achterberg lässt fragen, ob Sie Ihre Recherche nicht lieber einstellen möchten.' },
      { who: 'lena', text: 'Kai … das ist eine Falle.' },
      { who: 'kai', text: 'Anschnallen.' },
    ]);
    m.objective('Häng die Kronwache ab!');
    const t0 = m.time;
    await m.until(() => m.time - t0 > 9 || Math.hypot(g.player.x - meet.x, g.player.y - meet.y) > 70);
    // the bascule bridges come down
    g.physics.unlockZone(Zone.Hafen);
    g.sound.play('ring', undefined, undefined, 0.4);
    g.hud.center('BRÜCKEN RUNTER', 2.2, '#f6e27a');
    await m.say([{ who: 'lena', text: 'Die Brücken! Sie gehen runter! Rüber in den Freihafen – ich kenn da ein Lagerhaus!' }]);
    suvs.push(...spawnChasers(m, 1, ['kronwache'], { ...kw, crew: [crew(), crew(), crew()], weapons: ['pistol', 'smg', 'smg'], ram: false, accuracy: 0.18 }, rng, 70, 120));
    const hideSpot = districtSpot(city, D.Hafen, br.x, br.y - 150, 0, 90, rng) ?? districtSpot(city, D.Hafen, br.x, br.y - 120, 0, 250, rng)!;
    const hide = lanePoint(city, hideSpot.x, hideSpot.y, 60) ?? { ...hideSpot, h: 0 };
    await deliver(m, car, hide.x, hide.y, 'Bring Lena über die Brücke ins Lagerhaus im Freihafen', { r: 9, stop: true, back: 'Zurück zu Lena ins Auto!' });
    for (const ch of suvs) if (ch.mode !== 'out') ch.mode = 'hold';
    await m.say([
      { who: 'caption', text: 'Ein leeres Lagerhaus im Freihafen. Regen auf dem Wellblechdach.' },
      { who: 'lena', text: 'Hier sind wir sicher. Das Lager gehört einer Freundin.' },
      { who: 'lena', text: 'Weißt du, wer die Kronwache bezahlt? Achterberg. Innensenator, Bürgermeisterkandidat, Bauherr von Hafenkrone.' },
      { who: 'lena', text: 'Und laut meinem Informanten der Mann, der das Kokain durch den Hafen schleust. „Hafengold" nennen sie es.' },
      { who: 'kai', text: 'Achterberg.' },
      { who: 'lena', text: 'Und noch was. Das Geld von damals, von der A 26 … Mein Informant sagt, damit hat Achterberg angefangen.' },
      { who: 'kai', text: '…' },
      { who: 'lena', text: 'Ich bleibe dran. Mit dir oder ohne dich.' },
      { who: 'kai', text: 'Mit mir.' },
    ]);
    await m.title('ENDE AKT 1', 'Freihafen & Rostwerk sind jetzt offen', 3.6);
  },
};

export const ACT1B: MissionDef[] = [ticken, turbine, rotlicht, kiezkrieg, schwesterherz];
