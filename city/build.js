// Joins the compiled sources, in tsconfig order, into one classic script (city.js) so the page can
// load it with a plain <script> tag, from file:// as well as GitHub Pages, with no bundler.
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const parts = cfg.files.filter(f => !f.endsWith('.d.ts')).map(f => {
  const js = path.join(__dirname, 'build', path.basename(f).replace(/\.ts$/, '.js'));
  return `// ---- ${path.basename(f)} ----\n` + fs.readFileSync(js, 'utf8').replace(/^"use strict";\n/, '');
});
const out = `/* Last Boat to Calder: City. Generated from city/src/*.ts by \`npm run build:city\`; edit the TypeScript, not this file. */\n(function () {\n"use strict";\nif (typeof THREE === "undefined") { document.documentElement.classList.add("no3d"); return; }\n${parts.join('\n')}\n})();\n`;
fs.writeFileSync(path.join(__dirname, 'city.js'), out);
console.log(`city.js: ${(out.length / 1024).toFixed(1)} KB from ${parts.length} files`);
