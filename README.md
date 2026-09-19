# CTW Face Editor

Drag-and-drop 2D outline editor for all three faces of the clay cubic CTW identity mark (cwynn.com).

- Draggable polygon vertices, touch/pointer support
- Snap grid: 0.5, 0.25 (fine), or off — grid redraws to match
- **Tabs for W (right face), T (front face), C (top face)** — one 2D editor per face
- **3D preview shows all three faces together** as the cube corner, live
- Mirror about the symmetry axis, on by default where the cubic face is symmetric (W about z=2.5, C about z=2.5; T has no mirror by default)
- **Double-click** a point to delete it (mirror partner goes too)
- Points that join on the midline **merge into one** on drop
- Drag a midline point **sideways** and it stays put while a new mirrored pair is born under your cursor
- 3D preview shows all three faces together as the cube corner
- Reset to the approved cubic outline (W: R_V6, T: F_PRIMARY, C: TOP_V5); W also resets to your latest shaped outline
- **Export all** faces as one JSON `{w:.., t:.., c:..}` / copy to clipboard / **Load** JSON back (accepts the triple, or a bare `[[h,v],..]` array into the current face)
- Show vertex numbers (optional)

Live editor: GitHub Pages serves `index.html` from `main`.

## Face coordinate systems

- **W** (right face, x=5): polygon in `(z, y)` — z horizontal, y vertical. Mirror about z=2.5.
- **T** (front face, z=5): polygon in `(x, y)` — x horizontal, y vertical. No mirror by default (cubic T is not symmetric).
- **C** (top face, y=5): polygon in `(x, z)` — x horizontal, z vertical (top view, z=0/front at bottom). Mirror about z=2.5.

## Polygon versions

- `polygon-user-v1.json` — Charlie's edited outline (2026-09-19). Validated: symmetric about z=2.5, non-self-intersecting.
- `candidates/` — generated W variations (JSON + PNG renders + contact sheet). See `gen_candidates.py` to regenerate or add more.
