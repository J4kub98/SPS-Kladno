#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const diagramsDir = path.join(process.cwd(), 'docs', 'diagrams');
const outFormat = (process.argv[2] || 'svg').toLowerCase(); // svg | png
const outDir = path.join(diagramsDir, outFormat);

if (!fs.existsSync(diagramsDir)) {
  console.error(`Diagrams folder not found: ${diagramsDir}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(diagramsDir).filter(f => f.endsWith('.mmd'));
if (files.length === 0) {
  console.log('No .mmd files found to export.');
  process.exit(0);
}

const mmdcBin = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc'
);

(async () => {
  for (const f of files) {
    const inFile = path.join(diagramsDir, f);
    const base = path.basename(f, '.mmd');
    const outFile = path.join(outDir, `${base}.${outFormat}`);

    console.log(`Exporting ${f} -> ${path.relative(process.cwd(), outFile)}`);

    await new Promise((resolve, reject) => {
      const cmd = `"${mmdcBin}" -i "${inFile}" -o "${outFile}" -e ${outFormat} -w 1200 --scale 1`;
      const cp = spawn(cmd, { stdio: 'inherit', shell: true });
      cp.on('exit', code => code === 0 ? resolve() : reject(new Error(`mmdc exit code ${code}`)));
    });
  }
  console.log(`Done. Exported ${files.length} diagram(s) to ${path.relative(process.cwd(), outDir)}.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
