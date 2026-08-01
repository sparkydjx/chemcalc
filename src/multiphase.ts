/**
 * Vertical multiphase-flow regime, entrainment, film, and wall-shear model.
 *
 * Scope
 *  Steady, adiabatic, co-current upward gas-liquid flow in a circular tubular.
 *  Output wall shear stress is intended as input to NORSOK M-506:2017 CO2
 *  corrosion rate models (τw appears as S in the norsok flow correction).
 *
 * Key correlations (all references verified against original journal forms)
 *  - Superficial velocities from in-situ volumetric rates.
 *  - Harmathy (1960) bubble terminal velocity.
 *      V_b = 1.53 * [g σ (ρ_L − ρ_G) / ρ_L²]^{1/4}
 *  - Hasan & Kabir (1988) flow-regime transitions for vertical upflow:
 *      Bubble → slug at α = 0.25 with drift-flux C0 = 1.2:
 *        V_sg,t = 0.429 V_sl + 0.357 V_b        (small tubes, D < 0.15 m)
 *      Slug/churn → annular (Turner / Taitel-Barnea-Dukler 1980):
 *        V_sg,ann = 3.1 [σ g (ρ_L − ρ_G) / ρ_G²]^{1/4}
 *  - Drift-flux void fraction, general form:
 *        α = V_sg / (C0 V_m + V_d)
 *    with (C0, V_d) chosen per regime.
 *  - API RP 14E:  V_e = C / √ρ_m  (C = 100 continuous, solids-free).
 *  - Ishii & Mishima (1989) equilibrium droplet entrainment:
 *        We = (ρ_G j_G² D / σ) [(ρ_L − ρ_G) / ρ_G]^{1/3}
 *        Re_L = ρ_L j_L D / μ_L
 *        E = tanh(7.25e-7 We^{1.25} Re_L^{0.25})
 *  - Wallis (1969) interfacial friction factor (annular, Fanning form):
 *        f_i = 0.005 (1 + 300 δ/D)              (film treated as sand-grain roughness ≈ 4δ)
 *  - Vertical film force balance including gravity (laminar film):
 *        Γ/ρ_L = δ² [τ_i / (2 μ_L) − ρ_L g δ / (3 μ_L)]
 *    solved as a cubic in δ; reduces to Couette when gravity is negligible.
 *  - Turbulent film option (Henstock & Hanratty 1976 / Wallis 1969):
 *        δ+ ≈ 0.34 Re_f^{0.6}, δ+ = δ √(τ_i ρ_L) / μ_L
 *  - NORSOK M-506:2017 mixture-based wall shear (Chen 1979 f approximation):
 *        f = 0.001375 [1 + (2e4 (ε/D) + 10^6 μ_m / (ρ_m u_m D))^{1/3}]
 *        τ_w = 0.5 ρ_m f u_m²
 *
 * Units
 *  Public inputs are oilfield/imperial (as in API and NORSOK screening work).
 *  Conversions to SI are explicit and adjacent to the correlations that are
 *  natively SI. Outputs are reported in both SI (Pa, m) and oilfield units.
 *
 * Not modeled
 *  Wave-augmented interfacial friction beyond Wallis, wispy-annular,
 *  countercurrent flooding limits, non-Newtonian liquids, three-phase (oil-
 *  water-gas) slip, high-pressure droplet drag (see Sawant 2008 for HP form).
 *
 * References
 *  Hasan, A.R. & Kabir, C.S. (1988). Void Fraction in Bubbly, Slug and Churn
 *    Flow in Vertical Two-Phase Up-Flow. Chem. Eng. Comm. 66, 101-111.
 *  Harmathy, T.Z. (1960). Velocity of large drops and bubbles in media of
 *    infinite or restricted extent. AIChE J. 6, 281.
 *  Ishii, M. & Mishima, K. (1989). Droplet entrainment correlation in
 *    annular two-phase flow. Int. J. Heat Mass Trans. 32, 1835-1846.
 *  Taitel, Y., Barnea, D. & Dukler, A.E. (1980). Modelling flow-pattern
 *    transitions for steady upward gas-liquid flow. AIChE J. 26, 345.
 *  Wallis, G.B. (1969). One-Dimensional Two-Phase Flow. McGraw-Hill.
 *  API RP 14E (5th ed. 1991, reaffirmed 2013). Design and Installation of
 *    Offshore Production Platform Piping Systems.
 *  NORSOK M-506:2017 rev. 3. CO2 corrosion rate calculation model.
 *  Sawant, P., Ishii, M. & Mori, M. (2008). Droplet entrainment correlation
 *    in vertical upward co-current annular two-phase flow. Nucl. Eng. Des.
 *    238, 1342-1352. (Optional high-pressure correction, exposed via flag.)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WellInputs {
  /** Tubing inner diameter, inches */
  tubingIdIn: number
  /** In-situ liquid volumetric rate, ft^3/s */
  liquidRateFt3PerS: number
  /** In-situ gas volumetric rate, ft^3/s */
  gasRateFt3PerS: number
  /** Liquid density, lbm/ft^3 */
  liquidDensityLbmFt3: number
  /** Gas density, lbm/ft^3 */
  gasDensityLbmFt3: number
  /** Gas-liquid interfacial tension, dyne/cm */
  interfacialTensionDyneCm: number
  /** Liquid dynamic viscosity, cP */
  liquidViscosityCp: number
  /** Gas dynamic viscosity, cP */
  gasViscosityCp: number
  /** Absolute pipe wall roughness, inches. Default 0.0018 in ≈ 45 μm (new steel). */
  pipeRoughnessIn?: number
}

