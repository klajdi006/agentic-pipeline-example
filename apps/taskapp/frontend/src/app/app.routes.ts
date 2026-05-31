import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'priorities',
    loadComponent: () =>
      import('./features/priorities/priority-list.component').then(
        (m) => m.PriorityListComponent,
      ),
  },
  {
    path: 'priorities/new',
    loadComponent: () =>
      import('./features/priorities/priority-create.component').then(
        (m) => m.PriorityCreateComponent,
      ),
  },
  {
    path: 'priorities/:id',
    loadComponent: () =>
      import('./features/priorities/priority-edit.component').then(
        (m) => m.PriorityEditComponent,
      ),
  },
  { path: '', pathMatch: 'full', redirectTo: 'priorities' },
];
