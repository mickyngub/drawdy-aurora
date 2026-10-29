/**
 * Framework-free audio singleton for a shader hero that reacts to a voice sample.
 *
 * Why a module-level singleton rather than React state: the GL render loop reads
 * the analyser once per frame from inside `requestAnimationFrame`. Routing that
 * through React would re-render 60 times a second for a value no DOM node shows.
 * The store here is deliberately imperative; `subscribeAudio` / `getAudioSnapshot`
 * exist only so *chrome* (a play/pause button) can follow along cheaply.
 *
 * Why exactly one <audio> element is playing at a time: two hero surfaces plus a
 * voice list plus a playground all want "play this, stop whatever else". Funnelling
 * every caller through this module makes that free.
 *
 * Two envelope tiers
 * ------------------
 * 1. LIVE — an AnalyserNode over a MediaElementSource. Works for any clip, costs
 *    an AudioContext, and reads silence on machines with no output device.
 * 2. BAKED — a table generated offline by `scripts/bake-envelope.ts` and handed to
 *    `registerBakedEnvelope`. Deterministic, identical on every machine, and needs
 *    no Web Audio at all.
 *
 * Registering a baked envelope for a src flips that src to a plain <audio> element
 * with no graph attached, which is why the marquee clip has no first-play hitch:
 * constructing an AudioContext and a MediaElementSource on the click that starts
 * playback is exactly where the stutter comes from.
 */

export type AudioBands = [number, number, number, number];

/** Band edges in Hz: [overall, low, mid, high]. */
const BAND_EDGES: ReadonlyArray<readonly [number, number]> = [
    [0, 11000],
    [0, 350],
    [350, 2400],
    [2400, 11000],
];

/**
 * Perceptual shaping applied to every band.
 *
 * Raw FFT means hover around 0.1-0.25 for speech, which drives a shader uniform
 * almost invisibly. `sqrt` lifts the quiet end hard while the 1.8 gain and the
 * clamp keep loud passages from pinning at 1.0 for seconds at a time. Keep this
 * identical to `scripts/bake-envelope.ts` or the two tiers will not match.
 */
const shapeBand = (x: number): number => Math.min(Math.sqrt(1.8 * x), 1);

/** fftSize 256 gives 128 bins: ~86 Hz per bin at 22.05 kHz, plenty for 4 bands. */
const FFT_SIZE = 256;

export interface AudioSnapshot {
    readonly src: string | null;
    readonly playing: boolean;
}

export interface PlayOptions {
    /**
     * Attach an AnalyserNode so `getAudioBands()` returns live data.
     *
     * Defaults to `false` when a baked envelope is registered for the src, `true`
     * otherwise. Pass it explicitly to override either way.
     */
    analyser?: boolean;
    /** Start position in seconds. Applied once metadata lands. */
    startSeconds?: number;
}

let element: HTMLAudioElement | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

/**
 * Explicitly `Uint8Array<ArrayBuffer>`: from TypeScript 5.7 `Uint8Array` is generic
 * over its buffer, and `getByteFrequencyData` demands the non-shared variant.
 * Allocating the ArrayBuffer by hand pins the type without a cast.
 */
let bins: Uint8Array<ArrayBuffer> | null = null;

/**
 * `createMediaElementSource` may be called at most once per element, ever, and a
 * second call throws InvalidStateError. Elements are cached here so a replayed
 * clip reuses its node instead of blowing up.
 */
const sourceNodes = new WeakMap<
    HTMLAudioElement,
    MediaElementAudioSourceNode
>();

/** Elements warmed by `preloadAudio`, claimed by the first `playAudio` for that src. */
const preloaded = new Map<string, HTMLAudioElement>();

/** Baked envelope tables by src. */
const bakedEnvelopes = new Map<string, Uint8Array>();

/**
 * `snapshot` is replaced (never mutated) so `useSyncExternalStore` can compare by
 * reference. `SERVER_SNAPSHOT` is a separate frozen constant because React demands
 * the server snapshot be referentially stable across every call.
 */
let snapshot: AudioSnapshot = { src: null, playing: false };
const SERVER_SNAPSHOT: AudioSnapshot = Object.freeze({
    src: null,
    playing: false,
});

const listeners = new Set<() => void>();

function publish(patch: Partial<AudioSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
}

/** False in SSR and in test runners without a DOM. */
const canPlay = (): boolean =>
    typeof window !== "undefined" && typeof Audio !== "undefined";

// ---------------------------------------------------------------------------
// Store surface (React-agnostic; see ../react/useSiteAudio.ts for the binding)
// ---------------------------------------------------------------------------

export function subscribeAudio(callback: () => void): () => void {
    listeners.add(callback);
    return () => {
        listeners.delete(callback);
    };
}

export function getAudioSnapshot(): AudioSnapshot {
    return snapshot;
}

