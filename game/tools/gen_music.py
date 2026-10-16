#!/usr/bin/env python3
"""Procedurally composed radio stations for HAFENGOLD.

Every station is an original, seamlessly looping piece generated from a seed: drum patterns,
chord progressions, bass lines and melodies are composed by small rule sets per genre and rendered
with simple subtractive synthesis (polyBLEP oscillators, envelopes, noise drums, FFT reverb).

Usage: python3 tools/gen_music.py public/audio
"""
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy import signal

SR = 32000
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'
os.makedirs(OUT, exist_ok=True)


# ----------------------------------------------------------------------------------------------
# DSP helpers
# ----------------------------------------------------------------------------------------------
def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def polyblep(t, dt):
    out = np.zeros_like(t)
    a = t < dt
    x = t[a] / dt[a] if np.ndim(dt) else t[a] / dt
    out[a] = x + x - x * x - 1
    b = t > 1 - dt if np.ndim(dt) == 0 else t > 1 - dt
    x = (t[b] - 1) / (dt[b] if np.ndim(dt) else dt)
    out[b] = x * x + x + x + 1
    return out


def osc(kind, freq, n, phase0=0.0):
    """freq: scalar or array (Hz)."""
    f = np.full(n, float(freq)) if np.ndim(freq) == 0 else freq
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    if kind == 'sine':
        return np.sin(2 * np.pi * ph)
    if kind == 'tri':
        return 2 * np.abs(2 * ph - 1) - 1
    if kind == 'saw':
        return 2 * ph - 1 - polyblep(ph, dt)
    if kind == 'square':
        s1 = 2 * ph - 1 - polyblep(ph, dt)
        ph2 = (ph + 0.5) % 1.0
        s2 = 2 * ph2 - 1 - polyblep(ph2, dt)
        return (s1 - s2) * 0.5
    raise ValueError(kind)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.08, gate=None):
    gate = n if gate is None else min(n, gate)
    env = np.zeros(n)
    ia = max(1, int(a * SR))
    idd = max(1, int(d * SR))
    ir = max(1, int(r * SR))
    t = np.arange(n)
    env = np.where(t < ia, t / ia, 0.0)
    m = (t >= ia) & (t < ia + idd)
    env[m] = 1 - (1 - s) * (t[m] - ia) / idd
    m = (t >= ia + idd) & (t < gate)
    env[m] = s
    m = t >= gate
    level = env[gate - 1] if gate - 1 < n and gate > 0 else s
    env[m] = level * np.exp(-(t[m] - gate) / ir)
    return env


def lp(x, fc, order=2):
    fc = min(fc, SR * 0.45)
    return signal.sosfilt(signal.butter(order, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)


def env_filter(x, lo, hi, env):
    """Cheap filter envelope: crossfade between a dark and a bright static filter."""
    return lp(x, lo) * (1 - env) + lp(x, hi) * env


class Mix:
    def __init__(self, seconds, tail=3.0):
        self.L = int(seconds * SR)
        self.buf = np.zeros(self.L + int(tail * SR))
        self.send = np.zeros_like(self.buf)

    def add(self, t, x, gain=1.0, rev=0.0):
        i = int(t * SR)
        if i >= len(self.buf):
            return
        n = min(len(x), len(self.buf) - i)
        self.buf[i:i + n] += x[:n] * gain
        if rev > 0:
            self.send[i:i + n] += x[:n] * gain * rev

    def render(self, rng, room=1.4, wet=0.25):
        n = int(room * SR)
        t = np.arange(n) / SR
        ir = rng.standard_normal(n) * np.exp(-t / (room / 5))
        ir = lp(ir, 5500)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
        wetsig = signal.fftconvolve(self.send, ir)[: len(self.buf)]
        out = self.buf + wetsig * wet
        # wrap the tail around so the loop is seamless
        L = self.L
        tail = out[L:]
        out = out[:L].copy()
        out[: len(tail)] += tail[: L]
        return out


# ----------------------------------------------------------------------------------------------
# drums
# ----------------------------------------------------------------------------------------------
def kick(rng, punch=1.0, decay=0.28, f0=150, f1=46):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay)
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t / 0.002) * 0.25 * punch
    return np.tanh((x + click) * 1.6) * 0.9


