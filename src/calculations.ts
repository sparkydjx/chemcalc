/** Oilfield / chem treat formulas from chem calcs spreadsheet. */

export const PI = Math.PI

export type RateUnit =
  | 'Gals/Day'
  | 'Gals/Hr'
  | 'Gals/Min'
  | 'Bbls/Day'
  | 'Qrts/Day'
  | 'Qrts/Hr'
  | 'Qrts/Min'
  | 'L/Day'
  | 'L/Hr'
  | 'L/Min'
  | 'mL/Min'

/** US liquid gallon → liters. */
const LITERS_PER_GAL = 3.785411784
/** US liquid gallon → milliliters. */
const ML_PER_GAL = LITERS_PER_GAL * 1000
/** US liquid gallon → quarts. */
const QTS_PER_GAL = 4
export type DiaUnit = 'in' | 'ft' | 'mm' | 'm'
export type LenUnit = 'ft' | 'm' | 'miles' | 'km'
export type VolUnit = 'Bbls' | 'm3' | 'Gals' | 'L'
export type VelUnit = 'ft/sec' | 'm/sec'
/** Residence / contact time along a line. */
export type TimeUnit = 'sec' | 'min' | 'hrs'
export type GasRateUnit = 'MCFD' | 'MMCFD' | 'M3/Day'
/** Density units for hydrostatic liquid pressure. */
export type DensityUnit = 'gm/mL' | 'lbs/gal' | 'lbs/cuft'
/** Gas density as in-situ mass/volume, or specific gravity relative to air. */
export type GasDensityUnit = 'lbm/ft3' | 'sg'
/** Liquid column height for hydrostatic pressure. */
export type HeightUnit = 'ft' | 'in' | 'm'
export type PressureUnit = 'psi' | 'kPa' | 'mbar'

/** Standard conditions for gas rate conversion (60 °F, 14.7 psia). */
export const P_STD_PSIA = 14.7
export const T_STD_RANKINE = 520

/** Dosage: ppm × bbls/day → volume rate of chemical (gals/day base). */
export function dosageRate(
  targetPpm: number,
  bblsPerDay: number,
  out: RateUnit,
): number {
  const galsPerDay = (targetPpm / 1_000_000) * bblsPerDay * 42
  return galsPerDayToRate(galsPerDay, out)
}

/** Solve dosage for target PPM given injection rate and volume. */
export function dosagePpm(galsPerDay: number, bblsPerDay: number): number {
  return (galsPerDay * 1_000_000) / (bblsPerDay * 42)
}

/** Solve dosage for volume (bbls/day) given injection rate and PPM. */
export function dosageBblsPerDay(galsPerDay: number, targetPpm: number): number {
  return (galsPerDay * 1_000_000) / (targetPpm * 42)
}

/** US gal per ft³ used by the displacement (and related) formulas. */
const DISP_GAL_PER_FT3 = 7.4805

/** ft³ → oilfield barrels. */
function ft3ToBbls(ft3: number): number {
  return (ft3 * DISP_GAL_PER_FT3) / 42
}

/** Line ID (in) + length (ft) → displacement volume (bbls). */
export function displacementBbls(diameterIn: number, lengthFt: number): number {
  return (diameterIn / 24) ** 2 * lengthFt * DISP_GAL_PER_FT3 / 42 * PI
}

/**
 * Cylinder end-cap styles for displacement / vessel volume.
 * Volumes use inside diameter only (ASME F&D knuckle = 0.06 × D).
 */
export type EndCapType =
  | 'flat'
  | 'hemispherical'
  | 'elliptical'
  | 'torispherical'

/** Internal volume (bbls) of one end cap from inside diameter (in). */
export function endCapVolumeBbls(
  diameterIn: number,
  endCap: EndCapType,
): number {
  if (!(diameterIn > 0) || !Number.isFinite(diameterIn)) return NaN

  const radiusFt = diameterIn / 24
  const diameterFt = diameterIn / 12

  switch (endCap) {
    case 'flat':
      return 0
    case 'hemispherical':
      // V = (2/3) π R³ = π D³ / 12
      return ft3ToBbls((2 / 3) * PI * radiusFt ** 3)
    case 'elliptical':
      // ASME 2:1: V = (1/3) π R³ = π D³ / 24
      return ft3ToBbls((1 / 3) * PI * radiusFt ** 3)
    case 'torispherical': {
      // Exact torispherical dome with ASME F&D: DR = D, ICR = 0.06 D
      const R = diameterFt
      const a = 0.06 * diameterFt
      const c = diameterFt / 2 - a
      const under = (R - a) ** 2 - c ** 2
      if (!(under > 0)) return NaN
      const h = R - Math.sqrt(under)
      const ft3 =
        (PI / 3) *
        (2 * h * R * R -
          (2 * a * a + c * c + 2 * a * R) * (R - h) +
          3 * a * a * c * Math.asin((R - h) / (R - a)))
      return ft3ToBbls(ft3)
    }
  }
}

