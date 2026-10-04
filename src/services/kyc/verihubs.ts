import axios from 'axios'
import { config } from '../../config/index.js'
import type { KycTier1Request, KycTier2Request, KycResult } from '../../types/index.js'

// Verihubs eKYC — NIK validation via Dukcapil, liveness check
// Docs: https://docs.verihubs.com

function verihubsHeaders(): Record<string, string> {
  return {
    'app-id': config.VERIHUBS_APP_ID ?? 'sandbox',
    Authorization: `Bearer ${config.VERIHUBS_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
  }
}

interface VerihubsNikResponse {
  request_id: string
  status: string       // '1' = match, '0' = no match, '-1' = data not found
  name_similarity: number
  message: string
}

interface VerihubsLivenessResponse {
  request_id: string
  is_alive: boolean
  similarity: number
  message: string
}

export async function verifyTier1(req: KycTier1Request): Promise<KycResult> {
  if (!config.VERIHUBS_API_KEY) {
    return mockKycApproval(`mock_${req.nik}`)
  }

  // Step 1: NIK + name match via Dukcapil
  const nikRes = await axios.post<VerihubsNikResponse>(
    `${config.VERIHUBS_API_URL}/v2/nik`,
    {
      nik: req.nik,
      name: req.fullName,
      dob: req.dateOfBirth,
    },
    { headers: verihubsHeaders(), timeout: 15000 }
  )

  if (nikRes.data.status !== '1') {
    return {
      providerRef: nikRes.data.request_id,
      status: 'rejected',
      notes: `NIK validation failed: ${nikRes.data.message}`,
    }
  }

  // Step 2: Liveness check if selfie provided
  if (req.selfieBase64) {
    const livenessRes = await axios.post<VerihubsLivenessResponse>(
      `${config.VERIHUBS_API_URL}/v2/face-liveness`,
      { image: req.selfieBase64 },
      { headers: verihubsHeaders(), timeout: 20000 }
    )

    if (!livenessRes.data.is_alive || livenessRes.data.similarity < 0.7) {
      return {
        providerRef: livenessRes.data.request_id,
        status: 'rejected',
        score: livenessRes.data.similarity,
        notes: 'Liveness check failed',
      }
    }

    return {
      providerRef: livenessRes.data.request_id,
      status: 'approved',
      score: livenessRes.data.similarity,
    }
  }

  return {
    providerRef: nikRes.data.request_id,
    status: 'approved',
    score: nikRes.data.name_similarity,
  }
}

interface VerihubsNpwpResponse {
  request_id: string
  status: string
  message: string
}

export async function verifyTier2(req: KycTier2Request): Promise<KycResult> {
  if (!config.VERIHUBS_API_KEY) {
    return mockKycApproval(`mock_npwp_${req.npwp}`)
  }

  const res = await axios.post<VerihubsNpwpResponse>(
    `${config.VERIHUBS_API_URL}/v2/npwp`,
    {
      npwp: req.npwp,
      name: req.companyName,
    },
    { headers: verihubsHeaders(), timeout: 15000 }
  )

  if (res.data.status !== '1') {
    return {
      providerRef: res.data.request_id,
      status: 'rejected',
      notes: `NPWP validation failed: ${res.data.message}`,
    }
  }

  return {
    providerRef: res.data.request_id,
    status: 'approved',
  }
}

function mockKycApproval(ref: string): KycResult {
  return { providerRef: ref, status: 'approved', score: 0.99 }
}
