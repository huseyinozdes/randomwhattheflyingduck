# Fatigue Life Calculator

A browser-based fatigue calculator for quick stress-life, strain-life, and reliability estimates with engineering notation that stays close to handbook form.

## Models and equations

### Stress from area and bending

For a round section:

$$
A = \frac{\pi d^2}{4}, \qquad I = \frac{\pi d^4}{64}, \qquad c = \frac{d}{2}
$$

$$
\sigma = \frac{F}{A}, \qquad \sigma_b = \frac{M c}{I}
$$

With alternating and mean loading:

$$
\sigma_a = \frac{F_a}{A} + \frac{M_a c}{I}, \qquad
\sigma_m = \frac{F_m}{A} + \frac{M_m c}{I}
$$

### Goodman correction

$$
\frac{\sigma_a}{S_e} + \frac{\sigma_m}{S_{ut}} = 1
$$

$$
\sigma_{a,\mathrm{eq}} = \frac{\sigma_a}{1 - \sigma_m / S_{ut}}
$$

### Basquin stress-life relation

$$
\sigma_{a,\mathrm{eq}} = \sigma_f^{\prime} \left( 2 N_f \right)^b
$$

### Manson-Coffin-Basquin strain-life relation

$$
\varepsilon_a = \frac{\sigma_f^{\prime}}{E} \left( 2 N_f \right)^b + \varepsilon_f^{\prime} \left( 2 N_f \right)^c
$$

### Weibull reliability

$$
F(N) = 1 - \exp \left[ - \left( \frac{N}{\eta} \right)^\beta \right], \qquad
R(N) = \exp \left[ - \left( \frac{N}{\eta} \right)^\beta \right]
$$

$$
B_{10} = \eta \left[ -\ln(0.90) \right]^{1/\beta}, \qquad
B_{50} = \eta \left( \ln 2 \right)^{1/\beta}
$$

## Nomenclature

| Symbol | Meaning |
| --- | --- |
| $\sigma_a$ | alternating stress amplitude |
| $\sigma_m$ | mean stress |
| $\sigma_{a,\mathrm{eq}}$ | Goodman-corrected equivalent alternating stress |
| $S_{ut}$ | ultimate tensile strength |
| $S_e^{\prime}$ | unmodified endurance limit |
| $S_e$ | corrected endurance limit |
| $N_f$ | cycles to failure |
| $\varepsilon_a$ | strain amplitude |
| $\sigma_f^{\prime}$ | fatigue strength coefficient |
| $\varepsilon_f^{\prime}$ | fatigue ductility coefficient |
| $\beta$ | Weibull shape parameter |
| $\eta$ | Weibull scale parameter, or characteristic life |
| $R(N)$ | survival probability at life $N$ |
| $B_{10}$ | life at 10% cumulative failure probability |
| $B_{50}$ | median life |

## Local use

Open `index.html` in a browser. No build step or dependencies are required.

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
