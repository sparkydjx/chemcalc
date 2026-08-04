/** Oilfield / chem treat formulas from chem calcs spreadsheet. */

export const PI = Math.PI

export type RateUnit =
  | 'Gals/Day'
  | 'Gals/Hr'
  | 'Gals/Min'
  | 'Qrts/Day'
  | 'Qrts/Hr'
  | 'L/Day'
  | 'L/Hr'

/** US liquid gallon → liters. */
const LITERS_PER_GAL = 3.785411784
/** US liquid gallon → quarts. */
const QTS_PER_GAL = 4
export type DiaUnit = 'in' | 'mm'
export type LenUnit = 'ft' | 'miles' | 'km'
export type VolUnit = 'Bbls' | 'm3' | 'Gals'
export type VelUnit = 'ft/sec' | 'm/sec'
export type GasRateUnit = 'MCFD' | 'MMCFD' | 'M3/Day'

/** Dosage: ppm × bbls/day → volume rate of chemical (gals/day base). */
export function dosageRate(
  targetPpm: number,
  bblsPerDay: number,
  out: RateUnit,
): number {
  const galsPerDay = (targetPpm / 1_000_000) * bblsPerDay * 42
  return galsPerDayToRate(galsPerDay, out)
}

/** Solve dosage for target PPM given chemical rate and volume. */
export function dosagePpm(galsPerDay: number, bblsPerDay: number): number {
  return (galsPerDay * 1_000_000) / (bblsPerDay * 42)
}

/** Solve dosage for volume (bbls/day) given chemical rate and PPM. */
export function dosageBblsPerDay(galsPerDay: number, targetPpm: number): number {
  return (galsPerDay * 1_000_000) / (targetPpm * 42)
}

/** Line ID (in) + length (ft) → displacement volume (bbls). */
export function displacementBbls(diameterIn: number, lengthFt: number): number {
  return (diameterIn / 24) ** 2 * lengthFt * 7.4805 / 42 * PI
}

/** Solve displacement for diameter (in). */
export function displacementDiameterIn(bbls: number, lengthFt: number): number {
  return 24 * Math.sqrt(bbls / (lengthFt * 7.4805 / 42 * PI))
}

/** Solve displacement for length (ft). */
export function displacementLengthFt(bbls: number, diameterIn: number): number {
  return bbls / ((diameterIn / 24) ** 2 * 7.4805 / 42 * PI)
}

/** Liquid rate (bbls/day) in pipe ID (in) → velocity (ft/sec). */
export function liquidVelocityFps(bblsPerDay: number, diameterIn: number): number {
  return (bblsPerDay * 5.61458931) / (86400 * PI * (diameterIn / 24) ** 2)
}

/** Solve liquid velocity for flow rate (bbls/day). */
export function liquidRateBblsPerDay(fps: number, diameterIn: number): number {
  return (fps * 86400 * PI * (diameterIn / 24) ** 2) / 5.61458931
}

/** Solve liquid velocity for diameter (in). */
export function liquidDiameterIn(bblsPerDay: number, fps: number): number {
  return 24 * Math.sqrt((bblsPerDay * 5.61458931) / (fps * 86400 * PI))
}

/** Gas rate (MCFD), ID (in), pressure (psig) → velocity (ft/sec). */
export function gasVelocityFps(
  gasRateMcfd: number,
  diameterIn: number,
  pressurePsig: number,
): number {
  return (
    (gasRateMcfd * 477) /
    ((pressurePsig + 14.7) * 3060 * (diameterIn / 24) ** 2 * PI)
  )
}

/** Solve gas velocity for gas rate (MCFD). */
export function gasRateMcfdFromVelocity(
  fps: number,
  diameterIn: number,
  pressurePsig: number,
): number {
  return (
    (fps * (pressurePsig + 14.7) * 3060 * (diameterIn / 24) ** 2 * PI) / 477
  )
}

/** Solve gas velocity for diameter (in). */
export function gasDiameterIn(
  gasRateMcfd: number,
  fps: number,
  pressurePsig: number,
): number {
  return 24 * Math.sqrt(
    (gasRateMcfd * 477) / (fps * (pressurePsig + 14.7) * 3060 * PI),
  )
}

/** Solve gas velocity for pressure (psig). */
export function gasPressurePsig(
  gasRateMcfd: number,
  diameterIn: number,
  fps: number,
): number {
  return (
    (gasRateMcfd * 477) / (fps * 3060 * (diameterIn / 24) ** 2 * PI) - 14.7
  )
}

/** Ion concentration (mg/L) × volume (bbls/day) → lbs/day. */
export function ionLbsPerDay(ionMgL: number, volumeBblsPerDay: number): number {
  return ionMgL * volumeBblsPerDay * 0.00035
}

