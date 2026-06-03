import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tasks',
    loadComponent: () =>
      import('./features/tasks/task-list/task-list.component').then(
        (m) => m.TaskListComponent,
      ),
  },
  {
    path: 'priorities',
    loadComponent: () =>
      import('./features/priorities/priority-list/priority-list.component').then(
        (m) => m.PriorityListComponent,
      ),
  },
  {
    path: 'priorities/new',
    loadComponent: () =>
      import('./features/priorities/priority-create/priority-create.component').then(
        (m) => m.PriorityCreateComponent,
      ),
  },
  {
    path: 'priorities/:id',
    loadComponent: () =>
      import('./features/priorities/priority-edit/priority-edit.component').then(
        (m) => m.PriorityEditComponent,
      ),
  },
  { path: '', pathMatch: 'full', redirectTo: 'tasks' },
];
