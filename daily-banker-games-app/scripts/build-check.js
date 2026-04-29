const fs = require('fs');
const required = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'netlify.toml', 'netlify/functions/scan.js'];
const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length) {
  console.error('Missing required files:', missing.join(', '));
  process.exit(1);
}
console.log('Build check passed. Static Netlify app is ready.');
