# Pintas — Claude Code Context

## What is this project?

**Pintas** (Indonesian: "shortcut") is Indonesia's stablecoin payment infrastructure — modeled on [Linka](https://www.linka.xyz) (Latin America's stablecoin payment rails), adapted for Indonesia's regulatory and market environment.

## Core Documents

- **`PRD.md`** — Full Product Requirements Document. Start here for any implementation work.

## Key Context

### Product
- On-ramp/off-ramp: IDR ↔ USDT/USDC via BI-FAST + licensed exchange partners
- Cross-border payments: Multi-corridor settlement (MY, SA, UAE, SG, US → Indonesia)
- OTC desk: Institutional IDR/USDT block trades, min IDR 75M, T+0
- API-first: REST + WebSocket, SDKs for Node.js, Python, PHP, Go
- White-label: Branded stablecoin wallet for banks/e-wallets

### Regulatory
- Regulator: **OJK** (since Jan 10, 2025 — replaced Bappebti)
- License needed: **DFA Trader** (POJK 27/2024)
- AML/KYC: **SEOJK 20/2024**
- Data: **UU PDP 2022** (data must stay in Indonesia — AWS Jakarta ap-southeast-3)
- Crypto cannot be used as payment in Indonesia (IDR only legal tender per Currency Law)

### Key Partners
- **On-ramp liquidity**: Indodax, Tokocrypto (Binance partner), Pintu, Reku
- **IDR rails**: BI-FAST (BCA/Mandiri VA), QRIS (Xendit/Midtrans), RTGS Gen 3
- **E-wallet disbursement**: GoPay, OVO, Dana, ShopeePay, LinkAja (via Xendit/Midtrans)
- **Stablecoins**: USDT (TRC-20 dominant), USDC (Polygon), USDT (Polygon)
- **Blockchains**: Polygon (primary), TRON (USDT), Stellar (remittance), Ethereum (OTC)

### Market
- Inbound remittances: $10.73B/year
- Migrant workers abroad: 9 million
- Top corridors: Saudi Arabia, Malaysia, UAE → Indonesia
- Digital payments: projected $148B by 2028

## Development Branch

Work happens on: `claude/linka-indonesia-corridor-3nn2lq`
