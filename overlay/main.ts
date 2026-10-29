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

const TOOLBAR_PX = 64;

function fallbackGradient({ colours: [c0, c1, c2, c3], strength }: Look) {
    return [
        `radial-gradient(70% 45% at 30% 85%, ${tint(c0, strength)}, transparent 70%)`,
        `radial-gradient(60% 40% at 75% 55%, ${tint(c1, strength * 0.8)}, transparent 70%)`,
        `radial-gradient(70% 45% at 40% 25%, ${tint(c3, strength * 0.7)}, transparent 70%)`,
        `linear-gradient(${tint(c2, strength * 0.35)}, ${tint(c2, strength * 0.35)})`,
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

let toolbarShare = TOOLBAR_PX / innerHeight;
addEventListener("resize", () => {
    toolbarShare = TOOLBAR_PX / innerHeight;
});

mountCustom(
    body,
    {
        name: "aurora",
        fragmentSource: auroraSource as string,
        onInit: (context) =>
            context.setVec3Array("u_palette", labStops(look.colours)),
        onFrame: (context) => {
            context.setFloat("u_strength", look.strength);
            context.setFloat("u_toolbar", toolbarShare);
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

            let toolbarShare = TOOLBAR_PX / innerHeight;
            addEventListener("resize", () => {
                toolbarShare = TOOLBAR_PX / innerHeight;
            });
        },
    }
);
