async function build() {
  const { packager } = await import('@electron/packager');
  const { version } = require('../package.json');
  const outputs = await packager({ dir: '.', name: 'QuadFinder', platform: 'win32', arch: 'x64', out: `release/${version}`, overwrite: true, asar: true, prune: false,
    // The app has no production dependencies. Do not copy pnpm's development symlink graph.
    ignore: [/^\/(node_modules|tests|docs|scripts|output|release|\.git|\.github)(\/|$)/],
    appCopyright: 'QuadFinder contributors' });
  console.log(outputs.join('\n'));
}
build().catch(error => { console.error(error); process.exitCode = 1; });
