import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Rive } from '@rive-app/webgl2';
import { ReproductionService } from '../reproduction.service';

@Component({
  imports: [RouterLink],
  selector: 'app-rive-page',
  templateUrl: './rive-page.component.html',
})
export class RivePageComponent implements OnDestroy {
  protected readonly reproduction = inject(ReproductionService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private animation?: Rive;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      void this.initialize().catch((error: unknown) => this.reproduction.report(error));
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.reproduction.record('Angular ngOnDestroy');
    const animation = this.animation;
    this.animation = undefined;
    animation?.stopRendering();
    queueMicrotask(() => {
      animation?.cleanup();
      this.reproduction.rendererDestroyed();
    });
  }

  private async initialize(): Promise<void> {
    this.reproduction.ready.set(false);
    this.reproduction.stage.set('Loading image');
    const api = await this.reproduction.api();
    if (this.destroyed) return;
    const imageCanvas = document.createElement('canvas');
    imageCanvas.width = imageCanvas.height = 256;
    const context = imageCanvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    context.fillStyle = 'red';
    context.fillRect(0, 0, 256, 256);
    const bytes = Uint8Array.from(atob(imageCanvas.toDataURL().split(',')[1]), (character) =>
      character.charCodeAt(0),
    );
    let imageLoaded = Promise.resolve();
    await new Promise<void>((resolve, reject) => {
      this.animation = new api.Rive({
        canvas: this.canvas().nativeElement,
        src: 'runtime/image.riv',
        useOffscreenRenderer: false,
        enableRiveAssetCDN: false,
        drawingOptions: api.DrawOptimizationOptions.AlwaysDraw,
        assetLoader: (asset) => {
          if (
            !asset.isImage ||
            !('setRenderImage' in asset) ||
            typeof asset.setRenderImage !== 'function'
          )
            return false;
          const setRenderImage = asset.setRenderImage.bind(asset);
          imageLoaded = api.decodeImage(bytes).then((image) => {
            if (this.destroyed) {
              image.unref();
              return;
            }
            setRenderImage(image);
            this.reproduction.retain(image);
            image.unref();
            this.reproduction.record('image.unref() called after assignment');
          });
          return true;
        },
        onLoad: () => resolve(),
        onLoadError: (event) => reject(new Error(String(event.data))),
      });
    });
    await imageLoaded;
    if (this.destroyed) return;
    const runtime = await api.RuntimeLoader.awaitInstance();
    if ('images' in runtime && runtime.images instanceof Map) {
      for (const image of runtime.images.values()) {
        if (image instanceof HTMLImageElement) await image.decode();
      }
    }
    if (this.destroyed) return;
    this.animation?.startRendering();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    this.animation?.stopRendering();
    if (this.destroyed) return;
    this.reproduction.ready.set(true);
    this.reproduction.stage.set('Image rendered');
    this.reproduction.record('Image rendered with useOffscreenRenderer: false');
  }
}