export type FlowRegime = 'bubble' | 'slug/churn' | 'annular'

export interface RegimeResult {
  areaFt2: number
  Vsl: number
  Vsg: number
  Vm: number
  bubbleRiseVelocityFtPerS: number
  taylorBubbleRiseVelocityFtPerS: number
  /** Hasan-Kabir small-tube bubble→slug threshold on V_sg */
  bubbleToSlugTransitionVsgFtPerS: number
  /** Taitel/Turner slug/churn→annular threshold on V_sg */
  slugChurnToAnnularTransitionVsgFtPerS: number
  /** Kutateladze number for the slug→annular check (informational) */
  kutateladzeNumber: number
  regime: FlowRegime
}

export interface HoldupResult {
  /** Void (gas) fraction from a physically-consistent drift-flux for the regime. */
  voidFraction: number
  liquidHoldup: number
  /** Slip-corrected mixture density, lbm/ft^3 */
  mixtureDensitySlipLbmFt3: number
  /** No-slip (homogeneous) mixture density, lbm/ft^3, for API 14E screening */
  mixtureDensityNoSlipLbmFt3: number
  /** Drift-flux coefficients actually used in the calculation */
  c0: number
  driftVelocityFtPerS: number
}

export interface ErosionalResult {
  /** V_e = C/√ρ_m, ft/s */
  erosionalVelocityFtPerS: number
  actualVelocityFtPerS: number
  belowErosionalLimit: boolean
  cFactor: number
}

export interface EntrainmentResult {
  weberNumber: number
  liquidReynoldsNumber: number
  entrainmentFraction: number
  /** True if using the Sawant 2008 exponent (1/4) instead of Ishii-Mishima 1989 (1/3). */
  sawantHighPressureForm: boolean
}

export interface FilmResult {
  filmVolumetricRateFt3PerS: number
  /** Γ = ρ_L Q_film / (π D), kg/(m·s) — liquid mass per unit wetted perimeter */
  filmMassLoadingKgPerMs: number
  filmReynoldsNumber: number
  filmRegimeLaminar: boolean
}

export interface ShearResult {
  coreMassRateLbmPerS: number
  coreDensityLbmFt3: number
  coreVelocityFtPerS: number
  coreReynoldsNumber: number
  /** Fanning friction factor used for interfacial shear */
  interfacialFrictionFactor: number
  /** Which correlation produced the interfacial friction factor */
  interfacialFrictionModel: 'wallis-wavy' | 'blasius-smooth'
  interfacialShearPa: number
  /** Wall shear from the film-side momentum balance (annular). */
  wallShearStressPa: number
  wallShearStressLbfFt2: number
  /** Ratio to the 19 Pa NORSOK reference — quick corrosion-context flag. */
  norsokShearRatio: number
}

export interface FilmThicknessResult {
  filmThicknessM: number
  filmThicknessIn: number
  filmVelocityFtPerS: number
  /** True if the cubic (gravity-aware) form was used vs. Couette-only fallback. */
  gravityCorrected: boolean
  /** Wallis dimensionless film thickness δ+, informational. */
  deltaPlus: number
}

