// @render-scale 1
// @max-dpr 2
// @thumb-zoom 1

// Glyphs sit on an 8 x 8 pixel grid; g is a glyph pixel's centre relative to the cell centre (±0.5 … ±3.5).
float ring(vec2 g, float r) {
  vec2 a = abs(g);
  return step(abs(max(a.x, a.y) - r), 0.25) * step(a.x + a.y, r * 1.5 + 0.5);
}

float plus(vec2 g) {
  vec2 a = abs(g);
  return step(min(a.x, a.y), 0.5) * step(max(a.x, a.y), 2.5);
}

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  vec2 p = vec2(px.x, u_viewport.y - px.y);
  // Whole multiples of 8 px keep every glyph pixel the same size.
  float cellPx = 8.0 * max(1.0, floor(3.0 * u_height + 0.5));
  vec2 cell = floor(p / cellPx);
  vec2 g = floor((p - cell * cellPx) / cellPx * 8.0) - 3.5;
  vec2 c = cell - floor(u_viewport / cellPx * 0.5);
  float w = t * 2.0;
  float wave = (sin(c.x * 0.3 + w) + sin(c.y * 0.3 - w) + sin((c.x + c.y) * 0.2 + w)) / 3.0;
  float lit = wave > 0.5 ? max(ring(g, 3.5), plus(g))
    : wave > 0.0 ? ring(g, 2.5)
    : wave > -0.5 ? ring(g, 1.5)
    : ring(g, 0.5);
  float level = clamp(wave * 0.5 + 0.5, 0.0, 1.0);
  return vec4(lit * mix(0.25, 1.0, level), 1.0 - level, 0.12 * level, 0.8);
}
