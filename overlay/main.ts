import {
    grainFor,
    paletteFor,
    strengthFor,
    type Look,
    type Theme,
} from "../src/look";
import {
    ACK_MESSAGE,
    SETTINGS_MESSAGE,
    readSettings,
    type PatternId,
    type Settings,
} from "../src/settings";
import { labStops, rotateHexHue } from "./webgl/core/color";
import type { SurfaceHandle } from "./webgl/core/types";
import { mountCustom } from "./webgl/vanilla/mount-custom";
// @ts-ignore -- text import provided by rollup.config.mjs
import contoursSource from "./patterns/contours.frag.glsl?raw";
// @ts-ignore -- text import provided by rollup.config.mjs
import curtainsSource from "./patterns/curtains.frag.glsl?raw";
// @ts-ignore -- text import provided by rollup.config.mjs
import dotsSource from "./patterns/dots.frag.glsl?raw";
// @ts-ignore -- text import provided by rollup.config.mjs
import glyphsSource from "./patterns/glyphs.frag.glsl?raw";

const FALLBACK_CLASS = "bg-(image:--hero-fallback)";
const TOOLBAR_PX = 64;

const look = JSON.parse(
    document.getElementById("aurora-look")?.textContent ?? "{}"
) as Look;
const theme: Theme = { dark: look.dark === true, accent: look.accent ?? null };
let settings = readSettings(look.settings);
let paletteDirty = true;

const colours = (s: Settings) =>
    paletteFor(s, theme).map((c) => rotateHexHue(c, s.hue));

const tint = (colour: string, share: number): string =>
    `color-mix(in oklab, ${colour} ${Math.round(share * 100)}%, transparent)`;

function fallbackGradient(s: Settings): string {
    const [c0, c1, c2, c3] = colours(s);
    const strength = strengthFor(s, theme);
    return [
        `radial-gradient(70% 45% at 30% 85%, ${tint(c0, strength)}, transparent 70%)`,
        `radial-gradient(60% 40% at 75% 55%, ${tint(c1, strength * 0.8)}, transparent 70%)`,
        `radial-gradient(70% 45% at 40% 25%, ${tint(c3, strength * 0.7)}, transparent 70%)`,
        `linear-gradient(${tint(c2, strength * 0.35 * s.haze)}, ${tint(c2, strength * 0.35 * s.haze)})`,
    ].join(", ");
}

const body = document.body;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let failed = false;
const syncFallback = () => {
    body.style.setProperty("--hero-fallback", fallbackGradient(settings));
    body.classList.toggle(FALLBACK_CLASS, failed || reduced.matches);
};
reduced.addEventListener("change", syncFallback);
syncFallback();

// The soft curtains can render at half resolution; the crisp patterns need every pixel.
const PATTERN_SETUP: Record<
    PatternId,
    { source: string; renderScale: number; maxDpr: number; grain: boolean }
> = {
    curtains: {
        source: curtainsSource as string,
        renderScale: 0.5,
        maxDpr: 1,
        grain: true,
    },
    glyphs: {
        source: glyphsSource as string,
        renderScale: 1,
        maxDpr: 2,
        grain: false,
    },
    dots: {
        source: dotsSource as string,
        renderScale: 1,
        maxDpr: 2,
        grain: false,
    },
    contours: {
        source: contoursSource as string,
        renderScale: 1,
        maxDpr: 2,
        grain: false,
    },
};

let toolbarShare = TOOLBAR_PX / innerHeight;
let viewport = [innerWidth, innerHeight] as const;
addEventListener("resize", () => {
    toolbarShare = TOOLBAR_PX / innerHeight;
    viewport = [innerWidth, innerHeight];
});

// The settings panel is a sibling frame of this one, so it can post here directly; Drawdy offers no channel into a floating iframe.
addEventListener("message", (event) => {
    const data = event.data as { type?: unknown; settings?: unknown } | null;
    if (data?.type !== SETTINGS_MESSAGE) return;
    const next = readSettings(data.settings);
    const patternChanged = next.pattern !== settings.pattern;
    settings = next;
    paletteDirty = true;
    if (patternChanged) {
        surface?.destroy();
        surface = mount(settings.pattern);
    }
    syncFallback();
    (event.source as Window | null)?.postMessage({ type: ACK_MESSAGE }, "*");
});

let phase: number | null = null;

function mount(pattern: PatternId): SurfaceHandle {
    const setup = PATTERN_SETUP[pattern];
    paletteDirty = true;
    return mountCustom(
        body,
        {
            name: pattern,
            fragmentSource: setup.source,
            onFrame: (context) => {
                phase = (phase ?? context.time) + context.dt * settings.speed;
                if (paletteDirty) {
                    context.setVec3Array(
                        "u_palette",
                        labStops(colours(settings))
                    );
                    paletteDirty = false;
                }
                context.setFloat("u_phase", phase);
                context.setFloat("u_motion", Math.min(settings.speed, 1));
                context.setFloat("u_strength", strengthFor(settings, theme));
                context.setFloat("u_height", settings.height);
                context.setFloat("u_haze", settings.haze);
                context.setFloat("u_toolbar", toolbarShare);
                context.setVec2("u_viewport", viewport[0], viewport[1]);
            },
        },
        {
            transparent: true,
            maxDpr: setup.maxDpr,
            renderScale: setup.renderScale,
            grain: setup.grain ? grainFor(theme) : 0,
            vignette: 0,
            onError: () => {
                failed = true;
                syncFallback();
            },
        }
    );
}

let surface: SurfaceHandle | null = mount(settings.pattern);
