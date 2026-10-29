// @render-scale 0.5
// @max-dpr 1
// @grain 1
// @thumb-zoom 6

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y) + flow * 0.02;
  vec2 o = vec2(u_aspect * (0.5 + 0.1 * sin(t * 0.05)), 1.35);
  vec2 d = q - o;
  float dist = length(d);
  float ang = atan(d.x, -d.y) + 0.06 * sin(t * 0.07 + 1.3);
  float a = ang / (0.055 * u_height);
  float shafts = 0.55 * snoise(vec2(a * 0.35, t * 0.045))
    + 0.3 * snoise(vec2(a * 0.9 + 7.1, t * 0.07 - 3.0))
    + 0.08 * snoise(vec2(a * 2.1 - 4.0, t * 0.09));
  float beam = smoothstep(-0.05, 0.7, shafts);
  float dust = 0.85 + 0.15 * snoise(vec2(ang * 4.0, dist * 3.0 - t * 0.05));
  float fan = exp(-ang * ang / 0.4);
  float fall = exp(-(dist - 0.35) * 1.1);
  float breath = 0.88 + 0.12 * sin(t * 0.21);
  float level = clamp(0.15 + (dist - 0.35) * 0.55 + 0.4 * ang, 0.0, 1.0);
  float glow = exp(-(dist - 0.35) * 2.5) * fan;
  return vec4(beam * dust * fan * fall * breath * 1.5, level, 0.1 + 0.35 * glow, clamp(level + 0.2, 0.0, 1.0));
}
