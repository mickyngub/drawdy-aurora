/**
 * Framework-free mounting for your own fragment shader, for Astro, Svelte, Vue,
 * or a plain script tag.
 *
 * Creates its own canvas inside the container you give it, wires the harness,
 * and hands back `{ surface, update, destroy }`. Unlike the ribbon and orb
 * helpers this one sets no fallback background, because only you know what your
 * shader looks like when it is not running.
 */

import { mountDefinition } from "./mount-core";
import type { MountOverrides } from "./mount-core";
import type { FrameContext, SurfaceHandle } from "../core/types";
import { createCustomSurface } from "../surfaces/custom";
import type { CustomSurfaceOptions } from "../surfaces/custom";

/**
 * A value that can be pushed into a custom shader's uniform by name.
 *
 * Length decides the setter: 2, 3, and 4 map to vec2, vec3, and vec4. Pass a
 * `Float32Array` for an array uniform such as `float[8]`, where the length is
 * the array size rather than a vector width.
 */
export type UniformValue =
    | number
    | readonly [number, number]
    | readonly [number, number, number]
    | readonly [number, number, number, number]
    | Float32Array;

export interface CustomHandle extends SurfaceHandle {
    /**
     * Merges values into a uniform patch applied every frame, after the surface's
     * own `onFrame`. This is the custom-surface equivalent of retuning a config.
     */
    update(uniforms: Readonly<Record<string, UniformValue>>): void;
}

/**
 * Mounts an arbitrary fragment shader. You own the container's fallback
 * background, because only you know what your shader looks like when it is not
 * running.
 */
export function mountCustom(
    container: HTMLElement,
    options: CustomSurfaceOptions,
    overrides: MountOverrides = {}
): CustomHandle {
    const definition = createCustomSurface(options);
    const handle = mountDefinition(container, definition, {}, overrides);

    // Applied after the surface's own draw, so an explicit update() always wins
    // over whatever onFrame set. That is the behaviour a live tuning panel needs.
    const patch = new Map<string, UniformValue>();
    handle.surface.setUniforms((context: FrameContext) => {
        for (const [name, value] of patch) applyUniform(context, name, value);
    });

    return {
        ...handle,
        update(uniforms) {
            for (const [name, value] of Object.entries(uniforms))
                patch.set(name, value);
        },
    };
}

/** Dispatches a uniform value to the right setter by shape. */
function applyUniform(
    context: FrameContext,
    name: string,
    value: UniformValue
): void {
    if (typeof value === "number") {
        context.setFloat(name, value);
        return;
    }
    if (value instanceof Float32Array) {
        context.setFloatArray(name, value);
        return;
    }
    switch (value.length) {
        case 2:
            context.setVec2(name, value[0], value[1]);
            return;
        case 3:
            context.setVec3(name, value[0], value[1], value[2]);
            return;
        case 4:
            context.setVec4(name, value[0], value[1], value[2], value[3]);
            return;
        default:
            throw new Error(
                `Uniform "${name}": a plain array must have 2, 3, or 4 entries. ` +
                    `Use a Float32Array for an array uniform.`
            );
    }
}