export function getServerAudioSnapshot(): AudioSnapshot {
    return SERVER_SNAPSHOT;
}

// ---------------------------------------------------------------------------
// Baked envelope registry
// ---------------------------------------------------------------------------

/**
 * Register a table so this src plays without any Web Audio graph.
 *
 * Call it at module scope with a table decoded from the string
 * `scripts/bake-envelope.ts` printed. The render loop then reads amplitude with
 * `sampleBakedEnvelope(getBakedEnvelope(src)!, getPlaybackTime())`.
 */
export function registerBakedEnvelope(src: string, table: Uint8Array): void {
    bakedEnvelopes.set(src, table);
}

export function getBakedEnvelope(src: string): Uint8Array | undefined {
    return bakedEnvelopes.get(src);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Warm a clip so the first press starts instantly.
 *
 * Safe to call during idle time or on hover. `preload="auto"` is a hint, not a
 * guarantee, and browsers ignore it on metered connections, so nothing downstream
 * may assume the clip is actually buffered.
 */
export function preloadAudio(src: string): void {
    if (!canPlay() || preloaded.has(src)) return;

    const media = new Audio();
    media.preload = "auto";
    media.src = src;
    media.load();
    preloaded.set(src, media);
}

/** Take the warmed element for this src, or build a fresh one. */
function acquireElement(src: string): HTMLAudioElement {
    const warm = preloaded.get(src);
    if (warm) {
        // Claimed, not shared: once an element is playing it carries transport state
        // that a second caller must not inherit.
        preloaded.delete(src);
        warm.currentTime = 0;
        return warm;
    }
    return new Audio(src);
}

/**
 * Wire (or re-wire) the analyser graph.
 *
 * Everything here is best-effort. Autoplay policy, a missing output device, and
 * Safari's occasional refusal to build a MediaElementSource all throw, and none
 * of them should stop plain playback: the visual just falls back to its idle
 * envelope. That is why the whole block is wrapped and the nodes are nulled on
 * failure rather than left half-connected.
 */
function attachAnalyser(media: HTMLAudioElement): void {
    try {
        context = context ?? new AudioContext();
        analyser?.disconnect();

        let node = sourceNodes.get(media);
        if (!node) {
            node = context.createMediaElementSource(media);
            sourceNodes.set(media, node);
        }
        node.disconnect();

        const next = context.createAnalyser();
        next.fftSize = FFT_SIZE;
        analyser = next;
        bins = new Uint8Array(new ArrayBuffer(next.frequencyBinCount));

        node.connect(next);
        // Connect through to the speakers: createMediaElementSource *rebinds* the
        // element's output into the graph, so skipping this makes playback silent.
        next.connect(context.destination);

        // A context created before any user gesture starts suspended.
        if (context.state === "suspended") void context.resume();
    } catch {
        analyser = null;
        bins = null;
    }
}

/**
 * Play with no analyser.
 *
 * If this element has previously been routed through a MediaElementSource its
 * audio is permanently owned by the graph, so it has to be reconnected straight
 * to the destination or it plays silently. An element that never entered the
 * graph needs nothing at all, which is the fast path baked clips take.
 */
function detachAnalyser(media: HTMLAudioElement): void {
    analyser?.disconnect();
    analyser = null;
    bins = null;

    const node = sourceNodes.get(media);
    if (!node || !context) return;
    node.disconnect();
    node.connect(context.destination);
    if (context.state === "suspended") void context.resume();
}

/** Start `src` from scratch. */
export function playAudio(src: string, opts?: PlayOptions): void {
    if (!canPlay()) return;

    element?.pause();

    const media = acquireElement(src);
    element = media;

    media.addEventListener("ended", () => {
        // Rewind so a second press replays instead of sitting at the end.
        media.currentTime = 0;
        if (element === media) publish({ playing: false });
    });

    const { startSeconds } = opts ?? {};
    if (startSeconds !== undefined) {
        const seekWhenReady = () => {
            if (element === media && Number.isFinite(media.duration)) {
                media.currentTime = clamp(startSeconds, 0, media.duration);
            }
        };
        // A warmed element may already have metadata, in which case the event has
        // long since fired and waiting for it would hang the seek forever.
        if (Number.isFinite(media.duration)) seekWhenReady();
        else
            media.addEventListener("loadedmetadata", seekWhenReady, {
                once: true,
            });
    }

    // A registered baked envelope means nothing reads the analyser for this clip,
    // so building the graph would cost a hitch and buy nothing.
    const wantAnalyser = opts?.analyser ?? !bakedEnvelopes.has(src);
    if (wantAnalyser) attachAnalyser(media);
    else detachAnalyser(media);

    publish({ src, playing: true });
    media.play().catch(() => publish({ playing: false }));
}

/** Play `src`, or pause/resume it when it is already the loaded track. */
export function toggleAudio(src: string, opts?: PlayOptions): void {
    if (!canPlay()) return;

    if (element && snapshot.src === src) {
        if (snapshot.playing) {
            element.pause();
            publish({ playing: false });
        } else {
            if (context?.state === "suspended") void context.resume();
            const media = element;
            media.play().catch(() => publish({ playing: false }));
            publish({ playing: true });
        }
        return;
    }

    playAudio(src, opts);
}

export function stopAudio(): void {
    if (element && snapshot.playing) {
        element.pause();
        publish({ playing: false });
    }
}

/**
 * Seek the current track.
 *
 * Takes **seconds**, not a 0-1 fraction. Callers driving a scrubber from pointer
 * x should multiply by `element.duration` themselves, or read
 * `getPlaybackProgress()` to go the other way.
 */
export function seekAudio(seconds: number): void {
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0)
        return;
    element.currentTime = clamp(seconds, 0, element.duration);
}

