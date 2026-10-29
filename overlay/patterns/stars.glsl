// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2.5

// Stars keep a fifth of a cell clear and their glow fades before the edge, so a pixel only needs its own cell.
vec2 starLayer(vec2 p, float cellPx, float seed, float density, float size, float t) {
  vec2 cell = floor(p / cellPx);
  vec2 key = cell + seed * 17.0;
  if (hash12(key) > density) return vec2(0.0);
  vec2 centre = (cell + 0.2 + 0.6 * vec2(hash12(key + 1.7), hash12(key + 5.3))) * cellPx;
  float mag = pow(hash12(key + 9.1), 2.5);
  vec2 o = p - centre;
  float d = length(o);
  vec2 edge = min(p - cell * cellPx, (cell + 1.0) * cellPx - p);
  float window = smoothstep(0.0, 0.18 * cellPx, min(edge.x, edge.y));
  float r = mix(0.65, 1.5, mag) * size;
  float core = 1.0 - smoothstep(r - 0.5, r + 0.5, d);
  float glow = exp(-d / (1.2 + 3.0 * mag * size)) * 0.6 * mag;
  vec2 a = abs(o);
  float spike = step(0.8, mag) * (exp(-a.x * 2.0 - a.y * 0.35) + exp(-a.y * 2.0 - a.x * 0.35)) * 0.5;
  float twinkle = 0.72 + 0.28 * sin(t * mix(0.6, 2.2, hash12(key + 3.1)) + 6.2832 * hash12(key + 7.7));
  float b = (core * mix(1.0, 2.0, mag) + (glow + spike * mag) * window) * twinkle;
  return vec2(b, hash12(key + 11.3));
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 dir = vec2(-1.0, -0.22);
  vec2 shift = flow * 30.0;
  vec2 far = starLayer(px - dir * t * 1.5 + shift * 0.4, 34.0 * u_height, 1.0, 0.6, 0.85, t);
  vec2 mid = starLayer(px - dir * t * 3.5 + shift * 0.7, 58.0 * u_height, 2.0, 0.55, 1.05, t);
  vec2 near = starLayer(px - dir * t * 7.0 + shift, 100.0 * u_height, 3.0, 0.5, 1.35, t);
  float ink = far.x * 0.8 + mid.x + near.x;
  float level = (far.y * far.x * 0.8 + mid.y * mid.x + near.y * near.x) / max(ink, 1e-4);

  float slot = floor(t / 9.0);
  float local = t - slot * 9.0 - 6.0 * hash12(vec2(slot, 1.3));
  float duration = 1.2;
  if (hash12(vec2(slot, 4.1)) < 0.3 && local > 0.0 && local < duration) {
    vec2 start = u_viewport * vec2(0.15 + 0.7 * hash12(vec2(slot, 2.7)), 0.55 + 0.4 * hash12(vec2(slot, 8.9)));
    vec2 heading = normalize(vec2(hash12(vec2(slot, 5.5)) < 0.5 ? -1.0 : 1.0, -0.45));
    vec2 headPos = start + heading * 380.0 * local;
    float len = 150.0;
    vec2 rel = px - headPos;
    float along = clamp(-dot(rel, heading) / len, 0.0, 1.0);
    float across = length(rel + heading * along * len);
    float env = smoothstep(0.0, 0.25, local) * (1.0 - smoothstep(duration * 0.55, duration, local));
    float streak = ((1.0 - smoothstep(0.3, 1.3, across)) * pow(1.0 - along, 2.0) * 0.9 + exp(-length(rel) / 1.5) * 0.6) * env;
    level = mix(level, 0.0, clamp(streak * 4.0, 0.0, 1.0));
    ink = max(ink, streak);
  }

  float n = fbm2(px / 520.0 + vec2(t * 0.006, t * 0.004));
  return vec4(ink, level, 0.08 * smoothstep(0.05, 0.8, n), 0.8);
}
