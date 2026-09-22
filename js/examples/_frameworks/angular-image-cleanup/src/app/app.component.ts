import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ReproductionService } from './reproduction.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent {
  protected readonly reproduction = inject(ReproductionService);
}
