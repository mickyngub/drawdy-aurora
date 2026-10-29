/**
 * GlSurface: the framework-free render harness.
 *
 * Owns the WebGL2 context, the three passes, all pointer smoothing, and every
 * lifecycle rule that keeps the effect from burning battery. A surface plugs in
 * one fragment shader and one per-frame callback and gets the rest for free.
 *
 *   flow pass     ping-ponged velocity field, `flowSize` px on the long axis
 *   surface pass  the caller's shader, `renderScale` of canvas, reads the field
 *   present pass  vignette and grain, straight to the drawing buffer. The
 *                 mobile target can reduce its effective DPR below native size.
 *
 * Nothing here is React-specific; `react/ShaderCanvas.tsx` is a thin wrapper and
 * `vanilla/mount.ts` is a thinner one.
 */

import { buildShaderSource } from "./glsl-lib";
import { CORE_SHADERS } from "./shaders";
import type {
    FrameContext,
    GlSurfaceOptions,
    PointerState,
    SurfaceHooks,
    SurfaceDefinition,
} from "./types";
import type { AudioBands } from "./audio";

/** Media query that must match before the effect is allowed to run at all. */
const MOTION_ALLOWED = "(prefers-reduced-motion: no-preference)";

/**
 * The scroll listener is passive and captures, so scrolls inside nested
 * containers reach it too. Removal must pass the same capture flag.
 */
const SCROLL_LISTENER: AddEventListenerOptions = {
    passive: true,
    capture: true,
};
/** Default pixel budgeting targets phone-sized touch layouts only. */
const MOBILE_CANVAS_BUDGET = "(max-width: 767px) and (pointer: coarse)";
const MOBILE_CANVAS_PIXEL_TARGET = 1_100_000;

/**
 * Velocity is packed into an 8-bit texture as `v / (2 * MAX_VELOCITY) + 0.5`.
 * Shared with the shader through a `#define` so the two halves of the encoding
 * cannot drift apart.
 */
const MAX_VELOCITY = 2;

/** 128 in an unsigned byte decodes to exactly zero velocity. */
const NEUTRAL_VELOCITY_BYTE = 128;

/**
 * Largest timestep the simulation will take. After a hidden tab, a breakpoint,
 * or a long frame, the real delta can be seconds; advecting the field by that
 * would fling every parcel off the edge and leave a visibly blank panel.
 */
const MAX_TIMESTEP_SECONDS = 0.05;

/** Per-second exponential decay on one-shot impulses. */
const IMPULSE_DECAY = 6;

/** Simultaneous taps the surface shader can see. Two is enough for a double-click. */
const TAP_SLOTS = 2;

const DEFAULTS = {
    flowSize: 160,
    renderScale: 0.8,
    maxInternalHeight: 1300,
    maxDpr: 2,
    powerPreference: "low-power" as WebGLPowerPreference,
    respectReducedMotion: true,
    pauseOffscreen: true,
    offscreenMargin: 1,
    home: [0.5, 0.5] as readonly [number, number],
    springOmega: 6.5,
    presenceAttack: 0.14,
    presenceRelease: 0.9,
    coarsePointerScale: 1.65,
    maxPointerVelocity: MAX_VELOCITY,
    pointerVelocityDecay: 8,
    breeze: { amplitude: 0.1, speed: 0.13 },
    tapImpulse: 0.85,
    fieldDecay: 1.4,
    pointerForce: 8,
    stillnessPull: 1.15,
    forceRadius: 0.018,
    grain: 0.022,
    vignette: 1,
    transparent: false,
} as const;

interface RenderTarget {
    readonly texture: WebGLTexture;
    readonly framebuffer: WebGLFramebuffer;
    readonly width: number;
    readonly height: number;
}

/** Mutable twin of the readonly PointerState handed to surfaces. */
interface MutablePointer {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    springX: number;
    springY: number;
    inside: boolean;
    coarse: boolean;
    lastEventAt: number;
    pendingTaps: number;
}

type UniformMap = Map<string, WebGLUniformLocation>;

function compileProgram(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
    label: string
): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error(`[${label}] could not allocate a program`);

    for (const [type, source] of [
        [gl.VERTEX_SHADER, vertexSource],
        [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error(`[${label}] could not allocate a shader`);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader) ?? "compile failed";
            gl.deleteShader(shader);
            gl.deleteProgram(program);
            throw new Error(`[${label}] ${log}`);
        }
        gl.attachShader(program, shader);
        // Safe to delete now: the program holds a reference until it is linked.
        gl.deleteShader(shader);
    }

    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? "link failed";
        gl.deleteProgram(program);
        throw new Error(`[${label}] ${log}`);
    }
    return program;
}

/**
 * Caches every active uniform location at link time.
 *
 * `getUniformLocation` is a synchronous driver call; doing it per uniform per
 * frame is one of the few ways to make a three-triangle render CPU-bound.
 * Enumerating rather than taking a name list also means adding a uniform to a
 * shader needs no matching edit in TypeScript.
 */
function cacheUniformLocations(
    gl: WebGL2RenderingContext,
    program: WebGLProgram
): UniformMap {
    const locations: UniformMap = new Map();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index += 1) {
        const info = gl.getActiveUniform(program, index);
        if (!info) continue;
        const location = gl.getUniformLocation(program, info.name);
        if (!location) continue;
        locations.set(info.name, location);
        // Drivers report arrays as "u_pulses[0]"; accept the bare name too so
        // callers do not have to know which form their driver chose.
        if (info.name.endsWith("[0]"))
            locations.set(info.name.slice(0, -3), location);
    }
    return locations;
}

