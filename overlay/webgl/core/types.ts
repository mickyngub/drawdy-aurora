/**
 * Shared types for the harness and the surfaces that plug into it.
 *
 * The contract in one sentence: the harness owns the GL context, the passes, and
 * all input smoothing; a surface owns one fragment shader and whatever CPU state
 * it needs to feed that shader's uniforms each frame.
 */

import type { AudioBands } from "./audio";

/**
 * Pointer state after the harness has smoothed it. Coordinates are 0..1 across
 * the canvas with the origin at the **bottom-left**, matching gl_FragCoord, so
 * a surface never has to remember to flip Y.
 */
export interface PointerState {
    /** Raw position, updated on every pointermove. */
    readonly x: number;
    readonly y: number;
    /**
     * Smoothed velocity in canvas widths per second, clamped to
     * `maxPointerVelocity`. This is what drives the flow field.
     */
    readonly velocityX: number;
    readonly velocityY: number;
    /**
     * Spring-smoothed position. Trails the raw pointer with mass, which is what
     * makes a shape following the cursor feel attached rather than glued.
     */
    readonly springX: number;
    readonly springY: number;
    /** False once the pointer leaves; the spring then returns to `home`. */
    readonly inside: boolean;
    /**
     * True for touch and pen. Interaction radii are widened by
     * `coarsePointerScale` because a fingertip is a much less precise instrument
     * than a cursor and a mouse-sized hot spot feels unresponsive under it.
     */
    readonly coarse: boolean;
}

/** Uniform setters. Only valid while the surface program is bound, i.e. inside `onFrame`. */
export interface UniformSetters {
    setInt(name: string, value: number): void;
    setFloat(name: string, value: number): void;
    setVec2(name: string, x: number, y: number): void;
    setVec3(name: string, x: number, y: number, z: number): void;
    setVec4(name: string, x: number, y: number, z: number, w: number): void;
    /** For `float[N]` uniforms. */
    setFloatArray(name: string, values: Float32Array): void;
    /** For `vec2[N]` uniforms. */
    setVec2Array(name: string, values: Float32Array): void;
    /** For `vec3[N]` uniforms, e.g. a five-stop palette. */
    setVec3Array(name: string, values: Float32Array): void;
    /** For `vec4[N]` uniforms, e.g. the pulse and wake ring buffers. */
    setVec4Array(name: string, values: Float32Array): void;
    /** True when the shader actually declares (and uses) this uniform. */
    has(name: string): boolean;
}

/** Everything a surface is handed once per frame. */
export interface FrameContext extends UniformSetters {
    readonly gl: WebGL2RenderingContext;
    /**
     * Seconds since mount, offset by a random phase so two panels on one page,
     * or two page loads, never start on the same wave crest.
     */
    readonly time: number;
    /** Seconds since the previous frame, clamped to 50 ms. */
    readonly dt: number;
    /** Canvas width divided by height. */
    readonly aspect: number;
    readonly pointer: PointerState;
    /**
     * 0..1 hover envelope, already multiplied by `1 - duck`. Scales every
     * pointer-driven effect so nothing snaps on enter or leave.
     */
    readonly presence: number;
    /** 1 for a mouse, `coarsePointerScale` for touch. Multiply interaction radii by this. */
    readonly interactionScale: number;
    /**
     * Fires a one-shot impulse into the velocity field at 0..1 canvas coordinates.
     * A surface calls this when something happened that the harness cannot see:
     * an audio onset, a beat, an external event. Takes effect on the next frame,
     * since the flow pass has already run by the time a surface draws.
     */
    kick(x: number, y: number, strength: number, angleRadians?: number): void;
}

/** Per-frame hooks the harness calls on the surface, in this order. */
export interface SurfaceHooks {
    /** Called once after link and again on every canvas resize. */
    resize?(aspect: number): void;
    /**
     * Called before the flow pass, with no program bound, so **uniform setters are
     * not usable here**. Advance CPU state and optionally return a `duck` in 0..1
     * that suppresses pointer presence: an audio-reactive surface uses it so a
     * playing sample owns the motion instead of fighting the cursor.
     */
    advance?(context: FrameContext): { duck?: number } | void;
    /**
     * Called after pointer state resolves and before the surface pass. The place
     * to detect gestures (a swipe across a band, a direction change) that need the
     * final smoothed pointer values.
     */
    react?(context: FrameContext): void;
    /** Called with the surface program bound, immediately before the draw. Set uniforms here. */
    draw?(context: FrameContext): void;
}

/**
 * A ready-made surface: its fragment shader, the defines it needs, and one
 * per-frame callback. This is what `createRibbonSurface`, `createOrbSurface`,
 * and `createCustomSurface` return.
 */
export interface SurfaceDefinition {
    /** Human-readable, used only in error messages. */
    readonly name: string;
    /** Fragment shader source, before include resolution. */
    readonly fragmentSource: string;
    /** Extra `#define`s spliced in after the version line. */
    readonly defines?: Readonly<Record<string, number | string | boolean>>;
    /** Uploaded once after link: palettes and anything else that never changes per frame. */
    onInit?(context: FrameContext): void;
    /** Recompute layout constants when the aspect ratio crosses a breakpoint. */
    onResize?(aspect: number): void;
    /**
     * The per-frame body: advance CPU state, then set uniforms. Called with the
     * surface program bound.
     *
     * @param bands Four normalised audio levels, or null when nothing is playing.
     *   Surfaces built with `audio: false` ignore this and synthesise their own
     *   idle motion.
     * @returns an optional `duck` in 0..1 suppressing pointer presence next frame.
     */
    onFrame(
        context: FrameContext,
        bands?: AudioBands | null
    ): { duck?: number } | void;
    /** Release any CPU resources. The harness deletes GL objects itself. */
    dispose?(): void;
}

