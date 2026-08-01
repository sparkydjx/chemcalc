import './style.css'
import {
  dosageRate,
  dosagePpm,
  dosageBblsPerDay,
  displacementBbls,
  displacementDiameterIn,
  displacementLengthFt,
  liquidVelocityFps,
  liquidRateBblsPerDay,
  liquidDiameterIn,
  gasVelocityFps,
  gasRateMcfdFromVelocity,
  gasDiameterIn,
  gasPressurePsig,
  ionLbsPerDay,
  ionMgLFromLbs,
  ionVolumeFromLbs,
  scavengerEfficiency,
  scavengerInjectionRate,
  scavengerGasRateMcfd,
  scavengerH2sPpm,
  calculateApiRp14E,
  toInches,
  fromInches,
  toFeet,
  fromFeet,
  toBbls,
  fromBbls,
  toFps,
  fromFps,
  toMcfd,
  fromMcfd,
  rateToGalsPerDay,
  galsPerDayToRate,
  formatResult,
  type RateUnit,
  type DiaUnit,
  type LenUnit,
  type VolUnit,
  type VelUnit,
  type GasRateUnit,
} from './calculations'
import {
  runFullCalculation,
  bblPerDayToFt3PerS,
  stdGasRateToFt3PerS,
  stdToInSituGasRateFt3PerS,
  type WellInputs,
  type StdGasRateUnit,
} from './multiphase'

type CalcId =
  | 'home'
  | 'dosage'
  | 'displacement'
  | 'liquid-velocity'
  | 'gas-velocity'
  | 'ion-lbs'
  | 'scavenger-efficiency'
  | 'erosional-velocity'
  | 'multiphase'

const CALCS: { id: Exclude<CalcId, 'home'>; title: string; blurb: string }[] = [
  {
    id: 'dosage',
    title: 'Dosage Calculation',
    blurb: 'PPM, barrels/day, and chemical rate — solve for any',
  },
  {
    id: 'displacement',
    title: 'Line Displacement Volume',
    blurb: 'Diameter, length, and volume — solve for any',
  },
  {
    id: 'liquid-velocity',
    title: 'Liquid Velocity',
    blurb: 'Flow rate, diameter, and velocity — solve for any',
  },
  {
    id: 'gas-velocity',
    title: 'Gas Velocity',
    blurb: 'Gas rate, diameter, pressure, and velocity — solve for any',
  },
  {
    id: 'ion-lbs',
    title: 'mg/L to Lbs/Day',
    blurb: 'Concentration, volume, and lbs/day — solve for any',
  },
  {
    id: 'scavenger-efficiency',
    title: 'Scavenger Efficiency',
    blurb: 'H₂S, gas rate, injection, or % efficiency — solve for any',
  },
  {
    id: 'erosional-velocity',
    title: 'Erosional Velocity (API RP 14E)',
    blurb: 'Two-phase mixture density and erosional velocity limit',
  },
  {
    id: 'multiphase',
    title: 'Vertical Multiphase Flow',
    blurb: 'Regime, entrainment, film, and wall shear for NORSOK M-506',
  },
]

const app = document.querySelector<HTMLDivElement>('#app')!

function num(el: HTMLInputElement): number {
  const v = el.valueAsNumber
  return Number.isFinite(v) ? v : NaN
}

function setNum(el: HTMLInputElement, value: number): void {
  el.value = formatResult(value) === '—' ? '' : formatResult(value)
}

type UnitOption = { value: string; label: string }

type FieldOpts = {
  id: string
  value: number | string
  step?: string
  min?: string
  unit?: string
  unitOptions?: UnitOption[]
  unitId?: string
  unitValue?: string
  /** Variable key for solve-for; omit to hide checkbox. */
  solveKey?: string
  solved?: boolean
  /** Short plain-language explanation shown when the ? link is clicked. */
  help?: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Clickable ? that expands a short explanation under the field label. */
function helpLink(label: string, help?: string): string {
  if (!help) return ''
  return `
    <details class="field-help">
      <summary aria-label="Explain ${escapeHtml(label)}">?</summary>
      <p class="field-help-body">${escapeHtml(help)}</p>
    </details>
  `
}

/** Keep unit dropdowns alphanumeric by label for existing and future menus. */
function sortUnitOptions(options: UnitOption[]): UnitOption[] {
  const key = (label: string) => label.normalize('NFKD')
  return [...options].sort((a, b) =>
    key(a.label).localeCompare(key(b.label), undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  )
}

function field(label: string, opts: FieldOpts): string {
  let unitHtml = ''
  if (opts.unitOptions && opts.unitId) {
    unitHtml = `<select id="${opts.unitId}" aria-label="${label} units">
          ${sortUnitOptions(opts.unitOptions)
            .map(
              (u) =>
                `<option value="${u.value}"${u.value === opts.unitValue ? ' selected' : ''}>${u.label}</option>`,
            )
            .join('')}
        </select>`
  } else if (opts.unit) {
    unitHtml = `<span class="unit-static">${opts.unit}</span>`
  }

  const solveHtml =
    opts.solveKey !== undefined
      ? `<label class="solve-toggle" title="Solve for ${label}">
          <input
            type="checkbox"
            class="solve-check"
            data-solve="${opts.solveKey}"
            ${opts.solved ? 'checked' : ''}
            aria-label="Solve for ${label}"
          />
          <span>Solve</span>
        </label>`
      : ''

  return `
    <div class="field${opts.solved ? ' is-solved' : ''}" data-field="${opts.solveKey ?? opts.id}">
      <div class="field-header">
        <span class="field-label-row">
          <span class="field-label">${label}</span>
          ${helpLink(label, opts.help)}
        </span>
        ${solveHtml}
      </div>
      <span class="field-controls">
        <input
          id="${opts.id}"
          type="number"
          inputmode="decimal"
          value="${opts.value}"
          step="${opts.step ?? 'any'}"
          ${opts.min !== undefined ? `min="${opts.min}"` : ''}
          ${opts.solved ? 'readonly tabindex="-1"' : ''}
        />
        ${unitHtml}
      </span>
    </div>
  `
}

/** Read-only text output (regime labels, yes/no flags). */
function textOut(
  label: string,
  id: string,
  unit?: string,
  help?: string,
): string {
  return `
    <div class="field is-solved" data-field="${id}">
      <div class="field-header">
        <span class="field-label-row">
          <span class="field-label">${label}</span>
          ${helpLink(label, help)}
        </span>
      </div>
      <span class="field-controls">
        <input id="${id}" type="text" readonly tabindex="-1" value="" />
        ${unit ? `<span class="unit-static">${unit}</span>` : ''}
      </span>
    </div>
  `
}

function sectionTitle(title: string): string {
  return `<p class="form-section-title">${title}</p>`
}

function shell(
  title: string,
  body: string,
  showBack: boolean,
  hint = 'Check <strong>Solve</strong> next to the variable you want to find',
): string {
  return `
    <main class="shell">
      <header class="brand">
        ${showBack ? `<button type="button" class="back" id="back" aria-label="Back to calculators">←</button>` : ''}
        <div class="brand-text">
          <h1>${showBack ? title : 'ChemCalc'}</h1>
          ${showBack ? `<p class="hint">${hint}</p>` : '<p>Oilfield chemistry &amp; line calculations</p>'}
        </div>
      </header>
      <section class="workspace" aria-label="${title}">
        ${body}
      </section>
    </main>
  `
}

function renderHome(): void {
  const list = CALCS.map(
    (c) => `
      <button type="button" class="calc-link" data-calc="${c.id}">
        <span class="calc-link-title">${c.title}</span>
        <span class="calc-link-blurb">${c.blurb}</span>
      </button>
    `,
  ).join('')

  app.innerHTML = shell(
    'ChemCalc',
    `<nav class="calc-nav" aria-label="Calculators">${list}</nav>`,
    false,
  )

  app.querySelectorAll<HTMLButtonElement>('[data-calc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.calc as CalcId)
    })
  })
}