/**
 * Cylinder + end caps → displacement volume (bbls).
 * Default `endCapCount` is 2 (both ends of the cylinder).
 */
export function displacementWithEndCapsBbls(
  diameterIn: number,
  lengthFt: number,
  endCap: EndCapType,
  endCapCount = 2,
): number {
  const shell = displacementBbls(diameterIn, lengthFt)
  const caps = endCapCount * endCapVolumeBbls(diameterIn, endCap)
  return shell + caps
}

/**
 * Vertical cylinder volume (bbls) from inside diameter (in) and liquid height (ft).
 * Same geometry as line displacement: V = π (D/24)² h × (gal/ft³) / 42.
 */
export function cylinderVolumeBbls(diameterIn: number, heightFt: number): number {
  return displacementBbls(diameterIn, heightFt)
}

/**
 * Partially filled horizontal cylinder volume (bbls).
 *
 * Diameter (in), cylinder length (ft), and liquid fill height (ft) from the
 * bottom. Cross-section area:
 *   A = R² acos((R − h)/R) − (R − h) √(2 R h − h²)
 * then V_bbl = A × L × 7.4805 / 42. Height is clamped to [0, D].
 */
export function horizontalCylinderVolumeBbls(
  diameterIn: number,
  lengthFt: number,
  heightFt: number,
): number {
  const radiusFt = diameterIn / 24
  if (!(radiusFt > 0) || !(lengthFt > 0) || !Number.isFinite(heightFt)) {
    return NaN
  }
  if (heightFt <= 0) return 0
  if (heightFt >= 2 * radiusFt) {
    return displacementBbls(diameterIn, lengthFt)
  }

  const r = radiusFt
  const h = heightFt
  const areaFt2 =
    r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h)
  return (areaFt2 * lengthFt * 7.4805) / 42
}

export type CylinderOrientation = 'vertical' | 'horizontal'

/** Axial depth (ft) of one end cap from inside diameter (in). */
export function endCapDepthFt(diameterIn: number, endCap: EndCapType): number {
  if (!(diameterIn > 0) || !Number.isFinite(diameterIn)) return NaN

  switch (endCap) {
    case 'flat':
      return 0
    case 'hemispherical':
      return diameterIn / 24
    case 'elliptical':
      return diameterIn / 48
    case 'torispherical': {
      const diameterFt = diameterIn / 12
      const R = diameterFt
      const a = 0.06 * diameterFt
      const c = diameterFt / 2 - a
      const under = (R - a) ** 2 - c ** 2
      if (!(under > 0)) return NaN
      return R - Math.sqrt(under)
    }
  }
}

/**
 * Partial volume (bbls) of one head filled to `fillFt` from its base.
 * Uses a spherical-segment ratio scaled to the head's full volume (exact for
 * hemispherical; good approximation for 2:1 elliptical and ASME F&D).
 */
export function endCapPartialVolumeBbls(
  diameterIn: number,
  endCap: EndCapType,
  fillFt: number,
): number {
  if (endCap === 'flat') return 0
  const depth = endCapDepthFt(diameterIn, endCap)
  if (!Number.isFinite(depth) || !(depth > 0)) return NaN
  if (fillFt <= 0) return 0
  if (fillFt >= depth) return endCapVolumeBbls(diameterIn, endCap)

  const fullBbls = endCapVolumeBbls(diameterIn, endCap)
  const fullSegFt3 = (2 / 3) * PI * depth ** 3
  const partialSegFt3 =
    (PI * fillFt ** 2 * (3 * depth - fillFt)) / 3
  return fullBbls * (partialSegFt3 / fullSegFt3)
}

