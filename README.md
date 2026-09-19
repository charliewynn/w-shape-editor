# W Shape Editor

Drag-and-drop 2D outline editor for the shaped W of the clay cubic CTW identity mark (cwynn.com).

- Draggable polygon vertices, touch/pointer support
- Snap grid: 0.5, 0.25 (fine), or off — grid redraws to match
- Mirror about z=2.5, on by default — centerline vertices lock to the line
- **Double-click** a point to delete it (mirror partner goes too)
- Points that join on the midline **merge into one** on drop
- Drag a midline point **sideways** and it stays put while a new mirrored pair is born under your cursor
- Approximate isometric extrusion preview of the W
- Reset to the approved cubic R_V6 outline or your latest shaped outline
- Export polygon as JSON / copy to clipboard / **Load** JSON back from the text box (accepts `[[z,y],...]` or `{"points":[...]}`)
- Show vertex numbers (optional)

Live editor: GitHub Pages serves `index.html` from `main`.

## Polygon versions

- `polygon-user-v1.json` — Charlie's edited outline (2026-09-19). Validated: symmetric about z=2.5, non-self-intersecting.
- `candidates/` — generated W variations (JSON + PNG renders + contact sheet). See `gen_candidates.py` to regenerate or add more.
