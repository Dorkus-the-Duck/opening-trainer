import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  target: 'chrome130',
  outdir: 'dist',
  sourcemap: true,
  loader: { '.svg': 'dataurl', '.png': 'dataurl' },
  logLevel: 'info',
});
if (watch) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