def snare(rng, tone=190, decay=0.14, noise=0.8):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * tone * t) * np.exp(-t / 0.06)
    nz = bp(rng.standard_normal(n), 1200, 8000) * np.exp(-t / decay)
    return (body * 0.6 + nz * noise) * 0.8


def clap(rng):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    nz = bp(rng.standard_normal(n), 900, 3200)
    env = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        env[i:] += np.exp(-(t[: n - i]) / 0.008) * (0.8 if k < 2 else 1.0)
    env += np.exp(-np.maximum(0, t - 0.022) / 0.11) * 0.5 * (t > 0.022)
    return nz * env * 0.7


def hat(rng, open_=False):
    n = int((0.5 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 7000, 2)
    return x * np.exp(-t / (0.22 if open_ else 0.022)) * 0.35


def rim(rng):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1650 * t) * np.exp(-t / 0.012) + hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004)) * 0.4


def tom(rng, f=110):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    ff = f * (1 + 0.5 * np.exp(-t / 0.05))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-t / 0.22) * 0.7


def shaker(rng):
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 5000) * np.sin(np.pi * t / t[-1]) ** 2 * 0.18


# ----------------------------------------------------------------------------------------------
# instruments
# ----------------------------------------------------------------------------------------------
def synth_note(kind, midi, dur, rng, a=0.005, d=0.12, s=0.6, r=0.1, cut_lo=600, cut_hi=4000, fenv_tau=0.12, detune=0.0, vib=0.0, sub=0.0):
    n = int((dur + r * 4) * SR)
    f = mtof(midi)
    if vib:
        t = np.arange(n) / SR
        freq = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.3))
    else:
        freq = f
    x = osc(kind, freq, n, rng.random())
    if detune:
        x = 0.5 * x + 0.5 * osc(kind, freq * (1 + detune) if np.ndim(freq) == 0 else freq * (1 + detune), n, rng.random())
    if sub:
        x = x + sub * osc('sine', f / 2, n)
    env = adsr(n, a, d, s, r, gate=int(dur * SR))
    t = np.arange(n) / SR
    fenv = np.exp(-t / fenv_tau)
    x = env_filter(x, cut_lo, cut_hi, fenv)
    return x * env


def chord_pad(midis, dur, rng, kind='saw', cut=1800, a=0.25, r=0.6):
    out = None
    for m in midis:
        x = synth_note(kind, m, dur, rng, a=a, d=0.4, s=0.75, r=r, cut_lo=cut * 0.6, cut_hi=cut, fenv_tau=1.0, detune=0.004)
        out = x if out is None else out[: len(x)] + x[: len(out)] if len(x) != len(out) else out + x
    return out / max(1, len(midis)) * 1.4


def piano_note(midi, dur, rng):
    n = int((dur + 0.8) * SR)
    t = np.arange(n) / SR
    f = mtof(midi)
    x = np.zeros(n)
    for k, amp in enumerate([1, 0.5, 0.28, 0.16, 0.1, 0.06]):
        x += amp * np.sin(2 * np.pi * f * (k + 1) * (1 + 0.0004 * k * k) * t + rng.random() * 6.28) * np.exp(-t * (1.6 + k * 0.9))
    hammer = hp(rng.standard_normal(n), 1500) * np.exp(-t / 0.004) * 0.15
    env = np.minimum(1, t / 0.003) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.12))
    return (x + hammer) * env * 0.5


def guitar_drone(midis, dur, rng):
    """distorted power-chord style drone (saws through a waveshaper)"""
    n = int((dur + 0.3) * SR)
    x = np.zeros(n)
    for m in midis:
        x += osc('saw', mtof(m) * (1 + rng.uniform(-0.003, 0.003)), n, rng.random())
    x = np.tanh(lp(x, 2600) * 2.2)
    env = adsr(n, 0.01, 0.2, 0.85, 0.15, gate=int(dur * SR))
    return bp(x, 120, 3500) * env * 0.35


# ----------------------------------------------------------------------------------------------
# composition helpers
# ----------------------------------------------------------------------------------------------
MINOR = [0, 2, 3, 5, 7, 8, 10]
MAJOR = [0, 2, 4, 5, 7, 9, 11]
DORIAN = [0, 2, 3, 5, 7, 9, 10]


