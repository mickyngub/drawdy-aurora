import type { PatternBuild } from "../src/patterns";
import { buildShaderSource } from "./webgl/core/glsl-lib";
import { CORE_SHADERS } from "./webgl/core/shaders";

export type StillOptions = {
    palette: Float32Array;
    strength: number;
    haze: number;
    height: number;
    phase: number;
    /** CSS px of pattern shown per CSS px of output, so a thumbnail can show a wider view. */
    zoom: number;
};

export type StillRenderer = {
    /** Draws one frame into a shared canvas and returns it, or the shader's compile error. */
    render(
        build: PatternBuild,
        width: number,
        height: number,
        options: StillOptions
    ): HTMLCanvasElement | string;
};

const NEUTRAL_FLOW = new Uint8Array([128, 128, 0, 255]);

function compile(
    gl: WebGL2RenderingContext,
    fragment: string
): WebGLProgram | string {
    const program = gl.createProgram();
    for (const [type, source] of [
        [gl.VERTEX_SHADER, buildShaderSource(CORE_SHADERS.vertex)],
        [
            gl.FRAGMENT_SHADER,
            buildShaderSource(fragment, { MAX_VELOCITY: "2.0" }),
        ],
    ] as const) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            return gl.getShaderInfoLog(shader) ?? "compile failed";
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        return gl.getProgramInfoLog(program) ?? "link failed";
    return program;
}

export function createStillRenderer(): StillRenderer | null {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
    });
    if (!gl) return null;

    const flow = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, flow);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        NEUTRAL_FLOW
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    const programs = new Map<string, WebGLProgram | string>();

    return {
        render(build, width, height, options) {
            let program = programs.get(build.source);
            if (program === undefined) {
                program = compile(gl, build.source);
                programs.set(build.source, program);
            }
            if (typeof program === "string") return program;

            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(program);
            const at = (name: string) => gl.getUniformLocation(program, name);
            const dpr = devicePixelRatio || 1;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, flow);
            gl.uniform1i(at("u_flow"), 0);
            gl.uniform2f(at("u_res"), width, height);
            gl.uniform2f(
                at("u_viewport"),
                (width / dpr) * options.zoom,
                (height / dpr) * options.zoom
            );
            gl.uniform1f(at("u_phase"), options.phase);
            gl.uniform1f(at("u_motion"), 0);
            gl.uniform1f(at("u_aspect"), width / height);
            gl.uniform3fv(at("u_palette"), options.palette);
            gl.uniform1f(at("u_strength"), options.strength);
            gl.uniform1f(at("u_toolbar"), 0);
            gl.uniform1f(at("u_height"), options.height);
            gl.uniform1f(at("u_haze"), options.haze);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            return canvas;
        },
    };
}
