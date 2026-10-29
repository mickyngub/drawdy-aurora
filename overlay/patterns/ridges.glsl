// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 5

// 1D value noise with its derivative, so steep peaks keep their line width without fwidth.
vec2 vnoise(float x, float seed) {
  float i = floor(x);
  float f = x - i;
  float a = hash12(vec2(i, seed));
  float b = hash12(vec2(i + 1.0, seed));
  float u = f * f * (3.0 - 2.0 * f);
  return vec2(mix(a, b, u), (b - a) * 6.0 * f * (1.0 - f));
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float scale = u_res.y / u_viewport.y;
  float wpx = 1.1 * scale;
  float gap = 11.0 * u_height;
  float tall = 6.0 * gap;
  vec2 p = px + flow * 20.0;
  vec2 mid = u_viewport * 0.5;
  float spread = 0.15 * u_viewport.x + 4.0 * gap;
  float k0 = floor(p.y / gap - 6.2);
  float horizon = -1e6;
  float ink = 0.0;
  float tone = 0.0;
  for (int i = 0; i < 8; i++) {
    float k = k0 + float(i);
    float base = k * gap;
    float seed = mod(k, 97.0);
    float drift = t * (hash12(vec2(seed, 7.7)) - 0.5) * 0.5;
    vec2 n1 = vnoise(p.x / (gap * 2.4) + drift + seed * 13.1, seed);
    vec2 n2 = vnoise(p.x / (gap * 0.9) - drift * 1.7 + seed * 5.3, seed + 0.5);
    float r = 0.68 * n1.x + 0.32 * n2.x;
    float dr = 0.68 * n1.y / (gap * 2.4) + 0.32 * n2.y / (gap * 0.9);
    float ex = (p.x - mid.x - (hash12(vec2(seed, 2.1)) - 0.5) * 3.0 * gap) / spread;
    float ey = (base - mid.y) / (0.42 * u_viewport.y);
    float env = exp(-ex * ex) * (0.3 + 0.7 * exp(-ey * ey));
    float denv = -2.0 * ex / spread * env;
    float y = base + tall * env * r * r * r + 0.1 * gap * (n2.x - 0.5);
    float slope = tall * (denv * r * r * r + env * 3.0 * r * r * dr) + 0.1 * gap * n2.y / (gap * 0.9);
    float dist = abs(p.y - y) * scale / sqrt(1.0 + slope * slope);
    float line = clamp(0.5 + max(wpx, 1.0) * 0.5 - dist, 0.0, 1.0) * min(wpx, 1.0);
    float shown = smoothstep(-0.4 * gap, 0.0, y - horizon);
    ink += line * shown;
    tone += line * shown * (0.25 + 0.75 * clamp((y - base) / (0.6 * tall), 0.0, 1.0));
    horizon = max(horizon, y);
  }
  return vec4(ink * 1.3 * mix(0.6, 1.0, smoothstep(0.4, 1.0, u_height)), tone / max(ink, 1e-4), 0.0, 0.5);
}
