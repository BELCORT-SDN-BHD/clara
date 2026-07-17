export interface Approval {
  approved: boolean;
  approver?: string;
}

export interface PostEntryResult {
  postingId: string;
  receiptId: string;
  receiptNo: string;
  amountCents: number;
  /** true when the posting already existed (idempotent replay path) */
  wasDuplicate: boolean;
}

export interface CompletionResult {
  completionId: string;
  runId: string;
  opKey: string;
  approved: boolean;
  approver: string | null;
  wasDuplicate: boolean;
}
