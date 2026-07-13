# Engineering Utility Console

A minimalist, browser-based collection of engineering workflow utilities. The console keeps user files in the browser and requires no backend.

## Included utilities

- Image preview, simple light-background removal, resizing, and PNG/JPEG export
- Structured row editing and CSV export
- Common length, temperature, and weight conversions
- OBJ-to-STL mesh conversion and STL pass-through export
- Date differences, date offsets, and copyable date/time output

The CAD converter intentionally supports only OBJ-to-STL and STL-to-STL operations. Other formats are visible as planning references and are not presented as completed conversions.

## Local use

Open `index.html` in a browser. No build step or dependencies are required.

The interface loads Tailwind CSS and fonts from public CDNs, so the visual styling requires a network connection on first load. User-selected files are processed locally in the browser.

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
