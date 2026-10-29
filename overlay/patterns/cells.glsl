// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 4

float stroke(float d, float w, float aa) {
  return clamp((min(d + 0.5 * aa, 0.5 * w) - max(d - 0.5 * aa, -0.5 * w)) / aa, 0.0, 1.0);
}

// Seeds wander at most 0.32 of a cell from centre, which keeps the true neighbours inside the 3 x 3 search.
vec2 seedAt(vec2 cell, float t) {
  vec2 h = vec2(hash12(cell), hash12(cell + 19.19));
  return cell + 0.5 + 0.32 * sin(t * (0.12 + 0.1 * h.yx) + 6.2831853 * h);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float aa = u_viewport.y / u_res.y;
  float cellPx = 78.0 * u_height;
  vec2 p = (px - 0.5 * u_viewport) / cellPx;
  vec2 base = floor(p);

  vec2 seeds[9];
  float best = 1e9;
  int nearest = 0;
  for (int i = 0; i < 9; i++) {
    vec2 s = seedAt(base + vec2(float(i % 3) - 1.0, float(i / 3) - 1.0), t);
    seeds[i] = s;
    vec2 v = s - p;
    float d = dot(v, v);
    if (d < best) {
      best = d;
      nearest = i;
    }
  }
  vec2 m = seeds[nearest];
  float border = 1e9;
  for (int i = 0; i < 9; i++) {
    if (i == nearest) continue;
    vec2 s = seeds[i];
    border = min(border, dot(0.5 * (m + s) - p, normalize(s - m)));
  }
  border *= cellPx;

  vec2 id = base + vec2(float(nearest % 3) - 1.0, float(nearest / 3) - 1.0);
  vec2 h = vec2(hash12(id + 7.7), hash12(id + 3.3));
  float tinted = step(h.y, 0.5) * smoothstep(0.8, 1.0, 0.5 + 0.5 * sin(t * (0.09 + 0.16 * h.y) + 6.2831853 * h.x));
  float ln = snoise(p * cellPx / 900.0 + vec2(-t * 0.012, t * 0.01) + flow * 0.25);

  float line = stroke(border, 1.2, aa);
  float glow = exp(-border / 6.0);
  float ink = line * 0.95 + glow * 0.3 + tinted * (0.2 + 0.22 * exp(-border / 16.0));
  float level = clamp(0.5 + 0.35 * ln - 0.25 * tinted, 0.0, 1.0);
  return vec4(ink, level, 0.16 * tinted, level);
}
