# PRD: Exporter Settlement API

**Status:** Sandbox prototype — not a licensed service  
**Last updated:** 2026-10-06

## Overview

Exporter settlement corridor: USD invoice → USDC rails → USD payout to offshore account.

Indonesian exporters create invoices in USD. Buyers pay via virtual account. Pintas mints USDC, transfers on-chain, and redeems to USD payout.

## Milestones

| Milestone | Description | Status |
|---|---|---|
| M0 | Repo prep — park remittance track | ✅ Done |
| M1 | Money utilities + ledger foundation | ✅ Done |
| M2 | Exporters, buyers, payout accounts | ✅ Done |
| M3 | Quotes + tiered pricing | ✅ Done |
| M4 | Settlement orders + state machine | ✅ Done |
| M5 | Mock providers + happy path | ✅ Done |
| M6 | Failure paths + retry + refund | ✅ Done |
| M7 | Outbound webhooks | ✅ Done |
| M8 | Idempotency + inbound webhook hardening | ✅ Done |
| M9 | First real sandbox adapter | Deferred (pending D3/D4) |
| M10 | Exporter dashboard (sandbox demo) | 🔄 In progress |

## M10 — Exporter Dashboard

React + Vite app served at `/app`, calling only `/v1` APIs. No new business logic.

**Demo exporter:** PT Contoh Ekspor (KYB approved, one USD payout account)  
**Demo buyer:** Acme Trading Pte. Ltd. (Singapore)  
**API key:** `pk_sandbox_demo_pt_contoh_ekspor` (overridable via `DEMO_EXPORTER_API_KEY`)

The API key is returned by a BFF route `GET /app/session` and never baked into the bundle.

### Screens

1. **Settlements list** — invoice ref, buyer, status badge, amounts
2. **New invoice** — buyer + USD amount + invoice ref → quote review → collection details with copy buttons
3. **Settlement detail** — status timeline, amounts, collection details, sandbox action panel

### Sandbox panel (detail screen)

| Button | Endpoint |
|---|---|
| Simulate Full Payment | `POST /v1/sandbox/settlements/:id/fund` |
| Simulate 50% Payment | `POST /v1/sandbox/settlements/:id/fund` (half amount) |
| Advance Step | `POST /v1/sandbox/settlements/:id/advance` |
| Fail Next Step | `POST /v1/sandbox/settlements/:id/fail` |

### Settlement state machine

```
DRAFT
  → AWAITING_FUNDS   (collection instruction created)
  → FUNDED           (full payment received)
  → MINTING          (transient)
  → MINTED
  → IN_TRANSIT
  → ARRIVED
  → REDEEMING        (transient)
  → REDEEMED
  → PAYING_OUT       (transient)
  → PAID_OUT
  → RECONCILED       ✓ terminal
```

### Acceptance criteria

A non-technical user can:
1. Create an invoice for $5,000
2. See the fee (e.g. $25.00 at 50 bps) and net payout
3. Click "Simulate Full Payment"
4. Click "Advance Step" until status reaches RECONCILED
5. Complete within 2 minutes, without writing JSON

## Regulatory context

- Regulator: OJK (POJK 27/2024, DFA Trader license)
- Data residency: AWS ap-southeast-3 (Jakarta) per UU PDP 2022
- Crypto not legal tender in Indonesia — all USDC operations are internal rails only
- Sandbox only: all stablecoin operations are simulated
