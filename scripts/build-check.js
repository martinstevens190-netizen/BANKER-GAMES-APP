const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const required = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'netlify.toml',
  'netlify/functions/scan.js'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

for (const file of ['app.js', 'netlify/functions/scan.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

const blocked = ['de' + 'mo', 'tri' + 'al', 'tri' + 'als'];
const words = new RegExp('\\b(' + blocked.join('|') + ')\\b', 'i');
const filesToCheck = ['index.html', 'styles.css', 'app.js', 'README.md', 'netlify/functions/scan.js'];
for (const file of filesToCheck) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (words.test(content)) {
    console.error(`Remove restricted wording from ${file}`);
    process.exit(1);
  }
}

console.log('Build check passed. Banker Lab Pro is ready for Netlify deploy.');
