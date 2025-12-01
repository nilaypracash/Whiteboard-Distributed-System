const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['public/main.js'],
  bundle: true,
  outfile: 'public/bundle.js',
  format: 'esm',
  minify: false
}).catch(() => process.exit(1));
