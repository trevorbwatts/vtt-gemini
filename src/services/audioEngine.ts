import type { MixerSettings } from '../types';

/**
 * Audio Engine — Web Audio API singleton that owns all playback for the app.
 *
 * Architecture:
 * - One AudioContext, one master GainNode → four "bus" GainNodes
 *   (ambient / zones / sfx / notes), each connected to master.
 * - Mixer changes update gain values directly; no re-routing needed.
 * - Decoded audio buffers are cached by URL so the same sound never decodes twice.
 * - Ambient loops are tracked by a caller-supplied "key" (e.g. floor id) so the
 *   floor-ambient layer can add/remove/fade them as the party moves between
 *   floors. When two keys point at the same soundId, the engine collapses them
 *   into a single playing buffer with summed-and-capped volume — this avoids
 *   the comb-filter artifact you'd get from playing the same file twice.
 */

export type AudioBus = 'ambient' | 'zones' | 'sfx' | 'notes';

export const DEFAULT_MIXER_SETTINGS: MixerSettings = {
  master: 0.8,
  ambient: 0.7,
  zones: 0.8,
  sfx: 0.9,
  notes: 0.9,
};

const MIXER_STORAGE_KEY = 'vtt_mixer_settings';

export function loadMixerSettings(): MixerSettings {
  try {
    const raw = localStorage.getItem(MIXER_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MIXER_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      master: clamp01(parsed.master ?? DEFAULT_MIXER_SETTINGS.master),
      ambient: clamp01(parsed.ambient ?? DEFAULT_MIXER_SETTINGS.ambient),
      zones: clamp01(parsed.zones ?? DEFAULT_MIXER_SETTINGS.zones),
      sfx: clamp01(parsed.sfx ?? DEFAULT_MIXER_SETTINGS.sfx),
      notes: clamp01(parsed.notes ?? DEFAULT_MIXER_SETTINGS.notes),
    };
  } catch {
    return { ...DEFAULT_MIXER_SETTINGS };
  }
}