function wireBack(): void {
  app.querySelector('#back')?.addEventListener('click', () => navigate('home'))
}

/** Only one field-help tip open at a time. */
function wireFieldHelp(): void {
  app.querySelectorAll<HTMLDetailsElement>('details.field-help').forEach((el) => {
    el.addEventListener('toggle', () => {
      if (!el.open) return
      app.querySelectorAll<HTMLDetailsElement>('details.field-help').forEach((other) => {
        if (other !== el) other.open = false
      })
    })
  })
}

/** Exclusive solve-for checkboxes + live recalculation. */
function wireSolveForm(
  defaultSolve: string,
  inputIds: string[],
  compute: (solveFor: string) => void,
): void {
  let solveFor = defaultSolve

  const applySolveUi = () => {
    app.querySelectorAll<HTMLElement>('.field[data-field]').forEach((wrap) => {
      const key = wrap.dataset.field!
      const isSolved = key === solveFor
      wrap.classList.toggle('is-solved', isSolved)
      const input = wrap.querySelector<HTMLInputElement>('input[type="number"]')
      const check = wrap.querySelector<HTMLInputElement>('.solve-check')
      if (input) {
        input.readOnly = isSolved
        if (isSolved) input.tabIndex = -1
        else input.removeAttribute('tabindex')
      }
      if (check) check.checked = isSolved
    })
  }

  app.querySelectorAll<HTMLInputElement>('.solve-check').forEach((check) => {
    check.addEventListener('change', () => {
      if (check.checked) {
        solveFor = check.dataset.solve!
      } else if (check.dataset.solve === solveFor) {
        // Keep exactly one selected
        check.checked = true
        return
      }
      applySolveUi()
      compute(solveFor)
    })
  })

  const run = () => compute(solveFor)
  for (const id of inputIds) {
    const el = app.querySelector(`#${id}`)
    el?.addEventListener('input', run)
    el?.addEventListener('change', run)
  }

  applySolveUi()
  run()
}