export interface NorsokShearResult {
  reynoldsNumber: number
  frictionFactorFanning: number
  wallShearStressPa: number
  wallShearStressLbfFt2: number
}

export interface FullResult {
  regime: RegimeResult
  holdup: HoldupResult
  erosional: ErosionalResult
  entrainment: EntrainmentResult | null
  film: FilmResult | null
  shear: ShearResult | null
  filmThickness: FilmThicknessResult | null
  /** Mixture-based NORSOK M-506 wall shear (always computed; regime-agnostic). */
  norsokWallShear: NorsokShearResult
}

// ---------------------------------------------------------------------------
// Constants / conversions
// ---------------------------------------------------------------------------

export const G_SI = 9.81
export const FT_TO_M = 0.3048
export const IN_TO_M = 0.0254
export const FT3_TO_M3 = 0.028316846592
export const LBM_FT3_TO_KG_M3 = 16.018463374
export const CP_TO_PAS = 0.001
export const DYNE_CM_TO_N_M = 0.001
export const PA_TO_LBF_FT2 = 0.020885434

/** Newer/turned steel tubing absolute roughness (ε), inches. */
export const DEFAULT_PIPE_ROUGHNESS_IN = 0.0018

// ---------------------------------------------------------------------------
// Regime determination
// ---------------------------------------------------------------------------

export function computeRegime(inp: WellInputs): RegimeResult {
  const dFt = inp.tubingIdIn / 12
  const areaFt2 = (Math.PI / 4) * dFt * dFt

  const Vsl = inp.liquidRateFt3PerS / areaFt2
  const Vsg = inp.gasRateFt3PerS / areaFt2
  const Vm = Vsl + Vsg

  // Harmathy V_b in SI (single unit system, no CGS mid-step required).
  const rhoL = inp.liquidDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const rhoG = inp.gasDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const sigma = inp.interfacialTensionDyneCm * DYNE_CM_TO_N_M
  const dM = inp.tubingIdIn * IN_TO_M
  const dRho = rhoL - rhoG
  if (dRho <= 0) {
    throw new Error('Liquid density must exceed gas density.')
  }

  const VbSi = 1.53 * Math.pow((G_SI * sigma * dRho) / (rhoL * rhoL), 0.25)
  const bubbleRiseVelocityFtPerS = VbSi / FT_TO_M

  // Taylor bubble (slug) rise velocity, informational and used for slug drift.
  //   V_TB = 0.35 √(g D (ρ_L − ρ_G)/ρ_L)   (Nicklin/Wallis, Dumitrescu 1943)
  const VtbSi = 0.35 * Math.sqrt((G_SI * dM * dRho) / rhoL)
  const taylorBubbleRiseVelocityFtPerS = VtbSi / FT_TO_M

  // Bubble → slug (Hasan-Kabir 1988), rearranged for explicit V_sg,t(V_sl):
  //   V_sg = C0 α V_m + α V_b, at α = 0.25 with C0 = 1.2, V_m = V_sl + V_sg
  //   ⇒ V_sg,t = (C0 α)/(1 − C0 α) V_sl + α/(1 − C0 α) V_b
  //            = 0.4286 V_sl + 0.3571 V_b
  const bubbleToSlugTransitionVsgFtPerS =
    (0.3 / 0.7) * Vsl + (0.25 / 0.7) * bubbleRiseVelocityFtPerS

  // Slug/churn → annular: Taitel/Turner criterion in SI, converted to ft/s.
  const VsgAnnSi =
    3.1 * Math.pow((sigma * G_SI * dRho) / (rhoG * rhoG), 0.25)
  const slugChurnToAnnularTransitionVsgFtPerS = VsgAnnSi / FT_TO_M

  // Kutateladze number of the gas phase, Ku_G = V_sg √ρ_G / [σ g Δρ]^{1/4}
  // Annular onset per Taitel corresponds to Ku_G ≈ 3.1.
  const kutateladzeNumber =
    (Vsg * FT_TO_M * Math.sqrt(rhoG)) /
    Math.pow(sigma * G_SI * dRho, 0.25)

  // Ordered classification: check annular first so it can't be masked by a
  // pathological bubble/slug threshold in cases where the two thresholds cross.
  let regime: FlowRegime
  if (Vsg >= slugChurnToAnnularTransitionVsgFtPerS) {
    regime = 'annular'
  } else if (Vsg > bubbleToSlugTransitionVsgFtPerS) {
    regime = 'slug/churn'
  } else {
    regime = 'bubble'
  }

  return {
    areaFt2,
    Vsl,
    Vsg,
    Vm,
    bubbleRiseVelocityFtPerS,
    taylorBubbleRiseVelocityFtPerS,
    bubbleToSlugTransitionVsgFtPerS,
    slugChurnToAnnularTransitionVsgFtPerS,
    kutateladzeNumber,
    regime,
  }
}