/**
 * Vertical vessel volume (bbls) filled to `fillHeightFt` from the bottom.
 * `shellLengthFt` is the straight cylindrical section (tangent line to tangent line).
 */
export function verticalVesselVolumeBbls(
  diameterIn: number,
  shellLengthFt: number,
  fillHeightFt: number,
  endCap: EndCapType,
): number {
  if (endCap === 'flat') return cylinderVolumeBbls(diameterIn, fillHeightFt)
  if (fillHeightFt <= 0) return 0

  const headDepth = endCapDepthFt(diameterIn, endCap)
  if (!Number.isFinite(headDepth)) return NaN

  let remaining = fillHeightFt
  let volume = 0

  const bottomFill = Math.min(remaining, headDepth)
  volume += endCapPartialVolumeBbls(diameterIn, endCap, bottomFill)
  remaining -= bottomFill
  if (remaining <= 0) return volume

  const shellFill = Math.min(remaining, shellLengthFt)
  volume += cylinderVolumeBbls(diameterIn, shellFill)
  remaining -= shellFill
  if (remaining <= 0) return volume

  const topFill = Math.min(remaining, headDepth)
  volume += endCapPartialVolumeBbls(diameterIn, endCap, topFill)
  return volume
}

/** Gross liquid volume (bbls) in a tank at fill height `heightFt` (no valve offset). */
export function tankGrossVolumeBbls(
  orientation: CylinderOrientation,
  diameterIn: number,
  heightFt: number,
  lengthFt: number,
  endCap: EndCapType,
): number {
  if (orientation === 'vertical') {
    if (endCap === 'flat') return cylinderVolumeBbls(diameterIn, heightFt)
    return verticalVesselVolumeBbls(diameterIn, lengthFt, heightFt, endCap)
  }

  const cylinderVol = horizontalCylinderVolumeBbls(
    diameterIn,
    lengthFt,
    heightFt,
  )
  if (endCap === 'flat') return cylinderVol

  const diameterFt = diameterIn / 12
  const capVol =
    heightFt >= diameterFt ? 2 * endCapVolumeBbls(diameterIn, endCap) : 0
  return cylinderVol + capVol
}

/**
 * Liquid volume (bbls) above a valve offset from the tank bottom.
 * Subtracts the dead volume below `offsetFt`. Offset ≤ 0 is ignored.
 * Result is 0 when liquid height is at or below the valve.
 */
export function cylinderVolumeAboveOffsetBbls(
  orientation: CylinderOrientation,
  diameterIn: number,
  heightFt: number,
  offsetFt: number,
  lengthFt = 0,
  endCap: EndCapType = 'flat',
): number {
  const volumeAt = (h: number) =>
    tankGrossVolumeBbls(orientation, diameterIn, h, lengthFt, endCap)

  const gross = volumeAt(heightFt)
  const offset = Number.isFinite(offsetFt) && offsetFt > 0 ? offsetFt : 0
  if (offset <= 0) return gross

  const net = gross - volumeAt(offset)
  return net > 0 ? net : 0
}

/** One row of a horizontal-tank volume (strapping) table. */
export type TankVolumeTableRow = {
  /** Liquid height from the tank bottom, in the requested height unit. */
  height: number
  /** Gross liquid volume at that height, in the requested volume unit. */
  volume: number
}

/**
 * Build a horizontal-tank volume table: one row per unit of the diameter UOM
 * from empty (0) through full (diameter), with liquid height and volume in the
 * selected display units. Uses gross fill volume from the tank bottom (no
 * valve-offset subtraction).
 */
export function horizontalTankVolumeTable(
  diameterIn: number,
  lengthFt: number,
  endCap: EndCapType,
  diaUnit: DiaUnit,
  heightUnit: HeightUnit,
  volUnit: VolUnit,
): TankVolumeTableRow[] {
  if (!(diameterIn > 0) || !(lengthFt > 0)) return []

  const maxDiaUnits = fromInches(diameterIn, diaUnit)
  if (!(maxDiaUnits > 0) || !Number.isFinite(maxDiaUnits)) return []

  const rows: TankVolumeTableRow[] = []
  const pushHeightIn = (heightIn: number) => {
    const heightFt = heightIn / 12
    const bbls = tankGrossVolumeBbls(
      'horizontal',
      diameterIn,
      heightFt,
      lengthFt,
      endCap,
    )
    if (!Number.isFinite(bbls)) return
    rows.push({
      height: fromHeightFeet(heightFt, heightUnit),
      volume: fromBbls(bbls, volUnit),
    })
  }

  // Whole steps of 1 diameter-unit from 0 up to (but not past) full diameter.
  const wholeSteps = Math.floor(maxDiaUnits + 1e-9)
  for (let i = 0; i <= wholeSteps; i++) {
    const heightIn = Math.min(toInches(i, diaUnit), diameterIn)
    pushHeightIn(heightIn)
  }

  // Include the exact full diameter when it is not already on a whole step.
  if (maxDiaUnits - wholeSteps > 1e-9) {
    pushHeightIn(diameterIn)
  }

  return rows
}