function renderDosage(): void {
  app.innerHTML = shell(
    'Dosage Calculation',
    `
      <form class="calc-form" id="form">
        ${field('Target PPM', {
          id: 'ppm',
          value: 240,
          min: '0',
          unit: 'PPM',
          solveKey: 'ppm',
        })}
        ${field('Volume', {
          id: 'bbls',
          value: 100,
          min: '0',
          unitOptions: [
            { value: 'Bbls', label: 'Bbls/Day' },
            { value: 'm3', label: 'm³/Day' },
          ],
          unitId: 'vol-unit',
          unitValue: 'Bbls',
          solveKey: 'bbls',
        })}
        ${field('Chemical rate', {
          id: 'rate',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'Gals/Day', label: 'Gals/Day' },
            { value: 'Gals/Hr', label: 'Gals/Hr' },
            { value: 'Gals/Min', label: 'Gals/Min' },
            { value: 'L/Day', label: 'L/Day' },
            { value: 'L/Hr', label: 'L/Hr' },
            { value: 'Qrts/Day', label: 'Qrts/Day' },
            { value: 'Qrts/Hr', label: 'Qrts/Hr' },
          ],
          unitId: 'rate-unit',
          unitValue: 'Gals/Day',
          solveKey: 'rate',
          solved: true,
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'rate',
    ['ppm', 'bbls', 'rate', 'vol-unit', 'rate-unit'],
    (solveFor) => {
      const ppmEl = app.querySelector<HTMLInputElement>('#ppm')!
      const bblsEl = app.querySelector<HTMLInputElement>('#bbls')!
      const rateEl = app.querySelector<HTMLInputElement>('#rate')!
      const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
        .value as VolUnit
      const rateUnit = (app.querySelector('#rate-unit') as HTMLSelectElement)
        .value as RateUnit
      const bblsPerDay = toBbls(num(bblsEl), volUnit)

      if (solveFor === 'rate') {
        setNum(rateEl, dosageRate(num(ppmEl), bblsPerDay, rateUnit))
      } else if (solveFor === 'ppm') {
        const gpd = rateToGalsPerDay(num(rateEl), rateUnit)
        setNum(ppmEl, dosagePpm(gpd, bblsPerDay))
      } else {
        const gpd = rateToGalsPerDay(num(rateEl), rateUnit)
        setNum(bblsEl, fromBbls(dosageBblsPerDay(gpd, num(ppmEl)), volUnit))
      }
    },
  )
}

function renderDisplacement(): void {
  app.innerHTML = shell(
    'Line Displacement Volume',
    `
      <form class="calc-form" id="form">
        ${field('Diameter', {
          id: 'dia',
          value: 12,
          min: '0',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'mm', label: 'mm' },
          ],
          unitId: 'dia-unit',
          unitValue: 'in',
          solveKey: 'dia',
        })}
        ${field('Line length', {
          id: 'len',
          value: 5280,
          min: '0',
          unitOptions: [
            { value: 'ft', label: 'ft' },
            { value: 'km', label: 'km' },
            { value: 'miles', label: 'miles' },
          ],
          unitId: 'len-unit',
          unitValue: 'ft',
          solveKey: 'len',
        })}
        ${field('Displacement volume', {
          id: 'vol',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'Bbls', label: 'Bbls' },
            { value: 'Gals', label: 'Gals' },
            { value: 'm3', label: 'm³' },
          ],
          unitId: 'vol-unit',
          unitValue: 'Bbls',
          solveKey: 'vol',
          solved: true,
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'vol',
    ['dia', 'len', 'vol', 'dia-unit', 'len-unit', 'vol-unit'],
    (solveFor) => {
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const lenEl = app.querySelector<HTMLInputElement>('#len')!
      const volEl = app.querySelector<HTMLInputElement>('#vol')!
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const lenUnit = (app.querySelector('#len-unit') as HTMLSelectElement)
        .value as LenUnit
      const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
        .value as VolUnit

      if (solveFor === 'vol') {
        const bbls = displacementBbls(
          toInches(num(diaEl), diaUnit),
          toFeet(num(lenEl), lenUnit),
        )
        setNum(volEl, fromBbls(bbls, volUnit))
      } else if (solveFor === 'dia') {
        const diaIn = displacementDiameterIn(
          toBbls(num(volEl), volUnit),
          toFeet(num(lenEl), lenUnit),
        )
        setNum(diaEl, fromInches(diaIn, diaUnit))
      } else {
        const lenFt = displacementLengthFt(
          toBbls(num(volEl), volUnit),
          toInches(num(diaEl), diaUnit),
        )
        setNum(lenEl, fromFeet(lenFt, lenUnit))
      }
    },
  )
}

function renderLiquidVelocity(): void {
  app.innerHTML = shell(
    'Liquid Velocity',
    `
      <form class="calc-form" id="form">
        ${field('Flow rate', {
          id: 'rate',
          value: 500000,
          min: '0',
          unitOptions: [
            { value: 'Bbls', label: 'Bbls/Day' },
            { value: 'm3', label: 'm³/Day' },
          ],
          unitId: 'rate-unit',
          unitValue: 'Bbls',
          solveKey: 'rate',
        })}
        ${field('Diameter', {
          id: 'dia',
          value: 12,
          min: '0',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'mm', label: 'mm' },
          ],
          unitId: 'dia-unit',
          unitValue: 'in',
          solveKey: 'dia',
        })}
        ${field('Velocity', {
          id: 'vel',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'ft/sec', label: 'ft/sec' },
            { value: 'm/sec', label: 'm/sec' },
          ],
          unitId: 'vel-unit',
          unitValue: 'ft/sec',
          solveKey: 'vel',
          solved: true,
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'vel',
    ['rate', 'dia', 'vel', 'rate-unit', 'dia-unit', 'vel-unit'],
    (solveFor) => {
      const rateEl = app.querySelector<HTMLInputElement>('#rate')!
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const velEl = app.querySelector<HTMLInputElement>('#vel')!
      const rateUnit = (app.querySelector('#rate-unit') as HTMLSelectElement)
        .value as VolUnit
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const velUnit = (app.querySelector('#vel-unit') as HTMLSelectElement)
        .value as VelUnit
      const bblsPerDay = toBbls(num(rateEl), rateUnit)

      if (solveFor === 'vel') {
        const fps = liquidVelocityFps(
          bblsPerDay,
          toInches(num(diaEl), diaUnit),
        )
        setNum(velEl, fromFps(fps, velUnit))
      } else if (solveFor === 'rate') {
        const bpd = liquidRateBblsPerDay(
          toFps(num(velEl), velUnit),
          toInches(num(diaEl), diaUnit),
        )
        setNum(rateEl, fromBbls(bpd, rateUnit))
      } else {
        const diaIn = liquidDiameterIn(
          bblsPerDay,
          toFps(num(velEl), velUnit),
        )
        setNum(diaEl, fromInches(diaIn, diaUnit))
      }
    },
  )
}

function renderGasVelocity(): void {
  app.innerHTML = shell(
    'Gas Velocity',
    `
      <form class="calc-form" id="form">
        ${field('Gas rate', {
          id: 'rate',
          value: 500,
          min: '0',
          unitOptions: [
            { value: 'MCFD', label: 'MCFD' },
            { value: 'MMCFD', label: 'MMCFD' },
            { value: 'M3/Day', label: 'm³/Day' },
          ],
          unitId: 'rate-unit',
          unitValue: 'MCFD',
          solveKey: 'rate',
        })}
        ${field('Diameter', {
          id: 'dia',
          value: 8,
          min: '0',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'mm', label: 'mm' },
          ],
          unitId: 'dia-unit',
          unitValue: 'in',
          solveKey: 'dia',
        })}
        ${field('Line pressure', {
          id: 'psig',
          value: 105.3,
          min: '0',
          unit: 'psig',
          solveKey: 'psig',
        })}
        ${field('Velocity', {
          id: 'vel',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'ft/sec', label: 'ft/sec' },
            { value: 'm/sec', label: 'm/sec' },
          ],
          unitId: 'vel-unit',
          unitValue: 'ft/sec',
          solveKey: 'vel',
          solved: true,
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'vel',
    ['rate', 'rate-unit', 'dia', 'dia-unit', 'psig', 'vel', 'vel-unit'],
    (solveFor) => {
      const rateEl = app.querySelector<HTMLInputElement>('#rate')!
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const psigEl = app.querySelector<HTMLInputElement>('#psig')!
      const velEl = app.querySelector<HTMLInputElement>('#vel')!
      const rateUnit = (app.querySelector('#rate-unit') as HTMLSelectElement)
        .value as GasRateUnit
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const velUnit = (app.querySelector('#vel-unit') as HTMLSelectElement)
        .value as VelUnit

      if (solveFor === 'vel') {
        const fps = gasVelocityFps(
          toMcfd(num(rateEl), rateUnit),
          toInches(num(diaEl), diaUnit),
          num(psigEl),
        )
        setNum(velEl, fromFps(fps, velUnit))
      } else if (solveFor === 'rate') {
        const mcfd = gasRateMcfdFromVelocity(
          toFps(num(velEl), velUnit),
          toInches(num(diaEl), diaUnit),
          num(psigEl),
        )
        setNum(rateEl, fromMcfd(mcfd, rateUnit))
      } else if (solveFor === 'dia') {
        const diaIn = gasDiameterIn(
          toMcfd(num(rateEl), rateUnit),
          toFps(num(velEl), velUnit),
          num(psigEl),
        )
        setNum(diaEl, fromInches(diaIn, diaUnit))
      } else {
        setNum(
          psigEl,
          gasPressurePsig(
            toMcfd(num(rateEl), rateUnit),
            toInches(num(diaEl), diaUnit),
            toFps(num(velEl), velUnit),
          ),
        )
      }
    },
  )
}

