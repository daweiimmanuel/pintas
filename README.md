# Pintas

Prototype API for moving money into Indonesia on a stablecoin settlement rail: inbound remittance with IDR payouts, and an IDR ↔ stablecoin on/off-ramp.

> **Status: side-project prototype.** Runs against partner sandboxes only. No real funds move through this code.
> Pintas is **not licensed** by OJK or Bank Indonesia. The OJK DFA Trader license referenced below is a design target, not a license held.

---

## What Pintas is

Pintas (Indonesian for "shortcut") explores how a stablecoin can serve as an invisible settlement layer between foreign currencies and IDR, with every end user sending and receiving fiat only.

It is designed as two tracks for two different segments:

| Track | Segment | Status |
|---|---|---|
| **Inbound remittance & IDR on/off-ramp** | Individuals sending money home to Indonesia; fintechs needing IDR ↔ stablecoin conversion | Built in this repo (sandbox) |
| **B2B exporter settlement** | Indonesian exporters receiving payment from foreign buyers | Specified in [`PRD.md`](./PRD.md); not implemented in this repo |

## What's built (sandbox)

- **IDR on-ramp:** collection via BCA BI-FAST virtual accounts
- **IDR payouts:** bank transfers and e-wallet top-ups (GoPay, OVO, DANA, ShopeePay, LinkAja) via Durianpay's SNAP disbursement API, with beneficiary account validation
- **Remittance corridors:** quote, create and confirm for MY, SA, AE, SG and US → IDR
- **FX:** rates from Open Exchange Rates with a 1-minute cache; hardcoded fallback rates for sandbox use
- **Stablecoin pricing:** VWAP across Indodax and Tokocrypto with a 10-second cache
- **KYC:** tiered eKYC via Verihubs (Tier 1: NIK/Dukcapil, Tier 2: NPWP)
- **Webhooks:** outbound events on on-ramp, off-ramp, KYC and remittance state changes; retries with exponential backoff
- **Settlement worker:** deposit watcher, webhook retry daemon and order expiry job

### Corridor configuration (sandbox, illustrative)

| Corridor | Spread | Flat fee | Min | Max |
|---|---|---|---|---|
| Malaysia (MYR) | 80 bps | MYR 2 | MYR 10 | MYR 50,000 |
| Saudi Arabia (SAR) | 100 bps | SAR 5 | SAR 20 | SAR 50,000 |
| UAE (AED) | 100 bps | AED 5 | AED 20 | AED 50,000 |
| Singapore (SGD) | 70 bps | SGD 2 | SGD 5 | SGD 50,000 |
| United States (USD) | 120 bps | USD 3 | USD 5 | USD 25,000 |

These values are prototype assumptions for testing pricing logic, not live rates.

## How a remittance flows

```
Sender abroad (MYR / SAR / AED / SGD / USD)
        │  collected by a licensed sending-side partner
        ▼
Stablecoin settlement leg (invisible to sender and recipient)
        │
        ▼
Pintas converts to IDR
        │  payout via Durianpay SNAP disbursement API
        ▼
Recipient's Indonesian bank account or e-wallet (IDR)
```

## Known limitations

- **Sandbox only.** Partner integrations use sandbox credentials. When credentials are missing, payout calls return mock responses.
- **No sending-side partner integrated.** Corridor collection abroad is modelled, not connected.
- **Fallback FX rates are hardcoded** for sandbox testing.
- **Not load-tested or security-audited.** Not suitable for production use.
- **Unlicensed.** Operating this as a live service in Indonesia would require the appropriate OJK and Bank Indonesia licenses.

## Roadmap (not built)

- B2B exporter settlement track: FX rate lock, transaction state machine, tiered-and-capped pricing (see `PRD.md`)
- Second payout provider as a fallback behind a common payout interface
- Sending-side partner integration for each corridor
- Client SDKs

## Tech stack

TypeScript · Node.js / Fastify · Prisma + PostgreSQL 16 · Redis 7 · Docker Compose · Vitest · Vercel (API) · Railway/Render (worker)

## Running locally

```bash
cp .env.example .env        # add sandbox credentials; leave blank to use mock mode
docker compose up -d        # PostgreSQL + Redis
npm install
npx prisma migrate dev
npm run dev
```

### Remittance endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/remittance/quote` | Quote a corridor transfer |
| POST | `/v1/remittance` | Create a remittance |
| GET | `/v1/remittance/:id` | Get remittance status |

See `src/` for the full route list.

## Regulatory context

- **Rupiah is the only legal tender for payments in Indonesia.** Crypto cannot be used as a means of payment, so Pintas uses stablecoins only as a settlement layer; senders and recipients transact in fiat.
- **Crypto regulator:** OJK, since January 2025
- **Relevant framework:** POJK 27/2024, POJK 23/2025, SEOJK 20/2024 (AML/KYC), UU PDP 2022 (personal data protection)
- **License target:** OJK DFA Trader license (not held)
- **Data residency target:** AWS Jakarta (ap-southeast-3)

## Documentation

[`PRD.md`](./PRD.md) covers market analysis, regulatory mapping, partner network, architecture and the 18-month roadmap.

## Disclaimer

This is a personal prototype for research and learning. It is not a financial service, does not hold or move customer funds, and should not be used in production.
