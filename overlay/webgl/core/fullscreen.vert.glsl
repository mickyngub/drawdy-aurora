#version 300 es

// Covers the viewport with ONE oversized triangle derived from gl_VertexID.
//
// Why not a quad: two triangles meet on a diagonal, and interpolation across
// that seam is a classic source of a faint visible crease in full-screen
// effects. A single triangle has no interior edge.
//
// Why no attributes: with the positions computed from the vertex index there is
// no vertex buffer, no VAO, and no per-frame attribute upload. Draw with
// gl.drawArrays(gl.TRIANGLES, 0, 3).
//
//   id 0 -> (-1,-1)   id 1 -> (3,-1)   id 2 -> (-1,3)
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
