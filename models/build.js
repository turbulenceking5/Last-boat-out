// Joins the compiled sources, in tsconfig order, into one classic script so the game can load it
// with a plain <script> tag (works from file:// as well as GitHub Pages, no bundler needed).
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const parts = cfg.files.filter(f => !f.endsWith('.d.ts')).map(f => {
  const js = path.join(__dirname, 'build', path.basename(f).replace(/\.ts$/, '.js'));
  return `// ---- ${path.basename(f)} ----\n` + fs.readFileSync(js, 'utf8').replace(/^"use strict";\n/, '');
});
const out = `/* Last Boat to Calder: 3D place models. Generated from models/src/*.ts by \`npm run build:models\`; edit the TypeScript, not this file. */\n(function () {\n"use strict";\nif (typeof THREE === "undefined") return; // the CDN was unreachable: no 3D view, the game is unaffected\n${parts.join('\n')}\n})();\n`;
fs.writeFileSync(path.join(__dirname, 'models.js'), out);
console.log(`models.js: ${(out.length / 1024).toFixed(1)} KB from ${parts.length} files`);
