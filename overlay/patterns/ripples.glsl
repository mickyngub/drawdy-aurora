// @render-scale 1
// @max-dpr 2
// @grain 0
// @thumb-zoom 4

vec4 pattern(vec2 uv, vec2 px, float t, vec2 flow) {
  float scale = u_res.y / u_viewport.y;
  float wpx = 1.1 * scale;
  float spacing = 9.0 * u_height;
  float cellPx = 170.0 * u_height;
  float speed = 16.0 * u_height;
  // Drops sit 0.2..0.8 into their cell and only the nearest 2 x 2 cells are checked,
  // so a ripple must die before it reaches 0.7 of a cell.
  float life = 0.62 * cellPx / speed;
  float period = life * 1.5;
  float ink = 0.0;
  float tone = 0.0;
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    float layer = float(i >> 2);
    vec2 p = (px + flow * 30.0) / cellPx + layer * vec2(0.5, 0.37);
    vec2 cell = floor(p - 0.5) + vec2(i & 1, (i >> 1) & 1) + layer * 101.0;
    float tc = t + hash12(cell * 2.11) * period;
    float n = floor(tc / period);
    float age = tc - n * period - hash12(cell + n * 7.31) * (period - life);
    vec2 drop = floor(p - 0.5) + vec2(i & 1, (i >> 1) & 1)
      + 0.2 + 0.6 * vec2(hash12(cell * 1.9 + n * 3.17), hash12(cell * 2.3 - n * 5.1));
    float r = length(p - drop) * cellPx;
    float grow = age / life;
    float alive = step(0.0, age) * step(age, life);
    float gap = spacing * (0.75 + 0.5 * grow);
    float x = (age * speed - r) / gap;
    float k = floor(x + 0.5);
    float dist = abs(x - k) * gap * scale;
    float line = clamp(0.5 + max(wpx, 1.0) * 0.5 - dist, 0.0, 1.0) * min(wpx, 1.0);
    float packet = step(-0.5, k) * step(k, 2.5) * (1.0 - 0.3 * k);
    float fade = alive * pow(max(1.0 - grow, 0.0), 1.4) * smoothstep(0.0, 0.06, grow);
    float ring = line * packet * fade;
    ink += ring;
    tone += ring * hash12(cell * 0.71 + n);
    glow += fade * clamp(1.0 - r / max(age * speed, 1.0), 0.0, 1.0) * 0.25;
  }
  return vec4(min(ink * 1.8, 2.0), tone / max(ink, 1e-4), glow, 0.5);
}
