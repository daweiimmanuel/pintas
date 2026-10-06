# Parked Track: Inbound Remittance (IDR)

This directory contains the original Pintas inbound remittance product track:
cross-border transfers (MY, SA, UAE, SG, US → Indonesia) settled in IDR via
BI-FAST disbursement.

**Status: parked.** Development has shifted to the Exporter Settlement track
(USD → USD via USDC rails). This code is preserved for reference and may be
revived as Phase 2.

## Contents

- `services/corridor/` — FX quoting, order creation, receipt confirmation, travel rule hook
- `routes/corridor.ts` — REST routes (`GET /v1/remittance/quote`, `POST /v1/remittance`, `GET /v1/remittance/:id`, `POST /v1/remittance/:id/confirm`)

## Dependencies (when active)

- `src/services/disbursement/` — DurianPay SNAP disbursement (bank transfer + e-wallet)
- `src/services/travel-rule/` — Notabene IVMS-101 travel rule (SEOJK 20/2024)
- `src/services/blockchain/` — on-chain USDC/USDT deposit watching
- Open Exchange Rates FX feed

**Do not modify** this directory. It is a snapshot, not active code.