function renderIonLbs(): void {
  app.innerHTML = shell(
    'mg/L to Lbs/Day',
    `
      <form class="calc-form" id="form">
        ${field('Ion concentration', {
          id: 'mgL',
          value: 40,
          min: '0',
          unit: 'mg/L',
          solveKey: 'mgL',
        })}
        ${field('Volume', {
          id: 'vol',
          value: 2000,
          min: '0',
          unitOptions: [
            { value: 'Bbls', label: 'Bbls/Day' },
            { value: 'm3', label: 'm³/Day' },
          ],
          unitId: 'vol-unit',
          unitValue: 'Bbls',
          solveKey: 'vol',
        })}
        ${field('Ion mass rate', {
          id: 'lbs',
          value: '',
          min: '0',
          unit: 'Lbs/Day',
          solveKey: 'lbs',
          solved: true,
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm('lbs', ['mgL', 'vol', 'lbs', 'vol-unit'], (solveFor) => {
    const mgLEl = app.querySelector<HTMLInputElement>('#mgL')!
    const volEl = app.querySelector<HTMLInputElement>('#vol')!
    const lbsEl = app.querySelector<HTMLInputElement>('#lbs')!
    const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
      .value as VolUnit
    const bblsPerDay = toBbls(num(volEl), volUnit)

    if (solveFor === 'lbs') {
      setNum(lbsEl, ionLbsPerDay(num(mgLEl), bblsPerDay))
    } else if (solveFor === 'mgL') {
      setNum(mgLEl, ionMgLFromLbs(num(lbsEl), bblsPerDay))
    } else {
      setNum(volEl, fromBbls(ionVolumeFromLbs(num(lbsEl), num(mgLEl)), volUnit))
    }
  })
}

/** Live recalculation for forward-only (no solve-for) forms. */
function wireLiveForm(inputIds: string[], compute: () => void): void {
  for (const id of inputIds) {
    const el = app.querySelector(`#${id}`)
    el?.addEventListener('input', compute)
    el?.addEventListener('change', compute)
  }
  compute()
}

