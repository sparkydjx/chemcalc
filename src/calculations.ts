/** Oilfield / chem treat formulas from chem calcs spreadsheet. */

export const PI = Math.PI

/** Dosage: ppm × bbls/day → volume rate of chemical. */
export function dosageRate(
  targetPpm: number,
  bblsPerDay: number,
  out: 'Gals/Day' | 'Gals/Hr' | 'Gals/Min',
): number {
  const galsPerDay = (targetPpm / 1_000_000) * bblsPerDay * 42
  if (out === 'Gals/Day') return galsPerDay
  if (out === 'Gals/Hr') return galsPerDay / 24
  return galsPerDay / 1440
}

/** Line ID (in) + length (ft) → displacement volume (bbls). */
export function displacementBbls(diameterIn: number, lengthFt: number): number {
  return (diameterIn / 24) ** 2 * lengthFt * 7.4805 / 42 * PI
}

/** Liquid rate (bbls/day) in pipe ID (in) → velocity (ft/sec). */
export function liquidVelocityFps(bblsPerDay: number, diameterIn: number): number {
  return (bblsPerDay * 5.61458931) / (86400 * PI * (diameterIn / 24) ** 2)
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

/** Ion concentration (mg/L) × volume (bbls/day) → lbs/day. */
export function ionLbsPerDay(ionMgL: number, volumeBblsPerDay: number): number {
  return ionMgL * volumeBblsPerDay * 0.00035
}

// --- unit helpers (convert UI units → formula base units / results) ---

export function toInches(value: number, unit: 'in' | 'mm'): number {
  return unit === 'mm' ? value / 25.4 : value
}

export function toFeet(value: number, unit: 'ft' | 'miles' | 'km'): number {
  if (unit === 'miles') return value * 5280
  if (unit === 'km') return value * 3280.839895
  return value
}

export function fromBbls(
  bbls: number,
  unit: 'Bbls' | 'm3' | 'Gals',
): number {
  if (unit === 'm3') return bbls * 0.1589872949
  if (unit === 'Gals') return bbls * 42
  return bbls
}

export function fromFps(fps: number, unit: 'ft/sec' | 'm/sec'): number {
  return unit === 'm/sec' ? fps * 0.3048 : fps
}

/** Normalize gas rate to MCFD for the gas-velocity formula. */
export function toMcfd(
  value: number,
  unit: 'MCFD' | 'MMCFD' | 'M3/Day',
): number {
  if (unit === 'MMCFD') return value * 1000
  // 1 MCF ≈ 28.316846592 m³
  if (unit === 'M3/Day') return value / 28.316846592
  return value
}

export function formatResult(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1000 || (Math.abs(n) > 0 && Math.abs(n) < 0.001)) {
    return n.toPrecision(4)
  }
  const rounded = Number(n.toFixed(digits))
  return String(rounded)
}
