export interface LedgerAccountSeed {
  code: string
  asset: 'USD' | 'USDC'
  type: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE'
}

export const LEDGER_ACCOUNTS: LedgerAccountSeed[] = [
  { code: 'asset:usd:collection',         asset: 'USD',  type: 'ASSET'     },
  { code: 'asset:usd:payout',             asset: 'USD',  type: 'ASSET'     },
  { code: 'asset:usdc:treasury',          asset: 'USDC', type: 'ASSET'     },
  { code: 'asset:usdc:in_transit',        asset: 'USDC', type: 'ASSET'     },
  { code: 'conversion:usd',               asset: 'USD',  type: 'ASSET'     },
  { code: 'conversion:usdc',              asset: 'USDC', type: 'ASSET'     },
  { code: 'liability:usd:exporter_payable', asset: 'USD', type: 'LIABILITY' },
  { code: 'liability:usd:refund_payable', asset: 'USD',  type: 'LIABILITY' },
  { code: 'revenue:usd:fees',             asset: 'USD',  type: 'REVENUE'   },
]
