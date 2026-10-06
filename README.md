# Pintas

> **⚠ Prototype / sandbox only. No real funds move through this code. No OJK or Bank Indonesia license is held.**

Pintas (Indonesian: "shortcut") is stablecoin payment infrastructure for Indonesia. This repository is building the **Exporter Settlement** track: Indonesian exporters receive payment from foreign buyers in USD, which Pintas moves as USDC and redeems back to USD — stablecoin is invisible infrastructure.

---

## Active track: Exporter Settlement (USD → USD)

An Indonesian exporter invoices a foreign buyer in USD. The buyer pays into a Pintas-issued collection account. Pintas settles in USDC and pays out USD net of a transparent fee.

**Flow:** Invoice → Funded → Minted → In Transit → Arrived → Redeemed → Paid Out → Reconciled

- Double-entry ledger with per-asset balance checks at every transition
- Explicit state machine — every status change writes an `OrderEvent`
- Tiered-and-capped pricing quoted up front and locked in the settlement order
- Automatic reconciliation; partial/over-payment handling; refund flow
- Full failure paths: `*_FAILED` → retry → `MANUAL_REVIEW` → `REFUNDED`

See [`PRD.md`](./PRD.md) §1–18 for the complete product spec.

**Status (milestones):**

| Milestone | Status |
|---|---|
| M0 — Repo prep | ✅ Done |
| M1 — Money utility + ledger | 🔄 In progress |
| M2–M8 | Upcoming |

---

## Parked track: Inbound Remittance (IDR)

The original remittance track (foreign sender → IDR payout to Indonesian recipient via BI-FAST) is parked at [`experimental/remittance/`](./experimental/remittance/README.md). It is preserved for reference and may be revived as Phase 2.

---

## Tech stack

TypeScript · Node.js / Fastify v4 · Prisma 5 + PostgreSQL · Redis · Docker Compose · Vitest · Railway

## Running locally

```bash
cp .env.example .env        # add sandbox credentials; leave blank for mock mode
docker compose up -d        # PostgreSQL + Redis
npm install
npx prisma migrate dev
npm run dev
```

## Regulatory context

- Rupiah is the only legal tender for payments in Indonesia — stablecoin is a settlement layer only
- Regulator: OJK (since Jan 2025); relevant framework: POJK 27/2024, SEOJK 20/2024
- Data residency target: AWS Jakarta (ap-southeast-3) per UU PDP 2022
- License target: OJK DFA Trader — **not held**

## Disclaimer

Personal prototype for research. Not a financial service. Does not hold or move customer funds. Not suitable for production use.
