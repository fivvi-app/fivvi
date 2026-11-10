import { mkdirSync, writeFileSync } from 'node:fs';
import type { Reporter, TestCase } from '@playwright/test/reporter';
import {
  BUDGET_ROW_ANNOTATION,
  type BudgetRow,
  budgetsTarget,
  summarizeBudgets,
} from '../test/budgets';

/**
 * Prints the result of a budget run (F064 AC15) once, for both languages, as Markdown to paste on the
 * PR (`test/budgets.ts`), and writes it to `test-results/budgets-summary.md`. The budget tests leave
 * their numbers as annotations; this reads them when the run ends.
 */
export default class BudgetsReporter implements Reporter {
  private readonly rows: BudgetRow[] = [];

  onTestEnd(test: TestCase): void {
    for (const annotation of test.annotations) {
      if (annotation.type === BUDGET_ROW_ANNOTATION && annotation.description) {
        this.rows.push(JSON.parse(annotation.description) as BudgetRow);
      }
    }
  }

  onEnd(): void {
    if (this.rows.length === 0) return;
    const summary = summarizeBudgets({
      target: budgetsTarget(process.env.BUDGETS_BASE_URL),
      // Both languages in one table, each in the order the pages were measured.
      rows: [...this.rows].sort((a, b) => a.locale.localeCompare(b.locale)),
    });
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/budgets-summary.md', `${summary}\n`);
    console.log(`\n${summary}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
