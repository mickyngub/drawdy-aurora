import type { Theme } from "./look";
import type { Settings } from "./settings";

export type DriverToWebview =
    | { type: "init"; enabled: boolean; settings: Settings; theme: Theme }
    | { type: "theme"; cssVars: string; theme: Theme };

export type WebviewToDriver =
    | { type: "ready" }
    | { type: "enabled"; enabled: boolean }
    | { type: "settings"; settings: Settings; live: boolean };
