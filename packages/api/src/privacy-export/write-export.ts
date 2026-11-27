import {
  countExportRows,
  type ExportColumnInfo,
  type ExportRequest,
  exportColumns,
  readExportRows,
  type WorkspaceScope,
} from '@fivvi/database';
import {
  CSV_BOM,
  csvLine,
  type ExportFile,
  type ExportKind,
  exportColumnNames,
  exportReadme,
  exportRecord,
} from '@fivvi/domain';
import type { Locale } from '@fivvi/i18n';
import type { ZipWriter } from './zip-stream.ts';

// Writes the export of E014 (spec #477, tickets #1177 and #1178) into a ZIP: `README.txt`,
// `data.json` and one CSV per file the plan names. The same writer serves the client export, the
// workspace export and, later, the operator's terminated-workspace path. Rows are read batch by
// batch (`readExportRows`) and written as they come; nothing is held whole.

export interface ExportWorkspace {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly timeZone: string;
}

export interface WriteExportInput {
  readonly scope: WorkspaceScope;
  readonly kind: ExportKind;
  /** The Owner's language, for the read-me. */
  readonly locale: Locale;
  readonly workspace: ExportWorkspace;
  /** The client of a client export. */
  readonly clientId?: string;
  readonly files: readonly ExportFile[];
  readonly exportedAt: Date;
}

interface PlannedFile {
  readonly file: ExportFile;
  readonly request: ExportRequest;
  readonly columns: readonly ExportColumnInfo[];
  readonly names: readonly string[];
  readonly rows: number;
}

async function plan(input: WriteExportInput): Promise<PlannedFile[]> {
  const planned: PlannedFile[] = [];
  for (const file of input.files) {
    const request: ExportRequest = {
      table: file.table,
      fields: file.fields,
      ...(file.clientLink && input.clientId
        ? { clientLink: file.clientLink, clientId: input.clientId }
        : {}),
    };
    const columns = await exportColumns(input.scope, request);
    const rows = await countExportRows(input.scope, request);
    // A client export holds the kinds of record she has; the workspace export every declared kind.
    if (input.kind === 'client' && rows === 0) continue;
    planned.push({ file, request, columns, names: exportColumnNames(columns), rows });
  }
  return planned;
}

async function* jsonChunks(input: WriteExportInput, planned: readonly PlannedFile[]) {
  const { workspace } = input;
  yield `{"kind":${JSON.stringify(input.kind)},"exportedAt":${JSON.stringify(input.exportedAt.toISOString())},`;
  yield `"workspace":${JSON.stringify({ id: workspace.id, name: workspace.name, slug: workspace.slug, timeZone: workspace.timeZone })},`;
  if (input.clientId) yield `"clientId":${JSON.stringify(input.clientId)},`;
  yield '"tables":{';
  let firstTable = true;
  for (const { file, request, columns } of planned) {
    yield `${firstTable ? '' : ','}${JSON.stringify(file.table)}:[`;
    firstTable = false;
    let first = true;
    for await (const batch of readExportRows(input.scope, request, columns)) {
      yield batch
        .map((row) => {
          const line = JSON.stringify(exportRecord(row, workspace.timeZone));
          const text = first ? line : `,${line}`;
          first = false;
          return text;
        })
        .join('');
    }
    yield ']';
  }
  yield '}}\n';
}

async function* csvChunks(input: WriteExportInput, planned: PlannedFile) {
  yield CSV_BOM + csvLine(planned.names);
  for await (const batch of readExportRows(input.scope, planned.request, planned.columns)) {
    yield batch
      .map((row) => {
        const record = exportRecord(row, input.workspace.timeZone);
        return csvLine(planned.names.map((name) => record[name]));
      })
      .join('');
  }
}

export async function writeExport(zip: ZipWriter, input: WriteExportInput): Promise<void> {
  const planned = await plan(input);
  await zip.file('README.txt', [
    exportReadme({
      kind: input.kind,
      locale: input.locale,
      workspaceName: input.workspace.name,
      timeZone: input.workspace.timeZone,
      exportedAt: input.exportedAt,
      files: planned.map(({ file, rows, names }) => ({
        table: file.table,
        rows,
        columns: names,
      })),
    }),
  ]);
  await zip.file('data.json', jsonChunks(input, planned));
  for (const entry of planned) await zip.file(`${entry.file.name}.csv`, csvChunks(input, entry));
}
