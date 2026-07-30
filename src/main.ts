import './style.css'
import {
  dosageRate,
  displacementBbls,
  liquidVelocityFps,
  gasVelocityFps,
  ionLbsPerDay,
  toInches,
  toFeet,
  fromBbls,
  fromFps,
  toMcfd,
  formatResult,
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
    blurb: 'Target PPM and barrels/day → chemical feed rate',
  },
  {
    id: 'displacement',
    title: 'Line Displacement Volume',
    blurb: 'Pipe diameter and length → displacement volume',
  },
  {
    id: 'liquid-velocity',
    title: 'Liquid Velocity',
    blurb: 'Barrels/day and diameter → line velocity',
  },
  {
    id: 'gas-velocity',
    title: 'Gas Velocity',
    blurb: 'Gas rate, diameter, and pressure → velocity',
  },
  {
    id: 'ion-lbs',
    title: 'mg/L to Lbs/Day',
    blurb: 'Ion concentration and volume → pounds per day',
  },
]

const app = document.querySelector<HTMLDivElement>('#app')!

function num(el: HTMLInputElement): number {
  const v = el.valueAsNumber
  return Number.isFinite(v) ? v : NaN
}

function field(
  label: string,
  opts: {
    id: string
    value: number | string
    step?: string
    min?: string
    unit?: string
    unitOptions?: { value: string; label: string }[]
    unitId?: string
    unitValue?: string
  },
): string {
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

  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <span class="field-controls">
        <input
          id="${opts.id}"
          type="number"
          inputmode="decimal"
          value="${opts.value}"
          step="${opts.step ?? 'any'}"
          ${opts.min !== undefined ? `min="${opts.min}"` : ''}
        />
        ${unitHtml}
      </span>
    </label>
  `
}

function resultBlock(id: string, label: string, unitSelectHtml = ''): string {
  return `
    <div class="result" role="status" aria-live="polite">
      <span class="result-label">${label}</span>
      <span class="result-row">
        <output id="${id}" class="result-value">—</output>
        ${unitSelectHtml}
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
          ${showBack ? '' : '<p>Oilfield chemistry &amp; line calculations</p>'}
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

function onInputs(ids: string[], update: () => void): void {
  for (const id of ids) {
    const el = app.querySelector(`#${id}`)
    el?.addEventListener('input', update)
    el?.addEventListener('change', update)
  }
  update()
}

function renderDosage(): void {
  app.innerHTML = shell(
    'Dosage Calculation',
    `
      <form class="calc-form" id="form">
        ${field('Target PPM', { id: 'ppm', value: 238, min: '0', unit: 'PPM' })}
        ${field('Volume', {
          id: 'bbls',
          value: 144000,
          min: '0',
          unit: 'Bbls/Day',
        })}
        ${resultBlock(
          'out',
          'Chemical rate',
          `<select id="out-unit" aria-label="Output units">
            <option value="Gals/Min" selected>Gals/Min</option>
            <option value="Gals/Hr">Gals/Hr</option>
            <option value="Gals/Day">Gals/Day</option>
          </select>`,
        )}
      </form>
    `,
    true,
  )
  wireBack()
  onInputs(['ppm', 'bbls', 'out-unit'], () => {
    const ppm = num(app.querySelector('#ppm')!)
    const bbls = num(app.querySelector('#bbls')!)
    const outUnit = (app.querySelector('#out-unit') as HTMLSelectElement).value as
      | 'Gals/Day'
      | 'Gals/Hr'
      | 'Gals/Min'
    const out = app.querySelector('#out')!
    out.textContent = formatResult(dosageRate(ppm, bbls, outUnit))
  })
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
        })}
        ${resultBlock(
          'out',
          'Displacement volume',
          `<select id="out-unit" aria-label="Output units">
            <option value="Bbls" selected>Bbls</option>
            <option value="m3">m³</option>
            <option value="Gals">Gals</option>
          </select>`,
        )}
      </form>
    `,
    true,
  )
  wireBack()
  onInputs(['dia', 'len', 'dia-unit', 'len-unit', 'out-unit'], () => {
    const diaIn = toInches(
      num(app.querySelector('#dia')!),
      (app.querySelector('#dia-unit') as HTMLSelectElement).value as 'in' | 'mm',
    )
    const lenFt = toFeet(
      num(app.querySelector('#len')!),
      (app.querySelector('#len-unit') as HTMLSelectElement).value as
        | 'ft'
        | 'miles'
        | 'km',
    )
    const outUnit = (app.querySelector('#out-unit') as HTMLSelectElement)
      .value as 'Bbls' | 'm3' | 'Gals'
    const bbls = displacementBbls(diaIn, lenFt)
    app.querySelector('#out')!.textContent = formatResult(fromBbls(bbls, outUnit))
  })
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
          unit: 'Bbls/Day',
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
        })}
        ${resultBlock(
          'out',
          'Velocity',
          `<select id="out-unit" aria-label="Output units">
            <option value="ft/sec" selected>ft/sec</option>
            <option value="m/sec">m/sec</option>
          </select>`,
        )}
      </form>
    `,
    true,
  )
  wireBack()
  onInputs(['rate', 'dia', 'dia-unit', 'out-unit'], () => {
    const rate = num(app.querySelector('#rate')!)
    const diaIn = toInches(
      num(app.querySelector('#dia')!),
      (app.querySelector('#dia-unit') as HTMLSelectElement).value as 'in' | 'mm',
    )
    const outUnit = (app.querySelector('#out-unit') as HTMLSelectElement)
      .value as 'ft/sec' | 'm/sec'
    const fps = liquidVelocityFps(rate, diaIn)
    app.querySelector('#out')!.textContent = formatResult(fromFps(fps, outUnit))
  })
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
        })}
        ${field('Line pressure', {
          id: 'psig',
          value: 105.3,
          min: '0',
          unit: 'psig',
        })}
        ${resultBlock(
          'out',
          'Velocity',
          `<select id="out-unit" aria-label="Output units">
            <option value="ft/sec" selected>ft/sec</option>
            <option value="m/sec">m/sec</option>
          </select>`,
        )}
      </form>
    `,
    true,
  )
  wireBack()
  onInputs(['rate', 'rate-unit', 'dia', 'dia-unit', 'psig', 'out-unit'], () => {
    const mcfd = toMcfd(
      num(app.querySelector('#rate')!),
      (app.querySelector('#rate-unit') as HTMLSelectElement).value as
        | 'MCFD'
        | 'MMCFD'
        | 'M3/Day',
    )
    const diaIn = toInches(
      num(app.querySelector('#dia')!),
      (app.querySelector('#dia-unit') as HTMLSelectElement).value as 'in' | 'mm',
    )
    const psig = num(app.querySelector('#psig')!)
    const outUnit = (app.querySelector('#out-unit') as HTMLSelectElement)
      .value as 'ft/sec' | 'm/sec'
    const fps = gasVelocityFps(mcfd, diaIn, psig)
    app.querySelector('#out')!.textContent = formatResult(fromFps(fps, outUnit))
  })
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
        })}
        ${field('Volume', {
          id: 'vol',
          value: 2000,
          min: '0',
          unit: 'Bbls/Day',
        })}
        ${resultBlock('out', 'Ion mass rate', `<span class="unit-static">Lbs/Day</span>`)}
      </form>
    `,
    true,
  )
  wireBack()
  onInputs(['mgL', 'vol'], () => {
    const mgL = num(app.querySelector('#mgL')!)
    const vol = num(app.querySelector('#vol')!)
    app.querySelector('#out')!.textContent = formatResult(ionLbsPerDay(mgL, vol))
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
