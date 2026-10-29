import assert from "node:assert/strict";
import { test } from "node:test";
import { paletteFor, strengthFor } from "../src/look";
import {
    DEFAULT_SETTINGS,
    PATTERNS,
    PRESETS,
    SLIDERS,
    readSettings,
    startFrom,
} from "../src/settings";

const DARK = { dark: true, accent: "#aaff00" };
const LIGHT = { dark: false, accent: null };

test("anything unreadable falls back to the Aurora start", () => {
    assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
    assert.deepEqual(readSettings("nope"), DEFAULT_SETTINGS);
    assert.deepEqual(readSettings({ preset: "disco" }), DEFAULT_SETTINGS);
    assert.equal(DEFAULT_SETTINGS.preset, "aurora");
});

test("a missing or broken slider takes its preset's starting value", () => {
    assert.deepEqual(readSettings({ preset: "quiet" }), startFrom("quiet"));
    assert.equal(
        readSettings({ preset: "nebula", speed: Number.NaN }).speed,
        startFrom("nebula").speed
    );
});

test("sliders are clamped to their ranges", () => {
    for (const { key, min, max } of SLIDERS) {
        assert.equal(readSettings({ [key]: max + 100 })[key], max);
        assert.equal(readSettings({ [key]: min - 100 })[key], min);
    }
});

test("every starting point sits inside the slider ranges and has two palettes", () => {
    assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
    for (const preset of PRESETS) {
        assert.deepEqual(
            readSettings(startFrom(preset.id)),
            startFrom(preset.id)
        );
        assert.equal(preset.dark.length, 4);
        assert.equal(preset.light.length, 4);
    }
});

test("the Aurora start leads with Drawdy's accent and the others keep their own", () => {
    assert.equal(paletteFor(startFrom("aurora"), DARK)[0], "#aaff00");
    assert.equal(paletteFor(startFrom("aurora"), LIGHT)[0], "#c5f601");
    assert.equal(paletteFor(startFrom("ocean"), DARK)[0], "#22d3ee");
    assert.notDeepEqual(
        paletteFor(startFrom("sunset"), DARK),
        paletteFor(startFrom("sunset"), LIGHT)
    );
});

test("strength scales with the slider and is capped so the board stays readable", () => {
    assert.ok(
        strengthFor(DEFAULT_SETTINGS, DARK) >
            strengthFor(DEFAULT_SETTINGS, LIGHT)
    );
    const max = readSettings({ strength: 99 });
    assert.ok(strengthFor(max, DARK) <= 0.7);
    assert.ok(
        strengthFor(readSettings({ strength: 2 }), DARK) >
            strengthFor(DEFAULT_SETTINGS, DARK)
    );
});

test("the pattern is read, defaults to Curtains and survives a new starting point", () => {
    assert.equal(DEFAULT_SETTINGS.pattern, "curtains");
    assert.equal(readSettings({ pattern: "glyphs" }).pattern, "glyphs");
    assert.equal(readSettings({ pattern: "plaid" }).pattern, "curtains");
    assert.equal(startFrom("neon", "dots").pattern, "dots");
    assert.equal(startFrom("neon", "dots").preset, "neon");
    for (const pattern of PATTERNS)
        assert.equal(readSettings({ pattern: pattern.id }).pattern, pattern.id);
});
