import assert from "node:assert/strict";
import { test } from "node:test";
import type { DriverManifest, ModuleStyling } from "@drawdy/driver-protocol";
import * as driver from "../src/index";
import { LOOK_SLOT, SCHEME_SLOT, type Look } from "../src/look";
import { OVERLAY_HTML } from "../src/overlay-html";
import { DEFAULT_SETTINGS, startFrom } from "../src/settings";
import { WEBVIEW_HTML } from "../src/webview-html";

const manifest = {
    driverId: "mickyngub.aurora",
    driverName: "Aurora",
} as DriverManifest;

const BUTTON = `${manifest.driverId}:action-button`;
const OVERLAY = `${manifest.driverId}:overlay`;
const PANEL = `${manifest.driverId}:panel`;
const LIGHT = { theme: "light" } as ModuleStyling;
const DARK = {
    theme: "dark",
    tokens: { "--dd-accent": "#aaff00" },
} as unknown as ModuleStyling;

type Sent = { type: string; req?: any };

async function boot(stored?: Record<string, unknown>, styling = LIGHT) {
    const sent: Sent[] = [];
    await driver.activate({
        manifest,
        styling,
        generateId: () => "id",
        issueCommand: (async (command: Sent) => {
            sent.push(command);
            if (command.type === "command:kv-storage:get")
                return { res: { value: { got: stored } } };
            return { res: { value: { created: true, removed: true } } };
        }) as any,
    });
    const event = (type: string, body: unknown) =>
        driver.onEvent({ type, body } as any);
    const click = () =>
        event("subscription:dom:element-clicked", {
            domElementId: BUTTON,
            clientX: 0,
            clientY: 0,
        });
    const fromPanel = (message: unknown) =>
        event("subscription:webview:message", {
            webviewDomId: PANEL,
            message,
        });
    const of = (type: string) => sent.filter((c) => c.type === type);
    const overlays = () => of("command:dom:upsert-floating-element");
    const saved = () => of("command:kv-storage:set").map((c) => c.req.payload);
    const posted = () =>
        of("command:webview:post-message").map((c) => c.req.message);
    return { event, click, fromPanel, of, overlays, saved, posted };
}

const srcDocOf = (upsert: Sent): string => upsert.req.schema.child.srcDoc;

const lookIn = (upsert: Sent): Look => {
    const json = srcDocOf(upsert).match(
        /<script id="aurora-look" type="application\/json">(.*?)<\/script>/
    )?.[1];
    assert.ok(json, "the overlay page carries no look");
    return JSON.parse(json);
};

const schemeIn = (upsert: Sent) =>
    srcDocOf(upsert).match(
        /<meta name="color-scheme" content="(\w+)" \/>/
    )?.[1];

test("the button and the panel's messages are subscribed", async () => {
    const host = await boot();
    assert.equal(
        host.of("command:dom:create-action-button")[0].req.domElementId,
        BUTTON
    );
    assert.equal(
        host.of("subscription:dom:element-clicked")[0].req.domElementId,
        BUTTON
    );
    assert.equal(
        host.of("subscription:webview:message")[0].req.webviewDomId,
        PANEL
    );
});

test("the first click opens the panel and turns the aurora on", async () => {
    const host = await boot();
    assert.equal(host.overlays().length, 0);
    await host.click();
    const [panel] = host.of("command:webview:create");
    assert.equal(panel.req.webviewDomId, PANEL);
    assert.equal(panel.req.keepStateWhenClosed, true);
    assert.ok(!panel.req.htmlContent.includes("/*__DRAWDY_STYLING__*/"));
    assert.equal(host.overlays().length, 1);
    assert.deepEqual(host.saved().at(-1), {
        enabled: true,
        settings: DEFAULT_SETTINGS,
    });
});

test("a saved aurora comes back on load and clicks only open the panel", async () => {
    const settings = { ...startFrom("ocean"), strength: 1.8 };
    const host = await boot({ enabled: true, settings });
    assert.equal(host.overlays().length, 1);
    assert.deepEqual(lookIn(host.overlays()[0]).settings, settings);
    await host.click();
    await host.click();
    assert.equal(host.overlays().length, 1);
    assert.equal(host.of("command:dom:remove-floating-element").length, 0);
});

test("a saved aurora that was off stays off", async () => {
    const host = await boot({ enabled: false, settings: DEFAULT_SETTINGS });
    await host.click();
    assert.equal(host.overlays().length, 0);
});

