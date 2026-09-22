import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'animation',
    loadComponent: () =>
      import('./rive-page/rive-page.component').then((module) => module.RivePageComponent),
  },
  {
    path: 'away',
    loadComponent: () =>
      import('./away-page/away-page.component').then((module) => module.AwayPageComponent),
  },
  { path: '**', redirectTo: 'animation' },
];
