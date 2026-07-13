# Fatigue Life Calculator

A browser-based fatigue calculator for quick stress-life, strain-life, and reliability estimates with engineering notation that stays close to handbook form.

## Models and equations

### Stress from area and bending

For a solid round section of diameter $d$ under axial force $F$ and bending moment $M$, the cross-sectional properties and resulting stresses are:

$$
A = \frac{\pi d^2}{4}, \qquad I = \frac{\pi d^4}{64}, \qquad c = \frac{d}{2}
$$

$$
\sigma = \frac{F}{A}, \qquad \sigma_b = \frac{M c}{I}
$$

Under combined alternating (subscript $a$) and mean (subscript $m$) loading the stress components are resolved separately:

$$
\sigma_a = \frac{F_a}{A} + \frac{M_a c}{I}, \qquad
\sigma_m = \frac{F_m}{A} + \frac{M_m c}{I}
$$

where $F_a$, $F_m$ are alternating and mean axial forces, and $M_a$, $M_m$ are alternating and mean bending moments.

### Goodman mean-stress correction

The modified Goodman criterion (Goodman, 1899) accounts for the reduction in allowable alternating stress caused by a non-zero mean stress:

$$
\frac{\sigma_a}{S_e} + \frac{\sigma_m}{S_{ut}} = 1
$$

Rearranging to obtain the Goodman-corrected equivalent alternating stress amplitude:

$$
\sigma_{a,\mathrm{eq}} = \frac{\sigma_a}{1 - \sigma_m / S_{ut}}
$$

$\sigma_{a,\mathrm{eq}}$ is then compared against the stress-life curve to obtain $N_f$.

### Basquin stress-life relation

The Basquin (power-law) relation describes the $S$–$N$ curve in the high-cycle fatigue regime (Basquin, 1910):

$$
\sigma_{a,\mathrm{eq}} = \sigma_f^{\prime} \left( 2 N_f \right)^b
$$

Solving for life:

$$
N_f = \frac{1}{2} \left( \frac{\sigma_{a,\mathrm{eq}}}{\sigma_f^{\prime}} \right)^{1/b}
$$

where $b$ is the fatigue strength exponent (typically $-0.12 \leq b \leq -0.05$ for steels).

### Manson-Coffin-Basquin strain-life relation

The total strain-life relation (Manson, 1953; Coffin, 1954) partitions strain amplitude into elastic and plastic contributions:

$$
\varepsilon_a = \underbrace{\frac{\sigma_f^{\prime}}{E} \left( 2 N_f \right)^b}_{\text{elastic}} + \underbrace{\varepsilon_f^{\prime} \left( 2 N_f \right)^c}_{\text{plastic}}
$$

This covers both low-cycle ($N_f < 10^4$) and high-cycle ($N_f > 10^4$) regimes. The transition life $2N_t$ where elastic and plastic contributions are equal is:

$$
2 N_t = \left( \frac{\varepsilon_f^{\prime} E}{\sigma_f^{\prime}} \right)^{1/(b-c)}
$$

### Weibull reliability

The two-parameter Weibull distribution models the scatter in fatigue life at a given stress level (Weibull, 1951):

$$
F(N) = 1 - \exp \left[ - \left( \frac{N}{\eta} \right)^\beta \right], \qquad
R(N) = \exp \left[ - \left( \frac{N}{\eta} \right)^\beta \right]
$$

Standard reliability life percentiles used in bearing and component rating:

$$
B_{10} = \eta \left[ -\ln(0.90) \right]^{1/\beta}, \qquad
B_{50} = \eta \left( \ln 2 \right)^{1/\beta}
$$

$B_{10}$ is the life at which 10% of a population is expected to have failed; $B_{50}$ is the median life.

## Nomenclature

| Symbol | Meaning | Typical units |
| --- | --- | --- |
| $d$ | shaft/section diameter | mm or in |
| $A$ | cross-sectional area | mm² or in² |
| $I$ | second moment of area | mm⁴ or in⁴ |
| $c$ | distance from neutral axis to outer fibre | mm or in |
| $F$, $F_a$, $F_m$ | total, alternating, mean axial force | N or lbf |
| $M$, $M_a$, $M_m$ | total, alternating, mean bending moment | N·mm or lbf·in |
| $\sigma_a$ | alternating stress amplitude | MPa or ksi |
| $\sigma_m$ | mean stress | MPa or ksi |
| $\sigma_{a,\mathrm{eq}}$ | Goodman-corrected equivalent alternating stress | MPa or ksi |
| $S_{ut}$ | ultimate tensile strength | MPa or ksi |
| $S_e^{\prime}$ | unmodified (test-specimen) endurance limit | MPa or ksi |
| $S_e$ | corrected endurance limit | MPa or ksi |
| $E$ | Young's modulus | MPa or ksi |
| $N_f$ | cycles to failure | cycles |
| $b$ | fatigue strength exponent (Basquin slope) | dimensionless |
| $\varepsilon_a$ | total strain amplitude | dimensionless |
| $\sigma_f^{\prime}$ | fatigue strength coefficient | MPa or ksi |
| $\varepsilon_f^{\prime}$ | fatigue ductility coefficient | dimensionless |
| $c$ (strain-life) | fatigue ductility exponent | dimensionless |
| $\beta$ | Weibull shape parameter | dimensionless |
| $\eta$ | Weibull scale parameter (characteristic life) | cycles |
| $R(N)$ | survival probability at life $N$ | — |
| $F(N)$ | cumulative failure probability at life $N$ | — |
| $B_{10}$ | life at 10 % cumulative failure probability | cycles |
| $B_{50}$ | median life (50 % survival) | cycles |

