# ChemCalc

Progressive Web App chemistry calculator. Installable, works offline after first visit.

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Create a GitHub repo named `chemcalc` (or update `BASE_PATH` in the workflow to match).
2. Push this project to `main`.
3. In the repo: **Settings → Pages → Source → GitHub Actions**.
4. The workflow builds with `BASE_PATH=/chemcalc/` and publishes `dist`.

For a user/org site (`username.github.io`), set `BASE_PATH=/` in `.github/workflows/deploy.yml`.

## PWA notes

- Manifest and service worker are managed by [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/).
- Icons live in `public/icons/` — regenerate with `npm run icons`.
- Install from the browser (Chrome/Edge: install icon in the address bar; iOS Safari: Share → Add to Home Screen).

## Troubleshooting (Windows on ARM)

If `npm run build` fails looking for `@rollup/rollup-win32-arm64-msvc`:

```powershell
$env:npm_config_arch='arm64'; npm install -D @rollup/rollup-win32-arm64-msvc --force
```