export function saveMixerSettings(settings: MixerSettings): void {
  try {
    localStorage.setItem(MIXER_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* non-fatal */ }
}

function clamp01(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

interface LoopRequest {
  /** Caller key — typically floorId (ambient) or zoneId (zones). */
  key: string;
  /** Sound library id. Multiple keys can share the same soundId. */
  soundId: string;
  /** This caller's requested contribution to the mix, 0..1. */
  weight: number;
}

interface ActiveLoop {
  soundId: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Buses that support looped/decoded audio with dedupe & weighted mixing. */
type LoopBus = 'ambient' | 'zones';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private busGains: Partial<Record<AudioBus, GainNode>> = {};
  private buffers = new Map<string, AudioBuffer>();
  /** In-flight decode promises so concurrent calls share work instead of double-decoding. */
  private pendingBuffers = new Map<string, Promise<AudioBuffer>>();
  private settings: MixerSettings = { ...DEFAULT_MIXER_SETTINGS };

  /** Per-bus, per-caller loop requests. */
  private requests: Record<LoopBus, Map<string, LoopRequest>> = {
    ambient: new Map(),
    zones: new Map(),
  };
  /** Per-bus active loops, keyed by soundId (de-duplicated within the bus). */
  private activeLoops: Record<LoopBus, Map<string, ActiveLoop>> = {
    ambient: new Map(),
    zones: new Map(),
  };

  /**
   * Initialize the audio context. Must be called from a user-gesture handler
   * (e.g. opening the mixer, clicking a play button) — browsers block
   * AudioContext creation otherwise.
   */
  ensure(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.settings.master;
    this.masterGain.connect(this.ctx.destination);
    (['ambient', 'zones', 'sfx', 'notes'] as AudioBus[]).forEach(bus => {
      const g = this.ctx!.createGain();
      g.gain.value = this.settings[bus];
      g.connect(this.masterGain!);
      this.busGains[bus] = g;
    });
  }

  /** Update master + bus volumes. No-op for buses that haven't been created yet. */
  setSettings(next: MixerSettings): void {
    this.settings = { ...next };
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.value = this.settings.master;
    (['ambient', 'zones', 'sfx', 'notes'] as AudioBus[]).forEach(bus => {
      const g = this.busGains[bus];
      if (g) g.gain.value = this.settings[bus];
    });
  }

  getSettings(): MixerSettings {
    return { ...this.settings };
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    this.ensure();
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const pending = this.pendingBuffers.get(url);
    if (pending) return pending;
    const promise = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx!.decodeAudioData(arr);
      this.buffers.set(url, buf);
      this.pendingBuffers.delete(url);
      return buf;
    })();
    this.pendingBuffers.set(url, promise);
    return promise;
  }

  /**
   * Play a single non-looping sound. Resolves once playback has started.
   * Use for previews (sfx bus), interaction sounds, or sound notes.
   */
  async playOneShot(url: string, bus: AudioBus, volume = 1): Promise<void> {
    this.ensure();
    const buf = await this.loadBuffer(url);
    const src = this.ctx!.createBufferSource();
    src.buffer = buf;
    const g = this.ctx!.createGain();
    g.gain.value = clamp01(volume);
    src.connect(g);
    g.connect(this.busGains[bus]!);
    src.start();
  }

  /**
   * Declare that caller `key` wants `soundId` looping at `weight` (0..1) on
   * the given bus. The engine reconciles all current requests on that bus:
   * identical soundIds are summed (and capped at 1) so two callers using the
   * same file don't play it twice (which would phase/comb-filter). Pass
   * `soundId: null` to clear that key's request.
   */
  setLoopRequest(bus: LoopBus, key: string, soundId: string | null, weight: number): void {
    if (!soundId || weight <= 0) {
      this.requests[bus].delete(key);
    } else {
      this.requests[bus].set(key, { key, soundId, weight: clamp01(weight) });
    }
    this.reconcile(bus);
  }

  /** Tier 1: ambient bed loop request. Convenience over setLoopRequest('ambient', ...). */
  setAmbientRequest(key: string, soundId: string | null, weight: number): void {
    this.setLoopRequest('ambient', key, soundId, weight);
  }

  /** Tier 2: sound zone loop request. Convenience over setLoopRequest('zones', ...). */
  setZoneRequest(key: string, soundId: string | null, weight: number): void {
    this.setLoopRequest('zones', key, soundId, weight);
  }

  /** Remove all requests on a bus (e.g. when scenario unloads). */
  clearBus(bus: LoopBus): void {
    this.requests[bus].clear();
    this.reconcile(bus);
  }

  /** Convenience: clear ambient bus. */
  clearAmbient(): void { this.clearBus('ambient'); }
  /** Convenience: clear zones bus. */
  clearZones(): void { this.clearBus('zones'); }

  /**
   * Compare current requests on a bus against active loops and start/stop/adjust
   * to match. Uses short ramps to avoid clicks.
   */
  private reconcile(bus: LoopBus): void {
    if (!this.ctx) return;
    const requests = this.requests[bus];
    const active = this.activeLoops[bus];

    // Sum weights per soundId, capped at 1.
    const desired = new Map<string, number>();
    requests.forEach(req => {
      const prev = desired.get(req.soundId) ?? 0;
      desired.set(req.soundId, Math.min(1, prev + req.weight));
    });

    const now = this.ctx.currentTime;
    const FADE = 0.4; // seconds

    // Fade out anything no longer desired.
    active.forEach((loop, soundId) => {
      if (!desired.has(soundId)) {
        loop.gain.gain.cancelScheduledValues(now);
        loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
        loop.gain.gain.linearRampToValueAtTime(0, now + FADE);
        const src = loop.source;
        setTimeout(() => {
          try { src.stop(); } catch { /* already stopped */ }
        }, FADE * 1000 + 50);
        active.delete(soundId);
      }
    });

    // Start or adjust desired loops.
    desired.forEach((targetVolume, soundId) => {
      const existing = active.get(soundId);
      if (existing) {
        existing.gain.gain.cancelScheduledValues(now);
        existing.gain.gain.setValueAtTime(existing.gain.gain.value, now);
        existing.gain.gain.linearRampToValueAtTime(targetVolume, now + FADE);
      } else {
        this.startLoop(bus, soundId, targetVolume, FADE);
      }
    });
  }

  private async startLoop(bus: LoopBus, soundId: string, targetVolume: number, fade: number): Promise<void> {
    try {
      const url = soundUrlFromId(soundId);
      const buf = await this.loadBuffer(url);
      // If the request was cleared while we were loading, bail.
      const stillWanted = Array.from(this.requests[bus].values()).some(r => r.soundId === soundId);
      if (!stillWanted || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(this.busGains[bus]!);
      const now = this.ctx.currentTime;
      g.gain.linearRampToValueAtTime(targetVolume, now + fade);
      src.start();
      this.activeLoops[bus].set(soundId, { soundId, source: src, gain: g });
    } catch (err) {
      console.warn('[audioEngine] failed to start loop', bus, soundId, err);
    }
  }
}

/**
 * Build the public URL for a sound asset id. The id IS the filename
 * (see SoundAsset), and files live under public/sounds/.
 */
export function soundUrlFromId(id: string): string {
  return `/sounds/${id}`;
}

export const audioEngine = new AudioEngine();
