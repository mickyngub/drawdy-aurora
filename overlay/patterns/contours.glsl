// @render-scale 1
// @max-dpr 2
// @thumb-zoom 4

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 q = vec2(uv.x * u_aspect, uv.y);
  float field = fbm2(q * 1.25 + vec2(t * 0.035, t * 0.022) + flow * 0.15);
  float v = field * (9.0 / u_height);
  float k = floor(v + 0.5);
  float major = step(mod(k, 4.0), 0.5);
  // Line width in CSS px, so lines look the same at any device pixel ratio.
  float width = mix(1.1, 2.0, major) * (u_res.y / u_viewport.y);
  float dist = abs(fract(v + 0.5) - 0.5) / max(fwidth(v), 1e-4);
  float line = 1.0 - smoothstep(width * 0.5, width * 0.5 + 1.0, dist);
  float level = clamp(field * 0.5 + 0.5, 0.0, 1.0);
  return vec4(line * mix(0.55, 1.0, major) * 1.5, 1.0 - level, 0.12 * level, 0.8);
}
