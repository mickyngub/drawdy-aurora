// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 2

// Glyphs pick strokes of a 5 x 7 box (half bars and two diagonals), so random picks read as characters rather than noise.
float stroke(float seed, float id, float odds) {
  return step(1.0 - odds, hash12(vec2(seed * 71.3, id * 7.31)));
}

float glyph(vec2 g, float seed) {
  if (g.x < 0.0 || g.x > 4.0 || g.y < 0.0 || g.y > 6.0) return 0.0;
  float on = 0.0;
  ivec2 i = ivec2(g);
  if (i.y % 3 == 0) {
    float bar = float(i.y / 3);
    if (g.x <= 2.0) on = max(on, stroke(seed, bar * 2.0, 0.42));
    if (g.x >= 2.0) on = max(on, stroke(seed, bar * 2.0 + 1.0, 0.42));
  }
  if (i.x % 2 == 0) {
    float bar = float(i.x / 2);
    if (g.y <= 3.0) on = max(on, stroke(seed, 6.0 + bar * 2.0, 0.38));
    if (g.y >= 3.0) on = max(on, stroke(seed, 7.0 + bar * 2.0, 0.38));
  }
  float slope = g.y * (2.0 / 3.0);
  if (abs(g.x - (4.0 - slope)) <= 0.5) on = max(on, stroke(seed, 12.0, 0.2));
  if (abs(g.x - slope) <= 0.5) on = max(on, stroke(seed, 13.0, 0.2));
  return on;
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 p = vec2(px.x, u_viewport.y - px.y);
  float pix = max(1.0, floor(2.0 * u_height + 0.5));
  vec2 cellSize = vec2(7.0, 9.0) * pix;
  vec2 cell = floor(p / cellSize);
  vec2 g = floor((p - cell * cellSize) / pix) - vec2(1.0, 1.0);

  float speed = mix(1.1, 3.0, hash12(vec2(cell.x, 3.7)));
  float trail = mix(7.0, 20.0, hash12(vec2(cell.x, 9.1)));
  float rows = u_viewport.y / cellSize.y;
  float period = rows * mix(1.1, 2.2, hash12(vec2(cell.x, 17.3))) + trail + 2.0;
  float head = mod(t * speed + hash12(vec2(cell.x, 23.9)) * period, period) - 2.0;
  float d = head - cell.y;
  float behind = max(d, 0.0);
  float rise = clamp(d + 1.0, 0.0, 1.0);
  float tail = clamp(1.0 - behind / trail, 0.0, 1.0);
  float glow = exp(-behind * 1.3);

  float epoch = floor(t * mix(0.07, 0.3, hash12(cell + 41.7)) + hash12(cell));
  float seed = hash12(cell * vec2(1.31, 0.77) + mod(epoch, 251.0) * 13.7);
  float lit = glyph(g, seed);

  float dc = head - p.y / cellSize.y;
  float column = sin(3.14159 * clamp((p.x - cell.x * cellSize.x) / cellSize.x, 0.0, 1.0));
  float streak = clamp(dc + 1.0, 0.0, 1.0) * clamp(1.0 - max(dc, 0.0) / trail, 0.0, 1.0);

  float ink = lit * rise * (0.4 * tail * tail + 1.25 * glow);
  float level = mix(0.15, 0.9, behind / trail) * (1.0 - glow);
  return vec4(ink, level, 0.16 * streak * streak * column * column, 0.6);
}