def degree_to_midi(root, scale, deg, octave=0):
    o, d = divmod(deg, len(scale))
    return root + scale[d] + 12 * (o + octave)


def triad(root, scale, deg, octave=0, seventh=False):
    notes = [degree_to_midi(root, scale, deg + k, octave) for k in ([0, 2, 4, 6] if seventh else [0, 2, 4])]
    return notes


def make_melody(rng, root, scale, chords, bars, beats_per_bar=4, density=0.55, octave=1, rest_end=True):
    """Phrase-based melody: a 2-bar motif, varied and repeated over the chord progression."""
    steps = beats_per_bar * 2  # eighth notes per bar
    motif = []
    deg = rng.integers(0, 5)
    for i in range(steps * 2):
        if rng.random() < density or i == 0:
            deg = int(np.clip(deg + rng.choice([-2, -1, -1, 0, 1, 1, 2, 3, -3]), -2, 9))
            ln = rng.choice([1, 1, 2, 2, 3, 4])
            motif.append((i, ln, deg))
    notes = []
    for b in range(0, bars, 2):
        var = rng.random()
        for (i, ln, d) in motif:
            bar = b + i // steps
            if bar >= bars:
                continue
            chord_deg = chords[bar % len(chords)]
            dd = d
            # strong beats snap to chord tones
            if i % 4 == 0:
                tones = [chord_deg, chord_deg + 2, chord_deg + 4]
                dd = min(tones, key=lambda c: abs(c - d) + rng.random() * 0.5)
            if var < 0.35 and b % 4 == 2:
                dd += rng.choice([1, -1])
            if rest_end and (b % 8 == 6) and i >= steps + 4:
                continue
            notes.append((bar * steps + (i % steps), ln, degree_to_midi(root, scale, dd, octave)))
    return notes  # (eighth index, length in eighths, midi)


def encode(name, x, q=2):
    x = np.asarray(x, dtype=np.float64)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    pcm = (x * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    out = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'libvorbis', '-q:a', str(q), out], check=True)
    os.unlink(tmp)
    print(f'{name:16s} {len(x) / SR:6.1f}s {os.path.getsize(out) / 1024:7.1f} KB')


def master(x):
    x = hp(x, 30)
    # gentle glue compression via soft clipping
    peak = np.percentile(np.abs(x), 99.7) + 1e-9
    return np.tanh(x / peak * 0.9) * 0.95


# ----------------------------------------------------------------------------------------------
# stations
# ----------------------------------------------------------------------------------------------
def station_techno(seed=101):
    """NEON 101 – warehouse techno, 128 BPM"""
    rng = np.random.default_rng(seed)
    bpm = 128
    beat = 60 / bpm
    bars = 32
    mix = Mix(bars * 4 * beat)
    root = 45  # A2
    k = kick(rng, 1.0, 0.32)
    oh = hat(rng, True)
    ch = hat(rng, False)
    cp = clap(rng)
    rm = rim(rng)
    acid_pat = [(i, rng.choice([0, 0, 0, 12, 3, 7, 10, -2])) for i in range(16) if rng.random() < 0.7]
    for bar in range(bars):
        t0 = bar * 4 * beat
        breakdown = 16 <= bar < 20
        for b in range(4):
            if not breakdown:
                mix.add(t0 + b * beat, k, 1.0)
            mix.add(t0 + b * beat + beat / 2, oh, 0.6 if bar >= 4 else 0.3, rev=0.1)
            if bar >= 8:
                for s in (0.25, 0.75):
                    mix.add(t0 + b * beat + s * beat, ch, 0.35)
            if b in (1, 3) and bar >= 4:
                mix.add(t0 + b * beat, cp, 0.55, rev=0.35)
        if bar % 2 == 1 and not breakdown:
            mix.add(t0 + 3.75 * beat, rm, 0.4, rev=0.3)
        # rolling acid bassline (16ths), filter opens over the track
        if bar >= 2:
            opening = 0.2 + 0.8 * (0.5 - 0.5 * np.cos(2 * np.pi * bar / 16))
            for i, semi in acid_pat:
                note = synth_note('saw', root + semi, beat / 4 * 0.9, rng, a=0.002, d=0.08, s=0.3, r=0.03, cut_lo=180, cut_hi=400 + 3200 * opening, fenv_tau=0.06)
                mix.add(t0 + i * beat / 4, np.tanh(note * 2.5) * 0.5, 0.5 if not breakdown else 0.25, rev=0.05)
        # dark minor stabs every 2 bars
        if bar >= 8 and bar % 2 == 0:
            stab = chord_pad([root + 24, root + 27, root + 31], beat * 0.4, rng, cut=2600, a=0.003, r=0.25)
            for off in (1.5, 3.5) if bar % 4 == 0 else (0.75,):
                mix.add(t0 + off * beat, stab, 0.35, rev=0.6)
        # breakdown pad
        if breakdown and bar % 2 == 0:
            pad = chord_pad([root + 12, root + 15, root + 19, root + 22], beat * 8, rng, cut=1500)
            mix.add(t0, pad, 0.45, rev=0.7)
    return master(mix.render(rng, 1.8, 0.3))


