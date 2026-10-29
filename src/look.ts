import type { ModuleStyling } from "@drawdy/driver-protocol";

export type Look = {
    colours: [string, string, string, string];
    strength: number;
    reach: number;
    grain: number;
};

export const LOOK_SLOT = "__AURORA_LOOK__";
export const SCHEME_SLOT = "__AURORA_SCHEME__";

const LIME = "#c5f601";
const HEX = /^#[0-9a-f]{6}$/i;

// Live Drawdy sends --dd-* tokens beside the flat keys, but @drawdy/driver-protocol 1.3.0 does not type them.
type Styling = ModuleStyling & { tokens?: Partial<Record<string, string>> };

export function lookFor(styling: ModuleStyling): Look {
    const accent = (styling as Styling).tokens?.["--dd-accent"];
    const lime = accent && HEX.test(accent) ? accent : LIME;
    return styling.theme === "dark"
        ? {
              colours: [lime, "#1fe0a0", "#3b8cff", "#a46bff"],
              strength: 0.75,
              reach: 0.42,
              grain: 0.03,
          }
        : {
              colours: [lime, "#10b981", "#3b82f6", "#8b5cf6"],
              strength: 0.55,
              reach: 0.38,
              grain: 0.02,
          };
}
