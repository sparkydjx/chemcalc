import './style.css'
import {
  dosageRate,
  dosagePpm,
  dosageBblsPerDay,
  displacementWithEndCapsBbls,
  displacementDiameterInWithEndCaps,
  displacementLengthFtWithEndCaps,
  liquidVelocityFps,
  liquidRateBblsPerDay,
  liquidDiameterIn,
  contactTimeSec,
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
  liquidPressurePsi,
  liquidDensityFromPressure,
  liquidHeightFromPressure,
  cylinderVolumeAboveOffsetBbls,
  headAboveValveFt,
  maxCylinderLiquidHeightFt,
  liquidHeightFromVolumeAboveOffsetFt,
  horizontalTankVolumeTable,
  calculateApiRp14E,
  toInches,
  fromInches,
  toFeet,
  fromFeet,
  toBbls,
  fromBbls,
  toFps,
  fromFps,
  fromSeconds,
  toMcfd,
  fromMcfd,
  toLbPerFt3,
  fromLbPerFt3,
  toGasDensityLbPerFt3,
  toHeightFeet,
  fromHeightFeet,
  toPsi,
  fromPsi,
  rateToGalsPerDay,
  galsPerDayToRate,
  formatResult,
  parseNumString,
  type RateUnit,
  type DiaUnit,
  type LenUnit,
  type VolUnit,
  type VelUnit,
  type TimeUnit,
  type GasRateUnit,
  type DensityUnit,
  type GasDensityUnit,
  type HeightUnit,
  type PressureUnit,
  type CylinderOrientation,
  type EndCapType,
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
  | 'tank-volume'
  | 'erosional-velocity'
  | 'multiphase'

const CALCS: { id: Exclude<CalcId, 'home'>; title: string; blurb: string }[] = [
  {
    id: 'dosage',
    title: 'Dosage Calculation',
    blurb: 'PPM, barrels/day, and injection rate — optionally with liquid or gas velocity',
  },
  {
    id: 'displacement',
    title: 'Line Displacement Volume',
    blurb: 'Diameter, length, end caps, and volume — solve for any',
  },
  {
    id: 'liquid-velocity',
    title: 'Liquid Velocity',
    blurb: 'Flow rate, diameter, velocity, and contact time',
  },
  {
    id: 'gas-velocity',
    title: 'Gas Velocity',
    blurb: 'Gas rate, diameter, pressure, velocity, and contact time',
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
    id: 'tank-volume',
    title: 'Tank Volume',
    blurb: 'Cylinder volume, liquid height, density, pressure, and valve offset',
  },
  {
    id: 'erosional-velocity',
    title: 'Erosional Velocity (API RP 14E)',
    blurb: 'Mixture density, erosional limit, and superficial velocities',
  },
  {
    id: 'multiphase',
    title: 'Vertical Multiphase Flow',
    blurb: 'Regime, entrainment, film, and wall shear for NORSOK M-506',
  },
]

const app = document.querySelector<HTMLDivElement>('#app')!

function num(el: HTMLInputElement): number {
  return parseNumString(el.value)
}

function setNum(el: HTMLInputElement, value: number): void {
  const formatted = formatResult(value)
  el.value = formatted === '—' ? '' : formatted
}

/** Re-apply thousands commas after the user finishes editing (preserve exact value). */
function formatNumInput(el: HTMLInputElement): void {
  const v = num(el)
  if (!Number.isFinite(v)) return
  el.value = v.toLocaleString('en-US', { maximumFractionDigits: 20 })
}

function displayValue(value: number | string): string {
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 20 })
  }
  return value
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
          class="num-input"
          type="text"
          inputmode="decimal"
          value="${displayValue(opts.value)}"
          autocomplete="off"
          spellcheck="false"
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
  root: ParentNode = app,
): { getSolveFor: () => string; run: () => void } {
  let solveFor = defaultSolve

  const applySolveUi = () => {
    root.querySelectorAll<HTMLElement>('.field[data-field]').forEach((wrap) => {
      const check = wrap.querySelector<HTMLInputElement>('.solve-check')
      // Always-output fields (no Solve checkbox) keep their initial readonly state.
      if (!check) return
      const key = wrap.dataset.field!
      const isSolved = key === solveFor
      wrap.classList.toggle('is-solved', isSolved)
      const input = wrap.querySelector<HTMLInputElement>('input.num-input')
      if (input) {
        input.readOnly = isSolved
        if (isSolved) input.tabIndex = -1
        else input.removeAttribute('tabindex')
      }
      check.checked = isSolved
    })
  }

  root.querySelectorAll<HTMLInputElement>('.solve-check').forEach((check) => {
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
    const el = app.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
    el?.addEventListener('input', run)
    el?.addEventListener('change', run)
    if (el instanceof HTMLInputElement && el.classList.contains('num-input')) {
      el.addEventListener('blur', () => {
        formatNumInput(el)
        run()
      })
    }
  }

  applySolveUi()
  run()
  return { getSolveFor: () => solveFor, run }
}

/** Mutually exclusive include checkboxes (e.g. liquid vs gas velocity on dosage). */
function includeOption(id: string, label: string, help?: string): string {
  return `
    <label class="include-option">
      <input type="checkbox" id="${id}" />
      <span class="include-option-text">
        <span class="include-option-label">${escapeHtml(label)}</span>
        ${help ? `<span class="include-option-help">${escapeHtml(help)}</span>` : ''}
      </span>
    </label>
  `
}

function renderDosage(): void {
  app.innerHTML = shell(
    'Dosage Calculation',
    `
      <form class="calc-form" id="form">
        <div id="dosage-fields">
          ${field('PPM', {
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
            help: 'Treated fluid volume rate. When Liquid Velocity is included, this is also the flow rate used for velocity and contact time.',
          })}
          ${field('Injection rate', {
            id: 'rate',
            value: '',
            min: '0',
            unitOptions: [
              { value: 'Gals/Day', label: 'Gals/Day' },
              { value: 'Gals/Hr', label: 'Gals/Hr' },
              { value: 'Gals/Min', label: 'Gals/Min' },
              { value: 'Bbls/Day', label: 'Bbls/Day' },
              { value: 'L/Day', label: 'L/Day' },
              { value: 'L/Hr', label: 'L/Hr' },
              { value: 'L/Min', label: 'L/Min' },
              { value: 'mL/Min', label: 'mL/Min' },
              { value: 'Qrts/Day', label: 'Qrts/Day' },
              { value: 'Qrts/Hr', label: 'Qrts/Hr' },
              { value: 'Qrts/Min', label: 'Qrts/Min' },
            ],
            unitId: 'rate-unit',
            unitValue: 'Gals/Day',
            solveKey: 'rate',
            solved: true,
          })}
        </div>

        ${sectionTitle('Velocity')}
        <div class="include-options" role="group" aria-label="Include velocity calculator">
          ${includeOption(
            'include-liquid',
            'Liquid Velocity',
            'Pipe diameter, velocity, and contact time from the volume above',
          )}
          ${includeOption(
            'include-gas',
            'Gas Velocity',
            'Gas rate, pressure, diameter, velocity, and contact time',
          )}
        </div>

        <div id="liquid-velocity-panel" class="embedded-calc" hidden>
          ${sectionTitle('Liquid Velocity')}
          <p class="embed-note">Uses Volume above as liquid flow rate.</p>
          ${field('Diameter', {
            id: 'lv-dia',
            value: 12,
            min: '0',
            unitOptions: [
              { value: 'in', label: 'in' },
              { value: 'mm', label: 'mm' },
            ],
            unitId: 'lv-dia-unit',
            unitValue: 'in',
            solveKey: 'dia',
          })}
          ${field('Velocity', {
            id: 'lv-vel',
            value: '',
            min: '0',
            unitOptions: [
              { value: 'ft/sec', label: 'ft/sec' },
              { value: 'm/sec', label: 'm/sec' },
            ],
            unitId: 'lv-vel-unit',
            unitValue: 'ft/sec',
            solveKey: 'vel',
            solved: true,
          })}
          ${field('Line length', {
            id: 'lv-len',
            value: 5280,
            min: '0',
            unitOptions: [
              { value: 'ft', label: 'ft' },
              { value: 'm', label: 'm' },
              { value: 'km', label: 'km' },
            ],
            unitId: 'lv-len-unit',
            unitValue: 'ft',
            help: 'Pipe or line length used with velocity to compute contact (residence) time.',
          })}
          ${field('Contact time', {
            id: 'lv-contact',
            value: '',
            min: '0',
            unitOptions: [
              { value: 'sec', label: 'sec' },
              { value: 'min', label: 'min' },
              { value: 'hrs', label: 'hrs' },
            ],
            unitId: 'lv-contact-unit',
            unitValue: 'sec',
            solved: true,
            help: 'Time for fluid to travel the line: length ÷ velocity.',
          })}
        </div>

        <div id="gas-velocity-panel" class="embedded-calc" hidden>
          ${sectionTitle('Gas Velocity')}
          ${field('Gas rate', {
            id: 'gv-rate',
            value: 500,
            min: '0',
            unitOptions: [
              { value: 'MCFD', label: 'MCFD' },
              { value: 'MMCFD', label: 'MMCFD' },
              { value: 'M3/Day', label: 'm³/Day' },
            ],
            unitId: 'gv-rate-unit',
            unitValue: 'MCFD',
            solveKey: 'rate',
          })}
          ${field('Diameter', {
            id: 'gv-dia',
            value: 8,
            min: '0',
            unitOptions: [
              { value: 'in', label: 'in' },
              { value: 'mm', label: 'mm' },
            ],
            unitId: 'gv-dia-unit',
            unitValue: 'in',
            solveKey: 'dia',
          })}
          ${field('Line pressure', {
            id: 'gv-psig',
            value: 105.3,
            min: '0',
            unit: 'psig',
            solveKey: 'psig',
          })}
          ${field('Temperature', {
            id: 'gv-tempF',
            value: 60,
            unit: '°F',
          })}
          ${field('Gas compressibility Z', {
            id: 'gv-z',
            value: 1,
            min: '0',
            step: '0.01',
            unit: '—',
          })}
          ${field('Velocity', {
            id: 'gv-vel',
            value: '',
            min: '0',
            unitOptions: [
              { value: 'ft/sec', label: 'ft/sec' },
              { value: 'm/sec', label: 'm/sec' },
            ],
            unitId: 'gv-vel-unit',
            unitValue: 'ft/sec',
            solveKey: 'vel',
            solved: true,
          })}
          ${field('Line length', {
            id: 'gv-len',
            value: 5280,
            min: '0',
            unitOptions: [
              { value: 'ft', label: 'ft' },
              { value: 'm', label: 'm' },
              { value: 'km', label: 'km' },
            ],
            unitId: 'gv-len-unit',
            unitValue: 'ft',
            help: 'Pipe or line length used with velocity to compute contact (residence) time.',
          })}
          ${field('Contact time', {
            id: 'gv-contact',
            value: '',
            min: '0',
            unitOptions: [
              { value: 'sec', label: 'sec' },
              { value: 'min', label: 'min' },
              { value: 'hrs', label: 'hrs' },
            ],
            unitId: 'gv-contact-unit',
            unitValue: 'sec',
            solved: true,
            help: 'Time for fluid to travel the line: length ÷ velocity.',
          })}
        </div>
      </form>
    `,
    true,
  )
  wireBack()
  wireFieldHelp()

  const dosageRoot = app.querySelector('#dosage-fields')!
  const liquidPanel = app.querySelector<HTMLElement>('#liquid-velocity-panel')!
  const gasPanel = app.querySelector<HTMLElement>('#gas-velocity-panel')!
  const includeLiquid = app.querySelector<HTMLInputElement>('#include-liquid')!
  const includeGas = app.querySelector<HTMLInputElement>('#include-gas')!

  const computeDosage = (solveFor: string) => {
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
  }

  const computeLiquid = (solveFor: string) => {
    const bblsEl = app.querySelector<HTMLInputElement>('#bbls')!
    const diaEl = app.querySelector<HTMLInputElement>('#lv-dia')!
    const velEl = app.querySelector<HTMLInputElement>('#lv-vel')!
    const lenEl = app.querySelector<HTMLInputElement>('#lv-len')!
    const contactEl = app.querySelector<HTMLInputElement>('#lv-contact')!
    const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
      .value as VolUnit
    const diaUnit = (app.querySelector('#lv-dia-unit') as HTMLSelectElement)
      .value as DiaUnit
    const velUnit = (app.querySelector('#lv-vel-unit') as HTMLSelectElement)
      .value as VelUnit
    const lenUnit = (app.querySelector('#lv-len-unit') as HTMLSelectElement)
      .value as LenUnit
    const contactUnit = (
      app.querySelector('#lv-contact-unit') as HTMLSelectElement
    ).value as TimeUnit
    const bblsPerDay = toBbls(num(bblsEl), volUnit)

    let fps: number
    if (solveFor === 'vel') {
      fps = liquidVelocityFps(bblsPerDay, toInches(num(diaEl), diaUnit))
      setNum(velEl, fromFps(fps, velUnit))
    } else {
      // Solve for diameter from volume + velocity (volume stays with dosage).
      fps = toFps(num(velEl), velUnit)
      const diaIn = liquidDiameterIn(bblsPerDay, fps)
      setNum(diaEl, fromInches(diaIn, diaUnit))
    }

    setNum(
      contactEl,
      fromSeconds(
        contactTimeSec(toFeet(num(lenEl), lenUnit), fps),
        contactUnit,
      ),
    )
  }

  const computeGas = (solveFor: string) => {
    const rateEl = app.querySelector<HTMLInputElement>('#gv-rate')!
    const diaEl = app.querySelector<HTMLInputElement>('#gv-dia')!
    const psigEl = app.querySelector<HTMLInputElement>('#gv-psig')!
    const tempFEl = app.querySelector<HTMLInputElement>('#gv-tempF')!
    const zEl = app.querySelector<HTMLInputElement>('#gv-z')!
    const velEl = app.querySelector<HTMLInputElement>('#gv-vel')!
    const lenEl = app.querySelector<HTMLInputElement>('#gv-len')!
    const contactEl = app.querySelector<HTMLInputElement>('#gv-contact')!
    const rateUnit = (app.querySelector('#gv-rate-unit') as HTMLSelectElement)
      .value as GasRateUnit
    const diaUnit = (app.querySelector('#gv-dia-unit') as HTMLSelectElement)
      .value as DiaUnit
    const velUnit = (app.querySelector('#gv-vel-unit') as HTMLSelectElement)
      .value as VelUnit
    const lenUnit = (app.querySelector('#gv-len-unit') as HTMLSelectElement)
      .value as LenUnit
    const contactUnit = (
      app.querySelector('#gv-contact-unit') as HTMLSelectElement
    ).value as TimeUnit
    const tempF = num(tempFEl)
    const z = num(zEl)

    let fps: number
    if (solveFor === 'vel') {
      fps = gasVelocityFps(
        toMcfd(num(rateEl), rateUnit),
        toInches(num(diaEl), diaUnit),
        num(psigEl),
        tempF,
        z,
      )
      setNum(velEl, fromFps(fps, velUnit))
    } else if (solveFor === 'rate') {
      fps = toFps(num(velEl), velUnit)
      const mcfd = gasRateMcfdFromVelocity(
        fps,
        toInches(num(diaEl), diaUnit),
        num(psigEl),
        tempF,
        z,
      )
      setNum(rateEl, fromMcfd(mcfd, rateUnit))
    } else if (solveFor === 'dia') {
      fps = toFps(num(velEl), velUnit)
      const diaIn = gasDiameterIn(
        toMcfd(num(rateEl), rateUnit),
        fps,
        num(psigEl),
        tempF,
        z,
      )
      setNum(diaEl, fromInches(diaIn, diaUnit))
    } else {
      fps = toFps(num(velEl), velUnit)
      setNum(
        psigEl,
        gasPressurePsig(
          toMcfd(num(rateEl), rateUnit),
          toInches(num(diaEl), diaUnit),
          fps,
          tempF,
          z,
        ),
      )
    }

    setNum(
      contactEl,
      fromSeconds(
        contactTimeSec(toFeet(num(lenEl), lenUnit), fps),
        contactUnit,
      ),
    )
  }

  let dosageSolve = 'rate'
  let liquidSolve = 'vel'
  let gasSolve = 'vel'

  const runAll = () => {
    computeDosage(dosageSolve)
    if (!liquidPanel.hidden) computeLiquid(liquidSolve)
    if (!gasPanel.hidden) computeGas(gasSolve)
  }

  const wireScopedSolve = (
    root: ParentNode,
    defaultSolve: string,
    setSolve: (key: string) => void,
  ) => {
    let solveFor = defaultSolve
    const applySolveUi = () => {
      root.querySelectorAll<HTMLElement>('.field[data-field]').forEach((wrap) => {
        const check = wrap.querySelector<HTMLInputElement>('.solve-check')
        if (!check) return
        const key = wrap.dataset.field!
        const isSolved = key === solveFor
        wrap.classList.toggle('is-solved', isSolved)
        const input = wrap.querySelector<HTMLInputElement>('input.num-input')
        if (input) {
          input.readOnly = isSolved
          if (isSolved) input.tabIndex = -1
          else input.removeAttribute('tabindex')
        }
        check.checked = isSolved
      })
      setSolve(solveFor)
    }

    root.querySelectorAll<HTMLInputElement>('.solve-check').forEach((check) => {
      check.addEventListener('change', () => {
        if (check.checked) {
          solveFor = check.dataset.solve!
        } else if (check.dataset.solve === solveFor) {
          check.checked = true
          return
        }
        applySolveUi()
        runAll()
      })
    })

    applySolveUi()
  }

  wireScopedSolve(dosageRoot, 'rate', (k) => {
    dosageSolve = k
  })
  wireScopedSolve(liquidPanel, 'vel', (k) => {
    liquidSolve = k
  })
  wireScopedSolve(gasPanel, 'vel', (k) => {
    gasSolve = k
  })

  const syncPanels = () => {
    liquidPanel.hidden = !includeLiquid.checked
    gasPanel.hidden = !includeGas.checked
    runAll()
  }

  includeLiquid.addEventListener('change', () => {
    if (includeLiquid.checked) includeGas.checked = false
    syncPanels()
  })
  includeGas.addEventListener('change', () => {
    if (includeGas.checked) includeLiquid.checked = false
    syncPanels()
  })

  const inputIds = [
    'ppm',
    'bbls',
    'rate',
    'vol-unit',
    'rate-unit',
    'lv-dia',
    'lv-vel',
    'lv-len',
    'lv-dia-unit',
    'lv-vel-unit',
    'lv-len-unit',
    'lv-contact-unit',
    'gv-rate',
    'gv-rate-unit',
    'gv-dia',
    'gv-dia-unit',
    'gv-psig',
    'gv-tempF',
    'gv-z',
    'gv-vel',
    'gv-vel-unit',
    'gv-len',
    'gv-len-unit',
    'gv-contact-unit',
  ]
  for (const id of inputIds) {
    const el = app.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
    el?.addEventListener('input', runAll)
    el?.addEventListener('change', runAll)
    if (el instanceof HTMLInputElement && el.classList.contains('num-input')) {
      el.addEventListener('blur', () => {
        formatNumInput(el)
        runAll()
      })
    }
  }

  runAll()
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
          help: 'Inside diameter of the line or vessel. End-cap volumes are computed from this diameter alone.',
        })}
        <div class="field" data-field="end-cap">
          <div class="field-header">
            <span class="field-label-row">
              <span class="field-label">End caps</span>
              ${helpLink(
                'End caps',
                'Cylinder end caps on both ends. Flat adds no volume. Hemispherical = πD³/12 each, elliptical 2:1 = πD³/24 each, ASME F&D torispherical uses dish radius = D and knuckle = 0.06D. Straight length stays tangent-line to tangent-line.',
              )}
            </span>
          </div>
          <span class="field-controls">
            <select id="end-cap" aria-label="End caps">
              <option value="flat" selected>Flat</option>
              <option value="hemispherical">Hemispherical</option>
              <option value="elliptical">Elliptical (2:1)</option>
              <option value="torispherical">Torispherical (ASME F&amp;D)</option>
            </select>
          </span>
        </div>
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
          help: 'Straight cylindrical length (tangent line to tangent line). End-cap dish depth is not included here.',
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
          help: 'Cylinder volume plus both end caps when a head type is selected.',
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireFieldHelp()
  wireSolveForm(
    'vol',
    ['dia', 'len', 'vol', 'end-cap', 'dia-unit', 'len-unit', 'vol-unit'],
    (solveFor) => {
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const lenEl = app.querySelector<HTMLInputElement>('#len')!
      const volEl = app.querySelector<HTMLInputElement>('#vol')!
      const endCap = (app.querySelector('#end-cap') as HTMLSelectElement)
        .value as EndCapType
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const lenUnit = (app.querySelector('#len-unit') as HTMLSelectElement)
        .value as LenUnit
      const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
        .value as VolUnit

      if (solveFor === 'vol') {
        const bbls = displacementWithEndCapsBbls(
          toInches(num(diaEl), diaUnit),
          toFeet(num(lenEl), lenUnit),
          endCap,
        )
        setNum(volEl, fromBbls(bbls, volUnit))
      } else if (solveFor === 'dia') {
        const diaIn = displacementDiameterInWithEndCaps(
          toBbls(num(volEl), volUnit),
          toFeet(num(lenEl), lenUnit),
          endCap,
        )
        setNum(diaEl, fromInches(diaIn, diaUnit))
      } else {
        const lenFt = displacementLengthFtWithEndCaps(
          toBbls(num(volEl), volUnit),
          toInches(num(diaEl), diaUnit),
          endCap,
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
        ${field('Line length', {
          id: 'len',
          value: 5280,
          min: '0',
          unitOptions: [
            { value: 'ft', label: 'ft' },
            { value: 'm', label: 'm' },
            { value: 'km', label: 'km' },
          ],
          unitId: 'len-unit',
          unitValue: 'ft',
          help: 'Pipe or line length used with velocity to compute contact (residence) time.',
        })}
        ${field('Contact time', {
          id: 'contact',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'sec', label: 'sec' },
            { value: 'min', label: 'min' },
            { value: 'hrs', label: 'hrs' },
          ],
          unitId: 'contact-unit',
          unitValue: 'sec',
          solved: true,
          help: 'Time for fluid to travel the line: length ÷ velocity.',
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'vel',
    [
      'rate',
      'dia',
      'vel',
      'len',
      'rate-unit',
      'dia-unit',
      'vel-unit',
      'len-unit',
      'contact-unit',
    ],
    (solveFor) => {
      const rateEl = app.querySelector<HTMLInputElement>('#rate')!
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const velEl = app.querySelector<HTMLInputElement>('#vel')!
      const lenEl = app.querySelector<HTMLInputElement>('#len')!
      const contactEl = app.querySelector<HTMLInputElement>('#contact')!
      const rateUnit = (app.querySelector('#rate-unit') as HTMLSelectElement)
        .value as VolUnit
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const velUnit = (app.querySelector('#vel-unit') as HTMLSelectElement)
        .value as VelUnit
      const lenUnit = (app.querySelector('#len-unit') as HTMLSelectElement)
        .value as LenUnit
      const contactUnit = (
        app.querySelector('#contact-unit') as HTMLSelectElement
      ).value as TimeUnit
      const bblsPerDay = toBbls(num(rateEl), rateUnit)

      let fps: number
      if (solveFor === 'vel') {
        fps = liquidVelocityFps(
          bblsPerDay,
          toInches(num(diaEl), diaUnit),
        )
        setNum(velEl, fromFps(fps, velUnit))
      } else if (solveFor === 'rate') {
        fps = toFps(num(velEl), velUnit)
        const bpd = liquidRateBblsPerDay(
          fps,
          toInches(num(diaEl), diaUnit),
        )
        setNum(rateEl, fromBbls(bpd, rateUnit))
      } else {
        fps = toFps(num(velEl), velUnit)
        const diaIn = liquidDiameterIn(bblsPerDay, fps)
        setNum(diaEl, fromInches(diaIn, diaUnit))
      }

      setNum(
        contactEl,
        fromSeconds(
          contactTimeSec(toFeet(num(lenEl), lenUnit), fps),
          contactUnit,
        ),
      )
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
        ${field('Line length', {
          id: 'len',
          value: 5280,
          min: '0',
          unitOptions: [
            { value: 'ft', label: 'ft' },
            { value: 'm', label: 'm' },
            { value: 'km', label: 'km' },
          ],
          unitId: 'len-unit',
          unitValue: 'ft',
          help: 'Pipe or line length used with velocity to compute contact (residence) time.',
        })}
        ${field('Contact time', {
          id: 'contact',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'sec', label: 'sec' },
            { value: 'min', label: 'min' },
            { value: 'hrs', label: 'hrs' },
          ],
          unitId: 'contact-unit',
          unitValue: 'sec',
          solved: true,
          help: 'Time for fluid to travel the line: length ÷ velocity.',
        })}
      </form>
    `,
    true,
  )
  wireBack()
  wireSolveForm(
    'vel',
    [
      'rate',
      'rate-unit',
      'dia',
      'dia-unit',
      'psig',
      'tempF',
      'z',
      'vel',
      'vel-unit',
      'len',
      'len-unit',
      'contact-unit',
    ],
    (solveFor) => {
      const rateEl = app.querySelector<HTMLInputElement>('#rate')!
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const psigEl = app.querySelector<HTMLInputElement>('#psig')!
      const tempFEl = app.querySelector<HTMLInputElement>('#tempF')!
      const zEl = app.querySelector<HTMLInputElement>('#z')!
      const velEl = app.querySelector<HTMLInputElement>('#vel')!
      const lenEl = app.querySelector<HTMLInputElement>('#len')!
      const contactEl = app.querySelector<HTMLInputElement>('#contact')!
      const rateUnit = (app.querySelector('#rate-unit') as HTMLSelectElement)
        .value as GasRateUnit
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const velUnit = (app.querySelector('#vel-unit') as HTMLSelectElement)
        .value as VelUnit
      const lenUnit = (app.querySelector('#len-unit') as HTMLSelectElement)
        .value as LenUnit
      const contactUnit = (
        app.querySelector('#contact-unit') as HTMLSelectElement
      ).value as TimeUnit
      const tempF = num(tempFEl)
      const z = num(zEl)

      let fps: number
      if (solveFor === 'vel') {
        fps = gasVelocityFps(
          toMcfd(num(rateEl), rateUnit),
          toInches(num(diaEl), diaUnit),
          num(psigEl),
          tempF,
          z,
        )
        setNum(velEl, fromFps(fps, velUnit))
      } else if (solveFor === 'rate') {
        fps = toFps(num(velEl), velUnit)
        const mcfd = gasRateMcfdFromVelocity(
          fps,
          toInches(num(diaEl), diaUnit),
          num(psigEl),
          tempF,
          z,
        )
        setNum(rateEl, fromMcfd(mcfd, rateUnit))
      } else if (solveFor === 'dia') {
        fps = toFps(num(velEl), velUnit)
        const diaIn = gasDiameterIn(
          toMcfd(num(rateEl), rateUnit),
          fps,
          num(psigEl),
          tempF,
          z,
        )
        setNum(diaEl, fromInches(diaIn, diaUnit))
      } else {
        fps = toFps(num(velEl), velUnit)
        setNum(
          psigEl,
          gasPressurePsig(
            toMcfd(num(rateEl), rateUnit),
            toInches(num(diaEl), diaUnit),
            fps,
            tempF,
            z,
          ),
        )
      }

      setNum(
        contactEl,
        fromSeconds(
          contactTimeSec(toFeet(num(lenEl), lenUnit), fps),
          contactUnit,
        ),
      )
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
    const el = app.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
    el?.addEventListener('input', compute)
    el?.addEventListener('change', compute)
    if (el instanceof HTMLInputElement && el.classList.contains('num-input')) {
      el.addEventListener('blur', () => {
        formatNumInput(el)
        compute()
      })
    }
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

function renderTankVolume(): void {
  app.innerHTML = shell(
    'Tank Volume',
    `
      <form class="calc-form" id="form">
        ${field('Density', {
          id: 'density',
          value: 1,
          min: '0',
          step: '0.01',
          unitOptions: [
            { value: 'gm/mL', label: 'gm/mL' },
            { value: 'lbs/gal', label: 'lbs/gal' },
            { value: 'lbs/cuft', label: 'lbs/cuft' },
          ],
          unitId: 'density-unit',
          unitValue: 'gm/mL',
          solveKey: 'density',
        })}
        <div class="field" data-field="orientation">
          <div class="field-header">
            <span class="field-label-row">
              <span class="field-label">Cylinder orientation</span>
              ${helpLink(
                'Cylinder orientation',
                'Vertical: volume from diameter and liquid height. Horizontal: volume from diameter, cylinder length, and liquid fill height (partial circle cross-section).',
              )}
            </span>
          </div>
          <span class="field-controls">
            <select id="orientation" aria-label="Cylinder orientation">
              <option value="vertical" selected>Vertical</option>
              <option value="horizontal">Horizontal</option>
            </select>
          </span>
        </div>
        <div class="field" data-field="end-cap">
          <div class="field-header">
            <span class="field-label-row">
              <span class="field-label">End caps</span>
              ${helpLink(
                'End caps',
                'Cylinder end caps on both ends. Flat adds no volume. Hemispherical = πD³/12 each, elliptical 2:1 = πD³/24 each, ASME F&D torispherical uses dish radius = D and knuckle = 0.06D. Straight length stays tangent-line to tangent-line.',
              )}
            </span>
          </div>
          <span class="field-controls">
            <select id="end-cap" aria-label="End caps">
              <option value="flat" selected>Flat</option>
              <option value="hemispherical">Hemispherical</option>
              <option value="elliptical">Elliptical (2:1)</option>
              <option value="torispherical">Torispherical (ASME F&amp;D)</option>
            </select>
          </span>
        </div>
        ${field('Diameter', {
          id: 'dia',
          value: 12,
          min: '0',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'ft', label: 'ft' },
            { value: 'mm', label: 'mm' },
            { value: 'm', label: 'm' },
          ],
          unitId: 'dia-unit',
          unitValue: 'in',
          help: 'Inside diameter of the cylinder (tank or vessel). End-cap volumes are computed from this diameter alone.',
        })}
        ${field('Cylinder length', {
          id: 'len',
          value: 20,
          min: '0',
          unitOptions: [
            { value: 'ft', label: 'ft' },
            { value: 'in', label: 'in' },
            { value: 'm', label: 'm' },
          ],
          unitId: 'len-unit',
          unitValue: 'ft',
          help: 'Straight cylindrical length (tangent line to tangent line). Required for horizontal tanks and for vertical tanks with dished heads. End-cap dish depth is not included here.',
        })}
        ${field('Liquid height', {
          id: 'height',
          value: 20,
          min: '0',
          unitOptions: [
            { value: 'ft', label: 'ft' },
            { value: 'in', label: 'in' },
            { value: 'm', label: 'm' },
          ],
          unitId: 'height-unit',
          unitValue: 'in',
          solveKey: 'height',
          help: 'Liquid fill height from the tank bottom. Pressure is taken at the valve: head = liquid height − valve offset (e.g. 20 in − 2 in → 18 in of fluid). For horizontal cylinders, you cannot enter a height greater than diameter − valve offset. For vertical tanks with dished heads, height includes the heads and is capped at shell length + both head depths − valve offset. Check Solve to find height from volume (or from pressure and density when volume is blank).',
        })}
        ${field('Valve offset', {
          id: 'offset',
          value: 2,
          min: '0',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'ft', label: 'ft' },
            { value: 'm', label: 'm' },
          ],
          unitId: 'offset-unit',
          unitValue: 'in',
          help: 'Height of the outlet valve above the tank bottom. Pressure uses only the fluid above this point. Volume subtracts the dead space below the valve. Leave 0 if the valve is at the bottom.',
        })}
        ${field('Volume', {
          id: 'vol',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'Gals', label: 'Gal' },
            { value: 'Bbls', label: 'Bbls' },
            { value: 'L', label: 'L' },
            { value: 'm3', label: 'm³' },
          ],
          unitId: 'vol-unit',
          unitValue: 'Gals',
          solveKey: 'vol',
          help: 'Liquid volume above the valve. Vertical uses the cylindrical shell and both end caps when a head type is selected. Horizontal uses the partial-circle fill formula and adds both end caps when the cylinder cross-section is full. A valve offset subtracts the dead volume below the outlet. Check Solve to find volume from liquid height, or enter volume and solve for liquid height.',
        })}
        ${field('Pressure', {
          id: 'pressure',
          value: '',
          min: '0',
          unitOptions: [
            { value: 'psi', label: 'psi' },
            { value: 'kPa', label: 'kPa' },
            { value: 'mbar', label: 'mbar' },
          ],
          unitId: 'pressure-unit',
          unitValue: 'psi',
          solveKey: 'pressure',
          solved: true,
          help: 'Hydrostatic pressure of the fluid above the valve (P = ρ × head / 144). With 20 in of liquid and a 2 in offset, pressure is based on 18 in of fluid, not 20 in.',
        })}
        ${field('Level height above valve', {
          id: 'head',
          value: '',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'ft', label: 'ft' },
            { value: 'm', label: 'm' },
          ],
          unitId: 'head-unit',
          unitValue: 'in',
          solved: true,
          help: 'Liquid height minus valve offset — the fluid column used for hydrostatic pressure. Example: 20 in of liquid and a 2 in valve offset → 18 in of head.',
        })}
        <div class="calc-actions">
          <button type="button" class="action-btn" id="volume-table-btn">
            Volume table
          </button>
          <p class="action-hint" id="volume-table-hint">
            Horizontal tank: volume at each unit of the diameter UOM, with liquid height and volume in the selected units.
          </p>
        </div>
        <div class="volume-table-wrap" id="volume-table-wrap" hidden>
          <div class="volume-table-header">
            <h2 class="volume-table-title">Horizontal volume table</h2>
            <span class="volume-table-actions">
              <button type="button" class="action-btn action-btn-quiet" id="volume-table-export" disabled>
                Export Excel
              </button>
              <button type="button" class="action-btn action-btn-quiet" id="volume-table-hide">
                Hide
              </button>
            </span>
          </div>
          <div class="volume-table-scroll" id="volume-table-scroll"></div>
        </div>
      </form>
    `,
    true,
  )
  wireBack()
  wireFieldHelp()

  const lenField = app.querySelector<HTMLElement>('.field[data-field="len"]')!
  const orientationEl = app.querySelector<HTMLSelectElement>('#orientation')!
  const endCapEl = app.querySelector<HTMLSelectElement>('#end-cap')!
  const volumeTableBtn = app.querySelector<HTMLButtonElement>('#volume-table-btn')!
  const volumeTableHide = app.querySelector<HTMLButtonElement>('#volume-table-hide')!
  const volumeTableExport = app.querySelector<HTMLButtonElement>('#volume-table-export')!
  const volumeTableWrap = app.querySelector<HTMLElement>('#volume-table-wrap')!
  const volumeTableScroll = app.querySelector<HTMLElement>('#volume-table-scroll')!
  let volumeTableVisible = false
  let volumeTableRows: { height: number; volume: number }[] = []
  let volumeTableHeightLabel = ''
  let volumeTableVolumeLabel = ''

  const volUnitLabel = (unit: VolUnit): string => {
    if (unit === 'm3') return 'm³'
    if (unit === 'Gals') return 'Gal'
    return unit
  }

  const renderVolumeTable = () => {
    if (!volumeTableVisible) return

    const diaEl = app.querySelector<HTMLInputElement>('#dia')!
    const lenEl = app.querySelector<HTMLInputElement>('#len')!
    const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
      .value as DiaUnit
    const heightUnit = (
      app.querySelector('#height-unit') as HTMLSelectElement
    ).value as HeightUnit
    const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
      .value as VolUnit
    const endCap = endCapEl.value as EndCapType
    const diaIn = toInches(num(diaEl), diaUnit)
    const lengthFt = toHeightFeet(num(lenEl), (
      app.querySelector('#len-unit') as HTMLSelectElement
    ).value as HeightUnit)

    const rows = horizontalTankVolumeTable(
      diaIn,
      lengthFt,
      endCap,
      diaUnit,
      heightUnit,
      volUnit,
    )
    volumeTableRows = rows
    volumeTableHeightLabel = `Liquid height (${heightUnit})`
    volumeTableVolumeLabel = `Volume (${volUnitLabel(volUnit)})`
    volumeTableExport.disabled = rows.length === 0

    if (rows.length === 0) {
      volumeTableScroll.innerHTML =
        '<p class="volume-table-empty">Enter a positive diameter and cylinder length to build the table.</p>'
      return
    }

    const body = rows
      .map(
        (row) => `
        <tr>
          <td>${formatResult(row.height, 4)}</td>
          <td>${formatResult(row.volume, 4)}</td>
        </tr>`,
      )
      .join('')

    volumeTableScroll.innerHTML = `
      <table class="volume-table">
        <caption>
          Per ${diaUnit} of diameter · ${rows.length} levels
        </caption>
        <thead>
          <tr>
            <th scope="col">${volumeTableHeightLabel}</th>
            <th scope="col">${volumeTableVolumeLabel}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `
  }

  const showVolumeTable = () => {
    volumeTableVisible = true
    volumeTableWrap.hidden = false
    // Horizontal table needs cylinder length; switch orientation so length stays visible.
    if (orientationEl.value !== 'horizontal') {
      orientationEl.value = 'horizontal'
      orientationEl.dispatchEvent(new Event('change', { bubbles: true }))
    }
    renderVolumeTable()
    volumeTableWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const hideVolumeTable = () => {
    volumeTableVisible = false
    volumeTableWrap.hidden = true
    volumeTableScroll.innerHTML = ''
    volumeTableRows = []
    volumeTableExport.disabled = true
  }

  const escapeXml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const exportVolumeTableExcel = () => {
    if (volumeTableRows.length === 0) return

    const cell = (value: string, type: 'String' | 'Number') =>
      `<Cell><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`

    const headerRow = `<Row>${cell(volumeTableHeightLabel, 'String')}${cell(volumeTableVolumeLabel, 'String')}</Row>`
    const dataRows = volumeTableRows
      .map((row) => {
        const height = Number.isFinite(row.height) ? String(row.height) : ''
        const volume = Number.isFinite(row.volume) ? String(row.volume) : ''
        return `<Row>${cell(height, 'Number')}${cell(volume, 'Number')}</Row>`
      })
      .join('')

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Volume table">
  <Table>
   ${headerRow}
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>
`

    const blob = new Blob([xml], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'tank-volume-table.xls'
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  volumeTableBtn.addEventListener('click', showVolumeTable)
  volumeTableHide.addEventListener('click', hideVolumeTable)
  volumeTableExport.addEventListener('click', exportVolumeTableExcel)

  const applyOrientationUi = () => {
    const horizontal = orientationEl.value === 'horizontal'
    const endCap = endCapEl.value as EndCapType
    lenField.hidden = !horizontal && endCap === 'flat'
  }
  applyOrientationUi()
  orientationEl.addEventListener('change', applyOrientationUi)
  endCapEl.addEventListener('change', applyOrientationUi)

  wireSolveForm(
    'pressure',
    [
      'density',
      'orientation',
      'end-cap',
      'dia',
      'len',
      'height',
      'offset',
      'head',
      'pressure',
      'vol',
      'density-unit',
      'dia-unit',
      'len-unit',
      'height-unit',
      'offset-unit',
      'head-unit',
      'pressure-unit',
      'vol-unit',
    ],
    (solveFor) => {
      const densityEl = app.querySelector<HTMLInputElement>('#density')!
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const lenEl = app.querySelector<HTMLInputElement>('#len')!
      const heightEl = app.querySelector<HTMLInputElement>('#height')!
      const offsetEl = app.querySelector<HTMLInputElement>('#offset')!
      const headEl = app.querySelector<HTMLInputElement>('#head')!
      const pressureEl = app.querySelector<HTMLInputElement>('#pressure')!
      const volEl = app.querySelector<HTMLInputElement>('#vol')!
      const densityUnit = (
        app.querySelector('#density-unit') as HTMLSelectElement
      ).value as DensityUnit
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const lenUnit = (app.querySelector('#len-unit') as HTMLSelectElement)
        .value as HeightUnit
      const heightUnit = (
        app.querySelector('#height-unit') as HTMLSelectElement
      ).value as HeightUnit
      const offsetUnit = (
        app.querySelector('#offset-unit') as HTMLSelectElement
      ).value as HeightUnit
      const headUnit = (app.querySelector('#head-unit') as HTMLSelectElement)
        .value as HeightUnit
      const pressureUnit = (
        app.querySelector('#pressure-unit') as HTMLSelectElement
      ).value as PressureUnit
      const volUnit = (app.querySelector('#vol-unit') as HTMLSelectElement)
        .value as VolUnit
      const orientation = orientationEl.value as CylinderOrientation
      const endCap = endCapEl.value as EndCapType

      const diaIn = toInches(num(diaEl), diaUnit)
      const lengthFt = toHeightFeet(num(lenEl), lenUnit)
      const diameterFt = diaIn / 12
      const offsetRaw = num(offsetEl)
      let offsetFt =
        Number.isFinite(offsetRaw) && offsetRaw > 0
          ? toHeightFeet(offsetRaw, offsetUnit)
          : 0
      // Horizontal: valve cannot sit above the top of the cylinder.
      if (
        orientation === 'horizontal' &&
        diameterFt > 0 &&
        offsetFt > diameterFt
      ) {
        offsetFt = diameterFt
        setNum(offsetEl, fromHeightFeet(offsetFt, offsetUnit))
      }
      // Max liquid height input (horizontal: diameter − offset; vertical with heads: shell + 2×head depth − offset).
      const maxHeightFt = maxCylinderLiquidHeightFt(
        orientation,
        diaIn,
        offsetFt,
        lengthFt,
        endCap,
      )

      let heightFt = toHeightFeet(num(heightEl), heightUnit)

      /** Keep the liquid-height cell from exceeding diameter − offset. */
      const clampHeightInput = () => {
        if (!Number.isFinite(maxHeightFt)) return
        if (!(heightFt > maxHeightFt)) return
        heightFt = maxHeightFt
        // Always write back so the typed value cannot stay above the max.
        if (solveFor !== 'height') {
          setNum(heightEl, fromHeightFeet(heightFt, heightUnit))
        }
      }

      if (solveFor === 'pressure') {
        clampHeightInput()
        const headFt = headAboveValveFt(heightFt, offsetFt)
        setNum(headEl, fromHeightFeet(headFt, headUnit))
        const psi = liquidPressurePsi(
          toLbPerFt3(num(densityEl), densityUnit),
          headFt,
        )
        setNum(pressureEl, fromPsi(psi, pressureUnit))
      } else if (solveFor === 'density') {
        clampHeightInput()
        const headFt = headAboveValveFt(heightFt, offsetFt)
        setNum(headEl, fromHeightFeet(headFt, headUnit))
        if (headFt <= 0) {
          densityEl.value = ''
        } else {
          const lbFt3 = liquidDensityFromPressure(
            toPsi(num(pressureEl), pressureUnit),
            headFt,
          )
          setNum(densityEl, fromLbPerFt3(lbFt3, densityUnit))
        }
      } else if (solveFor === 'vol') {
        // Volume from geometry — liquid height is the input.
        clampHeightInput()
      } else {
        // Solve for liquid height from entered volume (geometry), with
        // hydrostatic P/ρ as a fallback when volume is not usable.
        const targetBbls = toBbls(num(volEl), volUnit)
        const fromVolume = liquidHeightFromVolumeAboveOffsetFt(
          orientation,
          diaIn,
          targetBbls,
          offsetFt,
          lengthFt,
          endCap,
        )
        if (Number.isFinite(fromVolume) && Number.isFinite(targetBbls)) {
          heightFt = fromVolume
        } else {
          const headFromP = liquidHeightFromPressure(
            toPsi(num(pressureEl), pressureUnit),
            toLbPerFt3(num(densityEl), densityUnit),
          )
          heightFt = offsetFt + (headFromP > 0 ? headFromP : 0)
        }
        if (Number.isFinite(maxHeightFt) && heightFt > maxHeightFt) {
          heightFt = maxHeightFt
        }
        setNum(heightEl, fromHeightFeet(heightFt, heightUnit))
      }

      // Re-read after solve/clamp and enforce the input max once more.
      heightFt = toHeightFeet(num(heightEl), heightUnit)
      if (Number.isFinite(maxHeightFt) && heightFt > maxHeightFt) {
        heightFt = maxHeightFt
        setNum(heightEl, fromHeightFeet(heightFt, heightUnit))
      }

      const headFt = headAboveValveFt(heightFt, offsetFt)
      setNum(headEl, fromHeightFeet(headFt, headUnit))

      // Keep volume in sync unless the user is typing volume to solve height.
      if (solveFor !== 'height') {
        const bbls = cylinderVolumeAboveOffsetBbls(
          orientation,
          diaIn,
          heightFt,
          offsetFt,
          lengthFt,
          endCap,
        )
        setNum(volEl, fromBbls(bbls, volUnit))
      }

      renderVolumeTable()
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
          value: 1,
          min: '0',
          step: '0.01',
          unit: 'water = 1',
        })}
        ${field('Liquid rate', {
          id: 'qL',
          value: 500,
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
          value: 2000,
          min: '0',
          step: '0.01',
          unitOptions: [
            { value: 'MCFD', label: 'MCFD' },
            { value: 'MMCFD', label: 'MMCFD' },
            { value: 'M3/Day', label: 'm³/Day' },
          ],
          unitId: 'qG-unit',
          unitValue: 'MCFD',
        })}
        ${field('Pipe ID', {
          id: 'dia',
          value: 2.441,
          min: '0',
          unitOptions: [
            { value: 'in', label: 'in' },
            { value: 'mm', label: 'mm' },
          ],
          unitId: 'dia-unit',
          unitValue: 'in',
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
          value: 0.9,
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
        ${field('Liquid superficial velocity', {
          id: 'vsl',
          value: '',
          unitOptions: [
            { value: 'ft/sec', label: 'ft/sec' },
            { value: 'm/sec', label: 'm/sec' },
          ],
          unitId: 'vsl-unit',
          unitValue: 'ft/sec',
          solved: true,
        })}
        ${field('Gas superficial velocity', {
          id: 'vsg',
          value: '',
          unitOptions: [
            { value: 'ft/sec', label: 'ft/sec' },
            { value: 'm/sec', label: 'm/sec' },
          ],
          unitId: 'vsg-unit',
          unitValue: 'ft/sec',
          solved: true,
        })}
        ${field('Mixture velocity', {
          id: 'vm',
          value: '',
          unitOptions: [
            { value: 'ft/sec', label: 'ft/sec' },
            { value: 'm/sec', label: 'm/sec' },
          ],
          unitId: 'vm-unit',
          unitValue: 'ft/sec',
          solved: true,
        })}
      </form>
    `,
    true,
    'API RP 14E two-phase limit — enter conditions to compute V<sub>e</sub> and superficial velocities',
  )
  wireBack()

  const cEl = app.querySelector<HTMLInputElement>('#c')!
  const cPreset = app.querySelector<HTMLSelectElement>('#c-preset')!

  cPreset.addEventListener('change', () => {
    cEl.value = cPreset.value
    cEl.dispatchEvent(new Event('input', { bubbles: true }))
  })

  wireLiveForm(
    [
      'sL',
      'qL',
      'sG',
      'qG',
      'qG-unit',
      'dia',
      'dia-unit',
      'psia',
      'tempF',
      'z',
      'c',
      've-unit',
      'vsl-unit',
      'vsg-unit',
      'vm-unit',
    ],
    () => {
      const sL = num(app.querySelector<HTMLInputElement>('#sL')!)
      const qL = num(app.querySelector<HTMLInputElement>('#qL')!)
      const sG = num(app.querySelector<HTMLInputElement>('#sG')!)
      const qGEl = app.querySelector<HTMLInputElement>('#qG')!
      const diaEl = app.querySelector<HTMLInputElement>('#dia')!
      const psia = num(app.querySelector<HTMLInputElement>('#psia')!)
      const tempF = num(app.querySelector<HTMLInputElement>('#tempF')!)
      const z = num(app.querySelector<HTMLInputElement>('#z')!)
      const c = num(cEl)
      const qGUnit = (app.querySelector('#qG-unit') as HTMLSelectElement)
        .value as GasRateUnit
      const diaUnit = (app.querySelector('#dia-unit') as HTMLSelectElement)
        .value as DiaUnit
      const veUnit = (app.querySelector('#ve-unit') as HTMLSelectElement)
        .value as VelUnit
      const vslUnit = (app.querySelector('#vsl-unit') as HTMLSelectElement)
        .value as VelUnit
      const vsgUnit = (app.querySelector('#vsg-unit') as HTMLSelectElement)
        .value as VelUnit
      const vmUnit = (app.querySelector('#vm-unit') as HTMLSelectElement)
        .value as VelUnit

      const glrEl = app.querySelector<HTMLInputElement>('#glr')!
      const densityEl = app.querySelector<HTMLInputElement>('#density')!
      const veEl = app.querySelector<HTMLInputElement>('#ve')!
      const vslEl = app.querySelector<HTMLInputElement>('#vsl')!
      const vsgEl = app.querySelector<HTMLInputElement>('#vsg')!
      const vmEl = app.querySelector<HTMLInputElement>('#vm')!

      try {
        const qGMmscfd = toMcfd(num(qGEl), qGUnit) / 1000
        const diameterIn = toInches(num(diaEl), diaUnit)
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
          diameterIn,
        )
        setNum(glrEl, result.gasLiquidRatioScfPerBbl)
        setNum(densityEl, result.mixtureDensityLbPerFt3)
        setNum(veEl, fromFps(result.erosionalVelocityFtPerSec, veUnit))
        setNum(
          vslEl,
          fromFps(result.liquidSuperficialVelocityFtPerSec!, vslUnit),
        )
        setNum(
          vsgEl,
          fromFps(result.gasSuperficialVelocityFtPerSec!, vsgUnit),
        )
        setNum(vmEl, fromFps(result.mixtureVelocityFtPerSec!, vmUnit))
      } catch {
        glrEl.value = ''
        densityEl.value = ''
        veEl.value = ''
        vslEl.value = ''
        vsgEl.value = ''
        vmEl.value = ''
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
        ${field('Pipe ID', {
          id: 'tubing-id',
          value: 3,
          min: '0',
          step: '0.01',
          unit: 'in',
          help: 'Inside diameter of the pipe the fluids flow through.',
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
          value: 2000,
          min: '0',
          step: '0.01',
          unitOptions: [
            { value: 'MMCFD', label: 'MMCFD' },
            { value: 'MCFD', label: 'MCFD' },
            { value: 'ft3/s', label: 'ft³/s' },
          ],
          unitId: 'gas-rate-unit',
          unitValue: 'MCFD',
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
          unitOptions: [
            { value: 'lbs/cuft', label: 'lbs/cuft' },
            { value: 'lbs/gal', label: 'lbs/gal' },
            { value: 'gm/mL', label: 'gm/mL' },
          ],
          unitId: 'rho-l-unit',
          unitValue: 'lbs/cuft',
          help: 'Mass per unit volume of the liquid phase. Choose lbs/cuft, lbs/gal, or gm/mL.',
        })}
        ${field('Gas density', {
          id: 'rho-g',
          value: 3,
          min: '0',
          step: '0.01',
          unitOptions: [
            { value: 'lbm/ft3', label: 'lbm/ft³' },
            { value: 'sg', label: 'air = 1' },
          ],
          unitId: 'rho-g-unit',
          unitValue: 'lbm/ft3',
          help: 'In-situ mass per unit volume of the gas phase, or specific gravity relative to air. Gravity (air = 1) is converted to in-situ density using pressure, temperature, and Z.',
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
      'rho-l-unit',
      'rho-g',
      'rho-g-unit',
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

      try {
        const liquidDensityUnit = (
          app.querySelector('#rho-l-unit') as HTMLSelectElement
        ).value as DensityUnit
        const gasDensityUnit = (
          app.querySelector('#rho-g-unit') as HTMLSelectElement
        ).value as GasDensityUnit
        const inputs: WellInputs = {
          tubingIdIn,
          liquidRateFt3PerS: bblPerDayToFt3PerS(liqBblDay),
          gasRateFt3PerS,
          liquidDensityLbmFt3: toLbPerFt3(
            num(app.querySelector<HTMLInputElement>('#rho-l')!),
            liquidDensityUnit,
          ),
          gasDensityLbmFt3: toGasDensityLbPerFt3(
            num(app.querySelector<HTMLInputElement>('#rho-g')!),
            gasDensityUnit,
            psia,
            tempF,
            zFactor,
          ),
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
    case 'tank-volume':
      renderTankVolume()
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
  let hash = location.hash.replace(/^#/, '')
  if (hash === 'liquid-pressure') hash = 'tank-volume'
  const known = CALCS.some((c) => c.id === hash)
  navigate(known ? (hash as CalcId) : 'home')
}

window.addEventListener('hashchange', routeFromHash)
routeFromHash()
