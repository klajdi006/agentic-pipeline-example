import { Pipe, PipeTransform } from '@angular/core';

/**
 * Renders a UTC ISO-8601 timestamp in the user's local timezone (see CLAUDE.md).
 * Backed by the platform `Intl.DateTimeFormat`, so it always reflects the browser's
 * resolved timezone without extra configuration.
 */
@Pipe({ name: 'tzDate', standalone: true })
export class TzDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}
