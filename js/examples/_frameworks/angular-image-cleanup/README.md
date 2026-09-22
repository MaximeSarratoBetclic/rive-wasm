# Angular / Rive image cleanup reproduction

[Open in StackBlitz](https://stackblitz.com/github/MaximeSarratoBetclic/rive-wasm/tree/codex/angular-image-cleanup-repro/js/examples/_frameworks/angular-image-cleanup?file=src/app/rive-page/rive-page.component.ts)

This standalone Angular 22 example exercises real router navigation and `ngOnDestroy` with a direct WebGL2 renderer (`useOffscreenRenderer: false`). It complements [rive-wasm PR #428](https://github.com/rive-app/rive-wasm/pull/428).

## Manual reproduction

1. Start with **Published 2.42.0** or **Unpatched sources**.
2. Wait for the red image, then select **Navigate away**.
3. In Chrome DevTools, select **Memory → Collect garbage**. On StackBlitz, open the preview in a separate tab first, then inspect that tab.
4. Confirm that **Collected wrappers** increased. The error list should show `Cannot read properties of undefined (reading 'deleteTexture')`.
5. Select **PR #428 fix**, which reloads the page, and repeat. The image should render identically and collection should complete with no error.

A browser page cannot force garbage collection. Zero errors before the collection counter increases is inconclusive. DevTools or the automated test below provides a quick, controlled trigger. Avoid inspecting the image wrapper in the console: DevTools can retain inspected objects and prevent collection.

The example deliberately retains the decoded image wrapper until after `Rive.cleanup()`, then releases the JavaScript reference. This controls the order needed to reproduce the bug; it does not suggest retaining wrappers in an application. `image.unref()` is called immediately after assigning the image to the asset. The lifecycle journal shows every step. Rendering uses a public Rive test asset and a generated red image; no application data is included.

## Versions

| Selection         | High-level API                             | Native runtime                              |
| ----------------- | ------------------------------------------ | ------------------------------------------- |
| Published 2.42.0  | `@rive-app/webgl2@2.42.0`                  | Its matching published WASM                 |
| Unpatched sources | `6286634f339fb991e347a1122dfc9c609fdc16c1` | `@rive-app/webgl2-advanced@2.42.2`          |
| PR #428 fix       | `6b5f04373d593b580fa899aa58f1c9a216e4745e` | The same `@rive-app/webgl2-advanced@2.42.2` |

`scripts/prepare-rive.mjs` downloads the pinned public TypeScript sources and compiles them with esbuild. It does not monkey-patch a generated bundle. The two source variants use the same WASM to isolate the high-level fix. All resources are then served locally. The initial setup requires access to npm and `raw.githubusercontent.com`; subsequent starts reuse the source cache.

## Local development

Use a Node.js version supported by Angular 22 (the example is tested with Node 24).

```sh
npm ci
npm start
```

Open the URL printed by Angular CLI. This directory is self-contained and does not depend on files elsewhere in the repository, so StackBlitz can import it directly.

## Automated Angular integration test

```sh
npm ci
npm run build
npx playwright install chromium
npm run test:lifecycle
```

The test serves the production Angular build and performs three actual navigation cycles per version. It requires:

- The assigned image is visible and identical across versions and remounts.
- Angular removes the canvas when the route changes.
- An independent finalization registry confirms that the image wrapper was collected.
- Both unpatched versions emit exactly the reported `deleteTexture` error on every cycle.
- The fixed version emits no browser errors.
- No native image remains after cleanup and collection.

Screenshots are written to `test-results/<version>/<cycle>/`, including the lifecycle journal after navigation and GC. The dedicated GitHub Actions workflow uploads them as an artifact. Increase repetitions with `RIVE_TEST_REPEATS=10 npm run test:lifecycle`.

This test validates one decoded-image ownership path. It does not cover every Angular integration, asynchronous asset loading race, Rive feature, or browser.