/**
 * Hydrostatic head (ft) of liquid above a valve offset.
 * Returns 0 when the liquid surface is at or below the valve.
 */
export function headAboveValveFt(heightFt: number, offsetFt: number): number {
  const offset = Number.isFinite(offsetFt) && offsetFt > 0 ? offsetFt : 0
  const head = heightFt - offset
  return head > 0 ? head : 0
}

/**
 * Max liquid height the user may enter (ft).
 * Horizontal: diameter − valve offset.
 * Vertical with end caps: shell length + both head depths − valve offset.
 * Vertical flat: uncapped.
 */
export function maxCylinderLiquidHeightFt(
  orientation: CylinderOrientation,
  diameterIn: number,
  offsetFt = 0,
  shellLengthFt = 0,
  endCap: EndCapType = 'flat',
): number {
  const offset = Number.isFinite(offsetFt) && offsetFt > 0 ? offsetFt : 0

  if (orientation === 'vertical') {
    if (endCap === 'flat') return Number.POSITIVE_INFINITY
    const headDepth = endCapDepthFt(diameterIn, endCap)
    if (!Number.isFinite(headDepth)) return 0
    const maxHeight = shellLengthFt + 2 * headDepth - offset
    return maxHeight > 0 ? maxHeight : 0
  }

  if (!(diameterIn > 0)) return 0
  const diameterFt = diameterIn / 12
  const maxHeight = diameterFt - offset
  return maxHeight > 0 ? maxHeight : 0
}

/**
 * Solve for liquid height (ft) from net volume above the valve (bbls).
 * Uses bisection on {@link cylinderVolumeAboveOffsetBbls}. Returns NaN when
 * geometry or target volume cannot yield a height.
 */