test("the overlay covers the window and never takes input", async () => {
    const host = await boot({ enabled: true });
    const [upsert] = host.overlays();
    assert.equal(upsert.req.domId, OVERLAY);
    assert.deepEqual(upsert.req.position, { x: 0, y: 0 });
    assert.equal(upsert.req.asPopover, false);
    assert.deepEqual(upsert.req.schema.styles, {
        width: [100, "vw"],
        height: [100, "vh"],
        pointerEvents: "none",
    });
});

test("a ready panel gets the current state", async () => {
    const settings = startFrom("nebula");
    const host = await boot({ enabled: true, settings }, DARK);
    await host.fromPanel({ type: "ready" });
    assert.deepEqual(host.posted().at(-1), {
        type: "init",
        enabled: true,
        settings,
        theme: { dark: true, accent: "#aaff00" },
    });
});

test("the panel's switch shows and hides the aurora and is saved", async () => {
    const host = await boot({ enabled: false });
    await host.fromPanel({ type: "enabled", enabled: true });
    assert.equal(host.overlays().length, 1);
    await host.fromPanel({ type: "enabled", enabled: false });
    const removed = host.of("command:dom:remove-floating-element");
    assert.equal(removed.length, 1);
    assert.equal(removed[0].req.domId, OVERLAY);
    assert.deepEqual(
        host.saved().map((s) => s.enabled),
        [true, false]
    );
});

test("settings already applied live are saved without reloading the overlay", async () => {
    const host = await boot({ enabled: true });
    const settings = { ...startFrom("sunset"), speed: 2 };
    await host.fromPanel({ type: "settings", settings, live: true });
    assert.equal(host.overlays().length, 1);
    assert.deepEqual(host.saved().at(-1)?.settings, settings);
});

test("settings that never reached the overlay reload it", async () => {
    const host = await boot({ enabled: true });
    const settings = { ...startFrom("ember"), hue: 40 };
    await host.fromPanel({ type: "settings", settings, live: false });
    assert.equal(host.overlays().length, 2);
    assert.deepEqual(lookIn(host.overlays()[1]).settings, settings);
});

test("a new pattern reaches the overlay page when it reloads", async () => {
    const host = await boot({ enabled: true });
    const settings = startFrom("mono", "glyphs");
    await host.fromPanel({ type: "settings", settings, live: false });
    assert.equal(lookIn(host.overlays()[1]).settings.pattern, "glyphs");
});

test("settings from the panel are clamped before use", async () => {
    const host = await boot({ enabled: true });
    await host.fromPanel({
        type: "settings",
        settings: { preset: "aurora", strength: 99, speed: -4 },
        live: true,
    });
    const saved = host.saved().at(-1)?.settings;
    assert.equal(saved.strength, 2);
    assert.equal(saved.speed, 0);
});

test("a theme change restyles the panel and the overlay together", async () => {
    const host = await boot({ enabled: true }, DARK);
    assert.equal(schemeIn(host.overlays()[0]), "dark");
    await host.event("subscription:dom:theme-changed", { styling: LIGHT });
    const theme = host.posted().at(-1);
    assert.equal(theme.type, "theme");
    assert.match(theme.cssVars, /color-scheme: light;/);
    assert.deepEqual(theme.theme, { dark: false, accent: null });
    assert.equal(schemeIn(host.overlays()[1]), "light");
    assert.equal(lookIn(host.overlays()[1]).dark, false);
});

test("messages from other webviews are ignored", async () => {
    const host = await boot({ enabled: false });
    await host.event("subscription:webview:message", {
        webviewDomId: "someone-else:panel",
        message: { type: "enabled", enabled: true },
    });
    assert.equal(host.overlays().length, 0);
});

test("the generated pages carry exactly one of each slot", () => {
    assert.equal(OVERLAY_HTML.split(LOOK_SLOT).length, 2);
    assert.equal(OVERLAY_HTML.split(SCHEME_SLOT).length, 2);
    assert.equal(WEBVIEW_HTML.split("/*__DRAWDY_STYLING__*/").length, 2);
    assert.doesNotMatch(OVERLAY_HTML, /<\/script(?![>])/);
    assert.doesNotMatch(WEBVIEW_HTML, /<\/script(?![>])/);
});
