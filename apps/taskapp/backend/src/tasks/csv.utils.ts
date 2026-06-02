import { Task } from './task.model';

const BOM = '﻿';
const HEADER = 'id,title,priority,completed,createdAt';

function toCsvCell(value: string): string {
  const sanitized = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (
    sanitized.includes(',') ||
    sanitized.includes('"') ||
    sanitized.includes('\n') ||
    sanitized.includes('\r')
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function tasksToCsv(tasks: Task[]): string {
  const rows = [HEADER];
  for (const task of tasks) {
    rows.push(
      [
        toCsvCell(task.id),
        toCsvCell(task.title),
        toCsvCell(task.priority),
        String(task.completed),
        toCsvCell(task.createdAt),
      ].join(','),
    );
  }
  return BOM + rows.join('\n');
}