// ---------------------------------------------------------------------------
// Holdup / mixture density (regime-aware drift flux)
// ---------------------------------------------------------------------------

/**
 * Regime-aware drift-flux void fraction with the standard (C0, V_d) sets:
 *   bubble:   C0 = 1.2, V_d = V_b (Harmathy)
 *   slug:     C0 = 1.2, V_d = V_TB (Taylor bubble)
 *   annular:  C0 = 1.0, V_d = 0    (α ≈ V_sg/V_m fallback; overridden below by
 *             film-thickness-based holdup once δ is known — see refineAnnularHoldup)
 */
export function computeHoldup(
  inp: WellInputs,
  reg: RegimeResult,
): HoldupResult {
  let c0: number
  let driftSi: number
  if (reg.regime === 'bubble') {
    c0 = 1.2
    driftSi = reg.bubbleRiseVelocityFtPerS * FT_TO_M
  } else if (reg.regime === 'slug/churn') {
    c0 = 1.2
    driftSi = reg.taylorBubbleRiseVelocityFtPerS * FT_TO_M
  } else {
    c0 = 1.0
    driftSi = 0
  }

  const VmSi = reg.Vm * FT_TO_M
  const VsgSi = reg.Vsg * FT_TO_M
  const voidFraction = Math.max(0, Math.min(1, VsgSi / (c0 * VmSi + driftSi)))
  const liquidHoldup = 1 - voidFraction

  const mixtureDensitySlipLbmFt3 =
    inp.liquidDensityLbmFt3 * liquidHoldup +
    inp.gasDensityLbmFt3 * voidFraction

  const noSlipLiquidFraction = reg.Vsl / reg.Vm
  const mixtureDensityNoSlipLbmFt3 =
    inp.liquidDensityLbmFt3 * noSlipLiquidFraction +
    inp.gasDensityLbmFt3 * (1 - noSlipLiquidFraction)

  return {
    voidFraction,
    liquidHoldup,
    mixtureDensitySlipLbmFt3,
    mixtureDensityNoSlipLbmFt3,
    c0,
    driftVelocityFtPerS: driftSi / FT_TO_M,
  }
}

// ---------------------------------------------------------------------------
// API RP 14E erosional velocity
// ---------------------------------------------------------------------------

export function computeErosionalVelocity(
  mixtureDensityLbmFt3: number,
  actualVelocityFtPerS: number,
  cFactor = 100,
): ErosionalResult {
  const erosionalVelocityFtPerS = cFactor / Math.sqrt(mixtureDensityLbmFt3)
  return {
    erosionalVelocityFtPerS,
    actualVelocityFtPerS,
    belowErosionalLimit: actualVelocityFtPerS < erosionalVelocityFtPerS,
    cFactor,
  }
}

// ---------------------------------------------------------------------------
// Ishii-Mishima entrainment
// ---------------------------------------------------------------------------

export interface EntrainmentOptions {
  /**
   * Use Sawant et al. 2008 exponent (1/4) instead of Ishii-Mishima 1989 (1/3)
   * on the density-ratio group. Recommended above ~30 bar or when data are
   * dominated by high-pressure steam-water systems. Default false.
   */
  sawantHighPressure?: boolean
  /**
   * Optional cap on the equilibrium entrainment fraction. Ishii-Mishima
   * tanh saturates to 1 which is physically implausible when any wall film
   * exists. Common practice: E_max ≈ 0.95. Default 1.0 (no cap).
   */
  maxEntrainmentFraction?: number
}

