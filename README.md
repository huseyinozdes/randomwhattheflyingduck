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
