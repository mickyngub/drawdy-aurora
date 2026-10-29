// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

const mat2 CLOUD_ROT = mat2(1.6, 1.2, -1.2, 1.6);

// Six octaves at lacunarity 2: the fine octaves are what make the edges read as cloud rather than blur.
float cloudShape(vec2 p, float t, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < octaves; i++) {
    sum += amp * snoise(p);
    p = CLOUD_ROT * p + vec2(t * 0.012 * float(i), 1.7);
    amp *= 0.5;
  }
  return sum;
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.03;
  vec2 p = q * (1.2 / u_height) + vec2(t * 0.02, t * 0.003);
  vec2 warp = vec2(snoise(p * 0.45 + vec2(0.0, t * 0.01)), snoise(p * 0.45 + vec2(5.2, 1.3) - t * 0.008));
  vec2 w = p + 0.4 * warp;
  float f = cloudShape(w, t, 6);
  float above = cloudShape(w + vec2(-0.05, 0.1), t, 3);
  float lit = clamp((f - above) * 3.0 + 0.5, 0.0, 1.0);
  float body = smoothstep(-0.18, 0.28, f);
  float core = smoothstep(-0.05, 0.45, f);
  float level = clamp(0.3 + 0.3 * warp.x + 0.25 * (1.0 - core), 0.0, 1.0);
  return vec4(core * (0.6 + 0.6 * lit) * 1.1, level, 0.06 + 0.32 * body, clamp(level + 0.25, 0.0, 1.0));
}