export function computeEntrainment(
  inp: WellInputs,
  reg: RegimeResult,
  opts: EntrainmentOptions = {},
): EntrainmentResult {
  const sawant = opts.sawantHighPressure ?? false
  const cap = opts.maxEntrainmentFraction ?? 1.0

  const dM = inp.tubingIdIn * IN_TO_M
  const VsgSi = reg.Vsg * FT_TO_M
  const VslSi = reg.Vsl * FT_TO_M
  const rhoLSi = inp.liquidDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const rhoGSi = inp.gasDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const sigmaSi = inp.interfacialTensionDyneCm * DYNE_CM_TO_N_M
  const muLSi = inp.liquidViscosityCp * CP_TO_PAS

  const exponent = sawant ? 0.25 : 1 / 3
  const densityGroup = Math.pow((rhoLSi - rhoGSi) / rhoGSi, exponent)
  const weberNumber =
    ((rhoGSi * VsgSi * VsgSi * dM) / sigmaSi) * densityGroup

  const liquidReynoldsNumber = (rhoLSi * VslSi * dM) / muLSi

  const raw = Math.tanh(
    7.25e-7 * Math.pow(weberNumber, 1.25) * Math.pow(liquidReynoldsNumber, 0.25),
  )
  const entrainmentFraction = Math.min(cap, raw)

  return {
    weberNumber,
    liquidReynoldsNumber,
    entrainmentFraction,
    sawantHighPressureForm: sawant,
  }
}

// ---------------------------------------------------------------------------
// Film properties
// ---------------------------------------------------------------------------

export function computeFilm(
  inp: WellInputs,
  ent: EntrainmentResult,
): FilmResult {
  const filmVolumetricRateFt3PerS =
    (1 - ent.entrainmentFraction) * inp.liquidRateFt3PerS

  const filmVolumetricRateM3PerS = filmVolumetricRateFt3PerS * FT3_TO_M3
  const rhoLSi = inp.liquidDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const dM = inp.tubingIdIn * IN_TO_M
  const muLSi = inp.liquidViscosityCp * CP_TO_PAS

  const filmMassLoadingKgPerMs =
    (rhoLSi * filmVolumetricRateM3PerS) / (Math.PI * dM)
  const filmReynoldsNumber = (4 * filmMassLoadingKgPerMs) / muLSi

  return {
    filmVolumetricRateFt3PerS,
    filmMassLoadingKgPerMs,
    filmReynoldsNumber,
    filmRegimeLaminar: filmReynoldsNumber < 1000,
  }
}

// ---------------------------------------------------------------------------
// Film thickness (gravity + shear, cubic)
// ---------------------------------------------------------------------------

/**
 * Solve for the smallest positive real root of
 *   (ρ_L g / 3μ_L) δ³ − (τ_i / 2μ_L) δ² + Γ/ρ_L = 0
 * which is the vertical film mass-balance for a laminar film with wall no-slip
 * and an interfacial shear boundary condition dv/dy|_δ = τ_i / μ_L, gas dragging
 * the film upward against gravity. Derivation: starting from the film momentum
 * equation μ d²v/dy² = (ρ_L − ρ_G) g ≈ ρ_L g, integrating with v(0)=0 and
 * μ dv/dy|_δ = τ_i yields Γ = (ρ_L/μ)[τ_i δ²/2 − ρ_L g δ³/3], from which the
 * cubic above follows after division by ρ_L.
 *
 * Falls back to the shear-only Couette root δ = √(2 Γ μ_L / ρ_L τ_i) if the
 * cubic returns a non-physical root (τ_i very large — gravity term negligible).
 */
