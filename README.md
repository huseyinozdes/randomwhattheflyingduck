# Engineering Utility Console

A minimalist, browser-based collection of engineering workflow utilities. The console keeps user files in the browser and requires no backend.

## Included utilities

- Image preview, simple light-background removal, resizing, PNG/JPEG export, and image-to-DXF outlines
- Structured row editing and CSV export
- Common length, temperature, and weight conversions
- OBJ-to-STL mesh conversion and STL pass-through export
- Date differences, date offsets, and copyable date/time output

The CAD converter intentionally supports only OBJ-to-STL and STL-to-STL operations. Other formats are visible as planning references and are not presented as completed conversions.

## Local use

Open `index.html` in a browser. No build step or dependencies are required.

The interface loads Tailwind CSS and fonts from public CDNs, so the visual styling requires a network connection on first load. User-selected files are processed locally in the browser.

## Image to DXF profiles

Load a PNG or JPEG in the Image tab and adjust threshold, invert, simplification, image dimensions in millimetres, and the optional centered frame. The image width and height describe the entire image canvas, including any blank margins. The SVG preview and downloadable DXF use the same closed outline geometry and millimetre units. Tracing uses the source resolution without downsampling, limited to 20 MiB, 20 megapixels and 8192 pixels per side. Images exceeding 100000 outline edges or 512 contours produce an explicit error rather than a reduced-detail export.

Threshold selects luminance less than or equal to the setting; invert selects luminance strictly greater than it. Fully transparent pixels are excluded in both modes; partial transparency is composited against white before comparing luminance. The background-removal button separately removes pixels whose red, green and blue channels are all at least 235; it does not remove dark backgrounds.

Outlines follow pixel boundaries, not fitted curves or centerlines, so magnification can reveal stair steps even in the resolution-independent SVG preview. Boundaries pinched at a grid corner are split into separate closed rings rather than self-touching polylines; distinct rings may still share a corner. Simplification is measured in source pixels, preserves topology conservatively around holes and touching contours, and leaves overlapping bounding boxes and contours above 300 corners unchanged. PNG/JPEG exports use the selected output resolution with centered aspect-preserving fit (transparent padding in PNG, white padding in JPEG); that setting does not change DXF tracing resolution.

Logos and lettering are traced as shapes; fonts are not identified and text is not editable. Inspect the DXF and calibrate dimensions before cutting: there is no kerf compensation or machine control.

DXF export writes an AutoCAD R2000 (`AC1015`) document with symbol tables, model/paper-space blocks and layouts, unique handles and model-space entity ownership, while retaining `$INSUNITS = 4` (millimetres). These exports have been loaded successfully in the full eDrawings 2024 SP05 desktop application and viewer control and independently read back for geometry and units. This includes a desktop rendering of the optionally smoothed logo and control load callbacks for smoothed geometric fixtures. The previous HEADER/ENTITIES-only R2000 output was not accepted by that viewer despite passing a tolerant parser's audit. Other CAD/CAM readers and versions are not certified.

The profile status displays the exporter build (`2026-11-13.3`). Profile scripts use versioned URLs to avoid reusing an older cached exporter after loading an updated page, and the UI disables export if its engine build does not match. Already-open tabs and cached older HTML require a hard refresh; previously downloaded DXFs are not upgraded automatically. When changing either profile script, bump both script URL versions in `index.html`, the engine's `version`, and the UI's `expectedVersion` together. These checks and all image calculations run locally; no calculation service or new runtime dependency is used.

Enter the output name in **DXF FILE NAME** before downloading. A single `.dxf` extension is added (existing repeated `.dxf` suffixes are removed), and a blank name uses `image-profile.dxf`. Reserved filename characters and Windows device names produce an explicit error instead of a silently renamed download. DXF uses the shared save-location picker where supported, with a browser download otherwise. Cancellation and picker/write failures are reported rather than silently attempting a different save.

For less stair-stepping, enable **reduce pixel stair steps**. This optional, local smoothing balances short raster corners and fits straight segments, with at most 0.75 source-pixel boundary displacement. It preserves contour bounds, orientation, source pixel-center classification, holes and one-pixel features, and rejects self-intersections or crossings between contours. Touching contours, unsafe proposals and work exceeding the conservative complexity budget stay unchanged. Manual simplification is disabled in this mode. For exact pixel boundaries, leave quality unchecked and simplification at zero. Smoothing changes continuous geometry between pixels; it does not recover absent image detail or alter the luminance threshold. Export coordinates retain eight decimal places in millimetres to avoid quantizing small smoothed details.

## Verification gate

Repository-standard verification commands:

- `npm run lint`
- `npm run build`
- `npm test`

CI runtime enforcement is defined in `.github/workflows/verification-gate.yml` and runs the same commands on pull requests to `main`.

## Mini-tool engine adapter for host repositories

`mini_tool_engine_adapter.js` provides a reusable engine dropdown contract and execution adapter that can be imported into another repository's run form.

### Engine options

- `Basic (Recommended - standard run, no mini-tool)`
- `Advanced (Includes mini-tool suggestions)`

### Behavior contract

- Basic maps to `basic_without_mini_tool`.
- Advanced maps to `advanced_with_mini_tool`.
- Validation rejects unknown engines and rejects `mini_tool_context` when engine is Basic.
- Response includes verification fields:
  - `verification.expected_mini_tool_included`
  - `verification.actual_mini_tool_included`
  - `verification.path_verified`

### Host integration example

```html
<script src="./mini_tool_engine_adapter.js"></script>
<script>
  const options = window.RandomWTFDuckMiniTool.engineDropdownOptions();
  const result = window.RandomWTFDuckMiniTool.runWithEngine({
    engine: "advanced",
    request: "Cut bracket at 2 in",
    mini_tool_context: "focus on conversion"
  });
  console.log(options, result.execution_path, result.verification.path_verified);
</script>
```