## Input parameter guidance

Typical material property ranges for ferrous engineering alloys. Values outside these bounds warrant source verification before use.

| Parameter | Symbol | Typical range (steels) | Primary source |
| --- | --- | --- | --- |
| Fatigue strength coefficient | $\sigma_f^{\prime}$ | $700–2\,000$ MPa | MMPDS-01, ASM Handbook Vol. 19 |
| Fatigue strength exponent | $b$ | $-0.12$ to $-0.05$ | ASM Handbook Vol. 19 |
| Fatigue ductility coefficient | $\varepsilon_f^{\prime}$ | $0.05–2.0$ | ASM Handbook Vol. 19 |
| Fatigue ductility exponent | $c$ | $-0.8$ to $-0.5$ | ASM Handbook Vol. 19 |
| Unmodified endurance limit | $S_e^{\prime}$ | $\approx 0.4–0.5\, S_{ut}$ (steels) | Shigley's MED §6-6 |
| Weibull shape parameter | $\beta$ | $1.1–3.5$ (rolling-element bearings: $\approx 1.5$) | ISO 281:2007 |

## Limitations and assumptions

- **Round cross-sections only.** Stress calculations assume a solid circular cross-section. Hollow, rectangular, or complex profiles require external section-property computation.
- **Uniaxial stress state.** No multiaxial fatigue criterion (e.g., von Mises, critical-plane) is applied. Multiaxial loading requires an equivalent stress transformation before use.
- **Linear-elastic material behaviour.** Mean-stress correction and the elastic term of the Manson-Coffin relation assume linear elasticity. Significant plasticity requires an explicit cyclic stress-strain model.
- **Constant-amplitude loading.** No cycle-counting (e.g., rainflow) or damage-accumulation (e.g., Miner's rule) is performed. Variable-amplitude histories must be reduced externally.
- **Stress concentration factors applied externally.** Theoretical stress concentration factor $K_t$ and notch sensitivity factor $q$ must be applied to stresses before input; the calculator does not apply them internally.
- **Material data accuracy.** Results depend directly on the quality of $\sigma_f^{\prime}$, $b$, $\varepsilon_f^{\prime}$, $c$ inputs. Handbook estimates carry ±15–30 % scatter; use test-derived values where precision is required.
- **Surface and size corrections.** The endurance limit correction factors ($k_a$–$k_f$ in Shigley notation) are not applied automatically. The corrected $S_e$ must be provided directly.

## Validation and verification

Benchmark cases for spot-checking calculator outputs.

### Benchmark 1 — Basquin (stress-life)

Given: $\sigma_f^{\prime} = 1000\ \text{MPa}$, $b = -0.10$, $\sigma_{a,\mathrm{eq}} = 400\ \text{MPa}$

$$
N_f = \frac{1}{2} \left( \frac{400}{1000} \right)^{1/(-0.10)} = \frac{1}{2} \times (0.4)^{-10} \approx 4.77 \times 10^4\ \text{cycles}
$$

### Benchmark 2 — Goodman correction

Given: $\sigma_a = 200\ \text{MPa}$, $\sigma_m = 150\ \text{MPa}$, $S_{ut} = 600\ \text{MPa}$

$$
\sigma_{a,\mathrm{eq}} = \frac{200}{1 - 150/600} = \frac{200}{0.75} \approx 266.7\ \text{MPa}
$$

### Benchmark 3 — Weibull $B_{10}$ life

Given: $\eta = 1 \times 10^6\ \text{cycles}$, $\beta = 1.5$

$$
B_{10} = 10^6 \times [-\ln(0.90)]^{1/1.5} = 10^6 \times (0.10536)^{0.6667} \approx 2.22 \times 10^5\ \text{cycles}
$$

## References

| Model | Primary reference |
| --- | --- |
| **Basquin stress-life** | Basquin, O. H. (1910). *The exponential law of endurance tests.* ASTM Proceedings, 10, 625–630. |
| **Manson strain-life** | Manson, S. S. (1953). *Behavior of materials under conditions of thermal stress.* NACA TN-2933. |
| **Coffin strain-life** | Coffin, L. F. (1954). *A study of the effects of cyclic thermal stresses on a ductile metal.* Trans. ASME, 76(6), 931–950. |
| **Goodman criterion** | Goodman, J. (1899). *Mechanics Applied to Engineering.* Longmans, Green & Co., London. |
| **Weibull distribution** | Weibull, W. (1951). *A statistical distribution function of wide applicability.* J. Appl. Mech., 18(3), 293–297. DOI: [10.1115/1.4010337](https://doi.org/10.1115/1.4010337) |
| **Endurance limit estimation** | Shigley, J. E., Mischke, C. R., & Budynas, R. G. (2004). *Mechanical Engineering Design*, 7th ed. McGraw-Hill. §6-6. |
| **Material data** | ASM International (1996). *ASM Handbook Volume 19: Fatigue and Fracture.* ASM International. |
| **Unit definitions** | ISO 1000:1992. *SI units and recommendations for the use of their multiples.* |

## Local use

Open `index.html` in a browser. No build step or dependencies are required.

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
