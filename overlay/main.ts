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
    type Settings,
} from "../src/settings";
import { labStops, rotateHexHue } from "./webgl/core/color";
import { mountCustom } from "./webgl/vanilla/mount-custom";
// @ts-ignore -- text import provided by rollup.config.mjs
import auroraSource from "./aurora.frag.glsl?raw";

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

let toolbarShare = TOOLBAR_PX / innerHeight;
addEventListener("resize", () => {
    toolbarShare = TOOLBAR_PX / innerHeight;
});

// The settings panel is a sibling frame of this one, so it can post here directly; Drawdy offers no channel into a floating iframe.
addEventListener("message", (event) => {
    const data = event.data as { type?: unknown; settings?: unknown } | null;
    if (data?.type !== SETTINGS_MESSAGE) return;
    settings = readSettings(data.settings);
    paletteDirty = true;
    syncFallback();
    (event.source as Window | null)?.postMessage({ type: ACK_MESSAGE }, "*");
});

let phase: number | null = null;

mountCustom(
    body,
    {
        name: "aurora",
        fragmentSource: auroraSource as string,
        onFrame: (context) => {
            phase = (phase ?? context.time) + context.dt * settings.speed;
            if (paletteDirty) {
                context.setVec3Array("u_palette", labStops(colours(settings)));
                paletteDirty = false;
            }
            context.setFloat("u_phase", phase);
            context.setFloat("u_motion", Math.min(settings.speed, 1));
            context.setFloat("u_strength", strengthFor(settings, theme));
            context.setFloat("u_height", settings.height);
            context.setFloat("u_haze", settings.haze);
            context.setFloat("u_toolbar", toolbarShare);
        },
    },
    {
        transparent: true,
        maxDpr: 1,
        renderScale: 0.5,
        grain: grainFor(theme),
        vignette: 0,
        onError: () => {
            failed = true;
            syncFallback();
        },
    }
);
