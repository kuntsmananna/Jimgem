/**
 * Renders the home-screen icons from `public/gems-logo.svg`.
 *
 * Run by hand — `node scripts/make-icons.mjs` — after the mark itself
 * changes, which is roughly never; the four PNGs are committed so a build
 * needs neither a browser nor an image library. It uses the Playwright
 * Chromium the project already has rather than adding `sharp`, whose
 * native binary is a dependency this app would carry for one file.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const CREAM = '#F4EBE7';
/*
 * The mark is inlined rather than loaded as an `<img src="file://…">`:
 * `setContent` leaves the page on `about:blank`, from which a file://
 * subresource is blocked, and the first run of this silently produced four
 * cream squares with a broken-image glyph in them.
 */
const LOGO = readFileSync('/home/user/Jimgem/public/gems-logo.svg', 'utf8').replace(/<\?xml[^>]*\?>/, '');
const OUT = '/home/user/Jimgem/public';
mkdirSync(`${OUT}/icons`, { recursive: true });

/*
 * The mark is 759.83 × 548.81 — wide, not square. A maskable icon's
 * guaranteed area is the inner 80% *circle*, and a 1.385:1 mark only fits
 * one at 0.649 of the canvas (its diagonal is 1.233 × its width), so the
 * maskable draws at 0.60 and the plain ones at 0.76.
 */
const ICONS = [
  { file: `${OUT}/icons/icon-192.png`, size: 192, scale: 0.76 },
  { file: `${OUT}/icons/icon-512.png`, size: 512, scale: 0.76 },
  { file: `${OUT}/icons/icon-512-maskable.png`, size: 512, scale: 0.60 },
  { file: `${OUT}/apple-touch-icon.png`, size: 180, scale: 0.72 },
];

/*
 * `executablePath` only when something names one: PLAYWRIGHT_BROWSERS_PATH
 * is set in the dev sandbox and Playwright finds its own browser from it,
 * while a hardcoded path made this the one file in the repo that could not
 * run on anyone else's checkout.
 */
const b = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
for (const { file, size, scale } of ICONS) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%}
    body{background:${CREAM};display:flex;align-items:center;justify-content:center}
    svg{width:${Math.round(size * scale)}px;height:auto;display:block}
  </style></head><body>${LOGO}</body></html>`);
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(120);
  await p.screenshot({ path: file, omitBackground: false });
  await p.close();
  console.log('wrote', file, size, 'mark', Math.round(size * scale));
}
await b.close();
