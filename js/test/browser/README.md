# WebGL2 image cleanup regression

From `js/`, install the test dependencies and browser once:

```sh
npm ci
npx playwright install chromium
```

Then run:

```sh
npm run test:webgl2-image-cleanup
```

The command compiles the current high-level TypeScript sources with the published
`@rive-app/webgl2-advanced@2.42.2` JavaScript/WASM pair. It does not require a native
toolchain, download assets at test time, or modify the generated bundle. This
isolates changes to the high-level API; it does not validate changes to C++ or the
low-level renderer.

The test assigns a visible image to a real Rive asset, calls `image.unref()`, keeps
the wrapper reachable until after `Rive.cleanup()`, then forces Chromium garbage
collection. An independent finalization registry confirms that the wrapper was
collected. Failure to collect is a test failure, not a successful cleanup.

Each scenario runs three times. The assertions cover browser errors, native image
release, identical rendered pixels, repeated `unref()`, fallback garbage
collection before cleanup, and the absence of `FinalizationRegistry` in the SDK.
Every browser scenario has a 15-second deadline. Increase repetitions with:

```sh
RIVE_TEST_REPEATS=10 npm run test:webgl2-image-cleanup
```

On the unpatched sources, the default command fails with
`Cannot read properties of undefined (reading 'deleteTexture')`. To measure its
reproduction rate there, use `-- --expect-delete-texture`; this mode requires that
exact error on every repetition and must fail on the fixed sources.