export function liquidHeightFromVolumeAboveOffsetFt(
  orientation: CylinderOrientation,
  diameterIn: number,
  netVolumeBbls: number,
  offsetFt: number,
  lengthFt = 0,
  endCap: EndCapType = 'flat',
): number {
  if (!(diameterIn > 0) || !Number.isFinite(netVolumeBbls) || netVolumeBbls < 0) {
    return NaN
  }

  const offset = Number.isFinite(offsetFt) && offsetFt > 0 ? offsetFt : 0
  if (netVolumeBbls === 0) return offset

  const maxHeightFt = maxCylinderLiquidHeightFt(
    orientation,
    diameterIn,
    offset,
    lengthFt,
    endCap,
  )
  // Vertical flat has no geometric max; use a tall practical cap from volume.
  const hiCap = Number.isFinite(maxHeightFt)
    ? maxHeightFt + offset
    : offset + Math.max(1, netVolumeBbls * 50)

  if (!(hiCap > offset)) return NaN

  const volumeAt = (heightFt: number) =>
    cylinderVolumeAboveOffsetBbls(
      orientation,
      diameterIn,
      heightFt,
      offset,
      lengthFt,
      endCap,
    )

  const maxVol = volumeAt(hiCap)
  if (!Number.isFinite(maxVol)) return NaN
  if (netVolumeBbls > maxVol + 1e-9) return hiCap

  let lo = offset
  let hi = hiCap
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const vol = volumeAt(mid)
    if (!Number.isFinite(vol)) return NaN
    if (vol < netVolumeBbls) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Solve displacement for diameter (in). */
export function displacementDiameterIn(bbls: number, lengthFt: number): number {
  return 24 * Math.sqrt(bbls / (lengthFt * DISP_GAL_PER_FT3 / 42 * PI))
}

/**
 * Solve cylinder + end-cap displacement for diameter (in).
 * Flat caps reduce to the pipe-only square-root solution; otherwise
 * Newton–Raphson on β D³ + α D² − V = 0.
 */
export function displacementDiameterInWithEndCaps(
  bbls: number,
  lengthFt: number,
  endCap: EndCapType,
  endCapCount = 2,
): number {
  if (!(bbls > 0) || !(lengthFt > 0)) return NaN
  if (endCap === 'flat' || endCapCount === 0) {
    return displacementDiameterIn(bbls, lengthFt)
  }

  // V = α D² + β D³  (D in inches)
  const alpha = (PI * lengthFt * DISP_GAL_PER_FT3) / (42 * 576)
  const unitCap = endCapVolumeBbls(1, endCap)
  if (!Number.isFinite(unitCap)) return NaN
  const beta = endCapCount * unitCap

  // Seed from the no-cap solution (slightly low when caps add volume).
  let d = displacementDiameterIn(bbls, lengthFt)
  if (!Number.isFinite(d) || !(d > 0)) d = 1

  for (let i = 0; i < 40; i++) {
    const f = beta * d ** 3 + alpha * d ** 2 - bbls
    const df = 3 * beta * d ** 2 + 2 * alpha * d
    if (!(Math.abs(df) > 0)) return NaN
    const next = d - f / df
    if (!(next > 0) || !Number.isFinite(next)) return NaN
    if (Math.abs(next - d) <= 1e-10 * Math.max(1, d)) return next
    d = next
  }
  return d
}

/** Solve displacement for length (ft). */
export function displacementLengthFt(bbls: number, diameterIn: number): number {
  return bbls / ((diameterIn / 24) ** 2 * DISP_GAL_PER_FT3 / 42 * PI)
}

/**
 * Solve cylinder + end-cap displacement for straight length (ft).
 * Length is the cylindrical section only (tangent line to tangent line).
 */
export function displacementLengthFtWithEndCaps(
  bbls: number,
  diameterIn: number,
  endCap: EndCapType,
  endCapCount = 2,
): number {
  const capVol = endCapCount * endCapVolumeBbls(diameterIn, endCap)
  if (!Number.isFinite(capVol)) return NaN
  return displacementLengthFt(bbls - capVol, diameterIn)
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

/** Line length (ft) ÷ velocity (ft/sec) → contact / residence time (sec). */
export function contactTimeSec(lengthFt: number, velocityFps: number): number {
  return lengthFt / velocityFps
}

/**
 * Gas rate (MCFD, standard conditions), ID (in), line pressure (psig),
 * flowing temperature (°F), and compressibility factor Z → velocity (ft/sec).
 *
 * Converts the standard gas rate to an in-situ (flowing) volumetric rate via
 * the real-gas law — the same P_std/P × T/T_std × Z correction used for
 * mixture density and superficial velocities in the erosional velocity and
 * multiphase calculators — then divides by pipe area.
 */
export function gasVelocityFps(
  gasRateMcfd: number,
  diameterIn: number,
  pressurePsig: number,
  temperatureF = 60,
  gasCompressibilityZ = 1,
): number {
  return (
    (gasRateMcfd *
      1000 *
      P_STD_PSIA *
      (temperatureF + 460) *
      gasCompressibilityZ) /
    (86400 *
      (pressurePsig + 14.7) *
      T_STD_RANKINE *
      PI *
      (diameterIn / 24) ** 2)
  )
}

/** Solve gas velocity for gas rate (MCFD). */
export function gasRateMcfdFromVelocity(
  fps: number,
  diameterIn: number,
  pressurePsig: number,
  temperatureF = 60,
  gasCompressibilityZ = 1,
): number {
  return (
    (fps *
      86400 *
      (pressurePsig + 14.7) *
      T_STD_RANKINE *
      PI *
      (diameterIn / 24) ** 2) /
    (1000 * P_STD_PSIA * (temperatureF + 460) * gasCompressibilityZ)
  )
}

/** Solve gas velocity for diameter (in). */
export function gasDiameterIn(
  gasRateMcfd: number,
  fps: number,
  pressurePsig: number,
  temperatureF = 60,
  gasCompressibilityZ = 1,
): number {
  return (
    24 *
    Math.sqrt(
      (gasRateMcfd *
        1000 *
        P_STD_PSIA *
        (temperatureF + 460) *
        gasCompressibilityZ) /
        (86400 * (pressurePsig + 14.7) * T_STD_RANKINE * PI * fps),
    )
  )
}

/** Solve gas velocity for pressure (psig). */
export function gasPressurePsig(
  gasRateMcfd: number,
  diameterIn: number,
  fps: number,
  temperatureF = 60,
  gasCompressibilityZ = 1,
): number {
  return (
    (gasRateMcfd *
      1000 *
      P_STD_PSIA *
      (temperatureF + 460) *
      gasCompressibilityZ) /
      (86400 * T_STD_RANKINE * PI * (diameterIn / 24) ** 2 * fps) -
    14.7
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

/**
 * Hydrostatic liquid pressure (psi) from density (lb/ft³) and height (ft).
 * P = ρ × h / 144
 */
export function liquidPressurePsi(
  densityLbPerFt3: number,
  heightFt: number,
): number {
  return (densityLbPerFt3 * heightFt) / 144
}

/** Solve hydrostatic pressure for density (lb/ft³). */
export function liquidDensityFromPressure(
  pressurePsi: number,
  heightFt: number,
): number {
  return (pressurePsi * 144) / heightFt
}

/** Solve hydrostatic pressure for liquid height (ft). */
export function liquidHeightFromPressure(
  pressurePsi: number,
  densityLbPerFt3: number,
): number {
  return (pressurePsi * 144) / densityLbPerFt3
}

// --- unit helpers (convert UI units → formula base units / results) ---

export function toInches(value: number, unit: DiaUnit): number {
  if (unit === 'mm') return value / 25.4
  if (unit === 'ft') return value * 12
  if (unit === 'm') return value / 0.0254
  return value
}

export function fromInches(inches: number, unit: DiaUnit): number {
  if (unit === 'mm') return inches * 25.4
  if (unit === 'ft') return inches / 12
  if (unit === 'm') return inches * 0.0254
  return inches
}

export function toFeet(value: number, unit: LenUnit): number {
  if (unit === 'm') return value / 0.3048
  if (unit === 'miles') return value * 5280
  if (unit === 'km') return value * 3280.839895
  return value
}

export function fromFeet(feet: number, unit: LenUnit): number {
  if (unit === 'm') return feet * 0.3048
  if (unit === 'miles') return feet / 5280
  if (unit === 'km') return feet / 3280.839895
  return feet
}

/** Convert contact time from seconds to the selected display unit. */
export function fromSeconds(seconds: number, unit: TimeUnit): number {
  if (unit === 'min') return seconds / 60
  if (unit === 'hrs') return seconds / 3600
  return seconds
}

export function toBbls(value: number, unit: VolUnit): number {
  if (unit === 'm3') return value / 0.1589872949
  if (unit === 'Gals') return value / 42
  if (unit === 'L') return value / (42 * LITERS_PER_GAL)
  return value
}

export function fromBbls(bbls: number, unit: VolUnit): number {
  if (unit === 'm3') return bbls * 0.1589872949
  if (unit === 'Gals') return bbls * 42
  if (unit === 'L') return bbls * 42 * LITERS_PER_GAL
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

/** 1 g/cm³ (gm/mL) → lb/ft³ */
const LB_FT3_PER_GM_ML = 62.4279605761446
/** US liquid gallons per cubic foot (also lb/ft³ per lb/gal). */
const GAL_PER_FT3 = 7.48051948051948
/** psi → kPa */
const KPA_PER_PSI = 6.894757293168361
/** psi → mbar */
const MBAR_PER_PSI = 68.9475729316836

/** Normalize density to lb/ft³ for the hydrostatic formula. */
export function toLbPerFt3(value: number, unit: DensityUnit): number {
  if (unit === 'gm/mL') return value * LB_FT3_PER_GM_ML
  if (unit === 'lbs/gal') return value * GAL_PER_FT3
  return value
}

export function fromLbPerFt3(lbPerFt3: number, unit: DensityUnit): number {
  if (unit === 'gm/mL') return lbPerFt3 / LB_FT3_PER_GM_ML
  if (unit === 'lbs/gal') return lbPerFt3 / GAL_PER_FT3
  return lbPerFt3
}

/**
 * Oilfield real-gas factor in ρ (lb/ft³) = 2.7 × SG × P / (Z × T_R).
 * 2.7 ≈ MW_air / R (28.97 / 10.7316), same coefficient as API RP 14E.
 */
const GAS_DENSITY_SG_FACTOR = 2.7

/**
 * Normalize gas density to in-situ lb/ft³.
 * Specific gravity (air = 1) is converted with local P, T, and Z:
 *   ρ = 2.7 × SG × P_psia / (Z × (°F + 460))
 */
export function toGasDensityLbPerFt3(
  value: number,
  unit: GasDensityUnit,
  pressurePsia: number,
  temperatureF: number,
  gasCompressibilityZ: number,
): number {
  if (unit !== 'sg') return value
  const tRankine = temperatureF + 460
  if (pressurePsia <= 0 || tRankine <= 0 || gasCompressibilityZ <= 0) {
    throw new Error(
      'Pressure, temperature, and Z must be positive to convert gas gravity to density.',
    )
  }
  return (
    (GAS_DENSITY_SG_FACTOR * value * pressurePsia) /
    (gasCompressibilityZ * tRankine)
  )
}

/** Normalize liquid height to feet. */
export function toHeightFeet(value: number, unit: HeightUnit): number {
  if (unit === 'in') return value / 12
  if (unit === 'm') return value / 0.3048
  return value
}

export function fromHeightFeet(feet: number, unit: HeightUnit): number {
  if (unit === 'in') return feet * 12
  if (unit === 'm') return feet * 0.3048
  return feet
}

/** Normalize pressure to psi. */
export function toPsi(value: number, unit: PressureUnit): number {
  if (unit === 'kPa') return value / KPA_PER_PSI
  if (unit === 'mbar') return value / MBAR_PER_PSI
  return value
}

export function fromPsi(psi: number, unit: PressureUnit): number {
  if (unit === 'kPa') return psi * KPA_PER_PSI
  if (unit === 'mbar') return psi * MBAR_PER_PSI
  return psi
}

export function rateToGalsPerDay(value: number, unit: RateUnit): number {
  if (unit === 'Gals/Hr') return value * 24
  if (unit === 'Gals/Min') return value * 1440
  if (unit === 'Bbls/Day') return value * 42
  if (unit === 'Qrts/Day') return value / QTS_PER_GAL
  if (unit === 'Qrts/Hr') return (value * 24) / QTS_PER_GAL
  if (unit === 'Qrts/Min') return (value * 1440) / QTS_PER_GAL
  if (unit === 'L/Day') return value / LITERS_PER_GAL
  if (unit === 'L/Hr') return (value * 24) / LITERS_PER_GAL
  if (unit === 'L/Min') return (value * 1440) / LITERS_PER_GAL
  if (unit === 'mL/Min') return (value * 1440) / ML_PER_GAL
  return value
}

export function galsPerDayToRate(gpd: number, unit: RateUnit): number {
  if (unit === 'Gals/Hr') return gpd / 24
  if (unit === 'Gals/Min') return gpd / 1440
  if (unit === 'Bbls/Day') return gpd / 42
  if (unit === 'Qrts/Day') return gpd * QTS_PER_GAL
  if (unit === 'Qrts/Hr') return (gpd * QTS_PER_GAL) / 24
  if (unit === 'Qrts/Min') return (gpd * QTS_PER_GAL) / 1440
  if (unit === 'L/Day') return gpd * LITERS_PER_GAL
  if (unit === 'L/Hr') return (gpd * LITERS_PER_GAL) / 24
  if (unit === 'L/Min') return (gpd * LITERS_PER_GAL) / 1440
  if (unit === 'mL/Min') return (gpd * ML_PER_GAL) / 1440
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

/**
 * Superficial liquid and gas velocities (ft/s) at flowing (in-situ) conditions,
 * using the same P/T/Z real-gas correction as the Gas Velocity calculator and
 * multiphase module:
 *
 *   Vsl = liquidVelocityFps(qL, ID)
 *   Vsg = gasVelocityFps(qG, ID, P_psig, T_°F, Z)
 *   Vm  = Vsl + Vsg
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

  const liquidSuperficialVelocityFtPerSec = liquidVelocityFps(qL, diameterIn)
  const gasSuperficialVelocityFtPerSec = gasVelocityFps(
    qG * 1000,
    diameterIn,
    p - P_STD_PSIA,
    t - 460,
    z,
  )

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
