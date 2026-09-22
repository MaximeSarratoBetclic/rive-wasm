import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const distribution = path.join(root, 'dist/angular-image-cleanup/browser');
const repeats = Number(process.env.RIVE_TEST_REPEATS || 3);
const errorMessage = "Cannot read properties of undefined (reading 'deleteTexture')";
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.riv': 'application/octet-stream',
};

await readFile(path.join(distribution, 'index.html'));
assert.ok(Number.isInteger(repeats) && repeats > 0);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(
      distribution,
      `.${url.pathname === '/' ? '/index.html' : url.pathname}`,
    );
    if (!file.startsWith(`${distribution}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
let browser;

async function confirmVisibleImage(page, screenshot) {
  const redPixels = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === 255 && pixels[index + 1] === 0 && pixels[index + 2] === 0) count++;
      }
      bitmap.close();
      return count;
    },
    [...screenshot],
  );
  assert.ok(redPixels > 100, 'The assigned image must remain visible after unref');
}

async function collectImage(page, session, expectedCount) {
  for (let attempt = 0; attempt < 10; attempt++) {
    await session.send('HeapProfiler.collectGarbage');
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const count = Number(await page.getByTestId('collected').textContent());
    if (count === expectedCount) return;
  }
  assert.fail('The image wrapper was not collected; the result is inconclusive');
}

try {
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  let expectedPixels;
  for (const variant of ['published', 'baseline', 'fixed']) {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.addInitScript(() => {
      window.browserErrors = [];
      window.addEventListener('error', (event) => {
        window.browserErrors.push(event.error?.message ?? event.message);
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.browserErrors.push(
          event.reason instanceof Error ? event.reason.message : String(event.reason),
        );
      });
    });
    await page.goto(`http://127.0.0.1:${address.port}/?runtime=${variant}#/animation`);
    const session = await page.context().newCDPSession(page);
    for (let iteration = 1; iteration <= repeats; iteration++) {
      const directory = path.join(root, 'test-results', variant, String(iteration));
      await mkdir(directory, { recursive: true });
      await page.getByRole('link', { name: 'Navigate away', exact: true }).waitFor();
      const screenshot = await page
        .locator('canvas')
        .screenshot({ path: path.join(directory, 'before-navigation.png') });
      await confirmVisibleImage(page, screenshot);
      expectedPixels ??= screenshot;
      assert.deepEqual(
        screenshot,
        expectedPixels,
        'Every version and remount must render the same image',
      );
      await page.getByRole('link', { name: 'Navigate away', exact: true }).click();
      await page.getByText('Renderer destroyed — waiting for GC', { exact: true }).waitFor();
      assert.equal(
        await page.locator('canvas').count(),
        0,
        'Angular must remove the animation canvas',
      );
      await collectImage(page, session, iteration);
      for (let pass = 0; pass < 2; pass++) {
        await session.send('HeapProfiler.collectGarbage');
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await page.screenshot({
        path: path.join(directory, 'after-navigation-and-gc.png'),
        fullPage: true,
      });
      const expectedErrors = variant === 'fixed' ? [] : Array(iteration).fill(errorMessage);
      const errors = await page.evaluate(() => window.browserErrors);
      assert.deepEqual(
        errors,
        expectedErrors,
        `${variant}: browser errors after Angular destruction and GC`,
      );
      assert.equal(
        Number(await page.getByTestId('error-count').textContent()),
        expectedErrors.length,
      );
      const nativeImageCount = await page.evaluate(
        async () => (await window.rive.RuntimeLoader.awaitInstance()).images.size,
      );
      assert.equal(nativeImageCount, 0, 'The native image must be released');
      if (iteration < repeats)
        await page.getByRole('link', { name: 'Back to animation', exact: true }).click();
    }
    console.log(
      `PASS ${variant}: ${repeats}/${repeats} Angular navigation cycles; ${await page.getByTestId('error-count').textContent()} expected deleteTexture errors`,
    );
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