def station_rap(seed=93):
    """Kiez FM 93,1 – boom-bap instrumental, 88 BPM, swung"""
    rng = np.random.default_rng(seed)
    bpm = 88
    beat = 60 / bpm
    bars = 24
    mix = Mix(bars * 4 * beat)
    root = 41  # F2
    scale = MINOR
    prog = [0, 5, 3, 4]  # i - VI - iv - v (degrees)
    k = kick(rng, 0.6, 0.35, 120, 42)
    sn = snare(rng, 180, 0.16, 1.0)
    ch = hat(rng, False)
    swing = 0.12 * beat
    kick_pat = [0, 1.75, 2.5] if rng.random() < 0.5 else [0, 0.75, 2.25, 2.75]
    for bar in range(bars):
        t0 = bar * 4 * beat
        cdeg = prog[(bar // 2) % len(prog)]
        for kb in kick_pat:
            mix.add(t0 + kb * beat, k, 1.0)
        for sb in (1, 3):
            mix.add(t0 + sb * beat, sn, 0.75, rev=0.25)
        for e in range(8):
            off = e * beat / 2 + (swing if e % 2 else 0)
            mix.add(t0 + off, ch, 0.45 if e % 2 == 0 else 0.3)
        # sub bass following the chord root
        bn = degree_to_midi(root, scale, cdeg, -1)
        for (start, ln) in ((0, 1.5), (2.5, 1.0)):
            note = synth_note('sine', bn + 12, ln * beat, rng, a=0.004, d=0.3, s=0.8, r=0.1, cut_lo=300, cut_hi=600)
            mix.add(t0 + start * beat, np.tanh(note * 1.8) * 0.7, 0.8)
        # dusty piano chords (sampled feel) once per bar
        if bar % 2 == 0:
            ch_notes = triad(root + 12, scale, cdeg, 0, seventh=True)
            for i, m in enumerate(ch_notes):
                mix.add(t0 + i * 0.012, piano_note(m, beat * 3.5, rng), 0.28, rev=0.35)
        # sparse melodic counterpoint in the second half
    mel = make_melody(rng, root, scale, [prog[(b // 2) % 4] for b in range(bars)], bars, density=0.3, octave=2)
    for (i, ln, m) in mel:
        bar = i // 8
        if bar < 8:
            continue
        t = (i * 0.5 + (0.12 if i % 2 else 0)) * beat
        mix.add(t, piano_note(m, ln * beat * 0.5, rng), 0.18, rev=0.5)
    out = mix.render(rng, 1.2, 0.2)
    # vinyl crackle
    crackle = (rng.random(len(out)) < 0.0006) * rng.standard_normal(len(out)) * 0.25
    out += hp(crackle, 1500) + lp(rng.standard_normal(len(out)), 4000) * 0.006
    return master(lp(out, 9000))


def station_schlager(seed=120):
    """Heimatwelle – Schlager-disco parody, 122 BPM, major key"""
    rng = np.random.default_rng(seed)
    bpm = 122
    beat = 60 / bpm
    bars = 32
    mix = Mix(bars * 4 * beat)
    root = 48  # C3
    scale = MAJOR
    prog = [0, 4, 5, 3]  # I - V - vi - IV
    k = kick(rng, 0.8, 0.25, 140, 50)
    cp = clap(rng)
    oh = hat(rng, True)
    sh = shaker(rng)
    for bar in range(bars):
        t0 = bar * 4 * beat
        cdeg = prog[bar % 4]
        for b in range(4):
            mix.add(t0 + b * beat, k, 0.9)
            mix.add(t0 + b * beat + beat / 2, oh, 0.45)
            for s in range(4):
                mix.add(t0 + b * beat + s * beat / 4, sh, 0.5)
            if b in (1, 3):
                mix.add(t0 + b * beat, cp, 0.6, rev=0.3)
        # octave-bouncing disco bass
        bn = degree_to_midi(root, scale, cdeg, -1)
        for e in range(8):
            m = bn + (12 if e % 2 else 0)
            note = synth_note('square', m, beat / 2 * 0.8, rng, a=0.003, d=0.1, s=0.5, r=0.04, cut_lo=300, cut_hi=1400, fenv_tau=0.05)
            mix.add(t0 + e * beat / 2, note, 0.45)
        # strings/organ pad
        pad = chord_pad(triad(root + 12, scale, cdeg), beat * 4, rng, kind='saw', cut=2400, a=0.08, r=0.3)
        mix.add(t0, pad, 0.22, rev=0.5)
        # offbeat piano stabs
        for b in range(4):
            for m in triad(root + 24, scale, cdeg):
                mix.add(t0 + b * beat + beat / 2, piano_note(m, beat * 0.3, rng), 0.12, rev=0.2)
    # catchy lead (a bright square with vibrato) in verses/chorus
    mel = make_melody(rng, root, scale, [prog[b % 4] for b in range(bars)], bars, density=0.62, octave=2)
    for (i, ln, m) in mel:
        bar = i // 8
        if bar < 4:
            continue
        lead = synth_note('square', m, ln * beat * 0.5 * 0.95, rng, a=0.01, d=0.1, s=0.7, r=0.08, cut_lo=1400, cut_hi=4200, fenv_tau=0.2, vib=0.006)
        mix.add(i * 0.5 * beat, lead, 0.2, rev=0.45)
        if bar >= 16:  # chorus: doubled a third/octave up
            harm = synth_note('saw', m + 12, ln * beat * 0.5 * 0.95, rng, a=0.01, d=0.1, s=0.6, r=0.08, cut_lo=1600, cut_hi=3600, fenv_tau=0.2, vib=0.006)
            mix.add(i * 0.5 * beat, harm, 0.08, rev=0.5)
    return master(mix.render(rng, 1.6, 0.28))


def station_motorik(seed=4):
    """Motorik 4 – krautrock motorik groove, 138 BPM, drone guitars"""
    rng = np.random.default_rng(seed)
    bpm = 138
    beat = 60 / bpm
    bars = 36
    mix = Mix(bars * 4 * beat)
    root = 40  # E2
    k = kick(rng, 0.5, 0.2, 110, 50)
    sn = snare(rng, 210, 0.12, 0.7)
    ch = hat(rng, False)
    tm = tom(rng, 95)
    vamp = [0, 0, 5, 3] if rng.random() < 0.5 else [0, 0, -2, 0]
    for bar in range(bars):
        t0 = bar * 4 * beat
        semi = vamp[(bar // 4) % len(vamp)]
        for b in range(4):
            if b in (0, 2) or (b == 3 and rng.random() < 0.2):
                mix.add(t0 + b * beat, k, 0.85)
            if b in (1, 3):
                mix.add(t0 + b * beat, sn, 0.5, rev=0.2)
            for e in (0, 0.5):
                mix.add(t0 + (b + e) * beat, ch, 0.32)
        if bar % 8 == 7:
            for i, off in enumerate((2.5, 3.0, 3.5)):
                mix.add(t0 + off * beat, tom(rng, 120 - i * 18), 0.45, rev=0.3)
        # driving 8th-note bass
        for e in range(8):
            note = synth_note('saw', root + semi, beat / 2 * 0.85, rng, a=0.003, d=0.1, s=0.6, r=0.04, cut_lo=250, cut_hi=900, fenv_tau=0.05)
            mix.add(t0 + e * beat / 2, note, 0.38)
        # drone guitar, enters after 4 bars
        if bar >= 4 and bar % 2 == 0:
            g = guitar_drone([root + 12 + semi, root + 19 + semi, root + 24 + semi], beat * 8, rng)
            mix.add(t0, g, 0.42, rev=0.3)
        # sequenced organ arpeggio in the second half
        if bar >= 16:
            arp = [0, 7, 12, 15, 12, 7]
            for i in range(16):
                m = root + 24 + semi + arp[i % len(arp)]
                n = synth_note('square', m, beat / 4 * 0.7, rng, a=0.002, d=0.05, s=0.4, r=0.03, cut_lo=900, cut_hi=2500, fenv_tau=0.04)
                mix.add(t0 + i * beat / 4, n, 0.12, rev=0.35)
    del tm
    return master(mix.render(rng, 1.4, 0.22))


def station_ndw(seed=80):
    """Welle 80 – synth pop / Neue Deutsche Welle style, 126 BPM"""
    rng = np.random.default_rng(seed)
    bpm = 126
    beat = 60 / bpm
    bars = 32
    mix = Mix(bars * 4 * beat)
    root = 43  # G2
    scale = DORIAN if rng.random() < 0.5 else MINOR
    prog = [0, 6, 5, 6] if rng.random() < 0.5 else [0, 3, 6, 4]
    k = kick(rng, 0.7, 0.22, 130, 52)
    sn = snare(rng, 230, 0.2, 0.9)
    ch = hat(rng, False)
    cp = clap(rng)
    for bar in range(bars):
        t0 = bar * 4 * beat
        cdeg = prog[(bar // 2) % len(prog)]
        for b in range(4):
            mix.add(t0 + b * beat, k, 0.85)
            for e in (0, 0.5):
                mix.add(t0 + (b + e) * beat, ch, 0.28 if e else 0.38)
            if b in (1, 3):
                mix.add(t0 + b * beat, sn, 0.55, rev=0.55)
                mix.add(t0 + b * beat, cp, 0.25, rev=0.4)
        # 16th-note sequencer bass (root/octave pattern)
        bn = degree_to_midi(root, scale, cdeg, 0)
        pat = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 10]
        for i, s in enumerate(pat):
            note = synth_note('saw', bn + s, beat / 4 * 0.7, rng, a=0.002, d=0.06, s=0.35, r=0.03, cut_lo=280, cut_hi=1700, fenv_tau=0.05)
            mix.add(t0 + i * beat / 4, note, 0.3)
        # chord stabs (brassy polysynth)
        if bar >= 4:
            ch_notes = triad(root + 12, scale, cdeg)
            for off in (0, 1.5, 3):
                st = chord_pad(ch_notes, beat * 0.45, rng, kind='saw', cut=3200, a=0.004, r=0.15)
                mix.add(t0 + off * beat, st, 0.2, rev=0.35)
    mel = make_melody(rng, root, scale, [prog[(b // 2) % len(prog)] for b in range(bars)], bars, density=0.5, octave=2)
    for (i, ln, m) in mel:
        bar = i // 8
        if bar < 8:
            continue
        lead = synth_note('square', m, ln * beat * 0.5 * 0.9, rng, a=0.004, d=0.15, s=0.5, r=0.12, cut_lo=1100, cut_hi=5000, fenv_tau=0.1)
        mix.add(i * 0.5 * beat, lead, 0.2, rev=0.4)
        # slap-back echo
        mix.add(i * 0.5 * beat + beat * 0.75, lead, 0.07, rev=0.4)
    return master(mix.render(rng, 1.5, 0.3))


STATIONS = [
    ('radio_neon', station_techno),
    ('radio_kiez', station_rap),
    ('radio_heimat', station_schlager),
    ('radio_motorik', station_motorik),
    ('radio_welle', station_ndw),
]


def main():
    only = set(sys.argv[2:])
    for name, fn in STATIONS:
        if only and name not in only:
            continue
        encode(name, fn())


if __name__ == '__main__':
    main()