function renderScavengerEfficiency(): void {
  app.innerHTML = shell(
    'Scavenger Efficiency',
    `
      <form class="calc-form" id="form">
        ${field('H₂S concentration', {
          id: 'h2s',
          value: 160,
          min: '0',
          unit: 'ppm',
          solveKey: 'h2s',
        })}
        ${field('Gas rate', {
          id: 'gas',
          value: 2500,
          min: '0',
          unitOptions: [
            { value: 'MCFD', label: 'MCFD' },
            { value: 'MMCFD', label: 'MMCFD' },
            { value: 'M3/Day', label: 'm³/Day' },
          ],
          unitId: 'gas-unit',
          unitValue: 'MCFD',
          solveKey: 'gas',
        })}
        ${field('Scavenger density', {
          id: 'density',
          value: 8.5,
          min: '0',
          step: '0.01',
          unit: 'lb/gal',
        })}
        ${field('Scavenger activity', {
          id: 'activity',
          value: 40,
          min: '0',
          unit: '%',
        })}
        ${field('Injection rate', {
          id: 'inject',
          value: 50,
          min: '0',
          unitOptions: [
            { value: 'Gals/Day', label: 'Gals/Day' },
            { value: 'Gals/Hr', label: 'Gals/Hr' },
            { value: 'Gals/Min', label: 'Gals/Min' },
            { value: 'Qrts/Day', label: 'Qrts/Day' },
            { value: 'Qrts/Hr', label: 'Qrts/Hr' },
            { value: 'L/Day', label: 'L/Day' },
            { value: 'L/Hr', label: 'L/Hr' },
          ],
          unitId: 'inject-unit',
          unitValue: 'Gals/Day',
          solveKey: 'inject',
        })}
        ${field('Scavenger efficiency', {
          id: 'efficiency',
          value: '',
          min: '0',
          unit: '%',
          solveKey: 'efficiency',
          solved: true,
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'efficiency',
    [
      'h2s',
      'gas',
      'gas-unit',
      'density',
      'activity',
      'inject',
      'inject-unit',
      'efficiency',
    ],
    (solveFor) => {
      const h2sEl = app.querySelector<HTMLInputElement>('#h2s')!
      const gasEl = app.querySelector<HTMLInputElement>('#gas')!
      const density = num(app.querySelector<HTMLInputElement>('#density')!)
      const activity = num(app.querySelector<HTMLInputElement>('#activity')!)
      const injectEl = app.querySelector<HTMLInputElement>('#inject')!
      const efficiencyEl = app.querySelector<HTMLInputElement>('#efficiency')!
      const gasUnit = (app.querySelector('#gas-unit') as HTMLSelectElement)
        .value as GasRateUnit
      const injectUnit = (app.querySelector('#inject-unit') as HTMLSelectElement)
        .value as RateUnit

      const clearSolved = () => {
        if (solveFor === 'efficiency') efficiencyEl.value = ''
        else if (solveFor === 'inject') injectEl.value = ''
        else if (solveFor === 'gas') gasEl.value = ''
        else h2sEl.value = ''
      }

      try {
        if (solveFor === 'efficiency') {
          const mcfd = toMcfd(num(gasEl), gasUnit)
          const galDay = rateToGalsPerDay(num(injectEl), injectUnit)
          setNum(
            efficiencyEl,
            scavengerEfficiency(num(h2sEl), mcfd, density, activity, galDay),
          )
        } else if (solveFor === 'inject') {
          const mcfd = toMcfd(num(gasEl), gasUnit)
          const galDay = scavengerInjectionRate(
            num(h2sEl),
            mcfd,
            density,
            activity,
            num(efficiencyEl),
          )
          setNum(injectEl, galsPerDayToRate(galDay, injectUnit))
        } else if (solveFor === 'gas') {
          const galDay = rateToGalsPerDay(num(injectEl), injectUnit)
          const mcfd = scavengerGasRateMcfd(
            num(h2sEl),
            density,
            activity,
            galDay,
            num(efficiencyEl),
          )
          setNum(gasEl, fromMcfd(mcfd, gasUnit))
        } else {
          const mcfd = toMcfd(num(gasEl), gasUnit)
          const galDay = rateToGalsPerDay(num(injectEl), injectUnit)
          setNum(
            h2sEl,
            scavengerH2sPpm(mcfd, density, activity, galDay, num(efficiencyEl)),
          )
        }
      } catch {
        clearSolved()
      }
    },
  )
}

function renderErosionalVelocity(): void {
  app.innerHTML = shell(
    'Erosional Velocity',
    `
      <form class="calc-form" id="form">
        ${field('Liquid specific gravity', {
          id: 'sL',
          value: 0.85,
          min: '0',
          step: '0.01',
          unit: 'water = 1',
        })}
        ${field('Liquid rate', {
          id: 'qL',
          value: 5000,
          min: '0',
          unit: 'Bbls/Day',
        })}
        ${field('Gas specific gravity', {
          id: 'sG',
          value: 0.65,
          min: '0',
          step: '0.01',
          unit: 'air = 1',
        })}
        ${field('Gas rate', {
          id: 'qG',
          value: 2,
          min: '0',
          step: '0.01',
          unitOptions: [
            { value: 'MMCFD', label: 'MMCFD' },
            { value: 'MCFD', label: 'MCFD' },
            { value: 'M3/Day', label: 'm³/Day' },
          ],
          unitId: 'qG-unit',
          unitValue: 'MMCFD',
        })}
        ${field('Pressure', {
          id: 'psia',
          value: 1000,
          min: '0',
          unit: 'psia',
        })}
        ${field('Temperature', {
          id: 'tempF',
          value: 60,
          unit: '°F',
        })}
        ${field('Gas compressibility Z', {
          id: 'z',
          value: 1,
          min: '0',
          step: '0.01',
          unit: '—',
        })}
        <div class="field" data-field="c-preset">
          <div class="field-header">
            <span class="field-label">Service condition</span>
          </div>
          <span class="field-controls">
            <select id="c-preset" aria-label="Service condition">
              <option value="100" selected>Continuous solids-free (C = 100)</option>
              <option value="125">Intermittent solids-free (C = 125)</option>
              <option value="150">Continuous clean (C = 150)</option>
              <option value="200">Continuous clean (C = 200)</option>
              <option value="250">Intermittent clean (C = 250)</option>
            </select>
          </span>
        </div>
        ${field('C factor', {
          id: 'c',
          value: 100,
          min: '0',
          unit: 'C',
        })}
        ${field('Gas/liquid ratio', {
          id: 'glr',
          value: '',
          unit: 'scf/bbl',
          solved: true,
        })}
        ${field('Mixture density', {
          id: 'density',
          value: '',
          unit: 'lb/ft³',
          solved: true,
        })}
        ${field('Erosional velocity', {
          id: 've',
          value: '',
          unitOptions: [
            { value: 'ft/sec', label: 'ft/sec' },
            { value: 'm/sec', label: 'm/sec' },
          ],
          unitId: 've-unit',
          unitValue: 'ft/sec',
          solved: true,
        })}
      </form>
    `,
    true,
    'API RP 14E two-phase limit — enter conditions to compute V<sub>e</sub>',
  )
  wireBack()

  const cEl = app.querySelector<HTMLInputElement>('#c')!
  const cPreset = app.querySelector<HTMLSelectElement>('#c-preset')!

  cPreset.addEventListener('change', () => {
    cEl.value = cPreset.value
    cEl.dispatchEvent(new Event('input', { bubbles: true }))
  })

  wireLiveForm(
    ['sL', 'qL', 'sG', 'qG', 'qG-unit', 'psia', 'tempF', 'z', 'c', 've-unit'],
    () => {
      const sL = num(app.querySelector<HTMLInputElement>('#sL')!)
      const qL = num(app.querySelector<HTMLInputElement>('#qL')!)
      const sG = num(app.querySelector<HTMLInputElement>('#sG')!)
      const qGEl = app.querySelector<HTMLInputElement>('#qG')!
      const psia = num(app.querySelector<HTMLInputElement>('#psia')!)
      const tempF = num(app.querySelector<HTMLInputElement>('#tempF')!)
      const z = num(app.querySelector<HTMLInputElement>('#z')!)
      const c = num(cEl)
      const qGUnit = (app.querySelector('#qG-unit') as HTMLSelectElement)
        .value as GasRateUnit
      const veUnit = (app.querySelector('#ve-unit') as HTMLSelectElement)
        .value as VelUnit

      const glrEl = app.querySelector<HTMLInputElement>('#glr')!
      const densityEl = app.querySelector<HTMLInputElement>('#density')!
      const veEl = app.querySelector<HTMLInputElement>('#ve')!

      try {
        const qGMmscfd = toMcfd(num(qGEl), qGUnit) / 1000
        const result = calculateApiRp14E(
          {
            liquidSpecificGravity: sL,
            liquidFlowRateBblPerDay: qL,
            gasSpecificGravity: sG,
            gasFlowRateMMscfd: qGMmscfd,
            pressurePsia: psia,
            temperatureRankine: tempF + 460,
            gasCompressibilityZ: z,
          },
          c,
        )
        setNum(glrEl, result.gasLiquidRatioScfPerBbl)
        setNum(densityEl, result.mixtureDensityLbPerFt3)
        setNum(veEl, fromFps(result.erosionalVelocityFtPerSec, veUnit))
      } catch {
        glrEl.value = ''
        densityEl.value = ''
        veEl.value = ''
      }
    },
  )
}

function renderMultiphase(): void {
  app.innerHTML = shell(
    'Vertical Multiphase Flow',
    `
      <form class="calc-form" id="form">
        ${sectionTitle('Inputs')}
        ${field('Tubing ID', {
          id: 'tubing-id',
          value: 3,
          min: '0',
          step: '0.01',
          unit: 'in',
          help: 'Inside diameter of the tubing or pipe the fluids flow through.',
        })}
        ${field('Liquid rate', {
          id: 'liq-rate',
          value: 600,
          min: '0',
          unit: 'Bbls/Day',
          help: 'Daily liquid volume (oil + water) at stock-tank conditions.',
        })}
        ${field('Gas rate (standard)', {
          id: 'gas-rate',
          value: 2,
          min: '0',
          step: '0.01',
          unitOptions: [
            { value: 'MMCFD', label: 'MMCFD' },
            { value: 'MCFD', label: 'MCFD' },
            { value: 'ft3/s', label: 'ft³/s' },
          ],
          unitId: 'gas-rate-unit',
          unitValue: 'MMCFD',
          help: 'Gas volume rate at standard conditions (14.7 psia, 60 °F). Choose MCFD, MMSCFD, or ft³/s.',
        })}
        ${field('Pressure', {
          id: 'psia',
          value: 1000,
          min: '0',
          unit: 'psia',
          help: 'Local flowing pressure at the calculation point, used to convert standard gas rate to in-situ.',
        })}
        ${field('Temperature', {
          id: 'temp-f',
          value: 150,
          unit: '°F',
          help: 'Local flowing temperature at the calculation point.',
        })}
        ${field('Gas compressibility Z', {
          id: 'z',
          value: 0.9,
          min: '0',
          step: '0.01',
          unit: '—',
          help: 'Real-gas compressibility factor — how much the gas differs from ideal-gas behavior at local P and T.',
        })}
        ${field('Gas rate (in-situ)', {
          id: 'gas-insitu',
          value: '',
          unit: 'ft³/s',
          solved: true,
          help: 'Computed gas volume rate inside the pipe at local P, T, and Z. Used for superficial velocities.',
        })}
        ${field('Liquid density', {
          id: 'rho-l',
          value: 55,
          min: '0',
          unit: 'lbm/ft³',
          help: 'Mass per unit volume of the liquid phase.',
        })}
        ${field('Gas density', {
          id: 'rho-g',
          value: 3,
          min: '0',
          step: '0.01',
          unit: 'lbm/ft³',
          help: 'Mass per unit volume of the gas phase at local (in-situ) conditions.',
        })}
        ${field('Interfacial tension', {
          id: 'sigma',
          value: 20,
          min: '0',
          unit: 'dyne/cm',
          help: 'Surface tension between gas and liquid. Affects bubble rise speed and the onset of annular flow.',
        })}
        ${field('Liquid viscosity', {
          id: 'mu-l',
          value: 1,
          min: '0',
          step: '0.01',
          unit: 'cP',
          help: 'Liquid dynamic viscosity — resistance of the liquid to flow.',
        })}
        ${field('Gas viscosity', {
          id: 'mu-g',
          value: 0.015,
          min: '0',
          step: '0.001',
          unit: 'cP',
          help: 'Gas dynamic viscosity — resistance of the gas to flow.',
        })}
        ${field('Pipe roughness', {
          id: 'roughness',
          value: 0.0018,
          min: '0',
          step: '0.0001',
          unit: 'in',
          help: 'Absolute wall roughness used in the NORSOK M-506 friction factor. Typical new steel ≈ 0.0018 in.',
        })}
        ${field('API 14E C factor', {
          id: 'c-factor',
          value: 100,
          min: '0',
          unit: 'C',
          help: 'Empirical constant in the API RP 14E erosional velocity limit Ve = C / √ρm. Often 100–125 for solids-free continuous service.',
        })}

        ${sectionTitle('Regime')}
        ${textOut(
          'Flow regime',
          'regime',
          undefined,
          'Bubble, slug/churn, or annular — how gas and liquid are arranged in the pipe at these conditions.',
        )}
        ${field('Vsl', {
          id: 'vsl',
          value: '',
          unit: 'ft/s',
          solved: true,
          help: 'Liquid superficial velocity: liquid volumetric rate divided by pipe area (as if liquid alone filled the pipe).',
        })}
        ${field('Vsg', {
          id: 'vsg',
          value: '',
          unit: 'ft/s',
          solved: true,
          help: 'Gas superficial velocity: in-situ gas volumetric rate divided by pipe area.',
        })}
        ${field('Vm', {
          id: 'vm',
          value: '',
          unit: 'ft/s',
          solved: true,
          help: 'Mixture velocity = Vsl + Vsg.',
        })}
        ${field('Bubble → slug Vsg', {
          id: 'vsg-bub-slug',
          value: '',
          unit: 'ft/s',
          solved: true,
          help: 'Predicted gas superficial velocity where flow leaves bubble and enters slug/churn (Hasan–Kabir).',
        })}
        ${field('Slug → annular Vsg', {
          id: 'vsg-slug-ann',
          value: '',
          unit: 'ft/s',
          solved: true,
          help: 'Predicted gas superficial velocity where flow becomes annular (Taitel/Turner criterion).',
        })}
        ${field('Kutateladze Ku_G', {
          id: 'ku',
          value: '',
          unit: '—',
          solved: true,
          help: 'Dimensionless gas velocity. Annular onset is typically near Ku_G ≈ 3.1.',
        })}

        ${sectionTitle('Holdup / Density')}
        ${field('Void fraction', {
          id: 'void',
          value: '',
          unit: '—',
          solved: true,
          help: 'Fraction of the pipe cross-section occupied by gas.',
        })}
        ${field('Liquid holdup', {
          id: 'holdup',
          value: '',
          unit: '—',
          solved: true,
          help: 'Fraction of the pipe cross-section occupied by liquid (1 − void fraction).',
        })}
        ${field('Mixture density (slip)', {
          id: 'rho-slip',
          value: '',
          unit: 'lbm/ft³',
          solved: true,
          help: 'Average mixture density using liquid holdup and gas void fraction (accounts for slip between phases).',
        })}

        ${sectionTitle('API RP 14E Screen')}
        ${field('Erosional velocity', {
          id: 've',
          value: '',
          unit: 'ft/s',
          solved: true,
          help: 'API RP 14E erosional velocity limit Ve = C / √ρm. Stay below this to reduce erosion risk.',
        })}
        ${textOut(
          'Below erosional limit',
          'erosional-ok',
          undefined,
          'Whether the mixture velocity Vm is below the API RP 14E erosional velocity limit.',
        )}

        ${sectionTitle('Annular Film / Shear')}
        ${field('Entrainment fraction E', {
          id: 'entrainment',
          value: '',
          unit: '—',
          solved: true,
          help: 'Fraction of the liquid carried as droplets in the gas core (Ishii–Mishima). Shown for annular flow only.',
        })}
        ${field('Film Reynolds number', {
          id: 're-film',
          value: '',
          unit: '—',
          solved: true,
          help: 'How turbulent the wall liquid film is. Values below about 1000 are treated as laminar.',
        })}
        ${textOut(
          'Film regime',
          'film-regime',
          undefined,
          'Whether the wall liquid film is laminar or turbulent based on film Reynolds number.',
        )}
        ${field('Film thickness', {
          id: 'delta',
          value: '',
          unit: 'in',
          solved: true,
          help: 'Thickness of the liquid film on the wall in annular flow.',
        })}
        ${field('Interfacial shear τᵢ', {
          id: 'tau-i',
          value: '',
          unit: 'Pa',
          solved: true,
          help: 'Shear stress at the gas–film interface (Wallis wavy-film friction).',
        })}
        ${field('Wall shear τ_w (annular)', {
          id: 'tau-w',
          value: '',
          unit: 'Pa',
          solved: true,
          help: 'Wall shear from the annular-film force balance. Useful for film/inhibitor stability checks.',
        })}

        ${sectionTitle('NORSOK M-506')}
        ${field('Wall shear τ_w (NORSOK)', {
          id: 'tau-norsok',
          value: '',
          unit: 'Pa',
          solved: true,
          help: 'Mixture-based wall shear stress from NORSOK M-506:2017 — the S value used in the CO₂ corrosion flow correction.',
        })}
        ${field('τ_w / 19 Pa', {
          id: 'norsok-ratio',
          value: '',
          unit: '—',
          solved: true,
          help: 'Ratio of NORSOK wall shear to the 19 Pa reference used in the NORSOK flow correction factor.',
        })}
      </form>
    `,
    true,
    'Enter standard gas rate + P, T, Z — tap ? next to a label for a short explanation',
  )
  wireBack()
  wireFieldHelp()

  const clearAnnular = () => {
    for (const id of [
      'entrainment',
      're-film',
      'delta',
      'tau-i',
      'tau-w',
    ]) {
      const el = app.querySelector<HTMLInputElement>(`#${id}`)
      if (el) el.value = ''
    }
    const filmRegime = app.querySelector<HTMLInputElement>('#film-regime')
    if (filmRegime) filmRegime.value = '—'
  }

  wireLiveForm(
    [
      'tubing-id',
      'liq-rate',
      'gas-rate',
      'gas-rate-unit',
      'psia',
      'temp-f',
      'z',
      'rho-l',
      'rho-g',
      'sigma',
      'mu-l',
      'mu-g',
      'roughness',
      'c-factor',
    ],
    () => {
      const tubingIdIn = num(app.querySelector<HTMLInputElement>('#tubing-id')!)
      const liqBblDay = num(app.querySelector<HTMLInputElement>('#liq-rate')!)
      const gasRaw = num(app.querySelector<HTMLInputElement>('#gas-rate')!)
      const gasUnit = (app.querySelector('#gas-rate-unit') as HTMLSelectElement)
        .value as StdGasRateUnit
      const psia = num(app.querySelector<HTMLInputElement>('#psia')!)
      const tempF = num(app.querySelector<HTMLInputElement>('#temp-f')!)
      const zFactor = num(app.querySelector<HTMLInputElement>('#z')!)
      const gasInSituEl = app.querySelector<HTMLInputElement>('#gas-insitu')!

      const setText = (id: string, value: string) => {
        const el = app.querySelector<HTMLInputElement>(`#${id}`)
        if (el) el.value = value
      }
      const clearNum = (id: string) => {
        const el = app.querySelector<HTMLInputElement>(`#${id}`)
        if (el) el.value = ''
      }

      let gasRateFt3PerS: number
      try {
        const stdFt3PerS = stdGasRateToFt3PerS(gasRaw, gasUnit)
        gasRateFt3PerS = stdToInSituGasRateFt3PerS(
          stdFt3PerS,
          psia,
          tempF,
          zFactor,
        )
        setNum(gasInSituEl, gasRateFt3PerS)
      } catch {
        gasInSituEl.value = ''
        setText('regime', '')
        setText('erosional-ok', '')
        setText('film-regime', '')
        for (const id of [
          'vsl',
          'vsg',
          'vm',
          'vsg-bub-slug',
          'vsg-slug-ann',
          'ku',
          'void',
          'holdup',
          'rho-slip',
          've',
          'tau-norsok',
          'norsok-ratio',
        ]) {
          clearNum(id)
        }
        clearAnnular()
        return
      }

      const inputs: WellInputs = {
        tubingIdIn,
        liquidRateFt3PerS: bblPerDayToFt3PerS(liqBblDay),
        gasRateFt3PerS,
        liquidDensityLbmFt3: num(app.querySelector<HTMLInputElement>('#rho-l')!),
        gasDensityLbmFt3: num(app.querySelector<HTMLInputElement>('#rho-g')!),
        interfacialTensionDyneCm: num(
          app.querySelector<HTMLInputElement>('#sigma')!,
        ),
        liquidViscosityCp: num(app.querySelector<HTMLInputElement>('#mu-l')!),
        gasViscosityCp: num(app.querySelector<HTMLInputElement>('#mu-g')!),
        pipeRoughnessIn: num(
          app.querySelector<HTMLInputElement>('#roughness')!,
        ),
      }
      const cFactor = num(app.querySelector<HTMLInputElement>('#c-factor')!)

      try {
        const result = runFullCalculation(inputs, {
          erosionalCFactor: cFactor,
        })
        const { regime, holdup, erosional, norsokWallShear } = result

        setText('regime', regime.regime)
        setNum(app.querySelector<HTMLInputElement>('#vsl')!, regime.Vsl)
        setNum(app.querySelector<HTMLInputElement>('#vsg')!, regime.Vsg)
        setNum(app.querySelector<HTMLInputElement>('#vm')!, regime.Vm)
        setNum(
          app.querySelector<HTMLInputElement>('#vsg-bub-slug')!,
          regime.bubbleToSlugTransitionVsgFtPerS,
        )
        setNum(
          app.querySelector<HTMLInputElement>('#vsg-slug-ann')!,
          regime.slugChurnToAnnularTransitionVsgFtPerS,
        )
        setNum(app.querySelector<HTMLInputElement>('#ku')!, regime.kutateladzeNumber)

        setNum(app.querySelector<HTMLInputElement>('#void')!, holdup.voidFraction)
        setNum(
          app.querySelector<HTMLInputElement>('#holdup')!,
          holdup.liquidHoldup,
        )
        setNum(
          app.querySelector<HTMLInputElement>('#rho-slip')!,
          holdup.mixtureDensitySlipLbmFt3,
        )

        setNum(
          app.querySelector<HTMLInputElement>('#ve')!,
          erosional.erosionalVelocityFtPerS,
        )
        setText(
          'erosional-ok',
          erosional.belowErosionalLimit ? 'Yes' : 'No — above limit',
        )

        setNum(
          app.querySelector<HTMLInputElement>('#tau-norsok')!,
          norsokWallShear.wallShearStressPa,
        )
        setNum(
          app.querySelector<HTMLInputElement>('#norsok-ratio')!,
          norsokWallShear.wallShearStressPa / 19,
        )

        if (
          result.entrainment &&
          result.film &&
          result.shear &&
          result.filmThickness
        ) {
          setNum(
            app.querySelector<HTMLInputElement>('#entrainment')!,
            result.entrainment.entrainmentFraction,
          )
          setNum(
            app.querySelector<HTMLInputElement>('#re-film')!,
            result.film.filmReynoldsNumber,
          )
          setText(
            'film-regime',
            result.film.filmRegimeLaminar ? 'Laminar' : 'Turbulent',
          )
          setNum(
            app.querySelector<HTMLInputElement>('#delta')!,
            result.filmThickness.filmThicknessIn,
          )
          setNum(
            app.querySelector<HTMLInputElement>('#tau-i')!,
            result.shear.interfacialShearPa,
          )
          setNum(
            app.querySelector<HTMLInputElement>('#tau-w')!,
            result.shear.wallShearStressPa,
          )
        } else {
          clearAnnular()
        }
      } catch {
        setText('regime', '')
        setText('erosional-ok', '')
        setText('film-regime', '')
        for (const id of [
          'vsl',
          'vsg',
          'vm',
          'vsg-bub-slug',
          'vsg-slug-ann',
          'ku',
          'void',
          'holdup',
          'rho-slip',
          've',
          'tau-norsok',
          'norsok-ratio',
        ]) {
          clearNum(id)
        }
        clearAnnular()
      }
    },
  )
}

function navigate(id: CalcId): void {
  history.replaceState(null, '', id === 'home' ? '#' : `#${id}`)
  switch (id) {
    case 'dosage':
      renderDosage()
      break
    case 'displacement':
      renderDisplacement()
      break
    case 'liquid-velocity':
      renderLiquidVelocity()
      break
    case 'gas-velocity':
      renderGasVelocity()
      break
    case 'ion-lbs':
      renderIonLbs()
      break
    case 'scavenger-efficiency':
      renderScavengerEfficiency()
      break
    case 'erosional-velocity':
      renderErosionalVelocity()
      break
    case 'multiphase':
      renderMultiphase()
      break
    default:
      renderHome()
  }
}

function routeFromHash(): void {
  const hash = location.hash.replace(/^#/, '') as CalcId | ''
  const known = CALCS.some((c) => c.id === hash)
  navigate(known ? (hash as CalcId) : 'home')
}

window.addEventListener('hashchange', routeFromHash)
routeFromHash()
