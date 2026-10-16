import { google } from 'googleapis';

export type SheetSyncConfig = {
  id: string;
  location_id: string;
  source_sheet_id: string;
  source_tab_name: string;
  source_range: string;
  primary_key: string;
  include_columns: string[];
  sync_enabled: boolean;
  sync_active_column?: string | null;
  last_updated_column?: string | null;
  last_synced_at?: string | null;
};

export type SheetRow = Record<string, string>;

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function parseSheetRange(range: string): { sheet: string; startCell: string } {
  const match = /^([^!]+)!?(.*)$/i.exec(range.trim());
  if (!match) {
    return { sheet: 'APP_SYNC', startCell: 'A1:Z500' };
  }
  const sheet = match[1] || 'APP_SYNC';
  const cells = (match[2] || 'A1:Z500').trim();
  return { sheet, startCell: cells || 'A1:Z500' };
}

export async function fetchSheetRows(config: SheetSyncConfig): Promise<SheetRow[]> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
  }

  const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() as any });
  const range = `${config.source_tab_name}!${config.source_range}`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.source_sheet_id,
    range,
  });

  const values = response.data.values || [];
  if (!values.length) return [];

  const headers = values[0].map((cell) => String(cell ?? '').trim());
  const selectedColumns = config.include_columns.length ? config.include_columns : headers;
  const activeColumn = config.sync_active_column ?? null;
  const lastUpdatedColumn = config.last_updated_column ?? null;

  return values.slice(1).reduce<SheetRow[]>((rows, row) => {
    const record: SheetRow = {};
    headers.forEach((header, index) => {
      if (selectedColumns.includes(normalizeHeader(header))) {
        record[normalizeHeader(header)] = String(row[index] ?? '');
      }
    });

    if (activeColumn && record[normalizeHeader(activeColumn)] !== undefined) {
      const active = String(record[normalizeHeader(activeColumn)]).toLowerCase();
      if (active === 'false' || active === '0' || active === 'no' || active === 'inactive') {
        return rows;
      }
    }

    if (lastUpdatedColumn && record[normalizeHeader(lastUpdatedColumn)] !== undefined) {
      const lastUpdated = record[normalizeHeader(lastUpdatedColumn)];
      if (lastUpdated && config.last_synced_at) {
        const existing = new Date(config.last_synced_at).getTime();
        const incoming = Date.parse(lastUpdated);
        if (!Number.isNaN(incoming) && incoming <= existing) {
          return rows;
        }
      }
    }

    rows.push(record);
    return rows;
  }, []);
}

export function coerceString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function isSameValue(a: unknown, b: unknown): boolean {
  return coerceString(a) === coerceString(b);
}