/** Solve ion mass for concentration (mg/L). */
export function ionMgLFromLbs(lbsPerDay: number, volumeBblsPerDay: number): number {
  return lbsPerDay / (volumeBblsPerDay * 0.00035)
}

/** Solve ion mass for volume (bbls/day). */
export function ionVolumeFromLbs(lbsPerDay: number, ionMgL: number): number {
  return lbsPerDay / (ionMgL * 0.00035)
}

/**
 * % scavenger efficiency from H₂S load and scavenger injection.
 *
 * ((0.0002888177 × ppm H₂S × MCFD)
 *   ÷ (density lb/gal × (activity % ÷ 100) × gal/day)) × 100
 */
export function scavengerEfficiency(
  h2sPpm: number,
  gasRateMcfd: number,
  scavengerDensityLbGal: number,
  scavengerActivityPct: number,
  injectionRateGalDay: number,
): number {
  const numerator = 0.0002888177 * h2sPpm * gasRateMcfd
  const denominator =
    scavengerDensityLbGal *
    (scavengerActivityPct / 100) *
    injectionRateGalDay

  if (denominator === 0) {
    throw new Error('Denominator cannot be zero')
  }

  const efficiency = (numerator / denominator) * 100
  return Math.round(efficiency * 100) / 100
}

/**
 * Injection rate (gal/day) for a target % scavenger efficiency.
 *
 * (0.0002888177 × ppm H₂S × MCFD)
 *   ÷ (density lb/gal × (activity % ÷ 100) × (efficiency % ÷ 100))
 */
export function scavengerInjectionRate(
  h2sPpm: number,
  gasRateMcfd: number,
  scavengerDensityLbGal: number,
  scavengerActivityPct: number,
  efficiencyPct: number,
): number {
  const numerator = 0.0002888177 * h2sPpm * gasRateMcfd
  const denominator =
    scavengerDensityLbGal *
    (scavengerActivityPct / 100) *
    (efficiencyPct / 100)

  if (denominator === 0) {
    throw new Error('Denominator cannot be zero')
  }

  return numerator / denominator
}

/**
 * Gas rate (MCFD) for a target % scavenger efficiency.
 *
 * (density lb/gal × (activity % ÷ 100) × gal/day × (efficiency % ÷ 100))
 *   ÷ (0.0002888177 × ppm H₂S)
 */
export function scavengerGasRateMcfd(
  h2sPpm: number,
  scavengerDensityLbGal: number,
  scavengerActivityPct: number,
  injectionRateGalDay: number,
  efficiencyPct: number,
): number {
  const numerator =
    scavengerDensityLbGal *
    (scavengerActivityPct / 100) *
    injectionRateGalDay *
    (efficiencyPct / 100)
  const denominator = 0.0002888177 * h2sPpm

  if (denominator === 0) {
    throw new Error('Denominator cannot be zero')
  }

  return numerator / denominator
}

/**
 * H₂S concentration (ppm) for a target % scavenger efficiency.
 *
 * (density lb/gal × (activity % ÷ 100) × gal/day × (efficiency % ÷ 100))
 *   ÷ (0.0002888177 × MCFD)
 */
export function scavengerH2sPpm(
  gasRateMcfd: number,
  scavengerDensityLbGal: number,
  scavengerActivityPct: number,
  injectionRateGalDay: number,
  efficiencyPct: number,
): number {
  const numerator =
    scavengerDensityLbGal *
    (scavengerActivityPct / 100) *
    injectionRateGalDay *
    (efficiencyPct / 100)
  const denominator = 0.0002888177 * gasRateMcfd

  if (denominator === 0) {
    throw new Error('Denominator cannot be zero')
  }

  return numerator / denominator
}

// --- unit helpers (convert UI units → formula base units / results) ---

export function toInches(value: number, unit: DiaUnit): number {
  return unit === 'mm' ? value / 25.4 : value
}

export function fromInches(inches: number, unit: DiaUnit): number {
  return unit === 'mm' ? inches * 25.4 : inches
}

export function toFeet(value: number, unit: LenUnit): number {
  if (unit === 'miles') return value * 5280
  if (unit === 'km') return value * 3280.839895
  return value
}

export function fromFeet(feet: number, unit: LenUnit): number {
  if (unit === 'miles') return feet / 5280
  if (unit === 'km') return feet / 3280.839895
  return feet
}

export function toBbls(value: number, unit: VolUnit): number {
  if (unit === 'm3') return value / 0.1589872949
  if (unit === 'Gals') return value / 42
  return value
}

export function fromBbls(bbls: number, unit: VolUnit): number {
  if (unit === 'm3') return bbls * 0.1589872949
  if (unit === 'Gals') return bbls * 42
  return bbls
}

export function toFps(value: number, unit: VelUnit): number {
  return unit === 'm/sec' ? value / 0.3048 : value
}

