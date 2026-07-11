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

### Ashby-style endurance anchoring for stress-life

The fatigue tab uses an Ashby-style endurance ratio to estimate the rotating-beam endurance anchor from ultimate strength:

$$
S_e^{\prime} = r_{\mathrm{Ashby}} S_{ut}, \qquad
S_e = S_e^{\prime} k_a k_b k_c k_d k_e
$$

With a high-cycle anchor at $N=10^6$ and a low-cycle anchor near $0.9S_{ut}$ at $N=10^3$, the Basquin slope is reconstructed as:

$$
b = \frac{\log_{10}(S_e / (0.9S_{ut}))}{3}
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