/** Autonomous drift applied to the flow field when nothing else is happening. */
export interface BreezeConfig {
    /** Peak velocity injected. 0 disables the breeze entirely. */
    readonly amplitude: number;
    /** Cycles per second of the Lissajous path the injection point walks. */
    readonly speed: number;
}

/** Constructor options for {@link GlSurface}. */
export interface GlSurfaceOptions {
    /** Fragment shader for the surface pass, before include resolution. */
    readonly fragmentSource: string;
    /** `#define`s spliced into the surface shader. */
    readonly defines?: Readonly<Record<string, number | string | boolean>>;
    /**
     * Called once after the program links, to return the per-frame hooks. Receives
     * the live context and program so a surface can cache its own locations if it
     * wants to bypass the harness's name-keyed setters.
     */
    readonly uniforms?: (
        gl: WebGL2RenderingContext,
        program: WebGLProgram
    ) => SurfaceHooks;

    /**
     * Long-axis resolution of the velocity field. It is a force field, not an
     * image; past ~200 px extra resolution costs fill rate and changes nothing
     * visible, because every consumer of it blurs the result anyway.
     */
    readonly flowSize?: number;
    /**
     * Surface render resolution as a fraction of the canvas. The effect is almost
     * all low-frequency glow, so rendering below native and upsampling with a
     * LINEAR filter is free quality; grain is added afterwards at full resolution.
     */
    readonly renderScale?: number;
    /** Hard ceiling on internal height, so a 4K panel does not quietly cost 4x. */
    readonly maxInternalHeight?: number;
    /** Device-pixel-ratio ceiling. Above 2 there is nothing left to resolve in a soft gradient. */
    readonly maxDpr?: number;
    /** Defaults to "low-power": this is decoration and should not wake a discrete GPU. */
    readonly powerPreference?: WebGLPowerPreference;

    /** When true (default) the effect never initialises under `prefers-reduced-motion: reduce`. */
    readonly respectReducedMotion?: boolean;
    /** When true (default) the loop stops while the canvas is off-screen. */
    readonly pauseOffscreen?: boolean;
    /**
     * How far outside the viewport the loop keeps running, as a fraction of the
     * viewport on every side. Default 1: one screen of headroom, so a panel is
     * already animating when it scrolls in instead of visibly waking up.
     */
    readonly offscreenMargin?: number;
    /**
     * Element whose position decides whether the effect is on screen. Defaults to
     * `pointerTarget`: the panel is the element whose position decides visibility,
     * since the canvas may be a smaller layer inside it.
     */
    readonly viewportTarget?: HTMLElement | null;
    /** Element that receives pointer listeners. Defaults to the canvas's parent, since the canvas itself is pointer-events-none. */
    readonly pointerTarget?: HTMLElement | null;

    /** Where the spring rests when the pointer is away, in 0..1 canvas space. */
    readonly home?: readonly [number, number];
    /** Spring stiffness. Critically damped, so this alone sets the feel: 4 is lazy, 10 is snappy. */
    readonly springOmega?: number;
    /** Seconds for pointer influence to fade in. Short, so entering feels immediate. */
    readonly presenceAttack?: number;
    /** Seconds to fade out. Long, so leaving feels like a settle rather than a cut. */
    readonly presenceRelease?: number;
    /** Multiplier on interaction radii for touch and pen. */
    readonly coarsePointerScale?: number;
    /** Clamp on injected pointer speed. A flick across the panel would otherwise blow up the field. */
    readonly maxPointerVelocity?: number;
    /** Per-second exponential decay applied to remembered velocity once the pointer leaves. */
    readonly pointerVelocityDecay?: number;
    readonly breeze?: BreezeConfig;
    /** Impulse strength fired into the flow field on pointer press. */
    readonly tapImpulse?: number;

    /** Viscosity of the velocity field. Higher settles faster. */
    readonly fieldDecay?: number;
    /** Gain on every force injected into the field. */
    readonly pointerForce?: number;
    /** Strength of the inward gather under a stationary pointer. */
    readonly stillnessPull?: number;
    /** Squared radius of the injection gaussians, in aspect-corrected UV. */
    readonly forceRadius?: number;

    /** Film grain amplitude in the present pass. */
    readonly grain?: number;
    /** Vignette strength in the present pass, 0 to disable. */
    readonly vignette?: number;
    /**
     * Let the page show through. The surface must then write premultiplied
     * colour (`rgb * alpha, alpha`); grain is scaled by alpha so clear areas stay clear.
     */
    readonly transparent?: boolean;

    /** Fired after the first successful frame. Set `data-ready` on the canvas here so its `data-ready:opacity-100` class fades it in. */
    readonly onFirstFrame?: (canvas: HTMLCanvasElement) => void;
    /** Fired when the context or a shader fails. The caller should leave the CSS fallback visible. */
    readonly onError?: (error: unknown) => void;
}

/** Everything a mount helper hands back to its caller. */
export interface SurfaceHandle {
    readonly surface: import("./gl-surface").GlSurface;
    destroy(): void;
}
