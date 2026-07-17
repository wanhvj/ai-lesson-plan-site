export interface TablePosition {
  t: number; // table index
  r: number; // row index
  c: number; // cell index
}

export interface CandidateField {
  id: string;
  labelHint?: string;
  position: TablePosition;
  confidence: number; // 0..1
  modeHints?: Array<'multiline' | 'replace'>;
  textSnippet?: string;
}

export interface AnalyzeResult {
  tables: { count: number; structure: Array<{ rows: number; colsPerRow: number[] }>; };
  candidates: CandidateField[];
}




