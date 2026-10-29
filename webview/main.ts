import builds from "virtual:aurora-patterns";
import { createStillRenderer } from "../overlay/still";
import { labStops, rotateHexHue } from "../overlay/webgl/core/color";
import { paletteFor, type Theme } from "../src/look";
import type { DriverToWebview, WebviewToDriver } from "../src/messages";
import {
    patternById,
    type PatternGroup,
    type PatternId,
} from "../src/patterns";
import {
    ACK_MESSAGE,
    DEFAULT_SETTINGS,
    SETTINGS_MESSAGE,
    SLIDERS,
    readSettings,
    startFrom,
    type PresetId,
    type Settings,
} from "../src/settings";

type DrawdyWebviewApi = {
    postMessage(message: unknown): void;
    onMessage(listener: (message: unknown) => void): () => void;
};

declare function acquireDrawdyApi(): DrawdyWebviewApi;

const COMMIT_MS = 300;
const LIVE_MS = 1500;
const THUMB_BUDGET_MS = 8;
const THUMB_PHASE = 12;
const BOARD = { dark: "#19191b", light: "#f3f3f3" };

const api = acquireDrawdyApi();
const send = (message: WebviewToDriver) => api.postMessage(message);
const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
const all = <T extends HTMLElement>(selector: string) => [
    ...document.querySelectorAll<T>(selector),
];

const stylingEl = byId<HTMLStyleElement>("drawdy-styling");
const enabledEl = byId<HTMLInputElement>("enabled");
const patternNameEl = byId<HTMLSpanElement>("pattern-name");
const groupEls = all<HTMLButtonElement>("[data-group-filter]");
const patternEls = all<HTMLButtonElement>("[data-pattern]");
const thumbEls = all<HTMLCanvasElement>("[data-thumb]");
const presetEls = all<HTMLButtonElement>("[data-preset]");
const swatchEls = all<HTMLSpanElement>("[data-swatch]");

let settings: Settings = { ...DEFAULT_SETTINGS };
let theme: Theme = { dark: true, accent: null };
let group: PatternGroup | "all" = "all";
let lastAck = -Infinity;
let commitTimer: ReturnType<typeof setTimeout> | undefined;

const renderer = createStillRenderer();
let thumbKey = "";
let thumbQueue: HTMLCanvasElement[] = [];
let thumbFrame = 0;

const colours = (s: Settings) =>
    paletteFor(s, theme).map((c) => rotateHexHue(c, s.hue));

// One shared WebGL context draws every thumbnail, a few per frame, because a page gets only about 16 contexts.
function drawThumbs(): void {
    thumbFrame = 0;
    if (!renderer) return;
    const started = performance.now();
    const palette = labStops(colours(settings));
    while (thumbQueue.length && performance.now() - started < THUMB_BUDGET_MS) {
        const el = thumbQueue.shift()!;
        const build = builds[el.dataset.thumb as PatternId];
        if (!build) continue;
        const still = renderer.render(build, el.width, el.height, {
            palette,
            strength: theme.dark ? 0.8 : 0.65,
            haze: settings.haze,
            height: 1,
            phase: THUMB_PHASE,
            zoom: build.thumbZoom,
        });
        const ctx = el.getContext("2d")!;
        ctx.clearRect(0, 0, el.width, el.height);
        if (typeof still !== "string") ctx.drawImage(still, 0, 0);
    }
    if (thumbQueue.length) thumbFrame = requestAnimationFrame(drawThumbs);
}

function scheduleThumbs(): void {
    const key = JSON.stringify([
        settings.preset,
        settings.hue,
        settings.haze,
        theme,
    ]);
    if (key === thumbKey) return;
    thumbKey = key;
    thumbQueue = [...thumbEls];
    if (!thumbFrame) thumbFrame = requestAnimationFrame(drawThumbs);
}

