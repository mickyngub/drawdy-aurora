import type {
    DriverCommandIssuer,
    DriverModule,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import { ACTION_BUTTON_SVG } from "./action-button";
import { LOOK_SLOT, SCHEME_SLOT, lookFor } from "./look";
import { OVERLAY_HTML } from "./overlay-html";

const LOG = "[mickyngub.aurora]";
const BUTTON_RETRIES_MS = [800, 2000, 4000, 8000, 15000];

let issue: DriverCommandIssuer;
let driverId = "";
let styling: ModuleStyling;
let seq = 0;
let shown = false;
let queue: Promise<void> = Promise.resolve();

const stamp = () => ({ driverId, requestId: String(seq++) });
const buttonId = (): string => `${driverId}:action-button`;
const overlayId = (): string => `${driverId}:overlay`;

const log = (message: string, err: unknown): void => {
    console.error(`${LOG} ${message}`, err);
};

const serial = (task: () => Promise<void>): Promise<void> =>
    (queue = queue.then(task).catch((err) => log("task failed", err)));

// The iframe's color-scheme must match Drawdy's page, or Chrome paints the iframe opaque.
export const overlayDocument = (s: ModuleStyling): string =>
    OVERLAY_HTML.replace(
        SCHEME_SLOT,
        s.theme === "dark" ? "dark" : "light"
    ).replace(LOOK_SLOT, JSON.stringify(lookFor(s)));

async function show(): Promise<boolean> {
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
                child: { srcDoc: overlayDocument(styling) },
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
        return false;
    }
    return true;
}

async function hide(): Promise<void> {
    await issue({
        type: "command:dom:remove-floating-element",
        ...stamp(),
        req: { domId: overlayId() },
    });
}

async function toggle(): Promise<void> {
    if (shown) {
        await hide();
        shown = false;
        return;
    }
    shown = await show();
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
    queue = Promise.resolve();
    try {
        await issue({ type: "subscription:dom:theme-changed", ...stamp() });
        await installButton(0);
    } catch (err) {
        log("activation failed", err);
    }
};

export const onEvent: DriverModule["onEvent"] = async (event) => {
    switch (event.type) {
        case "subscription:dom:element-clicked": {
            if (event.body.domElementId === buttonId()) await serial(toggle);
            return;
        }
        case "subscription:dom:theme-changed": {
            styling = event.body.styling;
            await serial(async () => {
                if (shown) shown = await show();
            });
            return;
        }
        default:
            return;
    }
};
