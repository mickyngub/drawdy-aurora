import type { ModuleStyling } from "@drawdy/driver-protocol";
import { presetById, type Palette, type Settings } from "./settings";

export type Theme = { dark: boolean; accent: string | null };

export type Look = Theme & { settings: Settings };

export const LOOK_SLOT = "__AURORA_LOOK__";
export const SCHEME_SLOT = "__AURORA_SCHEME__";

const HEX = /^#[0-9a-f]{6}$/i;
const BASE_STRENGTH = { dark: 0.34, light: 0.26 };
// Drawdy's own panels sit under the overlay, so they must stay readable at full strength.
const MAX_STRENGTH = 0.7;

// Live Drawdy sends --dd-* tokens beside the flat keys, but @drawdy/driver-protocol 1.3.0 does not type them.
type Styling = ModuleStyling & { tokens?: Partial<Record<string, string>> };

export function themeOf(styling: ModuleStyling): Theme {
    const accent = (styling as Styling).tokens?.["--dd-accent"];
    return {
        dark: styling.theme === "dark",
        accent: accent && HEX.test(accent) ? accent : null,
    };
}

export function paletteFor(settings: Settings, theme: Theme): Palette {
    const preset = presetById(settings.preset);
    const palette: Palette = [...(theme.dark ? preset.dark : preset.light)];
    if (preset.id === "aurora" && theme.accent) palette[0] = theme.accent;
    return palette;
}

export const strengthFor = (settings: Settings, theme: Theme): number =>
    Math.min(
        MAX_STRENGTH,
        (theme.dark ? BASE_STRENGTH.dark : BASE_STRENGTH.light) *
            settings.strength
    );

export const grainFor = (theme: Theme): number => (theme.dark ? 0.03 : 0.02);
