import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
// @ts-expect-error -- plain ESM helper shared with the build, no type declarations
import { readPatterns } from "../scripts/rollup-plugins.mjs";
import { PATTERN_GROUPS, PATTERNS } from "../src/patterns";

const DIR = new URL("../overlay/patterns", import.meta.url).pathname;
const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".glsl") && f !== "frame.glsl")
    .map((f) => f.slice(0, -".glsl".length))
    .sort();
const builds = readPatterns(DIR) as Record<
    string,
    { source: string; renderScale: number; maxDpr: number; thumbZoom: number }
>;

test("every registered pattern has a shader and every shader is registered", () => {
    assert.deepEqual(files, PATTERNS.map((p) => p.id).sort());
});

test("there are 30 patterns with unique ids, each in a known group", () => {
    assert.equal(PATTERNS.length, 30);
    assert.equal(new Set(PATTERNS.map((p) => p.id)).size, 30);
    for (const p of PATTERNS) assert.ok(PATTERN_GROUPS.includes(p.group));
});

test("each shader defines pattern() and is spliced into the shared frame", () => {
    for (const id of files) {
        const body = readFileSync(join(DIR, `${id}.glsl`), "utf8");
        assert.match(
            body,
            /vec4 pattern\(vec2 uv, vec2 px, float t, vec2 flow\)/,
            id
        );
        assert.doesNotMatch(
            body,
            /#version|^uniform /m,
            `${id} must not redeclare what frame.glsl owns`
        );
        const { source } = builds[id];
        assert.ok(source.startsWith("#version 300 es"), id);
        assert.doesNotMatch(source, /^#pragma pattern$/m, id);
        assert.ok(source.includes(body), id);
    }
});

test("each shader's render settings stay inside the performance budget", () => {
    for (const id of files) {
        const { renderScale, maxDpr, thumbZoom } = builds[id];
        assert.ok(renderScale > 0 && renderScale <= 1, `${id} render-scale`);
        assert.ok(maxDpr >= 1 && maxDpr <= 2, `${id} max-dpr`);
        assert.ok(thumbZoom > 0 && thumbZoom <= 12, `${id} thumb-zoom`);
    }
});