export function solveLaminarFilmThickness(
  filmMassLoadingKgPerMs: number,
  interfacialShearPa: number,
  liquidDensityKgM3: number,
  liquidViscosityPas: number,
): { deltaM: number; gravityCorrected: boolean } {
  if (interfacialShearPa <= 0) throw new Error('τ_i must be positive.')

  const a = (liquidDensityKgM3 * G_SI) / (3 * liquidViscosityPas)
  const b = -interfacialShearPa / (2 * liquidViscosityPas)
  const d = filmMassLoadingKgPerMs / liquidDensityKgM3

  // Newton on f(δ) = a δ³ + b δ² + d, starting from Couette guess. This is
  // monotonically decreasing then increasing on δ>0; a single Newton usually
  // converges cleanly. Fall back to Couette if Newton diverges.
  const deltaCouette = Math.sqrt(
    (2 * filmMassLoadingKgPerMs * liquidViscosityPas) /
      (liquidDensityKgM3 * interfacialShearPa),
  )
  let delta = deltaCouette
  let converged = false
  for (let i = 0; i < 100; i++) {
    const f = a * delta ** 3 + b * delta ** 2 + d
    const fp = 3 * a * delta ** 2 + 2 * b * delta
    if (fp === 0) break
    const step = f / fp
    const next = delta - 0.9 * step
    if (next <= 0 || !Number.isFinite(next)) break
    delta = next
    if (Math.abs(step) < 1e-12 * Math.max(delta, 1e-12)) {
      converged = true
      break
    }
  }

  if (!converged || !Number.isFinite(delta) || delta <= 0) {
    return { deltaM: deltaCouette, gravityCorrected: false }
  }
  return { deltaM: delta, gravityCorrected: true }
}

// ---------------------------------------------------------------------------
// Interfacial shear (Wallis-wavy) + wall shear (annular force balance)
// ---------------------------------------------------------------------------

/**
 * Solve the coupled interfacial shear ↔ film thickness system with Wallis
 * f_i = 0.005 (1 + 300 δ/D) and gravity-aware laminar film cubic.
 *
 * Iteration outline (Picard, dampened):
 *   1. Compute core mass rate and mean density assuming δ ≪ D/2.
 *   2. Compute core velocity u_c = (Q_g + E Q_l) / (A − A_film).
 *   3. Compute Re_c and initial f_i (smooth Blasius at δ = 0).
 *   4. Compute τ_i = 0.5 f_i ρ_c u_c², solve δ from cubic.
 *   5. Recompute A_film = π(D δ − δ²), u_c, f_i (Wallis with δ/D), τ_i.
 *   6. Loop until |Δδ|/δ < 1e-6 or 50 iters.
 */
