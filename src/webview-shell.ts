import {
    CHECKBOX,
    PRESET,
    PRESET_GRID,
    SECONDARY,
    SECTION,
    SECTION_LABEL,
    SLIDER,
    SWATCH,
} from "../webview/classes";
import { PANEL_CSS } from "./panel-css";
import { PRESETS, SLIDERS } from "./settings";

const TICK =
    '<svg class="pointer-events-none invisible col-start-1 row-start-1 size-3 text-on-accent peer-checked:visible" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.9997 15.1709L19.1921 5.97852L20.6063 7.39273L9.9997 17.9993L3.63574 11.6354L5.04996 10.2212L9.9997 15.1709Z"/></svg>';

const presetButtons = PRESETS.map(
    (p) =>
        `<button type="button" class="${PRESET}" data-preset="${p.id}" aria-pressed="false"><span class="${SWATCH}" data-swatch="${p.id}"></span>${p.label}</button>`
).join("\n");

const sliders = SLIDERS.map(
    (s) => `<section class="${SECTION}">
    <div class="${SECTION_LABEL}"><label for="slider-${s.key}">${s.label}</label><output id="value-${s.key}" for="slider-${s.key}" class="text-fg-subtle tabular-nums"></output></div>
    <input id="slider-${s.key}" data-setting="${s.key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" class="${SLIDER}" />
</section>`
).join("\n");

const BODY = `
<main class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-width:thin] [scrollbar-color:var(--color-line-strong)_transparent]">
    <div class="flex items-center justify-between gap-3">
        <label class="inline-flex cursor-pointer items-center gap-2 text-label text-fg-muted select-none"><span class="grid place-items-center"><input type="checkbox" id="enabled" class="${CHECKBOX}" />${TICK}</span>Show the aurora</label>
        <button type="button" id="reset" class="${SECONDARY}">Reset</button>
    </div>
    <section class="${SECTION}">
        <div class="${SECTION_LABEL}"><span>Start from</span></div>
        <div class="${PRESET_GRID}" role="group" aria-label="Start from">
${presetButtons}
        </div>
    </section>
${sliders}
    <p class="text-body text-fg-subtle">Only you see the aurora. It sits over your board, so clicks go straight through.</p>
</main>
`;

export function shellHtml(js: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource-variable/google-sans-flex@5.3.2/wght.css" />
<style id="drawdy-styling">:root{/*__DRAWDY_STYLING__*/}</style>
<style>${PANEL_CSS}</style>
</head>
<body class="flex h-screen flex-col overflow-hidden bg-panel font-sans text-body text-fg antialiased">
${BODY}
<script>${js}</script>
</body>
</html>`;
}