function render(): void {
    document.documentElement.style.setProperty(
        "--thumb-board",
        theme.dark ? BOARD.dark : BOARD.light
    );
    for (const el of groupEls)
        el.setAttribute(
            "aria-pressed",
            String(el.dataset.groupFilter === group)
        );
    for (const el of patternEls) {
        el.setAttribute(
            "aria-pressed",
            String(el.dataset.pattern === settings.pattern)
        );
        el.hidden = group !== "all" && el.dataset.group !== group;
    }
    const pattern = patternById(settings.pattern);
    patternNameEl.textContent = pattern.label;
    byId<HTMLLabelElement>("label-height").textContent = pattern.scaleLabel;
    for (const el of presetEls)
        el.setAttribute(
            "aria-pressed",
            String(el.dataset.preset === settings.preset)
        );
    for (const el of swatchEls) {
        const preset = el.dataset.swatch as PresetId;
        el.style.setProperty(
            "--swatch",
            `linear-gradient(90deg, ${paletteFor({ ...settings, preset }, theme).join(", ")})`
        );
    }
    for (const slider of SLIDERS) {
        const input = byId<HTMLInputElement>(`slider-${slider.key}`);
        const value = settings[slider.key];
        input.value = String(value);
        input.style.setProperty(
            "--fill",
            `${((value - slider.min) / (slider.max - slider.min)) * 100}%`
        );
        byId<HTMLOutputElement>(`value-${slider.key}`).textContent =
            slider.format(value);
    }
    scheduleThumbs();
}

function revealSelected(): void {
    patternEls
        .find((el) => el.dataset.pattern === settings.pattern)
        ?.scrollIntoView({ block: "nearest" });
}

// Drawdy only relays panel messages to the driver, so live changes go straight to the overlay frame, a sibling under the same top window.
function broadcast(): void {
    const frames = window.top?.frames;
    if (!frames) return;
    for (let i = 0; i < frames.length; i++) {
        try {
            frames[i].postMessage({ type: SETTINGS_MESSAGE, settings }, "*");
        } catch {
            continue;
        }
    }
}

function commitSoon(): void {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
        send({
            type: "settings",
            settings,
            live: performance.now() - lastAck < LIVE_MS,
        });
    }, COMMIT_MS);
}

function apply(next: Settings): void {
    settings = next;
    render();
    broadcast();
    commitSoon();
}

for (const el of thumbEls) {
    const dpr = devicePixelRatio || 1;
    el.width = Math.round(Number(el.dataset.w) * dpr);
    el.height = Math.round(Number(el.dataset.h) * dpr);
}

for (const slider of SLIDERS) {
    byId<HTMLInputElement>(`slider-${slider.key}`).addEventListener(
        "input",
        (event) =>
            apply(
                readSettings({
                    ...settings,
                    [slider.key]: Number(
                        (event.currentTarget as HTMLInputElement).value
                    ),
                })
            )
    );
}

for (const el of groupEls)
    el.addEventListener("click", () => {
        group = el.dataset.groupFilter as PatternGroup | "all";
        render();
        revealSelected();
    });

for (const el of patternEls)
    el.addEventListener("click", () =>
        apply({ ...settings, pattern: el.dataset.pattern as PatternId })
    );

for (const el of presetEls)
    el.addEventListener("click", () =>
        apply(startFrom(el.dataset.preset as PresetId, settings.pattern))
    );

byId<HTMLButtonElement>("reset").addEventListener("click", () =>
    apply(startFrom(settings.preset, settings.pattern))
);

enabledEl.addEventListener("change", () =>
    send({ type: "enabled", enabled: enabledEl.checked })
);

addEventListener("message", (event) => {
    if ((event.data as { type?: unknown } | null)?.type === ACK_MESSAGE)
        lastAck = performance.now();
});

api.onMessage((raw) => {
    const message = raw as DriverToWebview;
    if (message?.type === "init") {
        settings = readSettings(message.settings);
        theme = message.theme;
        enabledEl.checked = message.enabled;
        render();
        revealSelected();
    } else if (message?.type === "theme") {
        stylingEl.textContent = `:root{${message.cssVars}}`;
        theme = message.theme;
        render();
    }
});

render();
send({ type: "ready" });
