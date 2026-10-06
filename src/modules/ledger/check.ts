export interface LedgerLineInput {
  asset: string
  debitMinor: bigint
  creditMinor: bigint
}

// Verify that journal entry lines balance per asset (sum(debit) === sum(credit)).
// Throws if any asset is out of balance. Call before persisting any journal entry.
export function assertBalanced(lines: LedgerLineInput[]): void {
  const byAsset: Record<string, { debits: bigint; credits: bigint }> = {}
  for (const line of lines) {
    if (!byAsset[line.asset]) byAsset[line.asset] = { debits: 0n, credits: 0n }
    byAsset[line.asset].debits  += line.debitMinor
    byAsset[line.asset].credits += line.creditMinor
  }
  for (const [asset, { debits, credits }] of Object.entries(byAsset)) {
    if (debits !== credits) {
      throw new Error(
        `Ledger imbalance on asset ${asset}: debits=${debits} credits=${credits} diff=${debits - credits}`
      )
    }
  }
}
