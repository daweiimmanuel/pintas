# Pintas — Product Requirements Document
### Indonesia's Stablecoin Payment Infrastructure

**Version:** 1.0  
**Date:** October 2026  
**Status:** Draft for Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Vision & Strategic Goals](#3-vision--strategic-goals)
4. [Target Users & Personas](#4-target-users--personas)
5. [Regulatory Compliance Framework](#5-regulatory-compliance-framework)
6. [Payment Partners & Integration Network](#6-payment-partners--integration-network)
7. [Core Product Features](#7-core-product-features)
8. [Technical Architecture](#8-technical-architecture)
9. [Compliance & Risk Management](#9-compliance--risk-management)
10. [Go-to-Market Strategy](#10-go-to-market-strategy)
11. [Success Metrics & KPIs](#11-success-metrics--kpis)
12. [Phased Roadmap](#12-phased-roadmap)

---

## 1. Executive Summary

### What is Pintas?

**Pintas** (Indonesian: "shortcut") is Indonesia's first institutional-grade stablecoin payment infrastructure. It provides the programmable rails that fintechs, remittance companies, importers/exporters, and banks need to move money into and out of Indonesia — fast, cheap, and compliant.

Modeled on [Linka](https://www.linka.xyz) — Latin America's leading stablecoin payment infrastructure — Pintas adapts the same architecture to Indonesia's unique regulatory environment (OJK/Bank Indonesia), payment rails (BI-FAST, QRIS, RTGS), and market dynamics.

### The Opportunity

Indonesia sits at the intersection of three massive, underserved flows:

| Flow | Market Size | Problem |
|---|---|---|
| Inbound remittances | **$10.73B/year** (2024) | 5–8% fees, 1–3 day delays |
| Digital payments | **$148B projected by 2028** | No stablecoin rails for programmable settlement |
| B2B cross-border | **$15B+ total market** | SWIFT fees, FX spread, no API access |

**9 million Indonesians** work abroad (Saudi Arabia, Malaysia, UAE, Singapore, US) and collectively remit over $10B home per year. They pay an average of 5–8% in fees to incumbent services. No institutional-grade, API-accessible, stablecoin-based infrastructure exists today to serve this market.

### The Solution

Pintas provides a single API integration that handles:
- IDR ↔ USDT/USDC on-ramp and off-ramp via BI-FAST
- Cross-border settlement in <2 seconds over Polygon/Stellar/TRON
- OTC desk for institutional block trades
- Merchant payment acceptance (accept crypto, settle in IDR)
- Treasury management with multi-sig controls
- White-label licensing for banks and e-wallets

---

## 2. Problem Statement

### Pain Point 1: Remittance Fees Drain Migrant Worker Earnings

Indonesian migrant workers (TKI) in Malaysia, Saudi Arabia, and UAE pay 5–8% in fees through incumbents (Western Union, MoneyGram, bank SWIFT). On $10.73B in inflows, this extracts **$536M–$858M per year** from some of Indonesia's most economically vulnerable workers. No stablecoin corridor exists to pass savings on to senders and receivers.

### Pain Point 2: Settlement Delay Creates FX Risk for Businesses

SWIFT transfers take 1–3 days. Indonesian importers paying USD invoices are exposed to IDR/USD volatility throughout that window. A 1% IDR depreciation over 2 days on a $1M payable creates a $10,000 unhedged loss. Real-time stablecoin settlement eliminates this risk entirely.

### Pain Point 3: No Programmable IDR On/Off-Ramp API

There is no production-ready, licensed, API-accessible layer for IDR ↔ stablecoin conversion. Indonesian fintechs building remittance apps, neobanks, or DeFi interfaces must cobble together unlicensed exchange integrations, manual BI-FAST flows, and fragmented e-wallet disbursements. Each integration takes 3–6 months and exposes the builder to regulatory risk.

*Market signal:* DurianPay — Indonesia's largest domestic payment orchestrator ($5.5B TPV, 400+ enterprise clients, profitable in 2025) — announced in Q1 2026 that it is building stablecoin-based cross-border infrastructure. Their approach is **gateway-first, stablecoin added**: layering stablecoin rails on top of an existing domestic payout product. Pintas's architecture is the inverse — **stablecoin-native**, with IDR disbursement as the output layer — giving Pintas a structural advantage in multi-chain support, corridor breadth, and OTC depth from day one.

### Pain Point 4: E-Wallet Fragmentation Without a Unified Off-Ramp

GoPay, OVO, Dana, ShopeePay, and LinkAja together serve >70% of Indonesia's digital payment market — yet none natively support stablecoin deposit. A remittance receiver in Indonesia cannot receive USDT into their GoPay wallet. There is no unified, OJK-licensed bridge that converts stablecoin inflows to e-wallet disbursements.

### Pain Point 5: Institutional Stablecoin Trades Lack a Regulated Desk

Large USD↔IDR trades above $50,000 are executed through unlicensed OTC channels, grey-market P2P desks, or inefficient bank FX counters. No OJK-licensed OTC desk exists offering institutional-grade execution for USDT/USDC↔IDR block trades with same-day T+0 settlement.

---

## 3. Vision & Strategic Goals

### Vision

> "Indonesia's stablecoin backbone — move money at the speed of the internet."

### Mission

Make fast, cheap, and compliant cross-border payment infrastructure accessible to every Indonesian fintech, business, and migrant worker through a single API integration.

### Strategic Goals

| Goal | Timeframe | Target |
|---|---|---|
| Live remittance corridor | Month 6 | Malaysia → Indonesia, $5M/month volume |
| API platform with paying customers | Month 12 | 20 B2B customers, $30M/month volume |
| Institutional OTC desk | Month 12 | $5M/day OTC capacity |
| Regulatory standing | Month 18 | OJK DFA Trader license granted |
| Scale | Month 18 | $100M/month settlement, 5 corridors |

---

## 4. Target Users & Personas

### Primary: B2B API Customers

**Persona A — Indonesian Fintech / Remittance App**
- Company building a mobile remittance product for overseas Indonesian workers
- Needs: Licensed IDR off-ramp, e-wallet disbursement, KYC as a service, webhook notifications
- Example: A startup building a Malaysia-Indonesia corridor app for Malay migrant workers
- Value: Ship in weeks instead of months; no OJK compliance burden

**Persona B — Indonesian Importer / Exporter**
- Business paying USD/EUR invoices to overseas suppliers or receiving USD from export buyers
- Needs: Same-day USDT → IDR conversion, API-triggered transfers, audit trail
- Example: Jakarta-based garment exporter receiving USD from US buyers, converting to IDR on same day
- Value: Eliminate SWIFT fees ($25–$50/transfer), reduce FX exposure by settling same day

**Persona C — Institutional Trader / Fund**
- Indonesian family office, crypto fund, or corporate treasury team
- Needs: OTC desk, deep IDR liquidity, regulatory-compliant block trades, T+0 settlement
- Example: A crypto fund exiting USDT positions into IDR after a trade
- Value: Institutional-grade execution with OJK compliance, no slippage on large trades

**Persona D — Bank or E-Wallet (White Label)**
- Established Indonesian financial institution wanting to add stablecoin rails without building in-house
- Needs: Turnkey white-label wallet, OJK license umbrella, API, compliance
- Example: A regional bank wanting to offer USDT remittance receipt to its mobile banking customers
- Value: Launch in 4–6 weeks; Pintas holds the DFA license

### Secondary: B2C via Partner Channels

**Persona E — Migrant Worker (TKI)**
- Indonesian working in Malaysia, Saudi Arabia, UAE, Singapore, or South Korea
- Needs: Low-cost, fast transfer to family in Indonesia; disburse to GoPay/OVO/BCA
- Onboarded via white-label app from partner (remittance company)
- Value: Sub-1% fee vs. 5–8% incumbents; minute-fast vs. day-slow

---

## 5. Regulatory Compliance Framework

### 5.1 Primary Regulatory Authority

**OJK (Otoritas Jasa Keuangan)** — Financial Services Authority  
As of January 10, 2025, OJK replaced Bappebti as the primary regulator of crypto/digital financial assets in Indonesia.

### 5.2 Key Regulations

| Regulation | Effective Date | Scope | Requirement for Pintas |
|---|---|---|---|
| **POJK 27/2024** | Jan 10, 2025 | Core DFA trading framework | Obtain DFA Trader license; comply with capital, governance, risk management |
| **POJK 23/2025** | Nov 10, 2025 | Amendment: adds crypto derivatives | Framework for future derivative products on Pintas |
| **SEOJK 20/2024** | 2024 | KYC/AML standards | Tiered KYC for all users; AML monitoring and PPATK reporting |
| **UU PDP 2022** | 2024 (enforcement) | Personal Data Protection Law | Data residency in Indonesia; consent management; breach notification |
| **Bank Indonesia Currency Law** | Ongoing | IDR as sole legal tender | Crypto cannot be used *as payment*; Pintas settles in IDR on the IDR leg |
| **BI Cross-Border FX Reporting** | Ongoing | LLD/GWP reporting | Monthly FX flow reporting to Bank Indonesia |
| **PPh Pasal 22 (Tax)** | Ongoing | 0.21% per trade tax | Automatic withholding; remit to DJP quarterly |

### 5.3 License Requirements

To operate legally, Pintas must obtain:

1. **DFA Trader License** (primary): Min IDR 100B (~$6.5M) paid-up capital; Min IDR 50B (~$3.25M) equity. Full compliance with POJK 27/2024 governance, risk management, and consumer protection chapters.
2. **Partnership with licensed DFA Custodian**: For segregated MPC wallet custody of user assets.
3. **Payment aggregator relationship**: For BI-FAST VA issuance and e-wallet disbursement via licensed payment processors (Midtrans, Xendit, or Doku).

### 5.4 KYC Tiers

| Tier | Users | Verification | Daily Limit |
|---|---|---|---|
| Tier 1 — Individual | Retail / TKI | NIK/KTP + selfie (liveness) | IDR 20M (~$1,300) |
| Tier 2 — Business | SME / Fintech | KYB: NPWP, SIUP/NIB, directors' KYC | IDR 500M (~$32,500) |
| Tier 3 — Institutional | OTC / Bank | Enhanced DD: UBO, financial statements, AML questionnaire | Unlimited |

### 5.5 AML / CFT Requirements (SEOJK 20/2024)

- Customer due diligence (CDD) and enhanced due diligence (EDD) per risk tier
- Transaction monitoring: real-time screening against OFAC, UN, EU, and PPATK sanctions lists
- Suspicious Transaction Reports (STR) submitted to PPATK within 3 working days
- Unusual Transaction Reports (UTR) submitted within 14 working days
- Travel rule compliance for transfers ≥ IDR 46M (~$3,000 equivalent) — sender/receiver VASP information
- Annual AML/CFT independent audit

---

## 6. Payment Partners & Integration Network

### 6.1 Settlement Rails (Tier 1 — Local IDR)

| Rail | Provider | Use Case | SLA |
|---|---|---|---|
| **BI-FAST** | BCA, Bank Mandiri, BRI, BNI via VA | Real-time IDR disbursement to any bank | <25s, 24/7/365 |
| **QRIS Disbursement** | Licensed aggregator (Xendit/Midtrans) | E-wallet top-up (GoPay, OVO, Dana) | <30s |
| **RTGS Gen 3** | Bank Mandiri / BCA direct | High-value IDR transfers >IDR 500M | <2h, business hours |

### 6.2 On-Ramp / Off-Ramp Partners (Tier 2 — Crypto Exchanges)

| Partner | License | Liquidity | Pairs | Integration |
|---|---|---|---|---|
| **Indodax** | OJK DFA Exchange | Largest in ID, IDR/USDT deep book | IDR/USDT, IDR/USDC | REST API + VA top-up |
| **Tokocrypto** | OJK (PFAK, Binance partner) | Binance backstop liquidity | IDR/USDT, IDR/BTC | REST API |
| **Pintu** | OJK DFA Trader | Retail-focused, strong USDC | IDR/USDC, IDR/USDT | REST API |
| **Reku** | OJK DFA Trader | Growing retail base | IDR/USDT | REST API |

> Pintas uses a VWAP aggregation engine across partner exchanges for best execution pricing.

### 6.3 E-Wallet & Bank Disbursement (Tier 3)

| Provider | Coverage | Integration Method | Speed |
|---|---|---|---|
| **GoPay** | 25M+ active users | Xendit/Midtrans API | Instant (QRIS, 0% MDR <IDR 500k) |
| **OVO** | 20M+ active users | Xendit API | Instant (QRIS, 0% MDR <IDR 500k) |
| **Dana** | 30M+ active users | Dana B2B API / Xendit | Instant (QRIS, 0% MDR <IDR 500k) |
| **ShopeePay** | 20M+ active users | Via Midtrans | Instant (QRIS, 0% MDR <IDR 500k) |
| **LinkAja** | 10M+ active users | LinkAja B2B API | Instant (negotiated MDR) |
| **DurianPay Pay Out** | 130+ banks + 20+ e-wallets | DurianPay SNAP API (`POST /v1.0/transfer-interbank`, `POST /v1.0/emoney/topup`) | Instant (BI-FAST 24/7); max IDR 500M/txn major banks |

> **DurianPay as disbursement backbone:** DurianPay's SNAP-compliant API covers BI-FAST transfers, RTGS for amounts ≥ IDR 250M, and all major e-wallets under a single integration. It is a cost-effective complement to Xendit/Midtrans for high-volume bank disbursement, particularly for amounts exceeding standard e-wallet limits. DurianPay also offers real-time account validation (`POST /v1.0/account-inquiry-external`) for 90+ banks — critical for reducing failed off-ramp disbursements.

### 6.4 International Liquidity & Corridor Partners (Tier 4)

| Partner | Role | Corridors |
|---|---|---|
| **Tether (USDT)** | Primary stablecoin liquidity | All corridors |
| **Circle (USDC)** | Secondary stablecoin + Project Garuda bridge | SG, US corridors |
| **Bitfinex** | OTC institutional backstop | All |
| **YellowCard** | Africa corridor bridge (future) | NG, GH |
| **DuitNow (Malaysia)** | QR cross-border linkage (live) | MY → ID |
| **PayNow (Singapore)** | QR cross-border linkage (live) | SG → ID |
| **STC Pay (Saudi Arabia)** | TBD partnership | SA → ID |
| **UAE Exchange** | TBD partnership | UAE → ID |

### 6.6 Strategic Partnership Opportunity: DurianPay

DurianPay is the most strategically significant player to engage early. Its Q1 2026 announcement of stablecoin-based cross-border payments positions it simultaneously as:

| Relationship | Basis | Timeline |
|---|---|---|
| **Disbursement partner** | DurianPay's 130+ bank/e-wallet instant payout network covers exactly what Pintas needs for IDR off-ramp last-mile delivery | **Now (Phase 1)** |
| **Emerging competitor** | Once their stablecoin cross-border product ships, they will target the same B2B cross-border customer base | **Medium-term (12–18 months)** |
| **White-label candidate** | DurianPay needs stablecoin rails (their weakness); Pintas needs payout depth (DurianPay's strength) — mutual white-label arrangement is possible | **Phase 2+ (6–12 months)** |

**Recommended action:** Initiate partnership discussion before DurianPay ships their own stablecoin rails. A commercial API agreement locking in DurianPay as Pintas's preferred disbursement layer — with reciprocal referral for domestic-only use cases — delays their need to build independently and cements Pintas as the stablecoin infrastructure partner for their 400+ enterprise clients.

**Risk:** If DurianPay ships cross-border without partnering, their existing 400-client base and profitability give them faster distribution than Pintas can build from zero. Mitigant: Pintas's OJK **DFA Trader license** (stablecoin-native) is structurally different from DurianPay's **BI PSP Category 2 license** (payment aggregator). They cannot legally substitute — they still need a DFA-licensed partner for the stablecoin leg.

---

### 6.5 Blockchain Networks

| Network | Primary Use | Fee | Speed |
|---|---|---|---|
| **Polygon** | Primary (USDT, USDC) | <$0.01 | <2s |
| **TRON TRC-20** | USDT (dominant in ID market) | <$1 | <3s |
| **Stellar** | Remittance optimization, built-in DEX | <$0.001 | 3–5s |
| **Ethereum** | OTC large settlements | Variable | ~15s |

---

## 7. Core Product Features

### Feature 1: IDR ↔ Stablecoin On-Ramp / Off-Ramp

**Description:** The core primitive. Convert Indonesian Rupiah to USDT/USDC and back, via BI-FAST and licensed exchange partners.

**User Story (On-Ramp):**  
*"As a fintech developer, I call `POST /v1/onramp` with an amount in IDR and receive a Virtual Account number. When my user funds the VA via BI-FAST, the equivalent USDT is credited to their Pintas wallet within 60 seconds."*

**User Story (Off-Ramp):**  
*"As a remittance company, I call `POST /v1/offramp` with USDT amount and an IDR bank account number. The IDR is credited to the recipient's BRI account via BI-FAST within 60 seconds."*

**Settlement Flow:**
```
On-Ramp:  User → BI-FAST VA → Pintas Settlement Engine
          → Exchange VWAP (Indodax/Tokocrypto) → USDT/USDC
          → User's Pintas wallet (Polygon/TRON)

Off-Ramp: USDT → Pintas Settlement Engine
          → Exchange sell (VWAP) → IDR
          → BI-FAST disbursement → Recipient bank / e-wallet
```

**Key metrics:**
- On-ramp to wallet confirmation: <60s (including BI-FAST clearing)
- Off-ramp to IDR credit: <60s
- Spread: 0.3–0.5% over mid-market
- Available: 24/7/365

---

### Feature 2: Cross-Border Payment Settlement

**Description:** Send and receive cross-border payments using stablecoin rails, with automatic IDR disbursement to Indonesian recipients.

**User Story:**  
*"As a remittance app serving Indonesians in Malaysia, I send MYR to Pintas. Within 2 minutes, my user's family in Surabaya receives IDR in their BCA account — without SWIFT, without a correspondent bank."*

**Supported Corridors at Launch:**

| Corridor | Inbound Rail | Volume Potential |
|---|---|---|
| Malaysia → Indonesia | DuitNow QR linkage → BI-FAST | Largest migrant corridor |
| Saudi Arabia → Indonesia | Partner API → USDT → IDR | $3B+ annual inflow |
| UAE → Indonesia | Partner API → USDT → IDR | $1.5B+ annual inflow |
| Singapore → Indonesia | PayNow QRIS linkage → BI-FAST | High-income remittances |
| USA → Indonesia | ACH/Wire → USDC → IDR | Diaspora + B2B |

**Settlement Flow:**
```
Sender (abroad) → Corridor partner API
              → USDT/USDC (Polygon/Stellar/TRON)
              → Pintas Off-Ramp Engine (Indonesia)
              → Exchange sell → IDR
              → BI-FAST / QRIS → Recipient bank or e-wallet
```

**Key metrics:**
- End-to-end settlement: <2 minutes
- Fee: 0.5–1.5% (vs. 5–8% incumbents)
- Disbursement options: Bank (BI-FAST), GoPay, OVO, Dana, ShopeePay, cash pickup (via partner)

---

### Feature 3: Institutional OTC Desk

**Description:** A dedicated trading desk for large-volume IDR ↔ USDT/USDC block trades. Designed for funds, importers/exporters, and corporate treasuries.

**Specifications:**
- Minimum trade size: IDR 75M (~$5,000 USD)
- Quote type: Fixed all-in (no surprise fees or slippage)
- Settlement: T+0 same-day
- Pairs: IDR/USDT, IDR/USDC, IDR/USD (forward quotes available)
- Desk hours: 24/5 (Mon–Fri); on-call weekend coverage for >IDR 5B trades
- Access: Dashboard UI + API (`POST /v1/otc/quote`, `POST /v1/otc/execute`)

**Workflow:**
1. KYB onboarding + AML questionnaire (Tier 3 verification)
2. Request quote (desk responds in <2 minutes during business hours)
3. Confirm trade (counter expires in 30 seconds)
4. Funds move: USDT delivered on-chain + IDR credited via RTGS/BI-FAST

**Liquidity backstop:** Indodax (primary), Tokocrypto/Binance (secondary), Bitfinex (tertiary for large blocks)

---

### Feature 4: Developer API & SDK

**Description:** API-first platform enabling any business to embed Pintas on/off-ramp and payment capabilities with a few lines of code.

**API Endpoints:**

| Endpoint | Method | Description |
|---|---|---|
| `/v1/onramp` | POST | Create IDR → stablecoin conversion (returns VA) |
| `/v1/offramp` | POST | Create stablecoin → IDR conversion (returns tx ID) |
| `/v1/payments` | POST | Initiate cross-border payment |
| `/v1/rates` | GET | Real-time IDR/USDT, IDR/USDC rates (VWAP) |
| `/v1/transactions` | GET | List/query transaction history |
| `/v1/kyc` | POST | Submit KYC for a user (returns verification status) |
| `/v1/webhooks` | POST | Register a webhook endpoint |
| `/v1/otc/quote` | POST | Request OTC quote |
| `/v1/otc/execute` | POST | Execute a confirmed OTC quote |
| `/v1/wallets` | GET/POST | Manage Pintas wallets |

**SDKs:**
- Node.js / TypeScript: `npm install @pintas/sdk`
- Python: `pip install pintas`
- PHP: `composer require pintas/sdk` *(Indonesian developer ecosystem priority)*
- Go: `go get pintas.id/sdk`

**Developer Experience:**
- Sandbox environment at `https://sandbox.pintas.id/v1/`
- Interactive API explorer (Swagger/Redoc)
- Webhook delivery with HMAC-SHA256 signature verification
- Status page at `https://status.pintas.id`

---

### Feature 5: Merchant Payment Acceptance

**Description:** Businesses accept USDT/USDC payments from customers globally, Pintas automatically converts and settles in IDR — eliminating chargebacks and cross-border fees.

**User Story:**  
*"As an Indonesian e-commerce merchant, I embed Pintas's payment widget. When a customer in Singapore pays in USDC, I receive IDR in my BCA account within 60 seconds. My payment processor fee drops from 2.9% (credit card) to 0.5%."*

**Key benefits:**
- Zero chargebacks (irreversible on-chain payments)
- Instant IDR settlement
- 60–80% lower fees vs. credit card
- Global customer reach (any stablecoin wallet)

**Integration modes:**
- JavaScript widget (embed in any webpage)
- Payment link (no-code, hosted checkout)
- API (`POST /v1/payments`)
- QRIS-crypto bridge (generate QR that accepts USDT/USDC)

---

### Feature 6: Treasury Management (Squads)

**Description:** Multi-sig corporate treasury controls for teams managing stablecoin balances.

**Features:**
- Multi-sig approval: 2-of-3 (or configurable M-of-N) required for transfers above threshold
- Spending limits: Daily/weekly/monthly per role (Admin, Treasurer, Viewer)
- Policy engine: Approval workflows by amount, token type, or destination address
- Unified dashboard: Fiat (IDR) + stablecoin balances in one view
- Audit log: Immutable history of all actions (required for OJK compliance reporting)
- Export: CSV/PDF transaction reports for accounting and tax

---

### Feature 7: White Label Solution

**Description:** Launch a branded stablecoin wallet and remittance product in 4–6 weeks, powered by Pintas's infrastructure and OJK license umbrella.

**Included:**
- Customizable mobile app UI (React Native SDK)
- KYC flow with partner's branding
- Pintas on/off-ramp and cross-border rails under the hood
- OJK DFA compliance under Pintas's license (revenue-share model)
- Dedicated integration support team

**Target customers:**
- Regional banks wanting to add stablecoin remittance receipt
- E-wallets wanting to offer international USDT top-up
- Remittance operators wanting to go digital

---

### Feature 8: Compliance & Reporting Dashboard

**Description:** A dedicated compliance interface for OJK-required reporting and internal AML monitoring.

**Features:**
- Real-time transaction monitoring with risk scoring (Chainalysis/Elliptic integration)
- Sanctions screening results (OFAC, UN, EU, PPATK)
- One-click OJK monthly reports (POJK 27/2024 Article 45)
- PPATK STR/UTR submission workflow
- Travel rule compliance log (sender/receiver VASP data for cross-border >IDR 46M)
- PPh Pasal 22 (0.21%) withholding calculation and DJP remittance summary

---

## 8. Technical Architecture

### 8.1 System Overview

```
┌──────────────────────────────────────────────────────────┐
│                    PINTAS PLATFORM                        │
│                                                          │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  REST API   │  │ WebSocket  │  │  Dashboard UI    │  │
│  │  (v1/)      │  │ (rates/    │  │  (compliance +   │  │
│  │             │  │  webhooks) │  │   treasury)      │  │
│  └──────┬──────┘  └─────┬──────┘  └────────┬─────────┘  │
│         └───────────────┴─────────────────┘             │
│                          │                               │
│              ┌───────────▼────────────┐                  │
│              │   Settlement Engine    │                  │
│              │   (rate oracle, VWAP,  │                  │
│              │   routing, custody)    │                  │
│              └──────────┬─────────────┘                  │
│         ┌───────────────┼──────────────┐                 │
│         ▼               ▼              ▼                 │
│   ┌──────────┐  ┌──────────────┐  ┌──────────────┐      │
│   │ Exchange │  │  Blockchain  │  │  IDR Rails   │      │
│   │ Partners │  │  Networks    │  │  (BI-FAST,   │      │
│   │ (Indodax,│  │ (Polygon,    │  │   QRIS,      │      │
│   │  Tokocr.,│  │  TRON,       │  │   RTGS)      │      │
│   │  Pintu)  │  │  Stellar,    │  │              │      │
│   └──────────┘  │  Ethereum)   │  └──────────────┘      │
│                 └──────────────┘                         │
└──────────────────────────────────────────────────────────┘
```

### 8.2 Settlement Flow Detail

**On-Ramp (IDR → USDT):**
1. API call → Pintas creates BI-FAST Virtual Account (VA) for user
2. User transfers IDR via BI-FAST/internet banking → VA credited in <25s
3. Pintas Settlement Engine queries live VWAP from Indodax + Tokocrypto
4. Best-rate exchange selected; IDR sold → USDT purchased
5. USDT transferred to user's Pintas custodial wallet (Polygon or TRON)
6. Webhook fired: `onramp.completed` with tx hash and final amount
7. Total time: <60 seconds end-to-end

**Off-Ramp (USDT → IDR):**
1. API call with USDT amount + recipient bank/e-wallet details
2. USDT transferred from user wallet to Pintas settlement wallet
3. VWAP sell executed on exchange partner (IDR credited to Pintas IDR pool)
4. IDR disbursed via BI-FAST to recipient bank account OR Xendit to e-wallet
5. Webhook fired: `offramp.completed` with bank reference number
6. Total time: <60 seconds end-to-end

**Cross-Border Remittance (MY → ID example):**
1. Malaysian sender pays MYR via DuitNow QR to Pintas Malaysian partner
2. Partner API notifies Pintas of MYR receipt; IDR equivalent quoted
3. USDT minted/transferred on Polygon from Malaysian liquidity pool
4. Indonesian off-ramp triggered automatically
5. IDR disbursed via BI-FAST or QRIS to recipient
6. Both sender and recipient get SMS/push notification
7. Total time: <2 minutes

### 8.3 Infrastructure Specifications

| Parameter | Target |
|---|---|
| API uptime | 99.99% |
| API latency (p95) | <15ms |
| Settlement speed (stablecoin) | <2s on-chain |
| Settlement speed (IDR, end-to-end) | <60s |
| Hosting | AWS Jakarta (ap-southeast-3) — data residency compliance |
| Throughput | 10,000 transactions/minute |

### 8.4 Security Architecture

- **API Authentication:** Bearer JWT with granular scopes; API keys with IP whitelisting
- **Request Signing:** HMAC-SHA256 on all API requests
- **Custody:** MPC (Multi-Party Computation) wallets — no single key exposure; institutional-grade
- **Encryption:** AES-256 at rest, TLS 1.3 in transit
- **HSM:** Hardware Security Modules for private key ceremony and root key management
- **2FA:** TOTP and hardware key (YubiKey) for dashboard access
- **Penetration testing:** Quarterly third-party pen tests; bug bounty program

### 8.5 Tech Stack

| Layer | Technology |
|---|---|
| API | Node.js (TypeScript), REST + WebSocket |
| Database | PostgreSQL (primary), Redis (caching/rate limiting) |
| Message queue | Apache Kafka (event streaming for settlement) |
| Blockchain | Ethers.js (Polygon/Ethereum), Stellar SDK, TronWeb |
| KYC | Verihubs (Indonesian NIK/KTP verification) or Smile Identity |
| AML | Chainalysis KYT or Elliptic Navigator |
| Travel Rule | Notabene or VerifyVASP |
| Monitoring | Datadog (APM + logs), PagerDuty (alerting) |
| CI/CD | GitHub Actions → AWS ECS (containerized) |

---

## 9. Compliance & Risk Management

### 9.1 AML/CFT Program

Pintas maintains a full AML/CFT program compliant with SEOJK 20/2024 and FATF Recommendations:

**Customer Due Diligence (CDD):**
- All customers screened at onboarding against PPATK, OFAC, UN, EU sanctions lists
- Periodic re-screening for existing customers (quarterly for Tier 2/3)
- Beneficial ownership verification for all business accounts (UBO >25% threshold)

**Transaction Monitoring:**
- Real-time blockchain analytics via Chainalysis KYT: incoming/outgoing wallet risk scoring
- Rule-based monitoring: velocity checks, structuring detection, high-risk jurisdiction flags
- Alert review queue with 24h SLA for compliance team triage

**Reporting Obligations:**
- STR to PPATK: within 3 working days of suspicion identification
- UTR to PPATK: within 14 working days
- CTR (Cash Transaction Report): for IDR cash equivalents >IDR 500M per transaction

**Travel Rule (FATF R.15):**
- Transfers >IDR 46M (~$3,000): originator and beneficiary VASP information transmitted
- Integration with Notabene/VerifyVASP for VASP-to-VASP travel rule messages

### 9.2 Risk Framework

| Risk Category | Control |
|---|---|
| Counterparty risk | Exchange partner diversification (3+ venues); daily settlement reconciliation |
| Liquidity risk | Maintain 110% IDR reserve cover; pre-funded liquidity lines with exchanges |
| FX/stablecoin depeg risk | Automated depegging alerts; 5% stablecoin concentration limit per issuer |
| Regulatory risk | Monthly OJK liaison; legal retainer with Indonesian fintech law firm |
| Operational risk | Hot/warm/cold wallet architecture; 99.99% uptime SLA; multi-region failover |
| Cybersecurity risk | Annual pen test; bug bounty; MPC custody; HSM key management |

### 9.3 Data Protection (UU PDP 2022)

- Personal data stored exclusively on AWS Jakarta (ap-southeast-3) — no cross-border transfer without consent
- Data minimization: collect only what is required for KYC/AML obligations
- User consent management at onboarding with explicit data processing consent
- Breach notification: BSSN and affected users within 14 days of confirmed breach
- Data retention: Transaction records retained 5 years (AML requirement); user data deletable on request after account closure (subject to legal hold)

---

## 10. Go-to-Market Strategy

### 10.1 Phase 1 — Remittance Corridor (Months 1–6)

**Focus:** Malaysia → Indonesia (largest migrant worker corridor, QRIS-DuitNow linkage already live)

**Channels:**
- Partner with 1–2 Malaysian fintech/e-wallet companies that serve Indonesian TKI workers
- Pilot with Indonesian migrant worker communities (TKI associations in Kuala Lumpur)
- B2B API launch for 5 early-access Indonesian fintech partners

**Regulatory milestone:** OJK DFA Trader license application submitted by Month 2; first approval review by Month 5.

**Pricing:** 0.8% flat fee for remittance (vs. 5–8% Western Union/bank). Exchange spread: 0.3–0.5%.

**KPIs:** $5M/month volume, 10,000 active users, 5 API partners

---

### 10.2 Phase 2 — API Platform (Months 6–12)

**Focus:** B2B API for Indonesian fintechs, adding Saudi Arabia + UAE + Singapore corridors

**Channels:**
- Developer marketing: documentation, sandbox, GitHub SDK, fintech community events (IFSEConf, Tech in Asia Indonesia)
- Sales: Direct outreach to Indonesian neobanks (Jenius/BTPN, Allo Bank, SeaBank), remittance companies (SkyRemit, InstaRem local partners)
- Corridor expansion: Saudi Arabia partnership (STC Pay or Saudi Exchange network); UAE Exchange tie-up

**Regulatory milestone:** OJK DFA Trader license granted (expected Month 8–10)

**KPIs:** 20 API customers, $30M/month volume, 4 corridors live

---

### 10.3 Phase 3 — Institutional & White Label (Months 12–18)

**Focus:** OTC desk for importers/exporters; white-label for regional banks

**Channels:**
- Enterprise sales for white-label: pitch to Bank BJB, Bank Jatim, or mid-tier banks lacking stablecoin capability
- OTC: BD outreach to Indonesian import/export associations (KADIN, GPEI)
- US corridor: ACH/wire integration for Indonesian diaspora in US

**KPIs:** $100M/month volume, 50 API customers, 6 corridors, 1 white-label bank deal, IDR 75M/day OTC capacity

---

## 11. Success Metrics & KPIs

### Business Metrics

| Metric | Month 6 | Month 12 | Month 18 |
|---|---|---|---|
| Monthly settlement volume | $5M | $30M | $100M |
| Active API customers (paying) | 5 | 20 | 50 |
| Active remittance users | 10,000 | 50,000 | 200,000 |
| Corridors live | 1 (MY) | 4 (MY/SA/UAE/SG) | 6 (+ US, AU) |
| OTC monthly volume | — | $5M | $25M |
| White-label partnerships | — | 1 | 3 |

### Technical Metrics

| Metric | Target |
|---|---|
| API uptime | ≥99.99% |
| Settlement speed (p95) | <2s on-chain; <60s IDR end-to-end |
| API latency (p95) | <15ms |
| Failed transaction rate | <0.1% |
| Webhook delivery rate | >99.9% |

### Regulatory Metrics

| Milestone | Target Date |
|---|---|
| OJK DFA Trader license application | Month 2 |
| OJK license granted | Month 8–10 |
| First OJK monthly report submitted | Month 3 |
| AML audit completed | Month 12 |
| UU PDP compliance certification | Month 6 |

### Customer Success Metrics

| Metric | Target |
|---|---|
| B2B NPS | ≥50 at Month 12 |
| API time-to-first-transaction | <1 day (with sandbox) |
| Support ticket resolution (P1) | <4 hours |
| Documentation completeness | 100% endpoint coverage |

---

## 12. Phased Roadmap

### Phase 1: Foundation (Months 1–3)

**Goal:** Build the core settlement engine and achieve a working IDR ↔ USDT on/off-ramp in sandbox.

- [ ] OJK DFA Trader license application submitted
- [ ] BI-FAST Virtual Account integration (BCA/Mandiri partnership)
- [ ] Indodax + Tokocrypto exchange API integration (VWAP engine)
- [ ] Core settlement engine: IDR → USDT → IDR (Polygon + TRON)
- [ ] REST API v1: `/v1/onramp`, `/v1/offramp`, `/v1/rates`, `/v1/transactions`
- [ ] KYC Tier 1: NIK/KTP + selfie (via Verihubs integration)
- [ ] Webhook delivery system
- [ ] Sandbox environment (https://sandbox.pintas.id)
- [ ] Node.js SDK (primary market)
- [ ] Developer documentation (Mintlify or GitBook)

### Phase 2: Remittance MVP & Compliance (Months 3–6)

**Goal:** Launch live Malaysia → Indonesia corridor; achieve OJK compliance milestone.

- [ ] Malaysia corridor: DuitNow QR linkage integration (via Bank Negara Malaysia partner)
- [ ] E-wallet disbursement: GoPay + Dana via Xendit API
- [ ] QRIS disbursement for e-wallet off-ramp
- [ ] Travel rule module (Notabene integration)
- [ ] PPATK AML reporting integration
- [ ] Compliance dashboard (OJK monthly report export)
- [ ] Python SDK
- [ ] WebSocket rate feed (real-time IDR/USDT, IDR/USDC)
- [ ] KYC Tier 2 (KYB for business accounts)
- [ ] OJK compliance: SEOJK 20/2024 full implementation
- [ ] OVO + ShopeePay disbursement (via Midtrans)
- [ ] Live production launch (Malaysia corridor, B2B API)

### Phase 3: Platform Scale & Institutional (Months 6–12)

**Goal:** Expand to 4 corridors, launch OTC desk, grow to 20 API customers.

- [ ] OJK DFA Trader license received
- [ ] Saudi Arabia corridor (STC Pay / partner integration)
- [ ] UAE corridor (UAE Exchange / partner integration)
- [ ] Singapore corridor (PayNow QRIS linkage)
- [ ] OTC desk: IDR 75M minimum, T+0, dashboard + API
- [ ] RTGS Gen 3 integration (high-value IDR settlement)
- [ ] Treasury / Squads (multi-sig, spending limits, audit log)
- [ ] Merchant payment acceptance widget
- [ ] Chainalysis KYT integration (blockchain AML analytics)
- [ ] PHP SDK (Indonesian developer ecosystem)
- [ ] Go SDK
- [ ] Stellar network support (remittance cost optimization)
- [ ] White-label SDK (React Native, first pilot partner)
- [ ] External AML audit (Year 1 requirement)
- [ ] KYC Tier 3 (Institutional enhanced DD)

### Phase 4: Expansion (Months 12–18)

**Goal:** $100M/month, white-label bank deal, US corridor.

- [ ] US corridor: ACH/SWIFT → USDC bridge
- [ ] Australia corridor (Indonesian diaspora in AU)
- [ ] White-label production deployment (1 bank partner)
- [ ] Crypto derivatives framework (POJK 23/2025 scope: IDR/USDT futures)
- [ ] Project Garuda integration (Bank Indonesia digital rupiah, when live)
- [ ] BIS Nexus cross-border integration (BI-FAST upgrade for Nexus compatibility)
- [ ] Institutional OTC: FX forward quotes (IDR/USD)
- [ ] Expanded Squads: organization hierarchies, policy engine, SSO

---

## Appendix A: Competitive Landscape

| Provider | Type | Indonesia Corridor | API | Stablecoin | License |
|---|---|---|---|---|---|
| Western Union | Incumbent remittance | ✓ | Limited | ✗ | BI (payment company) |
| Wise | Digital remittance | ✓ | ✓ | ✗ | BI (partial) |
| Indodax | Crypto exchange | ✓ | ✓ (exchange only) | ✓ | OJK DFA Exchange |
| Tokocrypto | Crypto exchange | ✓ | ✓ (exchange only) | ✓ | OJK (PFAK) |
| **DurianPay** | Payment orchestrator → cross-border | Building (announced Q1 2026) | ✓ (full, domestic; cross-border TBD) | ✓ (planned, not live) | BI PSP Cat 2 + OJK registered (aggregator) |
| **Pintas** | **Stablecoin payment infrastructure** | **✓ (core product)** | **✓ (full — on-ramp, off-ramp, cross-border, OTC)** | **✓ (native)** | **OJK DFA Trader (applying)** |

**Competitive positioning:**

- **vs. Incumbents (WU, Wise):** Pintas is 10× cheaper (sub-1% vs. 5–8%) and settles in <2 minutes vs. 1–3 days. No stablecoin capability.
- **vs. Exchanges (Indodax, Tokocrypto):** Exchanges are IDR liquidity partners, not competitors. They lack cross-border corridors, remittance disbursement, OTC, and white-label.
- **vs. DurianPay:** The most nuanced comparison. DurianPay has Indonesia's deepest domestic disbursement network (130+ banks, 400+ enterprise clients, $5.5B TPV) but is a **payment aggregator adding stablecoin**, not a stablecoin-native infrastructure. Their BI PSP Category 2 license does not cover digital financial asset trading — they will need an OJK DFA-licensed partner for the stablecoin leg regardless. Pintas holds the DFA Trader license, making it the infrastructure layer DurianPay cannot replace. The preferred strategy is partnership (Pintas stablecoin rails + DurianPay IDR payout network), not head-on competition.

---

## Appendix B: Key Regulatory References

| Document | Issuer | URL / Reference |
|---|---|---|
| POJK 27/2024 | OJK | Peraturan OJK No. 27 Tahun 2024 |
| POJK 23/2025 | OJK | Peraturan OJK No. 23 Tahun 2025 (amends POJK 27/2024) |
| SEOJK 20/2024 | OJK | Surat Edaran OJK No. 20 Tahun 2024 (KYC/AML) |
| UU PDP 2022 | DPR/Government | Undang-Undang No. 27 Tahun 2022 tentang Perlindungan Data Pribadi |
| BI Currency Law | Bank Indonesia | Undang-Undang No. 7 Tahun 2011 tentang Mata Uang |
| Project Garuda | Bank Indonesia | Rupiah Digital initiative (CBDC) |
| FATF R.15 | FATF | Travel rule for virtual asset service providers |

---

*Document maintained by: Pintas Product Team*  
*Next review date: Q1 2027*
