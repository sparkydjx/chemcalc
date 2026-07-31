/** Oilfield / chem treat formulas from chem calcs spreadsheet. */

export const PI = Math.PI

export type RateUnit =
  | 'Gals/Day'
  | 'Gals/Hr'
  | 'Gals/Min'
  | 'L/Day'
  | 'L/Hr'
  | 'Qts/Day'
  | 'Qts/Hr'

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
  if (unit === 'L/Day') return value / LITERS_PER_GAL
  if (unit === 'L/Hr') return (value * 24) / LITERS_PER_GAL
  if (unit === 'Qts/Day') return value / QTS_PER_GAL
  if (unit === 'Qts/Hr') return (value * 24) / QTS_PER_GAL
  return value
}

export function galsPerDayToRate(gpd: number, unit: RateUnit): number {
  if (unit === 'Gals/Hr') return gpd / 24
  if (unit === 'Gals/Min') return gpd / 1440
  if (unit === 'L/Day') return gpd * LITERS_PER_GAL
  if (unit === 'L/Hr') return (gpd * LITERS_PER_GAL) / 24
  if (unit === 'Qts/Day') return gpd * QTS_PER_GAL
  if (unit === 'Qts/Hr') return (gpd * QTS_PER_GAL) / 24
  return gpd
}

export function formatResult(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)) {
    return n.toPrecision(4)
  }
  const rounded = Number(n.toFixed(digits))
  return String(rounded)
}
