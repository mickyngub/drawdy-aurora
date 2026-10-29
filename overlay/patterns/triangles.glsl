// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2.5

float stroke(float d, float w, float aa) {
  return clamp((min(d + 0.5 * aa, 0.5 * w) - max(d - 0.5 * aa, -0.5 * w)) / aa, 0.0, 1.0);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float aa = u_viewport.y / u_res.y;
  float side = 42.0 * u_height;
  float h = side * 0.8660254;
  vec2 p = px - 0.5 * u_viewport;
  // Three line families 60° apart; their floors name the triangle and sum to -1 (up) or -2 (down).
  vec3 u = vec3(p.y, dot(p, vec2(0.8660254, -0.5)), dot(p, vec2(-0.8660254, -0.5))) / h;
  vec3 id = floor(u);
  vec3 f = u - id;
  vec3 e = min(f, 1.0 - f) * h;
  float edge = min(e.x, min(e.y, e.z));
  float down = step(id.x + id.y + id.z, -1.5);
  vec3 cu = id + mix(1.0 / 3.0, 2.0 / 3.0, down);
  vec2 c = vec2((cu.y + 0.5 * cu.x) * h / 0.8660254, cu.x * h);

  float n = 0.65 * snoise(c / 380.0 + vec2(t * 0.035, 0.0) + flow * 0.3)
    + 0.35 * snoise(c / 190.0 - vec2(0.0, t * 0.05));
  float lit = smoothstep(0.2, 0.6, n + 0.3 * (hash12(id.xy + down * vec2(0.37, 0.71)) - 0.5));

  float fill = clamp((edge - 2.5) / aa + 0.5, 0.0, 1.0) * lit;
  float ink = stroke(edge, 1.0, aa) * (0.38 + 0.5 * lit) + fill * 0.34;
  float level = clamp(0.62 - 0.4 * n + 0.08 * down, 0.0, 1.0);
  return vec4(ink, level, 0.1 * lit, level);
}
