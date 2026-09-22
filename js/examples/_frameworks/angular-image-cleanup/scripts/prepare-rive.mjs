import { build } from 'esbuild';
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const output = path.join(root, 'public/runtime');
const advanced = require.resolve('@rive-app/webgl2-advanced');
const published = require.resolve('@rive-app/webgl2');
const revisions = {
  baseline: '6286634f339fb991e347a1122dfc9c609fdc16c1',
  fixed: '6b5f04373d593b580fa899aa58f1c9a216e4745e',
};
const sourceFiles = [
  'rive.ts',
  'runtimeLoader.ts',
  'semantics/index.ts',
  'semantics/types.ts',
  'semantics/accessibilityOverlay.ts',
  'semantics/semanticTreeModel.ts',
  'utils/index.ts',
  'utils/riveFont.ts',
  'utils/registerKeyboardInteractions.ts',
  'utils/finalizationRegistry.ts',
  'utils/sanitizeUrl.ts',
  'utils/registerTouchInteractions.ts',
  'animation/index.ts',
  'animation/Animation.ts',
];

async function download(url, destination) {
  try {
    await access(destination);
    return;
  } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

await mkdir(output, { recursive: true });
await copyFile(published, path.join(output, 'published.js'));
await copyFile(
  path.join(path.dirname(published), 'rive.wasm'),
  path.join(output, 'published.wasm'),
);
await copyFile(path.join(path.dirname(advanced), 'rive.wasm'), path.join(output, 'source.wasm'));
await download(
  `https://raw.githubusercontent.com/rive-app/rive-wasm/${revisions.baseline}/js/test/assets/embedded_png_asset.riv`,
  path.join(output, 'image.riv'),
);

for (const [name, revision] of Object.entries(revisions)) {
  const directory = path.join(root, '.cache/rive', revision);
  await download(
    `https://raw.githubusercontent.com/MaximeSarratoBetclic/rive-wasm/${revision}/js/package.json`,
    path.join(directory, 'package.json'),
  );
  await Promise.all(
    sourceFiles.map((file) =>
      download(
        `https://raw.githubusercontent.com/MaximeSarratoBetclic/rive-wasm/${revision}/js/src/${file}`,
        path.join(directory, file),
      ),
    ),
  );
  await build({
    entryPoints: [path.join(directory, 'rive.ts')],
    outfile: path.join(output, `${name}.js`),
    bundle: true,
    format: 'iife',
    globalName: 'rive',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    external: ['fs', 'path', 'module'],
    plugins: [
      {
        name: 'published-native-runtime',
        setup(builder) {
          builder.onResolve({ filter: /rive_advanced\.mjs$/ }, () => ({ path: advanced }));
          builder.onResolve({ filter: /^package\.json$/ }, () => ({
            path: path.join(directory, 'package.json'),
          }));
        },
      },
    ],
  });
  console.log(`${name}: ${revision}, native runtime 2.42.2`);
}