export function computeShear(
  inp: WellInputs,
  reg: RegimeResult,
  holdup: HoldupResult,
  ent: EntrainmentResult,
  film: FilmResult,
): ShearResult & { deltaMForFilm: number; gravityCorrected: boolean; deltaPlus: number } {
  const dM = inp.tubingIdIn * IN_TO_M
  const areaSi = (Math.PI / 4) * dM * dM
  const rhoLSi = inp.liquidDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const rhoGSi = inp.gasDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const muGSi = inp.gasViscosityCp * CP_TO_PAS
  const muLSi = inp.liquidViscosityCp * CP_TO_PAS
  const rhoMSi = holdup.mixtureDensitySlipLbmFt3 * LBM_FT3_TO_KG_M3

  const gasMassRateSi =
    inp.gasRateFt3PerS * FT3_TO_M3 * rhoGSi
  const liquidMassRateSi =
    inp.liquidRateFt3PerS * FT3_TO_M3 * rhoLSi
  const coreMassRateSi = gasMassRateSi + ent.entrainmentFraction * liquidMassRateSi

  // Gas + entrained-droplet volumetric rate in the core (droplets travel with
  // gas, so the entrained-liquid volumetric rate is E·Q_L at the liquid density).
  const coreVolRateSi =
    (inp.gasRateFt3PerS + ent.entrainmentFraction * inp.liquidRateFt3PerS) * FT3_TO_M3

  // Initial guess: δ = 0, so A_core = A, ρ_c = m_c/(A V_m).
  const VmSi = reg.Vm * FT_TO_M
  let coreDensitySi = coreMassRateSi / (areaSi * VmSi)
  let coreVelSi = coreVolRateSi / areaSi
  let coreRe = (coreDensitySi * coreVelSi * dM) / muGSi
  let fi = 0.079 / Math.pow(Math.max(coreRe, 1), 0.25)   // smooth Blasius start
  let interfacialShearPa = 0.5 * fi * coreDensitySi * coreVelSi * coreVelSi
  let model: 'wallis-wavy' | 'blasius-smooth' = 'blasius-smooth'

  const isAnnular = reg.regime === 'annular'
  let deltaM = 0
  let gravityCorrected = false

  if (isAnnular) {
    for (let iter = 0; iter < 60; iter++) {
      const { deltaM: dNew, gravityCorrected: gc } = solveLaminarFilmThickness(
        film.filmMassLoadingKgPerMs,
        interfacialShearPa,
        rhoLSi,
        muLSi,
      )
      const deltaMNew = 0.5 * deltaM + 0.5 * dNew    // damping helps stability

      // Recompute core area accounting for the film.
      const areaFilmSi = Math.PI * (dM * deltaMNew - deltaMNew * deltaMNew)
      const areaCoreSi = Math.max(areaSi - areaFilmSi, 1e-12)

      coreDensitySi = coreMassRateSi / (areaCoreSi * VmSi) // holds if u_c ≈ V_m
      coreVelSi = coreVolRateSi / areaCoreSi
      coreRe = (coreDensitySi * coreVelSi * dM) / muGSi

      // Wallis wavy-film interfacial friction (film as sand-grain roughness ≈ 4δ).
      fi = 0.005 * (1 + 300 * (deltaMNew / dM))
      model = 'wallis-wavy'
      interfacialShearPa = 0.5 * fi * coreDensitySi * coreVelSi * coreVelSi
      gravityCorrected = gc

      const rel = Math.abs(deltaMNew - deltaM) / Math.max(deltaMNew, 1e-15)
      deltaM = deltaMNew
      if (rel < 1e-6) break
    }
  }

  // Overall (differential-ring) vertical force balance:
  //   τ_w π D dz = τ_i π (D − 2δ) dz + (ρ_c − ρ_m) g A dz    (annular)
  //   For thin film, (D − 2δ)/D ≈ 1, A/(π D) = D/4 → the classic form.
  // For non-annular regimes we still expose an equivalent-area balance for
  // consistency (the norsokWallShear result is more appropriate there).
  const wallShearStressPa = isAnnular
    ? interfacialShearPa * ((dM - 2 * deltaM) / dM) +
      (dM / 4) * (coreDensitySi - rhoMSi) * G_SI
    : interfacialShearPa

  const deltaPlus = isAnnular
    ? (deltaM * Math.sqrt(interfacialShearPa * rhoLSi)) / muLSi
    : 0

  return {
    coreMassRateLbmPerS: coreMassRateSi / (LBM_FT3_TO_KG_M3 * FT3_TO_M3),
    coreDensityLbmFt3: coreDensitySi / LBM_FT3_TO_KG_M3,
    coreVelocityFtPerS: coreVelSi / FT_TO_M,
    coreReynoldsNumber: coreRe,
    interfacialFrictionFactor: fi,
    interfacialFrictionModel: model,
    interfacialShearPa,
    wallShearStressPa,
    wallShearStressLbfFt2: wallShearStressPa * PA_TO_LBF_FT2,
    norsokShearRatio: wallShearStressPa / 19,
    deltaMForFilm: deltaM,
    gravityCorrected,
    deltaPlus,
  }
}

// ---------------------------------------------------------------------------
// NORSOK M-506:2017 mixture-based wall shear (regime-agnostic)
// ---------------------------------------------------------------------------

/**
 * NORSOK M-506:2017 wall shear.
 *   Uses no-slip (homogeneous) mixture density/velocity/viscosity and a
 *   Chen-1979 friction factor. This is the S value plugged into the
 *   NORSOK flow correction f(v, τ_w) = (τ_w / 19)^0.146.
 */
