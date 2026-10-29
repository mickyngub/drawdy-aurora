/**
 * Bring-your-own-GLSL surface.
 *
 * ── The contract ────────────────────────────────────────────────────────────
 *
 * Your fragment shader must be `#version 300 es`, declare `precision highp
 * float;`, and write to a single `out vec4`. The harness compiles it against the
 * shared fullscreen vertex shader, so there are no attributes and no varyings:
 * derive position from `gl_FragCoord.xy / u_res`.
 *
 * These uniforms are ALWAYS set for you. Declare the ones you use and ignore the
 * rest; the harness skips any your shader does not reference, so there is no
 * cost to leaving them out.
 *
 *   uniform sampler2D u_flow;    velocity field, RG packed as v/(2*MAX_VELOCITY)+0.5
 *   uniform vec2  u_res;         resolution of the surface target, in pixels
 *   uniform float u_time;        seconds since mount, random phase offset
 *   uniform float u_aspect;      width / height
 *   uniform vec2  u_sprung;      spring-smoothed pointer, 0..1, bottom-left origin
 *   uniform float u_presence;    0..1 hover envelope, already ducked
 *   uniform float u_scale;       1.0 for a mouse, larger for a coarse finger
 *   uniform vec4  u_taps;        two (firedAt, strength) pairs
 *   uniform vec4  u_tapPos;      two (x, y) pairs matching u_taps
 *
 * `MAX_VELOCITY` is `#define`d for you, so decoding the field is:
 *
 *   vec2 velocity = (texture(u_flow, uv).xy - 0.5) * (2.0 * MAX_VELOCITY);
 *
 * Pull in shared GLSL with `#pragma include(SNOISE)` and friends; see
 * `core/glsl-lib.ts` for the list.
 *
 * ── Things that will bite you ───────────────────────────────────────────────
 *
 * - `u_res` is the SURFACE target, not the canvas. It is smaller than the canvas
 *   by `renderScale`. Never use it to reason about device pixels.
 * - Y is flipped relative to CSS: `u_sprung.y` of 1.0 is the top of the panel.
 * - Event ages must be measured against raw `u_time`. If you add a speed
 *   multiplier, apply it to oscillator phases only, or clicks will decay at a
 *   different rate than the animation they triggered.
 * - Add grain in the present pass, not here. Applied at surface resolution it is
 *   magnified on upsample and reads as blotches.
 */

import type { AudioBands } from "../core/audio";
import type { FrameContext, SurfaceDefinition } from "../core/types";

export interface CustomSurfaceOptions {
    /** Fragment shader source. `#pragma include(...)` is resolved before compiling. */
    readonly fragmentSource: string;
    /** Optional label used in shader compile errors. */
    readonly name?: string;
    /** `#define`s spliced in after the version line. Numbers get a decimal point unless integral use is intended. */
    readonly defines?: Readonly<Record<string, number | string | boolean>>;
    /** Uploaded once after link: palettes, lookup constants, anything static. */
    readonly onInit?: (context: FrameContext) => void;
    /** Called when the canvas resizes, before the next frame. */
    readonly onResize?: (aspect: number) => void;
    /**
     * Per-frame body, called with your program bound. Set your uniforms here.
     * Return `{ duck }` in 0..1 to suppress pointer presence next frame.
     */
    readonly onFrame: (
        context: FrameContext,
        bands?: AudioBands | null
    ) => { duck?: number } | void;
    /** Release any CPU-side resources. GL objects are the harness's problem. */
    readonly dispose?: () => void;
}

/**
 * Wraps a shader and a per-frame callback into the shape `GlSurface` expects.
 *
 * This is a thin adapter on purpose: there is nothing to configure that the
 * shader itself should not own.
 */
export function createCustomSurface(
    options: CustomSurfaceOptions
): SurfaceDefinition {
    return {
        name: options.name ?? "custom",
        fragmentSource: options.fragmentSource,
        defines: options.defines,
        onInit: options.onInit,
        onResize: options.onResize,
        onFrame: options.onFrame,
        dispose: options.dispose,
    };
}
