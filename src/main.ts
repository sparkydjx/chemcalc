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
  formatResult,
  type RateUnit,
  type DiaUnit,
  type LenUnit,
  type VolUnit,
  type VelUnit,
  type GasRateUnit,
} from './calculations'

type CalcId =
  | 'home'
  | 'dosage'
  | 'displacement'
  | 'liquid-velocity'
  | 'gas-velocity'
  | 'ion-lbs'

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
]

const app = document.querySelector<HTMLDivElement>('#app')!

function num(el: HTMLInputElement): number {
  const v = el.valueAsNumber
  return Number.isFinite(v) ? v : NaN
}

function setNum(el: HTMLInputElement, value: number): void {
  el.value = formatResult(value) === '—' ? '' : formatResult(value)
}

type FieldOpts = {
  id: string
  value: number | string
  step?: string
  min?: string
  unit?: string
  unitOptions?: { value: string; label: string }[]
  unitId?: string
  unitValue?: string
  /** Variable key for solve-for; omit to hide checkbox. */
  solveKey?: string
  solved?: boolean
}

function field(label: string, opts: FieldOpts): string {
  let unitHtml = ''
  if (opts.unitOptions && opts.unitId) {
    unitHtml = `<select id="${opts.unitId}" aria-label="${label} units">
          ${opts.unitOptions
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
        <span class="field-label">${label}</span>
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

function shell(title: string, body: string, showBack: boolean): string {
  return `
    <main class="shell">
      <header class="brand">
        ${showBack ? `<button type="button" class="back" id="back" aria-label="Back to calculators">←</button>` : ''}
        <div class="brand-text">
          <h1>${showBack ? title : 'ChemCalc'}</h1>
          ${showBack ? '<p class="hint">Check <strong>Solve</strong> next to the variable you want to find</p>' : '<p>Oilfield chemistry &amp; line calculations</p>'}
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
            { value: 'Gals/Min', label: 'Gals/Min' },
            { value: 'Gals/Hr', label: 'Gals/Hr' },
            { value: 'Gals/Day', label: 'Gals/Day' },
            { value: 'L/Day', label: 'L/Day' },
            { value: 'L/Hr', label: 'L/Hr' },
            { value: 'Qts/Day', label: 'Qts/Day' },
            { value: 'Qts/Hr', label: 'Qts/Hr' },
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
            { value: 'miles', label: 'miles' },
            { value: 'km', label: 'km' },
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
            { value: 'm3', label: 'm³' },
            { value: 'Gals', label: 'Gals' },
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
