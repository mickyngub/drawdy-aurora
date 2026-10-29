import type {
    DriverCommandIssuer,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { ACTION_BUTTON_SVG } from "./action-button";
import { LOOK_SLOT, SCHEME_SLOT, themeOf, type Look } from "./look";
import type { DriverToWebview, WebviewToDriver } from "./messages";
import { OVERLAY_HTML } from "./overlay-html";
import { DEFAULT_SETTINGS, readSettings, type Settings } from "./settings";
import { WEBVIEW_HTML } from "./webview-html";

const LOG = "[mickyngub.aurora]";
const BUTTON_RETRIES_MS = [800, 2000, 4000, 8000, 15000];
const STATE_KEY = "state";

let issue: DriverCommandIssuer;
let driverId = "";
let styling: ModuleStyling;
let seq = 0;
let shown = false;
let enabled = false;
let settings: Settings = DEFAULT_SETTINGS;
let firstRun = false;
let queue: Promise<void> = Promise.resolve();

const stamp = () => ({ driverId, requestId: String(seq++) });
const buttonId = (): string => `${driverId}:action-button`;
const overlayId = (): string => `${driverId}:overlay`;
const panelId = (): string => `${driverId}:panel`;

const log = (message: string, err: unknown): void => {
    console.error(`${LOG} ${message}`, err);
};

const serial = (task: () => Promise<void>): Promise<void> =>
    (queue = queue.then(task).catch((err) => log("task failed", err)));

function stylingCssVars(s: ModuleStyling): string {
    const { tokens, ...flat } = s as ModuleStyling & {
        tokens?: Record<string, string>;
    };
    const vars = Object.entries(flat).map(([key, value]) =>
        key === "theme"
            ? `color-scheme: ${value};`
            : `--drawdy-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`
    );
    for (const [name, value] of Object.entries(tokens ?? {}))
        vars.push(`${name}: ${value};`);
    return vars.join("");
}

// The iframe's color-scheme must match Drawdy's page, or Chrome paints the iframe opaque.
export function overlayDocument(s: ModuleStyling, current: Settings): string {
    const look: Look = { ...themeOf(s), settings: current };
    return OVERLAY_HTML.replace(
        SCHEME_SLOT,
        s.theme === "dark" ? "dark" : "light"
    ).replace(LOOK_SLOT, JSON.stringify(look));
}

async function show(): Promise<void> {
    const sent = await issue({
        type: "command:dom:upsert-floating-element",
        ...stamp(),
        req: {
            domId: overlayId(),
            position: { x: 0, y: 0 },
            asPopover: false,
            barrierDismissible: false,
            // pointerEvents "none" on the iframe itself, not just its wrapper, so every click, drag and wheel reaches the board.
            schema: {
                type: "iframe",
                label: "Aurora",
                child: { srcDoc: overlayDocument(styling, settings) },
                styles: {
                    width: [100, "vw"],
                    height: [100, "vh"],
                    pointerEvents: "none",
                },
            },
        },
    });
    if (sent.res.error) {
        log("showing the aurora failed", sent.res.error);
        shown = false;
        return;
    }
    shown = true;
}

async function hide(): Promise<void> {
    if (!shown) return;
    await issue({
        type: "command:dom:remove-floating-element",
        ...stamp(),
        req: { domId: overlayId() },
    });
    shown = false;
}

const post = (message: DriverToWebview): Promise<unknown> =>
    issue({
        type: "command:webview:post-message",
        ...stamp(),
        req: { webviewDomId: panelId(), message },
    });

async function load(): Promise<void> {
    const got = await issue({
        type: "command:kv-storage:get",
        ...stamp(),
        req: { key: STATE_KEY },
    });
    const state = got.res.error ? undefined : got.res.value?.got;
    firstRun = state === undefined;
    enabled = state?.enabled === true;
    settings = readSettings(state?.settings);
}

async function save(): Promise<void> {
    await issue({
        type: "command:kv-storage:set",
        ...stamp(),
        req: { key: STATE_KEY, payload: { enabled, settings } },
    });
}

async function setEnabled(next: boolean): Promise<void> {
    enabled = next;
    if (enabled) await show();
    else await hide();
    await save();
}

async function openPanel(): Promise<void> {
    await issue({
        type: "command:webview:create",
        ...stamp(),
        req: {
            webviewDomId: panelId(),
            htmlContent: WEBVIEW_HTML.replace(
                "/*__DRAWDY_STYLING__*/",
                stylingCssVars(styling)
            ),
            keepStateWhenClosed: true,
        },
    });
    if (firstRun) {
        firstRun = false;
        await setEnabled(true);
    }
}

async function onPanelMessage(message: WebviewToDriver): Promise<void> {
    switch (message.type) {
        case "ready":
            await post({
                type: "init",
                enabled,
                settings,
                theme: themeOf(styling),
            });
            return;
        case "enabled":
            await setEnabled(message.enabled === true);
            return;
        case "settings":
            settings = readSettings(message.settings);
            await save();
            // The panel already restyled a live overlay; reload only when that message never landed.
            if (shown && message.live !== true) await show();
            return;
    }
}

const installButton = async (attempt: number): Promise<void> => {
    try {
        const created = await issue({
            type: "command:dom:create-action-button",
            ...stamp(),
            req: { domElementId: buttonId(), svg: ACTION_BUTTON_SVG },
        });
        if (created.res.value?.created) {
            await issue({
                type: "subscription:dom:element-clicked",
                ...stamp(),
                req: { domElementId: buttonId() },
            });
            return;
        }
    } catch (err) {
        log(`button attempt ${attempt} failed`, err);
    }
    if (attempt >= BUTTON_RETRIES_MS.length) {
        console.error(`${LOG} action button never created`);
        return;
    }
    setTimeout(() => {
        void installButton(attempt + 1);
    }, BUTTON_RETRIES_MS[attempt]);
};

export const activate: DriverModule["activate"] = async (ctx) => {
    issue = ctx.issueCommand;
    driverId = ctx.manifest.driverId;
    styling = ctx.styling;
    shown = false;
    enabled = false;
    settings = DEFAULT_SETTINGS;
    firstRun = false;
    queue = Promise.resolve();
    try {
        await issue({ type: "subscription:dom:theme-changed", ...stamp() });
        await issue({
            type: "subscription:webview:message",
            ...stamp(),
            req: { webviewDomId: panelId() },
        });
        await installButton(0);
        await serial(async () => {
            await load();
            if (enabled) await show();
        });
    } catch (err) {
        log("activation failed", err);
    }
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    switch (event.type) {
        case "subscription:dom:element-clicked": {
            if (event.body.domElementId === buttonId()) await serial(openPanel);
            return;
        }
        case "subscription:webview:message": {
            if (event.body.webviewDomId !== panelId()) return;
            const message = event.body.message as WebviewToDriver | null;
            if (typeof message?.type !== "string") return;
            await serial(() => onPanelMessage(message));
            return;
        }
        case "subscription:dom:theme-changed": {
            styling = event.body.styling;
            await serial(async () => {
                await post({
                    type: "theme",
                    cssVars: stylingCssVars(styling),
                    theme: themeOf(styling),
                });
                if (shown) await show();
            });
            return;
        }
        default:
            return;
    }
};
