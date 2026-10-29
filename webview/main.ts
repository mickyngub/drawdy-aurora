import { paletteFor, type Theme } from "../src/look";
import type { DriverToWebview, WebviewToDriver } from "../src/messages";
import {
    ACK_MESSAGE,
    DEFAULT_SETTINGS,
    SETTINGS_MESSAGE,
    SLIDERS,
    patternById,
    readSettings,
    startFrom,
    type PatternId,
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

const api = acquireDrawdyApi();
const send = (message: WebviewToDriver) => api.postMessage(message);
const byId = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;

const stylingEl = byId<HTMLStyleElement>("drawdy-styling");
const enabledEl = byId<HTMLInputElement>("enabled");
const patternEls = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-pattern]"),
];
const presetEls = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-preset]"),
];
const swatchEls = [
    ...document.querySelectorAll<HTMLSpanElement>("[data-swatch]"),
];

let settings: Settings = { ...DEFAULT_SETTINGS };
let theme: Theme = { dark: true, accent: null };
let lastAck = -Infinity;
let commitTimer: ReturnType<typeof setTimeout> | undefined;

function render(): void {
    for (const el of patternEls)
        el.setAttribute(
            "aria-pressed",
            String(el.dataset.pattern === settings.pattern)
        );
    byId<HTMLLabelElement>("label-height").textContent = patternById(
        settings.pattern
    ).scaleLabel;
    for (const el of patternEls)
        el.addEventListener("click", () =>
            apply({ ...settings, pattern: el.dataset.pattern as PatternId })
        );

    for (const el of presetEls)
        el.setAttribute(
            "aria-pressed",
            String(el.dataset.preset === settings.preset)
        );
    for (const el of swatchEls) {
        const preset = el.dataset.swatch as PresetId;
        const palette = paletteFor({ ...settings, preset }, theme);
        el.style.setProperty(
            "--swatch",
            `linear-gradient(90deg, ${palette.join(", ")})`
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
    } else if (message?.type === "theme") {
        stylingEl.textContent = `:root{${message.cssVars}}`;
        theme = message.theme;
        render();
    }
});

render();
send({ type: "ready" });
