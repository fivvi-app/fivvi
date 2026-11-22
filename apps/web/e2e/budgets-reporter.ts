import { mkdirSync, writeFileSync } from 'node:fs';
import type { Reporter, TestCase } from '@playwright/test/reporter';
import {
  BUDGET_ROW_ANNOTATION,
  type BudgetRow,
  budgetsTarget,
  summarizeBudgets,
} from '../test/budgets';
import {
  CALENDAR_TIMING_ANNOTATION,
  type CalendarTiming,
  summarizeCalendarTiming,
} from '../test/calendar-budget';

/**
 * Prints the result of a budget run (F064 AC15) once, for both languages, as Markdown to paste on the
 * PR (`test/budgets.ts`), and writes it to `test-results/budgets-summary.md`. The budget tests leave
 * their numbers as annotations; this reads them when the run ends. The timing of the workspace
 * calendar's pilot week (F014 AC15, `test/calendar-budget.ts`) is a second table of the same file.
 */
export default class BudgetsReporter implements Reporter {
  private readonly rows: BudgetRow[] = [];
  private readonly calendarRows: CalendarTiming[] = [];

  onTestEnd(test: TestCase): void {
    for (const annotation of test.annotations) {
      if (annotation.type === BUDGET_ROW_ANNOTATION && annotation.description) {
        this.rows.push(JSON.parse(annotation.description) as BudgetRow);
      }
      if (annotation.type === CALENDAR_TIMING_ANNOTATION && annotation.description) {
        this.calendarRows.push(JSON.parse(annotation.description) as CalendarTiming);
      }
    }
  }

  onEnd(): void {
    if (this.rows.length === 0 && this.calendarRows.length === 0) return;
    const target = budgetsTarget(process.env.BUDGETS_BASE_URL);
    const parts: string[] = [];
    if (this.rows.length > 0) {
      parts.push(
        summarizeBudgets({
          target,
          // Both languages in one table, each in the order the pages were measured.
          rows: [...this.rows].sort((a, b) => a.locale.localeCompare(b.locale)),
        }),
      );
    }
    if (this.calendarRows.length > 0) {
      parts.push(
        summarizeCalendarTiming({
          target,
          rows: [...this.calendarRows].sort((a, b) => a.locale.localeCompare(b.locale)),
        }),
      );
    }
    const summary = parts.join('\n\n');
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/budgets-summary.md', `${summary}\n`);
    console.log(`\n${summary}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
