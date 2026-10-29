export type PresetId =
    "aurora" | "ocean" | "sunset" | "nebula" | "ember" | "quiet";

export type Palette = [string, string, string, string];

export type Settings = {
    preset: PresetId;
    strength: number;
    speed: number;
    hue: number;
    height: number;
    haze: number;
};

export type SliderKey = Exclude<keyof Settings, "preset">;

export type Preset = {
    id: PresetId;
    label: string;
    dark: Palette;
    light: Palette;
    start: Omit<Settings, "preset">;
};

export type Slider = {
    key: SliderKey;
    label: string;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
};

export const PRESETS: readonly Preset[] = [
    {
        id: "aurora",
        label: "Aurora",
        dark: ["#c5f601", "#1fe0a0", "#3b8cff", "#a46bff"],
        light: ["#c5f601", "#10b981", "#3b82f6", "#8b5cf6"],
        start: { strength: 1, speed: 1, hue: 0, height: 1, haze: 1 },
    },
    {
        id: "ocean",
        label: "Ocean",
        dark: ["#22d3ee", "#14b8a6", "#2563eb", "#6366f1"],
        light: ["#06b6d4", "#0d9488", "#2563eb", "#4f46e5"],
        start: { strength: 1, speed: 0.7, hue: 0, height: 1.3, haze: 1.3 },
    },
    {
        id: "sunset",
        label: "Sunset",
        dark: ["#fbbf24", "#fb7185", "#f43f5e", "#a855f7"],
        light: ["#f59e0b", "#f97316", "#e11d48", "#9333ea"],
        start: { strength: 1, speed: 0.8, hue: 0, height: 0.9, haze: 1.2 },
    },
    {
        id: "nebula",
        label: "Nebula",
        dark: ["#f0abfc", "#c084fc", "#818cf8", "#22d3ee"],
        light: ["#d946ef", "#a855f7", "#6366f1", "#0891b2"],
        start: { strength: 1.1, speed: 0.5, hue: 0, height: 1.6, haze: 1.6 },
    },
    {
        id: "ember",
        label: "Ember",
        dark: ["#fde047", "#fb923c", "#ef4444", "#be123c"],
        light: ["#eab308", "#f97316", "#dc2626", "#be123c"],
        start: { strength: 1, speed: 1.4, hue: 0, height: 0.8, haze: 0.9 },
    },
    {
        id: "quiet",
        label: "Quiet",
        dark: ["#a7f3d0", "#7dd3fc", "#c4b5fd", "#e9d5ff"],
        light: ["#6ee7b7", "#38bdf8", "#a78bfa", "#c084fc"],
        start: { strength: 0.6, speed: 0.4, hue: 0, height: 0.8, haze: 0.7 },
    },
];

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const SLIDERS: readonly Slider[] = [
    {
        key: "strength",
        label: "Strength",
        min: 0.2,
        max: 2,
        step: 0.05,
        format: percent,
    },
    {
        key: "speed",
        label: "Speed",
        min: 0,
        max: 3,
        step: 0.05,
        format: (value) => `${value.toFixed(1)}×`,
    },
    {
        key: "hue",
        label: "Colour shift",
        min: -180,
        max: 180,
        step: 1,
        format: (value) => `${value > 0 ? "+" : ""}${Math.round(value)}°`,
    },
    {
        key: "height",
        label: "Curtain height",
        min: 0.4,
        max: 2.2,
        step: 0.05,
        format: percent,
    },
    {
        key: "haze",
        label: "Haze",
        min: 0,
        max: 2,
        step: 0.05,
        format: percent,
    },
];

export const SETTINGS_MESSAGE = "mickyngub.aurora:settings";
export const ACK_MESSAGE = "mickyngub.aurora:ack";

export const presetById = (id: PresetId): Preset =>
    PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export const startFrom = (id: PresetId): Settings => ({
    preset: presetById(id).id,
    ...presetById(id).start,
});

export const DEFAULT_SETTINGS: Settings = startFrom("aurora");

export function readSettings(value: unknown): Settings {
    const raw =
        typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)
            : {};
    const known = PRESETS.find((p) => p.id === raw.preset);
    const settings = startFrom(known ? known.id : "aurora");
    for (const { key, min, max } of SLIDERS) {
        const n = raw[key];
        if (typeof n === "number" && Number.isFinite(n))
            settings[key] = Math.min(max, Math.max(min, n));
    }
    return settings;
}
