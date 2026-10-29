import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function rawText() {
    return {
        name: "raw-text",
        resolveId(source, importer) {
            if (!source.endsWith("?raw") || !importer) return null;
            return resolve(dirname(importer), source);
        },
        load(id) {
            if (!id.endsWith("?raw")) return null;
            const file = id.slice(0, -"?raw".length);
            this.addWatchFile(file);
            return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
        },
    };
}

const PATTERNS_ID = "virtual:aurora-patterns";
const META = /^\/\/ @([a-z-]+) (\S+)$/gm;

// Every overlay/patterns/<id>.glsl but frame.glsl becomes { source, renderScale, maxDpr, grain, thumbZoom },
// with the pattern spliced into frame.glsl and its "// @key value" header read as numbers.
export function readPatterns(dir) {
    const frame = readFileSync(join(dir, "frame.glsl"), "utf8");
    const builds = {};
    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith(".glsl") || file === "frame.glsl") continue;
        const body = readFileSync(join(dir, file), "utf8");
        const meta = Object.fromEntries(
            [...body.matchAll(META)].map(([, key, value]) => [
                key,
                Number(value),
            ])
        );
        builds[file.slice(0, -".glsl".length)] = {
            source: frame.replace(/^#pragma pattern$/m, () => body),
            renderScale: meta["render-scale"] ?? 1,
            maxDpr: meta["max-dpr"] ?? 2,
            grain: meta.grain === 1,
            thumbZoom: meta["thumb-zoom"] ?? 2,
        };
    }
    return builds;
}

export function patternSources(dir) {
    return {
        name: "aurora-patterns",
        resolveId(source) {
            return source === PATTERNS_ID ? `\0${PATTERNS_ID}` : null;
        },
        load(id) {
            if (id !== `\0${PATTERNS_ID}`) return null;
            for (const file of readdirSync(dir))
                if (file.endsWith(".glsl")) this.addWatchFile(join(dir, file));
            return `export default ${JSON.stringify(readPatterns(dir))};`;
        },
    };
}