/**
 * Allocates a colour texture plus its framebuffer.
 *
 * RGBA8 with LINEAR filtering throughout. A float target would avoid the
 * dithering the flow pass needs, but requires EXT_color_buffer_float, which is
 * exactly the kind of optional extension that turns a decorative background into
 * a blank rectangle on someone's laptop.
 */
function createRenderTarget(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    fillWithNeutralVelocity: boolean
): RenderTarget {
    const texture = gl.createTexture();
    if (!texture) throw new Error("could not allocate a texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);

    let pixels: Uint8Array | null = null;
    if (fillWithNeutralVelocity) {
        pixels = new Uint8Array(width * height * 4);
        for (let offset = 0; offset < pixels.length; offset += 4) {
            pixels[offset] = NEUTRAL_VELOCITY_BYTE;
            pixels[offset + 1] = NEUTRAL_VELOCITY_BYTE;
            pixels[offset + 3] = 255;
        }
    }

    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // CLAMP_TO_EDGE, not REPEAT: a wrapping velocity field pushes motion off one
    // edge and back in the other, which reads as a conveyor belt.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("could not allocate a framebuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, framebuffer, width, height };
}

/**
 * Deterministic pseudo-random in [0, 1) from an integer seed.
 *
 * Lives beside `kick()`, whose default angle is `Math.random()`. Randomness is
 * right for a click, which is a one-off, but wrong for anything replayed: an
 * audio envelope baked to a table is deterministic by design, and if the flow
 * impulses it triggers are not, the same clip renders differently on every play
 * and the whole point of baking is lost.
 *
 * Two rounds of xorshift-multiply, the integer finaliser from MurmurHash3.
 * Sequential seeds decorrelate, which matters because the seeds here are
 * consecutive frame indices.
 */
export function deterministicUnit(seed: number): number {
    let hashed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
    hashed = Math.imul(hashed ^ (hashed >>> 13), 0xc2b2ae35);
    return ((hashed ^ (hashed >>> 16)) >>> 0) / 4294967296;
}

/** Adapts a {@link SurfaceDefinition} into the hook shape the harness calls. */
export function toSurfaceHooks(
    definition: SurfaceDefinition
): () => SurfaceHooks {
    let ducking = 0;
    let initialised = false;
    return () => ({
        resize(aspect) {
            definition.onResize?.(aspect);
        },
        advance() {
            // The surface's own onFrame runs at draw time, where uniforms are legal to
            // set. All this hook does is hand back last frame's duck, which is what
            // the flow pass needs before the surface has run.
            return { duck: ducking };
        },
        draw(context) {
            if (!initialised) {
                initialised = true;
                definition.onInit?.(context);
            }
            const result = definition.onFrame(context, readAudioBands());
            ducking =
                result && typeof result.duck === "number" ? result.duck : 0;
        },
    });
}

/**
 * Audio is optional and lives behind a lazy import so a project that never uses
 * it does not pay for an AudioContext module. Surfaces built with `audio: false`
 * ignore the result entirely.
 */
let audioReader: (() => AudioBands | null) | null = null;

/** Installs the audio band source. Called by surfaces that opt into audio. */
export function setAudioBandSource(
    reader: (() => AudioBands | null) | null
): void {
    audioReader = reader;
}

function readAudioBands(): AudioBands | null {
    return audioReader ? audioReader() : null;
}

export class GlSurface {
    readonly #canvas: HTMLCanvasElement;
    readonly #options: Required<
        Omit<
            GlSurfaceOptions,
            | "uniforms"
            | "onFirstFrame"
            | "onError"
            | "defines"
            | "pointerTarget"
            | "viewportTarget"
        >
    > &
        Pick<
            GlSurfaceOptions,
            "uniforms" | "onFirstFrame" | "onError" | "defines"
        >;
    readonly #pointerTarget: HTMLElement;
    readonly #viewportTarget: HTMLElement;
    readonly #motionQuery: MediaQueryList | null;
    readonly #mobileCanvasBudgetQuery: MediaQueryList | null;

    #renderer: { stop(): void; dispose(): void } | null = null;
    #frameHandle = 0;
    #running = false;
    #visible = document.visibilityState === "visible";
    #onScreen = true;
    #destroyed = false;
    #firstFrameDone = false;
    #canvasCssWidth = 0;
    #canvasCssHeight = 0;
    #canvasDpr = 0;
    #sizeDirty = true;

    readonly #pointer: MutablePointer;
    readonly #extraUniformSetters = new Set<(context: FrameContext) => void>();

    #observer: IntersectionObserver | null = null;
    #resizeObserver: ResizeObserver | null = null;

    constructor(canvas: HTMLCanvasElement, options: GlSurfaceOptions) {
        this.#canvas = canvas;
        this.#options = {
            fragmentSource: options.fragmentSource,
            defines: options.defines,
            uniforms: options.uniforms,
            onFirstFrame: options.onFirstFrame,
            onError: options.onError,
            flowSize: options.flowSize ?? DEFAULTS.flowSize,
            renderScale: options.renderScale ?? DEFAULTS.renderScale,
            maxInternalHeight:
                options.maxInternalHeight ?? DEFAULTS.maxInternalHeight,
            maxDpr: options.maxDpr ?? DEFAULTS.maxDpr,
            powerPreference:
                options.powerPreference ?? DEFAULTS.powerPreference,
            respectReducedMotion:
                options.respectReducedMotion ?? DEFAULTS.respectReducedMotion,
            pauseOffscreen: options.pauseOffscreen ?? DEFAULTS.pauseOffscreen,
            offscreenMargin:
                options.offscreenMargin ?? DEFAULTS.offscreenMargin,
            home: options.home ?? DEFAULTS.home,
            springOmega: options.springOmega ?? DEFAULTS.springOmega,
            presenceAttack: options.presenceAttack ?? DEFAULTS.presenceAttack,
            presenceRelease:
                options.presenceRelease ?? DEFAULTS.presenceRelease,
            coarsePointerScale:
                options.coarsePointerScale ?? DEFAULTS.coarsePointerScale,
            maxPointerVelocity:
                options.maxPointerVelocity ?? DEFAULTS.maxPointerVelocity,
            pointerVelocityDecay:
                options.pointerVelocityDecay ?? DEFAULTS.pointerVelocityDecay,
            breeze: options.breeze ?? DEFAULTS.breeze,
            tapImpulse: options.tapImpulse ?? DEFAULTS.tapImpulse,
            fieldDecay: options.fieldDecay ?? DEFAULTS.fieldDecay,
            pointerForce: options.pointerForce ?? DEFAULTS.pointerForce,
            stillnessPull: options.stillnessPull ?? DEFAULTS.stillnessPull,
            forceRadius: options.forceRadius ?? DEFAULTS.forceRadius,
            grain: options.grain ?? DEFAULTS.grain,
            vignette: options.vignette ?? DEFAULTS.vignette,
            transparent: options.transparent ?? DEFAULTS.transparent,
        };

        // The canvas is pointer-events-none so it never intercepts clicks on the
        // content above it; the parent is therefore the element that actually sees
        // the pointer.
        this.#pointerTarget =
            options.pointerTarget ?? canvas.parentElement ?? canvas;
        // The panel is the element whose position decides visibility, since the
        // canvas may be a smaller layer inside it.
        this.#viewportTarget = options.viewportTarget ?? this.#pointerTarget;

        const [homeX, homeY] = this.#options.home;
        this.#pointer = {
            x: homeX,
            y: homeY,
            velocityX: 0,
            velocityY: 0,
            springX: homeX,
            springY: homeY,
            inside: false,
            coarse: false,
            lastEventAt: -1,
            pendingTaps: 0,
        };

        this.#motionQuery =
            this.#options.respectReducedMotion &&
            typeof window.matchMedia === "function"
                ? window.matchMedia(MOTION_ALLOWED)
                : null;
        this.#mobileCanvasBudgetQuery =
            typeof window.matchMedia === "function"
                ? window.matchMedia(MOBILE_CANVAS_BUDGET)
                : null;

        this.#motionQuery?.addEventListener(
            "change",
            this.#handleMotionPreferenceChange
        );
        document.addEventListener(
            "visibilitychange",
            this.#handleVisibilityChange
        );
        canvas.addEventListener("webglcontextlost", this.#handleContextLost);
        canvas.addEventListener(
            "webglcontextrestored",
            this.#handleContextRestored
        );
        window.addEventListener("resize", this.#handleResize, {
            passive: true,
        });
        this.#measureCanvas();
        if (typeof ResizeObserver === "function") {
            this.#resizeObserver = new ResizeObserver(([entry]) => {
                if (!entry) return;
                this.#setCanvasSize(
                    Math.round(entry.contentRect.width),
                    Math.round(entry.contentRect.height)
                );
                this.#requestFrame();
            });
            this.#resizeObserver.observe(canvas);
        }

        if (this.#options.pauseOffscreen) {
            this.#onScreen = this.#isNearViewport();
            this.#observeViewport();
            // Observer callbacks can trail a fast flick by several frames, and some
            // engines hold them until the scroll settles. Checking on scroll keeps
            // resume within a frame of the panel coming back into range.
            window.addEventListener(
                "scroll",
                this.#handleScroll,
                SCROLL_LISTENER
            );
        }

        this.#start();
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Registers a callback that runs every frame with the surface program bound.
     * Use it to drive uniforms from outside the surface definition, e.g. a theme
     * toggle or a scroll-linked value.
     *
     * @returns an unsubscribe function.
     */
    setUniforms(callback: (context: FrameContext) => void): () => void {
        this.#extraUniformSetters.add(callback);
        return () => {
            this.#extraUniformSetters.delete(callback);
        };
    }

    /**
     * Fires a one-shot impulse into the velocity field, in 0..1 canvas space with
     * the origin at the bottom-left. This is the hook for events the harness
     * cannot see: a beat, a route change, a form submission.
     */
    kick(
        x: number,
        y: number,
        strength: number,
        angleRadians = Math.random() * Math.PI * 2
    ): void {
        this.#pendingKick.x = Math.cos(angleRadians) * strength;
        this.#pendingKick.y = Math.sin(angleRadians) * strength;
        this.#pendingKick.originX = x;
        this.#pendingKick.originY = y;
    }

    /** True while the render loop is actually stepping. */
    get running(): boolean {
        return this.#running && this.#renderer !== null;
    }

    /** Removes every listener, deletes every GL object, and stops the loop. */
    destroy(): void {
        if (this.#destroyed) return;
        this.#destroyed = true;
        this.#motionQuery?.removeEventListener(
            "change",
            this.#handleMotionPreferenceChange
        );
        document.removeEventListener(
            "visibilitychange",
            this.#handleVisibilityChange
        );
        this.#canvas.removeEventListener(
            "webglcontextlost",
            this.#handleContextLost
        );
        this.#canvas.removeEventListener(
            "webglcontextrestored",
            this.#handleContextRestored
        );
        this.#observer?.disconnect();
        this.#observer = null;
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = null;
        window.removeEventListener(
            "scroll",
            this.#handleScroll,
            SCROLL_LISTENER
        );
        window.removeEventListener("resize", this.#handleResize);
        this.#extraUniformSetters.clear();
        this.#teardown();
    }

    // ── Impulse state ──────────────────────────────────────────────────────────

    readonly #pendingKick = { x: 0, y: 0, originX: 0.5, originY: 0.5 };

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    #handleMotionPreferenceChange = (): void => {
        if (this.#motionQuery?.matches) this.#start();
        else this.#teardown();
    };

    #handleVisibilityChange = (): void => {
        this.#visible = document.visibilityState === "visible";
        if (this.#visible && this.#options.pauseOffscreen) {
            this.#measureCanvas();
            this.#onScreen = this.#isNearViewport();
        }
        this.#syncRunState();
    };

    #handleScroll = (): void => {
        const near = this.#isNearViewport();
        if (near === this.#onScreen) return;
        this.#onScreen = near;
        this.#syncRunState();
    };

    /**
     * The observer's geometry, recomputed by hand: the viewport grown by
     * `offscreenMargin` on every side. One rect read of a static element during
     * a scroll is cheap because layout is already clean.
     */
    #isNearViewport(): boolean {
        const rect = this.#viewportTarget.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const marginX = window.innerWidth * this.#options.offscreenMargin;
        const marginY = window.innerHeight * this.#options.offscreenMargin;
        return (
            rect.bottom > -marginY &&
            rect.top < window.innerHeight + marginY &&
            rect.right > -marginX &&
            rect.left < window.innerWidth + marginX
        );
    }

    #setCanvasSize(width: number, height: number): void {
        if (width === this.#canvasCssWidth && height === this.#canvasCssHeight)
            return;
        this.#canvasCssWidth = width;
        this.#canvasCssHeight = height;
        this.#sizeDirty = true;
    }

    #measureCanvas(): void {
        this.#setCanvasSize(
            this.#canvas.clientWidth,
            this.#canvas.clientHeight
        );
        const dpr = window.devicePixelRatio || 1;
        if (dpr !== this.#canvasDpr) {
            this.#canvasDpr = dpr;
            this.#sizeDirty = true;
        }
    }

    #observeViewport(): void {
        if (typeof IntersectionObserver !== "function") return;
        this.#observer?.disconnect();
        const marginX = window.innerWidth * this.#options.offscreenMargin;
        const marginY = window.innerHeight * this.#options.offscreenMargin;
        this.#observer = new IntersectionObserver(
            () => {
                // An entry can be queued before a fast scroll settles. Use current
                // geometry, matching the scroll fallback, for one visibility truth.
                this.#onScreen = this.#isNearViewport();
                this.#syncRunState();
            },
            {
                rootMargin: `${marginY}px ${marginX}px ${marginY}px ${marginX}px`,
            }
        );
        this.#observer.observe(this.#viewportTarget);
    }

    #handleResize = (): void => {
        this.#measureCanvas();
        if (this.#options.pauseOffscreen) {
            this.#onScreen = this.#isNearViewport();
            this.#observeViewport();
        }
        this.#syncRunState();
        this.#requestFrame();
    };

    #handleContextLost = (event: Event): void => {
        // Without preventDefault the browser will not attempt a restore.
        event.preventDefault();
        this.#teardown();
    };

    #handleContextRestored = (): void => {
        this.#measureCanvas();
        if (this.#options.pauseOffscreen)
            this.#onScreen = this.#isNearViewport();
        this.#start();
    };

    #syncRunState(): void {
        if (!this.#renderer) return;
        const shouldRun =
            this.#visible && (!this.#options.pauseOffscreen || this.#onScreen);
        if (shouldRun) this.#resume();
        else this.#pause();
    }

    #start(): void {
        if (this.#destroyed || this.#renderer) return;
        if (this.#motionQuery && !this.#motionQuery.matches) return;
        try {
            this.#renderer = this.#createRenderer();
        } catch (error) {
            this.#options.onError?.(error);
            this.#renderer = null;
            return;
        }
        this.#attachPointerListeners();
        this.#syncRunState();
    }

    #teardown(): void {
        this.#pause();
        this.#detachPointerListeners();
        this.#renderer?.dispose();
        this.#renderer = null;
        this.#firstFrameDone = false;
        // Hand the CSS fallback back its turn.
        delete this.#canvas.dataset.ready;
    }

    #resume(): void {
        if (this.#running) return;
        this.#measureCanvas();
        this.#running = true;
        this.#lastFrameAt = -1; // force a synthetic first dt instead of a huge one
        this.#requestFrame();
    }

    #pause(): void {
        this.#running = false;
        if (this.#frameHandle) cancelAnimationFrame(this.#frameHandle);
        this.#frameHandle = 0;
    }

    #requestFrame(): void {
        if (!this.#running || this.#frameHandle) return;
        this.#frameHandle = requestAnimationFrame(this.#step);
    }

    // ── Pointer ────────────────────────────────────────────────────────────────

    #updatePointerFromEvent(event: PointerEvent, trackVelocity: boolean): void {
        const rect = this.#canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const x = (event.clientX - rect.left) / rect.width;
        // Flipped so the surface shares gl_FragCoord's bottom-left origin.
        const y = 1 - (event.clientY - rect.top) / rect.height;
        const now = performance.now() / 1000;

        if (trackVelocity && this.#pointer.lastEventAt >= 0) {
            const elapsed = Math.max(now - this.#pointer.lastEventAt, 0.001);
            let velocityX = (x - this.#pointer.x) / elapsed;
            let velocityY = (y - this.#pointer.y) / elapsed;

            // A flick across the panel produces an enormous instantaneous velocity;
            // injected raw it saturates the whole field in one frame and takes a
            // second to drain. Clamping the magnitude preserves direction.
            const speed = Math.hypot(velocityX, velocityY);
            const limit = this.#options.maxPointerVelocity;
            if (speed > limit) {
                velocityX *= limit / speed;
                velocityY *= limit / speed;
            }

            // One-pole smoothing, because raw per-event velocity is very noisy at high
            // report rates and the field shows every bit of that jitter.
            this.#pointer.velocityX +=
                (velocityX - this.#pointer.velocityX) * 0.35;
            this.#pointer.velocityY +=
                (velocityY - this.#pointer.velocityY) * 0.35;
        }

        this.#pointer.x = x;
        this.#pointer.y = y;
        this.#pointer.lastEventAt = now;
        this.#pointer.inside = true;
        this.#pointer.coarse = event.pointerType !== "mouse";
    }

    #handlePointerMove = (event: PointerEvent): void => {
        this.#updatePointerFromEvent(event, true);
    };

    #handlePointerDown = (event: PointerEvent): void => {
        // No velocity from a press: the jump from wherever the pointer last was to
        // the press point is not motion the user performed.
        this.#updatePointerFromEvent(event, false);
        this.#pointer.pendingTaps += 1;
    };

    #handlePointerLeave = (): void => {
        this.#pointer.inside = false;
        this.#pointer.lastEventAt = -1;
    };

    #handlePointerUp = (event: PointerEvent): void => {
        // Touch has no hover state: lifting a finger is leaving. A mouse stays.
        if (event.pointerType !== "mouse") this.#pointer.inside = false;
    };

    #attachPointerListeners(): void {
        const options: AddEventListenerOptions = { passive: true };
        this.#pointerTarget.addEventListener(
            "pointermove",
            this.#handlePointerMove,
            options
        );
        this.#pointerTarget.addEventListener(
            "pointerdown",
            this.#handlePointerDown,
            options
        );
        this.#pointerTarget.addEventListener(
            "pointerleave",
            this.#handlePointerLeave,
            options
        );
        this.#pointerTarget.addEventListener(
            "pointercancel",
            this.#handlePointerLeave,
            options
        );
        this.#pointerTarget.addEventListener(
            "pointerup",
            this.#handlePointerUp,
            options
        );
    }

    #detachPointerListeners(): void {
        this.#pointerTarget.removeEventListener(
            "pointermove",
            this.#handlePointerMove
        );
        this.#pointerTarget.removeEventListener(
            "pointerdown",
            this.#handlePointerDown
        );
        this.#pointerTarget.removeEventListener(
            "pointerleave",
            this.#handlePointerLeave
        );
        this.#pointerTarget.removeEventListener(
            "pointercancel",
            this.#handlePointerLeave
        );
        this.#pointerTarget.removeEventListener(
            "pointerup",
            this.#handlePointerUp
        );
    }

    // ── Frame state ────────────────────────────────────────────────────────────

    #lastFrameAt = -1;

    #step: FrameRequestCallback = () => {
        this.#frameHandle = 0;
        this.#drawFrame();
    };

    /**
     * Replaced by the renderer closure on start and reset to a no-op on teardown,
     * so a frame already queued when the context is lost cannot touch dead
     * GL objects.
     */
    #drawFrame: () => void = () => undefined;

    // ── Renderer ───────────────────────────────────────────────────────────────

    #createRenderer(): { stop(): void; dispose(): void } {
        const canvas = this.#canvas;
        const options = this.#options;

        const gl = canvas.getContext("webgl2", {
            // Opaque by default: an alpha-less drawing buffer skips a compositing
            // blend per frame. A transparent surface writes premultiplied colour.
            alpha: options.transparent,
            premultipliedAlpha: true,
            antialias: false,
            // Fullscreen triangles never test or write either buffer.
            depth: false,
            stencil: false,
            powerPreference: options.powerPreference,
        });
        if (!gl) throw new Error("WebGL2 is unavailable");

        // As a string, so the literal is unambiguously a float wherever the shaders
        // use it in arithmetic. A surface may override any of these.
        const velocityDefine = { MAX_VELOCITY: MAX_VELOCITY.toFixed(1) };
        const defines = { ...velocityDefine, ...(options.defines ?? {}) };
        const vertexSource = buildShaderSource(CORE_SHADERS.vertex);
        const flowProgram = compileProgram(
            gl,
            vertexSource,
            buildShaderSource(CORE_SHADERS.flowFragment, velocityDefine),
            "flow"
        );
        const surfaceProgram = compileProgram(
            gl,
            vertexSource,
            buildShaderSource(options.fragmentSource, defines),
            "surface"
        );
        const presentProgram = compileProgram(
            gl,
            vertexSource,
            buildShaderSource(CORE_SHADERS.presentFragment),
            "present"
        );

        const flowUniforms = cacheUniformLocations(gl, flowProgram);
        const surfaceUniforms = cacheUniformLocations(gl, surfaceProgram);
        const presentUniforms = cacheUniformLocations(gl, presentProgram);

        // A random phase offset so two panels on a page, and two loads of the same
        // page, never start on the same wave crest.
        let time = 90 * Math.random();

        let fieldFront: RenderTarget | null = null;
        let fieldBack: RenderTarget | null = null;
        let colorTarget: RenderTarget | null = null;
        let canvasWidth = 0;
        let canvasHeight = 0;

        let hover = 0;
        let duck = 0;
        let springVelocityX = 0;
        let springVelocityY = 0;

        const impulse = { x: 0, y: 0, originX: 0.5, originY: 0.5 };
        const tapImpulse = { x: 0, y: 0, originX: 0.5, originY: 0.5 };
        // vec4 per slot: (firedAt, strength) packed as xy and zw across two taps.
        const tapTimes = new Float32Array([-1000, 0, -1000, 0]);
        const tapPositions = new Float32Array([0.5, 0.5, 0.5, 0.5]);
        let nextTapSlot = 0;

        const setterTarget = { locations: surfaceUniforms };
        const context = this.#createFrameContext(gl, setterTarget);
        const hooks: SurfaceHooks =
            options.uniforms?.(gl, surfaceProgram) ?? {};

        const releaseTargets = (): void => {
            for (const target of [fieldFront, fieldBack, colorTarget]) {
                if (!target) continue;
                gl.deleteTexture(target.texture);
                gl.deleteFramebuffer(target.framebuffer);
            }
            fieldFront = fieldBack = colorTarget = null;
        };

        /** @returns false when the canvas has no area yet and the frame should be skipped. */
        const ensureTargets = (): boolean => {
            const cssWidth = this.#canvasCssWidth;
            const cssHeight = this.#canvasCssHeight;
            if (cssWidth === 0 || cssHeight === 0) return false;

            if (!this.#sizeDirty && fieldFront) return true;

            const requestedDpr = Math.min(this.#canvasDpr || 1, options.maxDpr);
            const shouldApplyCanvasBudget =
                this.#mobileCanvasBudgetQuery?.matches ?? false;
            // The present pass renders at drawing-buffer resolution. Its effective
            // DPR can be reduced by the mobile target, since a DPR cap alone cannot
            // protect a tall mobile hero from a multi-megapixel full-screen pass.
            const budgetDpr = Math.sqrt(
                MOBILE_CANVAS_PIXEL_TARGET / (cssWidth * cssHeight)
            );
            const canvasDpr = shouldApplyCanvasBudget
                ? Math.min(requestedDpr, budgetDpr)
                : requestedDpr;
            const roundDimension = shouldApplyCanvasBudget
                ? Math.floor
                : Math.round;
            const width = Math.max(roundDimension(cssWidth * canvasDpr), 1);
            const height = Math.max(roundDimension(cssHeight * canvasDpr), 1);
            if (
                width === canvasWidth &&
                height === canvasHeight &&
                fieldFront
            ) {
                this.#sizeDirty = false;
                return true;
            }

            canvasWidth = width;
            canvasHeight = height;
            canvas.width = width;
            canvas.height = height;

            const aspect = width / height;
            hooks.resize?.(aspect);
            releaseTargets();

            // The flow budget is spent on the long axis, so a wide panel does not get
            // a stretched field. 8 px is the floor below which advection breaks down.
            const flowWidth =
                aspect >= 1
                    ? options.flowSize
                    : Math.max(Math.round(options.flowSize * aspect), 8);
            const flowHeight =
                aspect >= 1
                    ? Math.max(Math.round(options.flowSize / aspect), 8)
                    : options.flowSize;

            const colorHeight = Math.min(
                Math.round(height * options.renderScale),
                options.maxInternalHeight
            );
            const colorWidth = Math.max(Math.round(colorHeight * aspect), 8);

            fieldFront = createRenderTarget(gl, flowWidth, flowHeight, true);
            fieldBack = createRenderTarget(gl, flowWidth, flowHeight, true);
            colorTarget = createRenderTarget(
                gl,
                colorWidth,
                colorHeight,
                false
            );
            this.#sizeDirty = false;
            return true;
        };

        const pointer = this.#pointer;
        const [homeX, homeY] = options.home;

        const renderFrame = (): void => {
            if (this.#destroyed || gl.isContextLost()) return;
            if (!ensureTargets() || !fieldFront || !fieldBack || !colorTarget) {
                this.#requestFrame();
                return;
            }

            const now = performance.now() / 1000;
            const dt =
                this.#lastFrameAt < 0
                    ? 1 / 60
                    : Math.min(now - this.#lastFrameAt, MAX_TIMESTEP_SECONDS);
            this.#lastFrameAt = now;
            time += dt;

            const aspect = canvasWidth / canvasHeight;

            // Autonomous drift: two incommensurate sines, so the injection point walks
            // a Lissajous path that never repeats on a period the eye can catch.
            const breezePhase = options.breeze.speed * time;
            const breezeX = 0.5 + 0.38 * Math.sin(0.7 * breezePhase + 1.3);
            const breezeY = 0.5 + 0.34 * Math.sin(1.13 * breezePhase + 4.1);
            // Tangent of that path, scaled for feel rather than taken as the exact
            // derivative: the true derivative is far too small to disturb the field.
            const breezeVelocityX =
                1.86 *
                Math.cos(0.7 * breezePhase + 1.3) *
                options.breeze.amplitude;
            const breezeVelocityY =
                2.69 *
                Math.cos(1.13 * breezePhase + 4.1) *
                options.breeze.amplitude;

            this.#frameContextState.time = time;
            this.#frameContextState.dt = dt;
            this.#frameContextState.aspect = aspect;
            this.#frameContextState.interactionScale = pointer.coarse
                ? options.coarsePointerScale
                : 1;

            const advanced = hooks.advance?.(context);
            if (advanced && typeof advanced.duck === "number")
                duck = advanced.duck;

            // Adopt any impulse queued through kick() since the last frame.
            if (this.#pendingKick.x !== 0 || this.#pendingKick.y !== 0) {
                impulse.x = this.#pendingKick.x;
                impulse.y = this.#pendingKick.y;
                impulse.originX = this.#pendingKick.originX;
                impulse.originY = this.#pendingKick.originY;
                this.#pendingKick.x = 0;
                this.#pendingKick.y = 0;
            }
            const impulseDecay = Math.exp(-IMPULSE_DECAY * dt);
            impulse.x *= impulseDecay;
            impulse.y *= impulseDecay;

            // Asymmetric envelope: quick in so entering feels responsive, slow out so
            // leaving reads as the panel settling rather than the effect switching off.
            const target = pointer.inside ? 1 : 0;
            const tau = pointer.inside
                ? options.presenceAttack
                : options.presenceRelease;
            hover += (target - hover) * (1 - Math.exp(-dt / tau));
            const presence = hover * (1 - duck);

            // Critically damped spring, semi-implicit Euler. Critically damped means
            // no overshoot, which is what separates "attached to the cursor" from
            // "wobbling near the cursor".
            const omega = options.springOmega;
            const targetX = pointer.inside ? pointer.x : homeX;
            const targetY = pointer.inside ? pointer.y : homeY;
            springVelocityX +=
                (omega * omega * (targetX - pointer.springX) -
                    2 * omega * springVelocityX) *
                dt;
            springVelocityY +=
                (omega * omega * (targetY - pointer.springY) -
                    2 * omega * springVelocityY) *
                dt;
            pointer.springX += springVelocityX * dt;
            pointer.springY += springVelocityY * dt;

            if (!pointer.inside) {
                const decay = Math.exp(-dt * options.pointerVelocityDecay);
                pointer.velocityX *= decay;
                pointer.velocityY *= decay;
            }

            if (pointer.pendingTaps > 0) {
                pointer.pendingTaps = 0;
                tapTimes[2 * nextTapSlot] = time;
                tapTimes[2 * nextTapSlot + 1] = 1;
                tapPositions[2 * nextTapSlot] = pointer.x;
                tapPositions[2 * nextTapSlot + 1] = pointer.y;
                nextTapSlot = (nextTapSlot + 1) % TAP_SLOTS;

                // Random direction: a tap has no direction of its own, and always
                // pushing the same way makes repeated clicks look mechanical.
                const angle = Math.random() * Math.PI * 2;
                tapImpulse.x = Math.cos(angle) * options.tapImpulse;
                tapImpulse.y = Math.sin(angle) * options.tapImpulse;
                tapImpulse.originX = pointer.x;
                tapImpulse.originY = pointer.y;
            }
            tapImpulse.x *= impulseDecay;
            tapImpulse.y *= impulseDecay;

            this.#frameContextState.presence = presence;
            hooks.react?.(context);

            // ── Pass 1: advance the velocity field into the back buffer ──
            // Pinned to consts: the uniform setters below are closures, and a `let`
            // that is reassigned later in this function (the swap) cannot stay
            // narrowed inside them.
            const fieldRead = fieldFront;
            const fieldWrite = fieldBack;

            gl.bindFramebuffer(gl.FRAMEBUFFER, fieldWrite.framebuffer);
            gl.viewport(0, 0, fieldWrite.width, fieldWrite.height);
            gl.useProgram(flowProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, fieldRead.texture);

            const setFlow = (
                name: string,
                apply: (location: WebGLUniformLocation) => void
            ): void => {
                const location = flowUniforms.get(name);
                if (location) apply(location);
            };
            setFlow("u_previous", (l) => gl.uniform1i(l, 0));
            setFlow("u_res", (l) =>
                gl.uniform2f(l, fieldWrite.width, fieldWrite.height)
            );
            setFlow("u_dt", (l) => gl.uniform1f(l, dt));
            setFlow("u_time", (l) => gl.uniform1f(l, time));
            setFlow("u_aspect", (l) => gl.uniform1f(l, aspect));
            setFlow("u_pointer", (l) => gl.uniform2f(l, pointer.x, pointer.y));
            setFlow("u_pointerVel", (l) =>
                gl.uniform2f(l, pointer.velocityX, pointer.velocityY)
            );
            setFlow("u_presence", (l) => gl.uniform1f(l, presence));
            setFlow("u_scale", (l) =>
                gl.uniform1f(l, this.#frameContextState.interactionScale)
            );
            setFlow("u_breeze", (l) => gl.uniform2f(l, breezeX, breezeY));
            setFlow("u_breezeVel", (l) =>
                gl.uniform2f(l, breezeVelocityX, breezeVelocityY)
            );
            setFlow("u_impulse", (l) => gl.uniform2f(l, impulse.x, impulse.y));
            setFlow("u_impulsePos", (l) =>
                gl.uniform2f(l, impulse.originX, impulse.originY)
            );
            setFlow("u_tapImpulse", (l) =>
                gl.uniform2f(l, tapImpulse.x, tapImpulse.y)
            );
            setFlow("u_tapImpulsePos", (l) =>
                gl.uniform2f(l, tapImpulse.originX, tapImpulse.originY)
            );
            setFlow("u_fieldDecay", (l) => gl.uniform1f(l, options.fieldDecay));
            setFlow("u_pointerForce", (l) =>
                gl.uniform1f(l, options.pointerForce)
            );
            setFlow("u_stillnessPull", (l) =>
                gl.uniform1f(l, options.stillnessPull)
            );
            setFlow("u_forceRadius", (l) =>
                gl.uniform1f(l, options.forceRadius)
            );
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // Swap: the freshly written field becomes the one everything reads.
            fieldFront = fieldWrite;
            fieldBack = fieldRead;

            // ── Pass 2: the surface, reading the field just written ──
            const surfaceTarget = colorTarget;
            gl.bindFramebuffer(gl.FRAMEBUFFER, surfaceTarget.framebuffer);
            gl.viewport(0, 0, surfaceTarget.width, surfaceTarget.height);
            gl.useProgram(surfaceProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, fieldWrite.texture);

            const setSurface = (
                name: string,
                apply: (location: WebGLUniformLocation) => void
            ): void => {
                const location = surfaceUniforms.get(name);
                if (location) apply(location);
            };
            setSurface("u_flow", (l) => gl.uniform1i(l, 0));
            setSurface("u_res", (l) =>
                gl.uniform2f(l, surfaceTarget.width, surfaceTarget.height)
            );
            setSurface("u_time", (l) => gl.uniform1f(l, time));
            setSurface("u_aspect", (l) => gl.uniform1f(l, aspect));
            setSurface("u_sprung", (l) =>
                gl.uniform2f(l, pointer.springX, pointer.springY)
            );
            setSurface("u_presence", (l) => gl.uniform1f(l, presence));
            setSurface("u_scale", (l) =>
                gl.uniform1f(l, this.#frameContextState.interactionScale)
            );
            setSurface("u_taps", (l) =>
                gl.uniform4f(
                    l,
                    tapTimes[0],
                    tapTimes[1],
                    tapTimes[2],
                    tapTimes[3]
                )
            );
            setSurface("u_tapPos", (l) =>
                gl.uniform4f(
                    l,
                    tapPositions[0],
                    tapPositions[1],
                    tapPositions[2],
                    tapPositions[3]
                )
            );

            hooks.draw?.(context);
            for (const callback of this.#extraUniformSetters) callback(context);
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            // ── Pass 3: present at drawing-buffer resolution ──
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvasWidth, canvasHeight);
            gl.useProgram(presentProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, surfaceTarget.texture);

            const setPresent = (
                name: string,
                apply: (location: WebGLUniformLocation) => void
            ): void => {
                const location = presentUniforms.get(name);
                if (location) apply(location);
            };
            setPresent("u_color", (l) => gl.uniform1i(l, 0));
            setPresent("u_res", (l) =>
                gl.uniform2f(l, canvasWidth, canvasHeight)
            );
            setPresent("u_time", (l) => gl.uniform1f(l, time));
            setPresent("u_aspect", (l) => gl.uniform1f(l, aspect));
            setPresent("u_grain", (l) => gl.uniform1f(l, options.grain));
            setPresent("u_vignette", (l) => gl.uniform1f(l, options.vignette));
            gl.drawArrays(gl.TRIANGLES, 0, 3);

            if (!this.#firstFrameDone) {
                this.#firstFrameDone = true;
                // Only now is there something worth looking at; before this the canvas
                // is a black rectangle over the gradient fallback.
                options.onFirstFrame?.(canvas);
            }
            this.#requestFrame();
        };

        this.#drawFrame = renderFrame;

        return {
            stop: () => this.#pause(),
            dispose: () => {
                this.#drawFrame = () => undefined;
                releaseTargets();
                gl.deleteProgram(flowProgram);
                gl.deleteProgram(surfaceProgram);
                gl.deleteProgram(presentProgram);
            },
        };
    }

    // ── FrameContext plumbing ──────────────────────────────────────────────────

    readonly #frameContextState = {
        time: 0,
        dt: 1 / 60,
        aspect: 1,
        presence: 0,
        interactionScale: 1,
    };

    #createFrameContext(
        gl: WebGL2RenderingContext,
        target: { locations: UniformMap }
    ): FrameContext {
        const state = this.#frameContextState;
        const pointer = this.#pointer;

        const locate = (name: string): WebGLUniformLocation | undefined =>
            target.locations.get(name);

        const pointerView: PointerState = {
            get x() {
                return pointer.x;
            },
            get y() {
                return pointer.y;
            },
            get velocityX() {
                return pointer.velocityX;
            },
            get velocityY() {
                return pointer.velocityY;
            },
            get springX() {
                return pointer.springX;
            },
            get springY() {
                return pointer.springY;
            },
            get inside() {
                return pointer.inside;
            },
            get coarse() {
                return pointer.coarse;
            },
        };

        return {
            gl,
            get time() {
                return state.time;
            },
            get dt() {
                return state.dt;
            },
            get aspect() {
                return state.aspect;
            },
            get presence() {
                return state.presence;
            },
            get interactionScale() {
                return state.interactionScale;
            },
            pointer: pointerView,
            kick: (x, y, strength, angleRadians) =>
                this.kick(x, y, strength, angleRadians),
            has: (name) => target.locations.has(name),
            setInt(name, value) {
                const location = locate(name);
                if (location) gl.uniform1i(location, value);
            },
            setFloat(name, value) {
                const location = locate(name);
                if (location) gl.uniform1f(location, value);
            },
            setVec2(name, x, y) {
                const location = locate(name);
                if (location) gl.uniform2f(location, x, y);
            },
            setVec3(name, x, y, z) {
                const location = locate(name);
                if (location) gl.uniform3f(location, x, y, z);
            },
            setVec4(name, x, y, z, w) {
                const location = locate(name);
                if (location) gl.uniform4f(location, x, y, z, w);
            },
            setFloatArray(name, values) {
                const location = locate(name);
                if (location) gl.uniform1fv(location, values);
            },
            setVec2Array(name, values) {
                const location = locate(name);
                if (location) gl.uniform2fv(location, values);
            },
            setVec3Array(name, values) {
                const location = locate(name);
                if (location) gl.uniform3fv(location, values);
            },
            setVec4Array(name, values) {
                const location = locate(name);
                if (location) gl.uniform4fv(location, values);
            },
        };
    }
}
