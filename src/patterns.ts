export const PATTERN_GROUPS = ["glow", "lines", "grid", "retro"] as const;

export type PatternGroup = (typeof PATTERN_GROUPS)[number];

export const GROUP_LABELS: Record<PatternGroup, string> = {
    glow: "Glow",
    lines: "Lines",
    grid: "Grid",
    retro: "Retro",
};

export const PATTERNS = [
    {
        id: "curtains",
        label: "Curtains",
        group: "glow",
        scaleLabel: "Curtain height",
    },
    { id: "clouds", label: "Clouds", group: "glow", scaleLabel: "Cloud size" },
    { id: "lava", label: "Lava", group: "glow", scaleLabel: "Blob size" },
    { id: "mesh", label: "Mesh", group: "glow", scaleLabel: "Blend size" },
    { id: "rays", label: "Rays", group: "glow", scaleLabel: "Ray width" },
    {
        id: "caustics",
        label: "Caustics",
        group: "glow",
        scaleLabel: "Ripple size",
    },
    { id: "bokeh", label: "Bokeh", group: "glow", scaleLabel: "Light size" },
    { id: "smoke", label: "Smoke", group: "glow", scaleLabel: "Swirl size" },
    {
        id: "contours",
        label: "Contours",
        group: "lines",
        scaleLabel: "Line spacing",
    },
    { id: "flow", label: "Flow", group: "lines", scaleLabel: "Line spacing" },
    { id: "waves", label: "Waves", group: "lines", scaleLabel: "Wave spacing" },
    { id: "moire", label: "Moiré", group: "lines", scaleLabel: "Ring spacing" },
    {
        id: "ripples",
        label: "Ripples",
        group: "lines",
        scaleLabel: "Ring spacing",
    },
    {
        id: "stripes",
        label: "Stripes",
        group: "lines",
        scaleLabel: "Stripe width",
    },
    {
        id: "ridges",
        label: "Ridges",
        group: "lines",
        scaleLabel: "Ridge spacing",
    },
    {
        id: "hatch",
        label: "Hatch",
        group: "lines",
        scaleLabel: "Hatch spacing",
    },
    { id: "dots", label: "Dots", group: "grid", scaleLabel: "Dot spacing" },
    { id: "grid", label: "Grid", group: "grid", scaleLabel: "Cell size" },
    {
        id: "hexagons",
        label: "Hexagons",
        group: "grid",
        scaleLabel: "Cell size",
    },
    { id: "truchet", label: "Truchet", group: "grid", scaleLabel: "Tile size" },
    {
        id: "checker",
        label: "Checker",
        group: "grid",
        scaleLabel: "Square size",
    },
    {
        id: "triangles",
        label: "Triangles",
        group: "grid",
        scaleLabel: "Tile size",
    },
    { id: "cells", label: "Cells", group: "grid", scaleLabel: "Cell size" },
    { id: "glyphs", label: "Glyphs", group: "retro", scaleLabel: "Cell size" },
    {
        id: "coderain",
        label: "Code rain",
        group: "retro",
        scaleLabel: "Column width",
    },
    { id: "ascii", label: "ASCII", group: "retro", scaleLabel: "Cell size" },
    { id: "dither", label: "Dither", group: "retro", scaleLabel: "Pixel size" },
    { id: "plasma", label: "Plasma", group: "retro", scaleLabel: "Blob size" },
    {
        id: "horizon",
        label: "Horizon",
        group: "retro",
        scaleLabel: "Grid size",
    },
    { id: "stars", label: "Stars", group: "retro", scaleLabel: "Star spacing" },
] as const satisfies readonly {
    id: string;
    label: string;
    group: PatternGroup;
    scaleLabel: string;
}[];

export type PatternId = (typeof PATTERNS)[number]["id"];

export type Pattern = (typeof PATTERNS)[number];

/** What the build makes of each overlay/patterns/<id>.glsl; see rollup-plugins.mjs. */
export type PatternBuild = {
    source: string;
    renderScale: number;
    maxDpr: number;
    grain: boolean;
    thumbZoom: number;
};

export const patternById = (id: PatternId): Pattern =>
    PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];

export const isPatternId = (value: unknown): value is PatternId =>
    PATTERNS.some((p) => p.id === value);
