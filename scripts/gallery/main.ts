import builds from "virtual:aurora-patterns";
import { createStillRenderer } from "../../overlay/still";
import { labStops } from "../../overlay/webgl/core/color";
import { paletteFor, strengthFor } from "../../src/look";
import { PATTERNS, isPatternId } from "../../src/patterns";
import { startFrom, type PresetId } from "../../src/settings";

const W = 420;
const H = 260;
const BOARDS = [
    { dark: true, background: "#19191b", ink: "#f4f4f5" },
    { dark: false, background: "#f3f3f3", ink: "#1e1e1e" },
];

const params = new URLSearchParams(location.search);
const ids = (params.get("ids")?.split(",") ?? PATTERNS.map((p) => p.id)).filter(
    isPatternId
);
const phase = Number(params.get("t") ?? "12");
const preset = (params.get("preset") ?? "aurora") as PresetId;
const scale = Number(params.get("scale") ?? "1");
const dpr = devicePixelRatio || 1;
const renderer = createStillRenderer();
const root = document.getElementById("gallery")!;

function sketch(ctx: CanvasRenderingContext2D, ink: string): void {
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeRect(40, 70, 150, 100);
    ctx.beginPath();
    ctx.moveTo(230, 170);
    ctx.bezierCurveTo(270, 60, 320, 230, 380, 90);
    ctx.stroke();
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText("Sketch under the pattern", 40, 220);
}

for (const id of ids) {
    const figure = document.createElement("figure");
    figure.dataset.pattern = id;
    figure.className = "flex flex-col gap-1";
    const caption = document.createElement("figcaption");
    caption.className = "text-sm text-zinc-300";
    caption.textContent = id;
    const row = document.createElement("div");
    row.className = "flex gap-2";
    figure.append(caption, row);
    root.append(figure);

    for (const board of BOARDS) {
        const canvas = document.createElement("canvas");
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.className = "h-(--h) w-(--w) rounded-md";
        canvas.style.setProperty("--w", `${W}px`);
        canvas.style.setProperty("--h", `${H}px`);
        row.append(canvas);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = board.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        sketch(ctx, board.ink);
        ctx.restore();

        const settings = { ...startFrom(preset, id), height: scale };
        const theme = { dark: board.dark, accent: null };
        const still = renderer?.render(
            builds[id],
            canvas.width,
            canvas.height,
            {
                palette: labStops(paletteFor(settings, theme)),
                strength: strengthFor(settings, theme),
                haze: settings.haze,
                height: settings.height,
                phase,
                zoom: 1,
            }
        );
        if (typeof still === "string" || !still) {
            figure.dataset.error = still ?? "no WebGL2";
            caption.textContent = `${id}: ${still ?? "no WebGL2"}`;
            caption.className = "text-sm text-red-400 whitespace-pre-wrap";
            break;
        }
        ctx.drawImage(still, 0, 0);
    }
}
document.body.dataset.done = "true";
