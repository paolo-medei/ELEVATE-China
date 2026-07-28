/**
 * Bundles the built app into one self-contained .html file.
 *
 * Everything — CSS, JavaScript, the simulated season, the map — is inlined, so the
 * result opens by double-clicking it in any browser, offline, with no server and no
 * install. Run `npm run standalone` after `npm run build`.
 */
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist/assets');
const out = path.resolve('FarmersWingman.html');

if (!fs.existsSync(dist)) {
  console.error('dist/assets not found — run `npm run build` first.');
  process.exit(1);
}

const files = fs.readdirSync(dist);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
if (!js || !css) {
  console.error('Could not find the built bundle in dist/assets.');
  process.exit(1);
}

const script = fs.readFileSync(path.join(dist, js), 'utf8');
if (/<\/script/i.test(script)) {
  console.error('The bundle contains a closing script tag and cannot be inlined safely.');
  process.exit(1);
}

// a tiny inline favicon so the tab has an icon without a second file
const favicon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#2a78d6"/>' +
      '<circle cx="16" cy="16" r="6" fill="none" stroke="#fff" stroke-width="2.5"/>' +
      '<circle cx="16" cy="16" r="2" fill="#fff"/></svg>',
  );

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Farmers' Wingman · Assy Plateau</title>
<meta name="description" content="Drone herd monitoring demo for the Assy Plateau summer pasture." />
<link rel="icon" href="${favicon}" />
<style>
${fs.readFileSync(path.join(dist, css), 'utf8')}
</style>
</head>
<body>
<div id="root"></div>
<script>
/* Last resort: an error while the module is still being evaluated happens before any of
   the app's own handlers exist, and would otherwise leave nothing but a white page. */
(function () {
  var shown = false;
  function show(what) {
    if (shown) return;
    var root = document.getElementById('root');
    if (!root || root.childElementCount > 0) return;
    shown = true;
    root.innerHTML =
      '<div style="max-width:34rem;margin:12vh auto;padding:0 1.5rem;font:15px/1.6 system-ui,sans-serif;color:#ddd">' +
      '<h1 style="font-size:1.15rem;margin:0 0 .6rem">Farmers&rsquo; Wingman could not start</h1>' +
      '<p style="margin:0 0 .8rem">Try reloading. If it keeps happening, this browser may be blocking site data for this page.</p>' +
      '<pre style="white-space:pre-wrap;font-size:12px;opacity:.6;margin:0">' + what + '</pre></div>';
  }
  addEventListener('error', function (e) { show(e.message || String(e.error)); });
  addEventListener('unhandledrejection', function (e) { show(String(e.reason)); });
  addEventListener('load', function () { setTimeout(function () { show('The page loaded but nothing was drawn.'); }, 8000); });
})();
</script>
<script type="module">
${script}
</script>
</body>
</html>
`;

fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)} — ${(html.length / 1024).toFixed(0)} KB, opens offline in any browser`);

// the app and the data it reads travel together: farm.json sits beside the .html so a
// grazier can open one, edit the other, and load it straight back in
const db = fs.readFileSync(path.resolve('src/data/farm.json'), 'utf8');
fs.writeFileSync(path.resolve('farm.json'), db);
console.log(`farm.json — ${(db.length / 1024).toFixed(0)} KB, the input database the app reads`);

/*
 * docs/ is what GitHub Pages serves. The same single file, named index.html so the site
 * root opens straight into the app, with the data files beside it to download. .nojekyll
 * stops Pages running the files through Jekyll.
 */
const docs = path.resolve('docs');
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, 'index.html'), html);
fs.writeFileSync(path.join(docs, '.nojekyll'), '');
fs.writeFileSync(path.join(docs, 'farm.json'), db);
for (const extra of ['farm-data.xlsx']) {
  if (fs.existsSync(path.resolve(extra))) fs.copyFileSync(path.resolve(extra), path.join(docs, extra));
}
console.log('docs/ — the same app, ready for GitHub Pages');
console.log('run `npm run make-xlsx` to refresh farm-data.xlsx, the Excel view of it');
