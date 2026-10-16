#!/usr/bin/env python3
"""Procedural sound effects for HAFENGOLD. Writes Ogg Vorbis files into the given directory.

All sounds are synthesized from scratch (numpy/scipy). Loops are made seamless by building
strictly periodic excitation signals and filtering a tiled copy (the middle tile is periodic).
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
RNG = np.random.default_rng(20261016)


# ----------------------------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------------------------
def write(name, x, sr=SR, q=4):
    x = np.asarray(x, dtype=np.float64)
    peak = np.max(np.abs(x)) or 1.0
    if peak > 0.99:
        x = x / peak * 0.99
    pcm = (x * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    out = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libvorbis', '-q:a', str(q), out], check=True)
    os.unlink(tmp)
    print(f'{name:22s} {len(x) / sr:5.2f}s  {os.path.getsize(out) / 1024:6.1f} KB')


def sos_bp(lo, hi, order=2, sr=SR):
    return signal.butter(order, [lo, hi], btype='bandpass', fs=sr, output='sos')


def sos_lp(fc, order=2, sr=SR):
    return signal.butter(order, fc, btype='lowpass', fs=sr, output='sos')


def sos_hp(fc, order=2, sr=SR):
    return signal.butter(order, fc, btype='highpass', fs=sr, output='sos')


def filt(sos, x):
    return signal.sosfilt(sos, x)


def periodic(fn, x, tiles=3):
    """Apply a (causal) filter chain to a periodic signal and return one seamless period."""
    n = len(x)
    y = fn(np.tile(x, tiles))
    return y[n * (tiles - 1): n * tiles]


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def exp_env(n, tau, sr=SR):
    return np.exp(-np.arange(n) / (sr * tau))


def resonator(x, f, q, sr=SR):
    b, a = signal.iirpeak(f, q, fs=sr)
    return signal.lfilter(b, a, x)


def smooth_noise(n, cutoff, sr=SR):
    return filt(sos_lp(cutoff, 2, sr), RNG.standard_normal(n))


def fade(x, fin=0.005, fout=0.02, sr=SR):
    x = x.copy()
    a = int(fin * sr)
    b = int(fout * sr)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)
    return x


# ----------------------------------------------------------------------------------------------
# engines
# ----------------------------------------------------------------------------------------------
ENGINES = {
    # name: (firings per rev, pattern amplitudes per cycle, kernel tau, resonances, brightness, noise, knock, sub)
    'i4': dict(fpr=2, pattern=[1.0, 0.92, 0.97, 0.9], tau=0.006, res=[(110, 2.5, 1.0), (320, 3, 0.5), (900, 4, 0.18)], lp=3200, noise=0.18, knock=0.0),
    'i6': dict(fpr=3, pattern=[1.0, 0.95, 0.98, 0.94, 0.99, 0.95], tau=0.005, res=[(140, 2.5, 1.0), (420, 3, 0.45), (1300, 5, 0.2)], lp=4200, noise=0.12, knock=0.0),
    'v8': dict(fpr=4, pattern=[1.0, 0.55, 0.95, 0.62, 0.9, 0.5, 1.0, 0.66], tau=0.008, res=[(85, 2.0, 1.2), (240, 3, 0.55), (700, 4, 0.2)], lp=2600, noise=0.16, knock=0.0),
    'boxer': dict(fpr=3, pattern=[1.0, 0.8, 0.95, 0.78, 1.0, 0.82], tau=0.004, res=[(150, 2.5, 0.8), (520, 2.5, 0.6), (2100, 4, 0.35)], lp=5200, noise=0.22, knock=0.0),
    'diesel': dict(fpr=2, pattern=[1.0, 0.9, 0.95, 0.88], tau=0.007, res=[(95, 2.0, 1.0), (280, 3, 0.4), (1800, 3, 0.25)], lp=3800, noise=0.25, knock=0.55),
    'two': dict(fpr=1, pattern=[1.0, 0.93, 1.0, 0.9], tau=0.0025, res=[(180, 3, 0.6), (650, 2.2, 0.9), (1500, 4, 0.4)], lp=6000, noise=0.3, knock=0.0),
    'truck': dict(fpr=3, pattern=[1.0, 0.9, 0.96, 0.92, 0.98, 0.9], tau=0.01, res=[(65, 2.0, 1.2), (190, 2.5, 0.6), (600, 3, 0.25)], lp=2200, noise=0.2, knock=0.35),
}

# (low rpm, high rpm) sample points
ENGINE_RPM = {
    'i4': (1100, 4400),
    'i6': (1100, 4400),
    'v8': (1000, 4000),
    'boxer': (1300, 5200),
    'diesel': (900, 3000),
    'two': (2400, 6600),
    'truck': (700, 2100),
}


def engine_loop(kind, rpm, dur=1.6):
    p = ENGINES[kind]
    fire_hz = rpm / 60.0 * p['fpr']
    pat = p['pattern']
    # integer number of complete patterns in the loop
    cycles = max(1, round(fire_hz * dur / len(pat)))
    nfire = cycles * len(pat)
    n = int(round(nfire / fire_hz * SR))
    imp = np.zeros(n)
    for k in range(nfire):
        pos = int(round(k * n / nfire))
        jitter = RNG.normal(0, 0.03)
        imp[pos % n] += pat[k % len(pat)] * (1 + jitter)
    # excitation kernel: decaying noisy burst
    klen = int(p['tau'] * SR * 7)
    kernel = exp_env(klen, p['tau']) * (0.6 + 0.4 * RNG.standard_normal(klen))
    kernel[: max(1, int(0.0006 * SR))] += 1.5

    def chain(x):
        x = signal.fftconvolve(x, kernel)[: len(x)]
        y = np.zeros_like(x)
        for f, q, g in p['res']:
            y += resonator(x, f * (1 + (rpm - 2000) / 20000), q) * g
        y += x * 0.15
        y = filt(sos_lp(p['lp']), y)
        return y

    tone = periodic(chain, imp)
    # mechanical / intake noise modulated by firing
    nz = RNG.standard_normal(n)
    noise = periodic(lambda x: filt(sos_bp(900, 5000), x), nz)
    mod = periodic(lambda x: filt(sos_lp(fire_hz * 1.5), x), imp * 30 + 0.3)
    mod = mod / (np.max(np.abs(mod)) or 1)
    noise = noise * (0.4 + 0.6 * np.abs(mod))
    out = norm(tone) + norm(noise) * p['noise']
    if p['knock'] > 0:
        click_k = exp_env(int(0.004 * SR), 0.0006) * RNG.standard_normal(int(0.004 * SR))
        knock = periodic(lambda x: filt(sos_hp(1800), signal.fftconvolve(x, click_k)[: len(x)]), imp)
        out = out + norm(knock) * p['knock']
    if kind == 'truck':
        t = np.arange(n) / SR
        turbo_f = round(2800 * dur) / dur
        out = out + 0.05 * np.sin(2 * np.pi * turbo_f * t)
    out = np.tanh(out * 1.6) / np.tanh(1.6)
    return norm(out, 0.85)


def ev_loop(level, dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    base = 340 if level == 'lo' else 1150
    f = round(base * dur) / dur
    x = 0.6 * np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
    hum_f = round(100 * dur) / dur
    x += 0.25 * np.sin(2 * np.pi * hum_f * t)
    nz = periodic(lambda s: filt(sos_bp(2000, 7000), s), RNG.standard_normal(n))
    x = x + norm(nz) * 0.08
    return norm(x, 0.6)


# ----------------------------------------------------------------------------------------------
# misc sfx
# ----------------------------------------------------------------------------------------------
def skid_loop(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f0, amp in [(820, 1.0), (1040, 0.8), (1310, 0.55), (1650, 0.3)]:
        fm = periodic(lambda s: filt(sos_lp(6), s), RNG.standard_normal(n))
        fm = fm / (np.max(np.abs(fm)) or 1) * 45
        ph = 2 * np.pi * np.cumsum(f0 + fm) / SR
        # force periodicity of the phase: adjust frequency so total phase is a multiple of 2pi
        total = ph[-1]
        ph *= np.round(total / (2 * np.pi)) * 2 * np.pi / total
        am = periodic(lambda s: filt(sos_lp(14), s), RNG.standard_normal(n))
        am = 0.6 + 0.4 * am / (np.max(np.abs(am)) or 1)
        out += amp * np.sin(ph) * am
    hiss = periodic(lambda s: filt(sos_bp(1800, 6500), s), RNG.standard_normal(n))
    out = norm(out) + norm(hiss) * 0.35
    return norm(np.tanh(out * 1.3), 0.8)


def metal_hit(dur, partials, decay, noise_amt, thump, glass=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, a, d in partials:
        out += a * np.sin(2 * np.pi * f * t + RNG.uniform(0, 6.28)) * np.exp(-t / d)
    nz = filt(sos_bp(300, 6000), RNG.standard_normal(n)) * np.exp(-t / decay)
    out = norm(out) * 0.6 + norm(nz) * noise_amt
    if thump > 0:
        th = np.sin(2 * np.pi * (70 - 30 * t) * t) * np.exp(-t / 0.12)
        out += th * thump
    if glass > 0:
        g = np.zeros(n)
        for _ in range(60):
            pos = int(RNG.uniform(0.0, 0.35) * SR)
            f = RNG.uniform(2500, 7500)
            ln = int(0.08 * SR)
            if pos + ln >= n:
                continue
            tt = np.arange(ln) / SR
            g[pos:pos + ln] += np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.02) * RNG.uniform(0.3, 1)
        out += norm(g) * glass
    return fade(norm(np.tanh(out * 1.4), 0.9), 0.001, 0.05)


def explosion(dur=2.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * np.cumsum(np.maximum(25, 90 * np.exp(-t / 0.25))) / SR) * np.exp(-t / 0.45)
    rumble = filt(sos_lp(180, 3), RNG.standard_normal(n)) * np.exp(-t / 0.9)
    crack = filt(sos_bp(500, 5000), RNG.standard_normal(n)) * np.exp(-t / 0.08)
    debris = np.zeros(n)
    for _ in range(40):
        pos = int(RNG.uniform(0.1, 1.8) * SR)
        ln = int(0.03 * SR)
        if pos + ln >= n:
            continue
        debris[pos:pos + ln] += filt(sos_bp(1500, 6000), RNG.standard_normal(ln)) * np.exp(-np.arange(ln) / (SR * 0.006)) * RNG.uniform(0.1, 0.6)
    out = norm(boom) * 1.0 + norm(rumble) * 0.9 + norm(crack) * 0.6 + norm(debris) * 0.25
    return fade(norm(np.tanh(out * 1.8), 0.95), 0.001, 0.3)


def horn_loop(f1, f2, dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f1 = round(f1 * dur) / dur
    f2 = round(f2 * dur) / dur
    x = signal.square(2 * np.pi * f1 * t, 0.45) * 0.5 + signal.square(2 * np.pi * f2 * t, 0.45) * 0.5
    x = periodic(lambda s: filt(sos_lp(3500), resonator(s, 1800, 2) * 0.5 + s * 0.6), x)
    return norm(np.tanh(x * 1.5), 0.7)


def siren_loop():
    # German two-tone ("tatue-tata"): alternating fourth interval
    tone = 0.63
    dur = tone * 4
    n = int(dur * SR)
    t = np.arange(n) / SR
    seq = [(440.0, 0), (587.0, 1), (440.0, 2), (587.0, 3)]
    freq = np.zeros(n)
    for f, k in seq:
        a = int(k * tone * SR)
        b = int((k + 1) * tone * SR)
        freq[a:b] = f
    # short glides between tones
    freq = filt(sos_lp(40, 1), np.tile(freq, 3))[2 * n:3 * n]
    ph = 2 * np.pi * np.cumsum(freq) / SR
    ph *= np.round(ph[-1] / (2 * np.pi)) * 2 * np.pi / ph[-1]
    x = np.sign(np.sin(ph)) * 0.55 + np.sin(ph) * 0.45 + 0.25 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    x = periodic(lambda s: filt(sos_lp(4200), resonator(s, 1400, 2.5) * 0.4 + s), x)
    return norm(np.tanh(x * 1.2), 0.75)


def thud(dur=0.25, f=90, noise=0.4, decay=0.06):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * (f + 60 * np.exp(-t / 0.02)) * t) * np.exp(-t / decay)
    nz = filt(sos_lp(1800), RNG.standard_normal(n)) * np.exp(-t / (decay * 0.5))
    return fade(norm(x + nz * noise, 0.9), 0.0005, 0.02)


def footstep(i):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    nz = filt(sos_bp(250 + 80 * i, 2500), RNG.standard_normal(n)) * np.exp(-t / 0.018)
    return fade(norm(nz, 0.5), 0.0005, 0.02)


def chime(notes, dur_each=0.11, decay=0.25):
    out = np.zeros(int(SR * (dur_each * len(notes) + decay * 3)))
    for i, f in enumerate(notes):
        pos = int(i * dur_each * SR)
        ln = int(decay * 3 * SR)
        t = np.arange(ln) / SR
        tone = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.15 * np.sin(2 * np.pi * 3.01 * f * t)) * np.exp(-t / decay)
        out[pos:pos + ln] += tone[: len(out) - pos]
    return fade(norm(out, 0.7), 0.001, 0.05)


def fanfare():
    # short brassy "mission passed" jingle (original melody)
    notes = [(392, 0.12), (523.25, 0.12), (659.25, 0.12), (783.99, 0.42), (659.25, 0.12), (783.99, 0.7)]
    out = []
    for f, d in notes:
        n = int(d * SR)
        t = np.arange(n) / SR
        env = np.minimum(1, t / 0.015) * np.exp(-t / (d * 1.2))
        saw = signal.sawtooth(2 * np.pi * f * t) * 0.5 + signal.sawtooth(2 * np.pi * f * 1.005 * t) * 0.5
        out.append(filt(sos_lp(2600), saw) * env)
    x = np.concatenate(out)
    tail = int(0.8 * SR)
    rev = signal.fftconvolve(x, exp_env(tail, 0.25) * RNG.standard_normal(tail) * 0.08)
    y = np.concatenate([x, np.zeros(tail)])
    m = min(len(y), len(rev))
    y[:m] += rev[:m]
    return fade(norm(y, 0.8), 0.002, 0.2)


def wasted():
    dur = 2.2
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 220 * np.exp(-t / 1.5)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    x *= np.exp(-t / 0.9)
    boom = np.sin(2 * np.pi * 50 * t) * np.exp(-t / 0.3)
    return fade(norm(x + boom * 0.8, 0.8), 0.002, 0.3)


def splash():
    n = int(1.1 * SR)
    t = np.arange(n) / SR
    nz = filt(sos_bp(300, 4000), RNG.standard_normal(n)) * (np.exp(-t / 0.18) + 0.3 * np.exp(-t / 0.6))
    bub = np.zeros(n)
    for _ in range(25):
        pos = int(RNG.uniform(0.05, 0.8) * SR)
        ln = int(0.05 * SR)
        if pos + ln >= n:
            continue
        tt = np.arange(ln) / SR
        f0 = RNG.uniform(400, 1200)
        bub[pos:pos + ln] += np.sin(2 * np.pi * (f0 + 3000 * tt) * tt) * np.exp(-tt / 0.012)
    return fade(norm(nz + norm(bub) * 0.3, 0.8), 0.002, 0.1)


def fire_loop(dur=2.5):
    n = int(dur * SR)
    roar = periodic(lambda s: filt(sos_lp(500, 2), s), RNG.standard_normal(n))
    crack = np.zeros(n)
    for _ in range(90):
        pos = int(RNG.uniform(0, dur) * SR) % n
        ln = int(0.01 * SR)
        idx = (pos + np.arange(ln)) % n
        crack[idx] += RNG.uniform(0.2, 1) * np.exp(-np.arange(ln) / (SR * 0.002)) * RNG.standard_normal(ln)
    crack = periodic(lambda s: filt(sos_hp(1200), s), crack)
    return norm(norm(roar) * 0.8 + norm(crack) * 0.35, 0.7)


def ambient_city(dur=24.0, sr=22050):
    n = int(dur * sr)
    t = np.arange(n) / sr
    hum = periodic(lambda s: filt(sos_lp(140, 2, sr), s), RNG.standard_normal(n))
    swell = periodic(lambda s: filt(sos_lp(0.15, 1, sr), s), RNG.standard_normal(n))
    swell = 0.6 + 0.4 * swell / (np.max(np.abs(swell)) or 1)
    traffic = periodic(lambda s: filt(sos_bp(200, 1200, 2, sr), s), RNG.standard_normal(n)) * swell
    birds = np.zeros(n)
    for _ in range(18):
        pos = int(RNG.uniform(0, dur - 0.5) * sr)
        f0 = RNG.uniform(2500, 4800)
        for k in range(RNG.integers(2, 6)):
            ln = int(0.07 * sr)
            p2 = pos + int(k * 0.11 * sr)
            if p2 + ln >= n:
                break
            tt = np.arange(ln) / sr
            birds[p2:p2 + ln] += np.sin(2 * np.pi * (f0 + 900 * np.sin(2 * np.pi * 14 * tt)) * tt) * np.sin(np.pi * tt / tt[-1]) * 0.6
    out = norm(hum) * 0.5 + norm(traffic) * 0.5 + norm(birds) * 0.18
    return norm(out, 0.6)


def click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return fade(norm(np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.008), 0.5), 0.0005, 0.005)


def door():
    a = thud(0.3, 70, 0.6, 0.05)
    n = int(0.08 * SR)
    latch = filt(sos_bp(2000, 6000), RNG.standard_normal(n)) * np.exp(-np.arange(n) / (SR * 0.01))
    out = np.zeros(len(a) + int(0.05 * SR))
    out[: len(a)] += a
    out[int(0.04 * SR): int(0.04 * SR) + n] += norm(latch) * 0.4
    return fade(norm(out, 0.8))


def punch():
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (140 * np.exp(-t / 0.05) + 60) * t) * np.exp(-t / 0.05)
    slap = filt(sos_bp(800, 5000), RNG.standard_normal(n)) * np.exp(-t / 0.01)
    return fade(norm(body + slap * 0.7, 0.9), 0.0005, 0.02)


def main():
    for kind, (lo, hi) in ENGINE_RPM.items():
        write(f'eng_{kind}_lo', engine_loop(kind, lo))
        write(f'eng_{kind}_hi', engine_loop(kind, hi))
    write('eng_ev_lo', ev_loop('lo'))
    write('eng_ev_hi', ev_loop('hi'))
    write('skid', skid_loop())
    write('crash_light', metal_hit(0.45, [(240, 1, 0.08), (530, 0.6, 0.06), (910, 0.4, 0.05), (1500, 0.25, 0.04)], 0.05, 0.6, 0.6))
    write('crash_mid', metal_hit(0.8, [(180, 1, 0.15), (410, 0.8, 0.12), (690, 0.6, 0.1), (1130, 0.4, 0.08), (1720, 0.3, 0.06)], 0.09, 0.8, 0.8, 0.2))
    write('crash_heavy', metal_hit(1.4, [(120, 1, 0.3), (310, 0.9, 0.25), (560, 0.7, 0.2), (980, 0.5, 0.14), (1460, 0.4, 0.1), (2210, 0.2, 0.08)], 0.16, 1.0, 1.0, 0.45))
    write('glass', metal_hit(0.8, [(3000, 0.2, 0.05)], 0.05, 0.2, 0.0, 1.0))
    write('explosion', explosion())
    write('horn', horn_loop(415, 520))
    write('horn_truck', horn_loop(200, 252))
    write('siren', siren_loop())
    write('thud', thud())
    write('punch', punch())
    for i in range(3):
        write(f'step{i}', footstep(i))
    write('door', door())
    write('click', click())
    write('money', chime([1318.5, 1760.0], 0.07, 0.18))
    write('pickup', chime([987.8, 1318.5, 1975.5], 0.06, 0.15))
    write('pass', fanfare())
    write('wasted', wasted())
    write('splash', splash())
    write('fire', fire_loop())
    write('ambient', ambient_city(), sr=22050, q=2)


if __name__ == '__main__':
    main()