export function fromFps(fps: number, unit: VelUnit): number {
  return unit === 'm/sec' ? fps * 0.3048 : fps
}

/** Normalize gas rate to MCFD for the gas-velocity formula. */
export function toMcfd(value: number, unit: GasRateUnit): number {
  if (unit === 'MMCFD') return value * 1000
  // 1 MCF ≈ 28.316846592 m³
  if (unit === 'M3/Day') return value / 28.316846592
  return value
}

export function fromMcfd(mcfd: number, unit: GasRateUnit): number {
  if (unit === 'MMCFD') return mcfd / 1000
  if (unit === 'M3/Day') return mcfd * 28.316846592
  return mcfd
}

export function rateToGalsPerDay(value: number, unit: RateUnit): number {
  if (unit === 'Gals/Hr') return value * 24
  if (unit === 'Gals/Min') return value * 1440
  if (unit === 'Qrts/Day') return value / QTS_PER_GAL
  if (unit === 'Qrts/Hr') return (value * 24) / QTS_PER_GAL
  if (unit === 'L/Day') return value / LITERS_PER_GAL
  if (unit === 'L/Hr') return (value * 24) / LITERS_PER_GAL
  return value
}

export function galsPerDayToRate(gpd: number, unit: RateUnit): number {
  if (unit === 'Gals/Hr') return gpd / 24
  if (unit === 'Gals/Min') return gpd / 1440
  if (unit === 'Qrts/Day') return gpd * QTS_PER_GAL
  if (unit === 'Qrts/Hr') return (gpd * QTS_PER_GAL) / 24
  if (unit === 'L/Day') return gpd * LITERS_PER_GAL
  if (unit === 'L/Hr') return (gpd * LITERS_PER_GAL) / 24
  return gpd
}

/** Parse a user-facing number string that may include thousands commas. */
export function parseNumString(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '') return NaN
  const v = Number(cleaned)
  return Number.isFinite(v) ? v : NaN
}

export function formatResult(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) > 0 && Math.abs(n) < 0.001) {
    return n.toPrecision(4)
  }
  const value =
    Math.abs(n) >= 1000 ? Number(n.toPrecision(4)) : Number(n.toFixed(digits))
  return value.toLocaleString('en-US', { maximumFractionDigits: 20 })
}

// --- API RP 14E erosional velocity (imperial / oilfield units) ---

export interface MixtureDensityInputs {
  /** Liquid specific gravity (water = 1.0); use average for oil–water mixtures */
  liquidSpecificGravity: number
  /** Liquid flow rate, bbl/day */
  liquidFlowRateBblPerDay: number
  /** Gas specific gravity (air = 1.0) */
  gasSpecificGravity: number
  /** Gas flow rate, MMscfd */
  gasFlowRateMMscfd: number
  /** Operating pressure, psia */
  pressurePsia: number
  /** Operating temperature, °R (°F + 460) */
  temperatureRankine: number
  /** Gas compressibility factor Z (dimensionless) */
  gasCompressibilityZ: number
}

export interface ErosionalVelocityResult {
  gasLiquidRatioScfPerBbl: number
  mixtureDensityLbPerFt3: number
  erosionalVelocityFtPerSec: number
  /** Liquid superficial velocity Vsl (ft/s), when pipe diameter is provided */
  liquidSuperficialVelocityFtPerSec?: number
  /** Gas superficial velocity Vsg (ft/s), when pipe diameter is provided */
  gasSuperficialVelocityFtPerSec?: number
  /** Mixture velocity Vm = Vsl + Vsg (ft/s), when pipe diameter is provided */
  mixtureVelocityFtPerSec?: number
}

/** Empirical C constants per API RP 14E (solids-free service) */
export const C_CONSTANTS = {
  continuousSolidsFree: 100,
  intermittentSolidsFree: 125,
  continuousCleanNonCorrosive: 150, // typically 150–200
  intermittentCleanNonCorrosive: 250,
} as const

/**
 * Gas/liquid mixture density per API RP 14E Eq. 2.15 (lb/ft³).
 * R is formed from gas and liquid rates: R = (Q_g × 1e6) / Q_l (scf/bbl).
 */
export function calculateMixtureDensity(inputs: MixtureDensityInputs): number {
  const {
    liquidSpecificGravity: sL,
    liquidFlowRateBblPerDay: qL,
    gasSpecificGravity: sG,
    gasFlowRateMMscfd: qG,
    pressurePsia: p,
    temperatureRankine: t,
    gasCompressibilityZ: z,
  } = inputs

  if (qL <= 0) {
    throw new Error('Liquid rate must be positive to form gas/liquid ratio.')
  }
  if (p <= 0) {
    throw new Error('Pressure must be positive (psia).')
  }
  if (t <= 0) {
    throw new Error('Temperature must be positive (°R).')
  }
  if (z <= 0) {
    throw new Error('Gas compressibility Z must be positive.')
  }

  const r = (qG * 1_000_000) / qL
  const numerator = 12409 * sL * p + 2.7 * r * sG * p
  const denominator = 198.7 * p + r * t * z

  if (denominator === 0) {
    throw new Error('Denominator is zero — check flow rate and condition inputs.')
  }

  return numerator / denominator
}

