import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CreatePriorityRequest } from '@taskapp/shared-types';
import { PrioritiesApiService } from '../../core/api/priorities.service';
import { PRIORITY_LEVEL_MIN, PRIORITY_NAME_MAX_LENGTH } from './priority.logic';

@Component({
  selector: 'app-priority-create',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>New priority</h2>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>
        Name
        <input formControlName="name" />
      </label>
      @if (form.controls.name.touched && form.controls.name.invalid) {
        <p>Name is required (max 100 characters).</p>
      }

      <label>
        Level
        <input type="number" formControlName="level" />
      </label>
      @if (form.controls.level.touched && form.controls.level.invalid) {
        <p>Level must be 0 or greater.</p>
      }

      <button type="submit" [disabled]="form.invalid">Create</button>
    </form>
  `,
})
export class PriorityCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PrioritiesApiService);
  private readonly router = inject(Router);

  // Validators mirror CreatePriorityDto on the backend.
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(PRIORITY_NAME_MAX_LENGTH)]],
    level: [0, [Validators.required, Validators.min(PRIORITY_LEVEL_MIN)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const body = this.form.getRawValue() satisfies CreatePriorityRequest;
    this.api.create(body).subscribe(() => this.router.navigate(['/priorities']));
  }
}