// ---------------------------------------------------------------------------
// Readers (safe to call every animation frame)
// ---------------------------------------------------------------------------

export function getPlayingSrc(): string | null {
    return snapshot.playing ? snapshot.src : null;
}

export function getPlaybackTime(): number {
    return element?.currentTime ?? 0;
}

export function getPlaybackProgress(): number {
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0)
        return 0;
    return element.currentTime / element.duration;
}

/**
 * Current four-band spectrum, or `null` when there is nothing to measure.
 *
 * `null` is meaningful: it tells the caller to fall back to a baked table or to a
 * synthetic idle envelope rather than driving the visual to zero. Returning
 * `[0,0,0,0]` here would make the ribbon go flat and dead whenever audio is
 * merely absent, or whenever the clip is deliberately running analyser-free.
 */
export function getAudioBands(): AudioBands | null {
    if (!analyser || !bins || !context || !snapshot.playing) return null;

    const data = bins;
    analyser.getByteFrequencyData(data);

    const binHz = context.sampleRate / 2 / data.length;
    const mean = (loHz: number, hiHz: number): number => {
        const lo = Math.max(Math.floor(loHz / binHz), 0);
        const hi = Math.min(Math.ceil(hiHz / binHz), data.length);
        if (hi <= lo) return 0;
        let total = 0;
        for (let i = lo; i < hi; i++) total += data[i]!;
        return total / (hi - lo) / 255;
    };

    return [
        shapeBand(mean(BAND_EDGES[0]![0], BAND_EDGES[0]![1])),
        shapeBand(mean(BAND_EDGES[1]![0], BAND_EDGES[1]![1])),
        shapeBand(mean(BAND_EDGES[2]![0], BAND_EDGES[2]![1])),
        shapeBand(mean(BAND_EDGES[3]![0], BAND_EDGES[3]![1])),
    ];
}

// ---------------------------------------------------------------------------
// Baked envelopes: the deterministic tier
// ---------------------------------------------------------------------------

/**
 * Read a pre-baked envelope table at `seconds`.
 *
 * Layout is 4 bytes per frame, band-major within the frame, `fps` frames per
 * second, matching `scripts/bake-envelope.ts`.
 *
 * Out of range returns zeros rather than clamping to the end frame: silence
 * before the start and after the end is correct, a held final frame is not.
 */
export function sampleBakedEnvelope(
    table: Uint8Array,
    seconds: number,
    fps = 50
): AudioBands {
    const frames = Math.floor(table.length / 4);
    if (frames === 0) return [0, 0, 0, 0];

    const pos = seconds * fps;
    // `pos > -1` rather than `>= 0` so the first frame fades in from silence
    // instead of popping on at full value.
    if (pos <= -1 || pos >= frames) return [0, 0, 0, 0];

    const i0 = Math.max(Math.floor(pos), 0);
    const i1 = Math.min(i0 + 1, frames - 1);
    const t = clamp(pos - i0, 0, 1);

    const at = (frame: number, band: number): number =>
        (table[frame * 4 + band] ?? 0) / 255;
    const lerp = (band: number): number =>
        at(i0, band) + (at(i1, band) - at(i0, band)) * t;

    return [lerp(0), lerp(1), lerp(2), lerp(3)];
}

/**
 * Decode a base64 envelope table produced by `scripts/bake-envelope.ts`.
 *
 * Works in the browser (`atob`) and in Node (`Buffer`) so the same table can be
 * unit-tested server-side without a DOM.
 */
export function decodeBakedEnvelope(base64: string): Uint8Array {
    if (typeof atob === "function") {
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    }

    const nodeBuffer = (
        globalThis as { Buffer?: { from(s: string, e: string): Uint8Array } }
    ).Buffer;
    if (nodeBuffer) return new Uint8Array(nodeBuffer.from(base64, "base64"));

    throw new Error("decodeBakedEnvelope: no atob or Buffer available");
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
