import type { Look } from "../src/look";
import { labStops } from "./webgl/core/color";
import { mountCustom } from "./webgl/vanilla/mount-custom";
// @ts-ignore -- text import provided by rollup.config.mjs
import auroraSource from "./aurora.frag.glsl?raw";

const FALLBACK_CLASS = "bg-(image:--hero-fallback)";

const look = JSON.parse(
    document.getElementById("aurora-look")?.textContent ?? "null"
) as Look;

const tint = (colour: string, share: number): string =>
    `color-mix(in oklab, ${colour} ${Math.round(share * 100)}%, transparent)`;

function fallbackGradient({ colours: [c0, c1, , c3], strength }: Look) {
    return [
        `radial-gradient(45% 38% at 50% 100%, ${tint(c0, strength)}, transparent 70%)`,
        `radial-gradient(35% 30% at 32% 100%, ${tint(c1, strength * 0.7)}, transparent 70%)`,
        `radial-gradient(35% 30% at 68% 100%, ${tint(c3, strength * 0.6)}, transparent 70%)`,
    ].join(", ");
}

const body = document.body;
body.style.setProperty("--hero-fallback", fallbackGradient(look));
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let failed = false;
const syncFallback = () =>
    body.classList.toggle(FALLBACK_CLASS, failed || reduced.matches);
reduced.addEventListener("change", syncFallback);
syncFallback();

mountCustom(
    body,
    {
        name: "aurora",
        fragmentSource: auroraSource as string,
        onInit: (context) =>
            context.setVec3Array("u_palette", labStops(look.colours)),
        onFrame: (context) => {
            context.setFloat("u_reach", look.reach);
            context.setFloat("u_strength", look.strength);
        },
    },
    {
        transparent: true,
        maxDpr: 1,
        renderScale: 0.5,
        grain: look.grain,
        vignette: 0,
        onError: () => {
            failed = true;
            syncFallback();
        },
    }
);
