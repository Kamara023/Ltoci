/** Types des réponses de l'API publique LotoStats (contrat PHASE 5). */

export interface DrawDto {
  id: string;
  date: string;
  drawType: { code: string; name: string };
  status: string;
  numbers: Record<string, number[]>; // WINNING / MACHINE
}

export interface NumberStatDto {
  number: number;
  frequency: number;
  relativeFreq: number;
  currentGap: number;
  avgGap: number | null;
  maxGap: number | null;
  lastSeenDate: string | null;
  trend: number | null;
}

export interface StatsMeta {
  setType: string;
  drawTypeCode: string | null;
  window: string;
  computedAt?: string | null;
  [k: string]: unknown;
}

export interface NumberStatsResponse {
  meta: StatsMeta;
  data: NumberStatDto[];
  disclaimer?: string;
}

export interface GameDto {
  code: string;
  name: string;
  operator: string;
  setTypes: { code: string; label: string; numbersCount: number; numberMin: number; numberMax: number }[];
  drawTypes: { code: string; name: string; scheduledTime: string | null }[];
}

export interface PaginatedDraws {
  data: DrawDto[];
  meta: { page: number; limit: number; total: number };
  historyLimitedToDays?: number | null;
}

export interface ApiUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string | null };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
