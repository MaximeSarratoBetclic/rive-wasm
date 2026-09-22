import { Injectable, signal } from '@angular/core';

type RiveApi = typeof import('@rive-app/webgl2');
type DecodedImage = Awaited<ReturnType<RiveApi['decodeImage']>>;

declare global {
  interface Window {
    rive?: RiveApi;
  }
}

const variants = [
  { id: 'published', label: 'Published Rive 2.42.0', wasm: 'published' },
  { id: 'baseline', label: 'Unpatched sources · 6286634', wasm: 'source' },
  { id: 'fixed', label: 'PR #428 · 6b5f043', wasm: 'source' },
];

@Injectable({ providedIn: 'root' })
export class ReproductionService {
  readonly variant =
    variants.find(
      (variant) => variant.id === new URLSearchParams(location.search).get('runtime'),
    ) ?? variants[0];
  readonly events = signal<string[]>([]);
  readonly errors = signal<string[]>([]);
  readonly stage = signal('Loading runtime');
  readonly collected = signal(0);
  readonly ready = signal(false);
  private retainedImage?: DecodedImage;
  private readonly registry = new FinalizationRegistry<number>((id) => {
    this.collected.update((count) => count + 1);
    this.record(`GC collected image wrapper ${id}`);
  });
  private imageCount = 0;
  private readonly runtime = this.loadRuntime();

  constructor() {
    window.addEventListener('error', (event) => this.report(event.message));
    window.addEventListener('unhandledrejection', (event) => this.report(event.reason));
  }

  async api(): Promise<RiveApi> {
    return this.runtime;
  }

  record(message: string): void {
    this.events.update((events) => [...events, message]);
  }

  report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.errors.update((errors) => [...errors, message]);
    this.record(`ERROR: ${message}`);
  }

  retain(image: DecodedImage): void {
    this.retainedImage = image;
    this.registry.register(image, ++this.imageCount);
    this.record('Image assigned; wrapper retained until renderer cleanup');
  }

  rendererDestroyed(): void {
    this.retainedImage = undefined;
    this.ready.set(false);
    this.stage.set('Renderer destroyed — waiting for GC');
    this.record('Rive.cleanup() completed; image wrapper is now collectible');
  }

  private async loadRuntime(): Promise<RiveApi> {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `runtime/${this.variant.id}.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the selected runtime'));
      document.head.append(script);
    });
    const api = window.rive;
    if (!api) throw new Error('The selected runtime did not expose its API');
    api.RuntimeLoader.setWasmUrl(`runtime/${this.variant.wasm}.wasm`);
    api.RuntimeLoader.setWasmFallbackUrl(null);
    await api.RuntimeLoader.awaitInstance();
    this.record(`Runtime ready: ${this.variant.label}`);
    return api;
  }
}