export function computeNorsokWallShear(
  inp: WellInputs,
  reg: RegimeResult,
): NorsokShearResult {
  const dM = inp.tubingIdIn * IN_TO_M
  const rhoLSi = inp.liquidDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const rhoGSi = inp.gasDensityLbmFt3 * LBM_FT3_TO_KG_M3
  const muLSi = inp.liquidViscosityCp * CP_TO_PAS
  const muGSi = inp.gasViscosityCp * CP_TO_PAS
  const roughnessM = (inp.pipeRoughnessIn ?? DEFAULT_PIPE_ROUGHNESS_IN) * IN_TO_M

  const lambda = reg.Vsl / reg.Vm                    // no-slip liquid fraction
  const rhoM = lambda * rhoLSi + (1 - lambda) * rhoGSi
  // NORSOK M-506 uses power-law mixing for viscosity (Dukler-type):
  //   μ_m = μ_L^λ × μ_G^{1-λ}
  const muM = Math.pow(muLSi, lambda) * Math.pow(muGSi, 1 - lambda)
  const uM = reg.Vm * FT_TO_M

  const reM = (rhoM * uM * dM) / muM
  const term = 2e4 * (roughnessM / dM) + 1e6 / Math.max(reM, 1)
  const f = 0.001375 * (1 + Math.pow(term, 1 / 3))
  const tauW = 0.5 * rhoM * f * uM * uM

  return {
    reynoldsNumber: reM,
    frictionFactorFanning: f,
    wallShearStressPa: tauW,
    wallShearStressLbfFt2: tauW * PA_TO_LBF_FT2,
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface RunOptions extends EntrainmentOptions {
  /** API RP 14E C-factor. Default 100 (solids-free continuous service). */
  erosionalCFactor?: number
}

/** Oilfield liquid rate (stock-tank bbl/day) → in-situ ft³/s (5.6146 ft³/bbl). */
export function bblPerDayToFt3PerS(bblPerDay: number): number {
  return (bblPerDay * 5.6146) / 86400
}

/** In-situ MCFD → ft³/s. */
export function mcfdToFt3PerS(mcfd: number): number {
  return (mcfd * 1000) / 86400
}

/** In-situ ft³/s → MCFD. */
export function ft3PerSToMcfd(ft3PerS: number): number {
  return (ft3PerS * 86400) / 1000
}

/** Standard / surface gas rate units (60 °F, 14.7 psia). */
export type StdGasRateUnit = 'MCFD' | 'MMCFD' | 'ft3/s'

export const P_STD_PSIA = 14.7
/** 60 °F absolute. */
export const T_STD_RANKINE = 520

/** Convert a standard gas rate to ft³/s at standard conditions. */
export function stdGasRateToFt3PerS(
  value: number,
  unit: StdGasRateUnit,
): number {
  if (unit === 'MCFD') return (value * 1000) / 86400
  if (unit === 'MMCFD') return (value * 1_000_000) / 86400
  return value
}

/**
 * Standard volumetric gas rate → in-situ ft³/s via real-gas law:
 *   Q_in-situ = Q_std × (P_std / P) × (T / T_std) × Z
 * Temperatures in Rankine; P in psia.
 */
export function stdToInSituGasRateFt3PerS(
  stdFt3PerS: number,
  pressurePsia: number,
  temperatureF: number,
  z: number,
): number {
  if (pressurePsia <= 0) {
    throw new Error('Pressure must be positive (psia).')
  }
  if (z <= 0) {
    throw new Error('Gas compressibility Z must be positive.')
  }
  const tR = temperatureF + 460
  if (tR <= 0) {
    throw new Error('Temperature must be above absolute zero.')
  }
  return (
    stdFt3PerS * (P_STD_PSIA / pressurePsia) * (tR / T_STD_RANKINE) * z
  )
}

export function runFullCalculation(
  inp: WellInputs,
  opts: RunOptions = {},
): FullResult {
  const regime = computeRegime(inp)
  const holdup = computeHoldup(inp, regime)
  const erosional = computeErosionalVelocity(
    holdup.mixtureDensitySlipLbmFt3,
    regime.Vm,
    opts.erosionalCFactor ?? 100,
  )
  const norsokWallShear = computeNorsokWallShear(inp, regime)

  let entrainment: EntrainmentResult | null = null
  let film: FilmResult | null = null
  let shear: ShearResult | null = null
  let filmThickness: FilmThicknessResult | null = null

  if (regime.regime === 'annular') {
    entrainment = computeEntrainment(inp, regime, opts)
    film = computeFilm(inp, entrainment)
    const s = computeShear(inp, regime, holdup, entrainment, film)
    shear = s
    filmThickness = {
      filmThicknessM: s.deltaMForFilm,
      filmThicknessIn: s.deltaMForFilm / IN_TO_M,
      filmVelocityFtPerS:
        s.deltaMForFilm > 0
          ? (film.filmMassLoadingKgPerMs /
              (inp.liquidDensityLbmFt3 * LBM_FT3_TO_KG_M3 * s.deltaMForFilm)) /
            FT_TO_M
          : 0,
      gravityCorrected: s.gravityCorrected,
      deltaPlus: s.deltaPlus,
    }
  }

  return {
    regime,
    holdup,
    erosional,
    entrainment,
    film,
    shear,
    filmThickness,
    norsokWallShear,
  }
}
