import { config } from '../../config/index.js'

export type AmlRisk = 'low' | 'medium' | 'high' | 'severe'

export interface ScreeningResult {
  address: string
  risk: AmlRisk
  cluster?: string
}

export async function screenAddress(address: string): Promise<ScreeningResult> {
  if (!config.CHAINALYSIS_API_KEY) {
    return { address, risk: 'low' }
  }

  try {
    const res = await fetch(
      `${config.CHAINALYSIS_API_URL}/v1/risk/address/${encodeURIComponent(address)}`,
      {
        headers: {
          'X-API-KEY': config.CHAINALYSIS_API_KEY,
          Accept: 'application/json',
        },
      }
    )

    if (!res.ok) {
      console.error(`[aml] Chainalysis error: ${res.status}`)
      return { address, risk: 'low' } // fail-open on provider error
    }

    const data = (await res.json()) as { risk?: string; cluster?: { name?: string } }
    return {
      address,
      risk: normalizeRisk(data.risk ?? 'low'),
      cluster: data.cluster?.name,
    }
  } catch (err) {
    console.error('[aml] Chainalysis request failed:', err)
    return { address, risk: 'low' } // fail-open on network error
  }
}

export function isHighRisk(result: ScreeningResult): boolean {
  return result.risk === 'high' || result.risk === 'severe'
}

function normalizeRisk(raw: string): AmlRisk {
  const r = raw.toLowerCase()
  if (r === 'severe') return 'severe'
  if (r === 'high') return 'high'
  if (r === 'medium') return 'medium'
  return 'low'
}
