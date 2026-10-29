// Renders patterns as stills over a sample drawing, dark and light, for reviewing designs.
// node scripts/gallery.mjs [out.html]  then open it with ?ids=a,b&t=12&preset=aurora&scale=1
import typescript from "@rollup/plugin-typescript";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rollup } from "rollup";
import { patternSources, rawText } from "./rollup-plugins.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] ?? join(ROOT, "dist", "gallery.html"));
const bundle = await rollup({
    input: join(ROOT, "scripts", "gallery", "main.ts"),
    plugins: [
        patternSources(join(ROOT, "overlay", "patterns")),
        rawText(),
        typescript({
            tsconfig: join(ROOT, "tsconfig.json"),
            noEmitOnError: false,
        }),
    ],
    onwarn: () => {},
});
const { output } = await bundle.generate({ format: "iife" });
await bundle.close();
writeFileSync(
    out,
    `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="bg-zinc-950 p-4 font-sans">
<main id="gallery" class="grid grid-cols-1 gap-4"></main>
<script>${output[0].code.replaceAll("</script", "<\\/script")}</script>
</body>
</html>`
);
console.log(out);