/** API RP 14E erosional velocity limit (ft/s): V_e = C / √ρ_m */
export function calculateErosionalVelocity(
  mixtureDensityLbPerFt3: number,
  c: number,
): number {
  if (mixtureDensityLbPerFt3 <= 0) {
    throw new Error('Mixture density must be positive.')
  }
  if (c <= 0) {
    throw new Error('C factor must be positive.')
  }
  return c / Math.sqrt(mixtureDensityLbPerFt3)
}

/** Standard conditions for gas rate conversion (60 °F, 14.7 psia) — same base used in calculateMixtureDensity. */
const P_STD_PSIA = 14.7
const T_STD_RANKINE = 520

/**
 * Superficial liquid and gas velocities (ft/s) at flowing (in-situ) conditions,
 * using the same P/T/Z real-gas correction already applied for mixture density
 * (and used identically in the multiphase module's stdToInSituGasRateFt3PerS):
 *
 *   A   = (π/4)(ID/12)²                                        (ft²)
 *   Vsl = (Q_L × 5.6146 / 86400) / A                            (ft/s)
 *   Q_g,actual = (Q_g × 1e6 / 86400) × (P_std/P) × (T/T_std) × Z (ft³/s)
 *   Vsg = Q_g,actual / A                                        (ft/s)
 *   Vm  = Vsl + Vsg
 *
 * Unlike the single-phase Gas Velocity calculator (which assumes fixed T and
 * Z for a quick check), this uses the actual temperature and compressibility
 * factor already entered for the mixture-density calculation.
 */
export function calculateSuperficialVelocities(
  inputs: MixtureDensityInputs,
  diameterIn: number,
): {
  liquidSuperficialVelocityFtPerSec: number
  gasSuperficialVelocityFtPerSec: number
  mixtureVelocityFtPerSec: number
} {
  const {
    liquidFlowRateBblPerDay: qL,
    gasFlowRateMMscfd: qG,
    pressurePsia: p,
    temperatureRankine: t,
    gasCompressibilityZ: z,
  } = inputs

  if (diameterIn <= 0) {
    throw new Error('Pipe diameter must be positive.')
  }
  if (p <= 0) {
    throw new Error('Pressure must be positive (psia).')
  }
  if (t <= 0) {
    throw new Error('Temperature must be positive (°R).')
  }
  if (z <= 0) {
    throw new Error('Gas compressibility Z must be positive.')
  }

  const areaFt2 = (PI / 4) * (diameterIn / 12) ** 2

  const liquidRateFt3PerSec = (qL * 5.6146) / 86400
  const liquidSuperficialVelocityFtPerSec = liquidRateFt3PerSec / areaFt2

  const gasRateStdFt3PerSec = (qG * 1_000_000) / 86400
  const gasRateActualFt3PerSec =
    gasRateStdFt3PerSec * (P_STD_PSIA / p) * (t / T_STD_RANKINE) * z
  const gasSuperficialVelocityFtPerSec = gasRateActualFt3PerSec / areaFt2

  return {
    liquidSuperficialVelocityFtPerSec,
    gasSuperficialVelocityFtPerSec,
    mixtureVelocityFtPerSec:
      liquidSuperficialVelocityFtPerSec + gasSuperficialVelocityFtPerSec,
  }
}

/** Mixture density and erosional velocity in one call. */
export function calculateApiRp14E(
  inputs: MixtureDensityInputs,
  c: number,
  diameterIn?: number,
): ErosionalVelocityResult {
  const gasLiquidRatioScfPerBbl =
    (inputs.gasFlowRateMMscfd * 1_000_000) / inputs.liquidFlowRateBblPerDay
  const mixtureDensityLbPerFt3 = calculateMixtureDensity(inputs)
  const erosionalVelocityFtPerSec = calculateErosionalVelocity(
    mixtureDensityLbPerFt3,
    c,
  )

  const result: ErosionalVelocityResult = {
    gasLiquidRatioScfPerBbl,
    mixtureDensityLbPerFt3,
    erosionalVelocityFtPerSec,
  }

  if (diameterIn !== undefined) {
    const superficial = calculateSuperficialVelocities(inputs, diameterIn)
    result.liquidSuperficialVelocityFtPerSec =
      superficial.liquidSuperficialVelocityFtPerSec
    result.gasSuperficialVelocityFtPerSec =
      superficial.gasSuperficialVelocityFtPerSec
    result.mixtureVelocityFtPerSec = superficial.mixtureVelocityFtPerSec
  }

  return result
}
