/**
 * Shared plumbing behind the `mount-*.ts` helpers: the canvas element, the
 * harness wiring, and the fallback background.
 *
 * This file imports no surface, which is the point. Copying `mount-orb.ts` into
 * a project should not drag the ribbon's shader and config in with it, so the
 * parts every surface needs live here and each `mount-<surface>.ts` adds only
 * its own import.
 */

import { GlSurface, toSurfaceHooks } from "../core/gl-surface";
import type {
    GlSurfaceOptions,
    SurfaceDefinition,
    SurfaceHandle,
} from "../core/types";

/** Overrides applied on top of a surface's own recommended harness options. */
export type MountOverrides = Partial<
    Omit<GlSurfaceOptions, "fragmentSource" | "uniforms" | "defines">
>;

/**
 * Creates the canvas.
 *
 * `pointer-events-none` matters: the canvas covers the whole panel, and without
 * it every link and button underneath stops working. Pointer input reaches the
 * harness through the container instead.
 *
 * It starts at `opacity-0` so the fallback underneath is what the visitor sees
 * until there is a real frame to show; `data-ready` fades it in. A canvas that
 * has never drawn is an opaque black rectangle, and flashing that over a
 * gradient is worse than showing no effect at all.
 */
export function createCanvas(container: HTMLElement): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className =
        "pointer-events-none absolute inset-0 -z-1 block size-full opacity-0 transition-opacity duration-700 ease-[ease] data-ready:opacity-100";

    // The canvas is absolutely positioned, so the container must establish a
    // containing block or the effect will escape to the nearest positioned
    // ancestor and cover unrelated parts of the page. `isolate` makes the
    // container a stacking context, so the canvas's -z-1 puts it above the
    // container's fallback background but below all of its content, positioned
    // or not, wherever the canvas sits in DOM order.
    const computed = getComputedStyle(container);
    if (computed.position === "static") container.classList.add("relative");
    if (computed.isolation !== "isolate") container.classList.add("isolate");

    container.appendChild(canvas);
    return canvas;
}

/** Shared wiring: build the harness for a definition and return the handle. */
export function mountDefinition(
    container: HTMLElement,
    definition: SurfaceDefinition,
    baseOptions: MountOverrides,
    overrides: MountOverrides
): SurfaceHandle {
    const canvas = createCanvas(container);

    const surface = new GlSurface(canvas, {
        ...baseOptions,
        ...overrides,
        fragmentSource: definition.fragmentSource,
        defines: definition.defines,
        uniforms: toSurfaceHooks(definition),
        onFirstFrame: (element) => {
            element.dataset.ready = "";
            overrides.onFirstFrame?.(element);
        },
        onError: (error) => {
            // Leave the fallback visible and say so once. Throwing here would take
            // down whatever framework called us over a decorative background.
            console.warn(
                `[${definition.name}] falling back to the static gradient`,
                error
            );
            overrides.onError?.(error);
        },
    });

    return {
        surface,
        destroy() {
            surface.destroy();
            definition.dispose?.();
            canvas.remove();
        },
    };
}

/**
 * Only set a fallback background if the caller has not already styled one. A
 * container already carrying `bg-(image:--hero-fallback)` hands its background
 * to the palette, so its placeholder gradient is replaced.
 */
export function applyFallbackGradient(
    container: HTMLElement,
    gradient: string
): void {
    const ownsFallback = container.classList.contains(
        "bg-(image:--hero-fallback)"
    );
    if (!ownsFallback && getComputedStyle(container).backgroundImage !== "none")
        return;
    setFallbackGradient(container, gradient);
}

/** Points the container's background at `--hero-fallback` and sets it to `gradient`. */
export function setFallbackGradient(
    container: HTMLElement,
    gradient: string
): void {
    container.style.setProperty("--hero-fallback", gradient);
    container.classList.add("bg-(image:--hero-fallback)");
}
