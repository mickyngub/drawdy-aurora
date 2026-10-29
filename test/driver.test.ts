import assert from "node:assert/strict";
import { test } from "node:test";
import type {
    DomElementSchema,
    DriverManifest,
    ModuleStyling,
} from "@drawdy/driver-protocol";
import * as driver from "../src/index";
import { LOOK_SLOT, SCHEME_SLOT, lookFor, type Look } from "../src/look";
import { OVERLAY_HTML } from "../src/overlay-html";

const manifest = {
    driverId: "mickyngub.aurora",
    driverName: "Aurora",
} as DriverManifest;

const BUTTON = `${manifest.driverId}:action-button`;
const OVERLAY = `${manifest.driverId}:overlay`;
const LIGHT = { theme: "light" } as ModuleStyling;
const DARK = {
    theme: "dark",
    tokens: { "--dd-accent": "#aaff00" },
} as unknown as ModuleStyling;

type Sent = { type: string; req?: any };

async function boot(styling: ModuleStyling = LIGHT) {
    const sent: Sent[] = [];
    await driver.activate({
        manifest,
        styling,
        generateId: () => "id",
        issueCommand: (async (command: Sent) => {
            sent.push(command);
            return { res: { value: { created: true, removed: true } } };
        }) as any,
    });
    const event = (type: string, body: unknown) =>
        driver.onEvent({ type, body } as any);
    const click = (domElementId: string) =>
        event("subscription:dom:element-clicked", {
            domElementId,
            clientX: 0,
            clientY: 0,
        });
    const of = (type: string) => sent.filter((c) => c.type === type);
    return { sent, event, click, of };
}

const lookIn = (schema: DomElementSchema): Look => {
    assert.equal(schema.type, "iframe");
    if (schema.type !== "iframe" || !("srcDoc" in schema.child))
        throw new Error("the overlay is not an srcDoc iframe");
    const json = schema.child.srcDoc.match(
        /<script id="aurora-look" type="application\/json">(.*?)<\/script>/
    )?.[1];
    assert.ok(json, "the overlay page carries no look");
    return JSON.parse(json);
};

test("the button is installed and its clicks are subscribed", async () => {
    const host = await boot();
    assert.equal(
        host.of("command:dom:create-action-button")[0].req.domElementId,
        BUTTON
    );
    assert.equal(
        host.of("subscription:dom:element-clicked")[0].req.domElementId,
        BUTTON
    );
});

test("turning it on covers the window with an overlay that never takes input", async () => {
    const host = await boot();
    await host.click(BUTTON);
    const [upsert] = host.of("command:dom:upsert-floating-element");
    assert.equal(upsert.req.domId, OVERLAY);
    assert.deepEqual(upsert.req.position, { x: 0, y: 0 });
    assert.equal(upsert.req.asPopover, false);
    assert.equal(upsert.req.barrierDismissible, false);
    assert.deepEqual(upsert.req.schema.styles, {
        width: [100, "vw"],
        height: [100, "vh"],
        pointerEvents: "none",
    });
    assert.deepEqual(lookIn(upsert.req.schema), lookFor(LIGHT));
});

test("a second click takes the overlay away and a third brings it back", async () => {
    const host = await boot();
    await host.click(BUTTON);
    await host.click(BUTTON);
    const removed = host.of("command:dom:remove-floating-element");
    assert.equal(removed.length, 1);
    assert.equal(removed[0].req.domId, OVERLAY);
    await host.click(BUTTON);
    assert.equal(host.of("command:dom:upsert-floating-element").length, 2);
});

test("clicks on other elements are ignored", async () => {
    const host = await boot();
    await host.click("someone-else:button");
    assert.equal(host.of("command:dom:upsert-floating-element").length, 0);
});

test("a theme change restyles a shown overlay and leaves a hidden one alone", async () => {
    const host = await boot();
    await host.event("subscription:dom:theme-changed", { styling: DARK });
    assert.equal(host.of("command:dom:upsert-floating-element").length, 0);

    await host.click(BUTTON);
    await host.event("subscription:dom:theme-changed", { styling: LIGHT });
    const upserts = host.of("command:dom:upsert-floating-element");
    assert.equal(upserts.length, 2);
    assert.deepEqual(lookIn(upserts[0].req.schema), lookFor(DARK));
    assert.deepEqual(lookIn(upserts[1].req.schema), lookFor(LIGHT));
});

test("the overlay page declares the same color scheme as Drawdy's page", async () => {
    const host = await boot(DARK);
    await host.click(BUTTON);
    await host.event("subscription:dom:theme-changed", { styling: LIGHT });
    const schemes = host
        .of("command:dom:upsert-floating-element")
        .map(
            (c) =>
                c.req.schema.child.srcDoc.match(
                    /<meta name="color-scheme" content="(\w+)" \/>/
                )?.[1]
        );
    assert.deepEqual(schemes, ["dark", "light"]);
});

test("the dark look leads with Drawdy's accent and falls back to lime", () => {
    assert.equal(lookFor(DARK).colours[0], "#aaff00");
    assert.equal(
        lookFor({
            theme: "dark",
            tokens: { "--dd-accent": "oklch(0.9 0.2 120)" },
        } as unknown as ModuleStyling).colours[0],
        "#c5f601"
    );
    assert.ok(lookFor(DARK).strength > lookFor(LIGHT).strength);
});

test("the overlay page has one look slot and a full-window body", () => {
    assert.equal(OVERLAY_HTML.split(LOOK_SLOT).length, 2);
    assert.equal(OVERLAY_HTML.split(SCHEME_SLOT).length, 2);
    assert.match(OVERLAY_HTML, /<body class="h-screen overflow-hidden">/);
    assert.doesNotMatch(OVERLAY_HTML, /<\/script(?![>])/);
});
