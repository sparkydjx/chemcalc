/**
 * Worked example for src/multiphase.ts.
 *
 * Reproduces the hand calculation for a 3-in tubing, 600 STB/d liquid, high
 * GOR gas well in an annular flow regime. Run with:
 *   npx tsx src/multiphase.example.ts
 */

import {
  runFullCalculation,
  bblPerDayToFt3PerS,
  type WellInputs,
} from './multiphase'

const exampleInputs: WellInputs = {
  tubingIdIn: 3.0,
  liquidRateFt3PerS: bblPerDayToFt3PerS(600),
  gasRateFt3PerS: 1.2,
  liquidDensityLbmFt3: 55,
  gasDensityLbmFt3: 3.0,
  interfacialTensionDyneCm: 20,
  liquidViscosityCp: 1.0,
  gasViscosityCp: 0.015,
  pipeRoughnessIn: 0.0018,
}

const result = runFullCalculation(exampleInputs)

const line = (label: string) => console.log(`\n=== ${label} ===`)

line('Regime')
console.log(result.regime)

line('Holdup / Mixture Density')
console.log(result.holdup)

line('API RP 14E Erosional Screen')
console.log(result.erosional)

if (result.entrainment) {
  line('Ishii-Mishima Entrainment')
  console.log(result.entrainment)
}
if (result.film) {
  line('Film Properties')
  console.log(result.film)
}
if (result.shear) {
  line('Shear (annular force balance, Wallis f_i)')
  console.log(result.shear)
}
if (result.filmThickness) {
  line('Film Thickness')
  console.log(result.filmThickness)
}

line('NORSOK M-506:2017 Wall Shear (regime-agnostic)')
console.log(result.norsokWallShear)
