import axios from 'axios'
import { config } from '../../config/index.js'

// Travel Rule compliance — SEOJK 20/2024 / FATF Recommendation 16
// Transfers above IDR 46,000,000 require VASP originator/beneficiary data (IVMS 101)
// Integration: Notabene (https://notabene.id)
// Fail-open: if API key absent or API errors, log and continue (sandbox/prototype mode)

const TRAVEL_RULE_THRESHOLD_IDR = 46_000_000

export interface TravelRuleParty {
  name: string
  accountNumber?: string
  country: string // ISO 3166-1 alpha-2
}

export interface TravelRulePayload {
  transferId: string
  amountIdr: string
  originator: TravelRuleParty
  beneficiary: TravelRuleParty
}

export function travelRuleRequired(amountIdr: string): boolean {
  return parseFloat(amountIdr) >= TRAVEL_RULE_THRESHOLD_IDR
}

export async function submitTravelRule(payload: TravelRulePayload): Promise<void> {
  if (!config.NOTABENE_API_KEY) {
    console.log('[travel-rule] NOTABENE_API_KEY not set — logging payload only:', JSON.stringify(payload))
    return
  }

  try {
    // IVMS 101 wire format
    const ivms = {
      transactionAsset: 'IDR',
      transactionAmount: payload.amountIdr,
      originator: {
        originatorPersons: [
          {
            naturalPerson: {
              name: [{ nameIdentifier: [{ primaryIdentifier: payload.originator.name }] }],
            },
          },
        ],
        accountNumber: payload.originator.accountNumber ? [payload.originator.accountNumber] : [],
      },
      beneficiary: {
        beneficiaryPersons: [
          {
            naturalPerson: {
              name: [{ nameIdentifier: [{ primaryIdentifier: payload.beneficiary.name }] }],
            },
          },
        ],
        accountNumber: payload.beneficiary.accountNumber ? [payload.beneficiary.accountNumber] : [],
      },
      beneficiaryVASP: { identification: 'pintas.id' },
    }

    await axios.post(
      `${config.NOTABENE_API_URL}/api/v1/ivms-transfers`,
      {
        id: payload.transferId,
        originatorVASPdid: 'pintas.id',
        beneficiaryVASPdid: 'pintas.id',
        ivmsDataSet: ivms,
      },
      {
        headers: {
          Authorization: `Bearer ${config.NOTABENE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    )

    console.log(`[travel-rule] Submitted transfer ${payload.transferId}`)
  } catch (err) {
    // Fail-open: log error but don't block the disbursement
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[travel-rule] Submission failed for ${payload.transferId} — continuing: ${msg}`)
  }
}
