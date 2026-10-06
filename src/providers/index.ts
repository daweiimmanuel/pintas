import { mockCollectionProvider } from './collection/mock.js'
import { mockRampProvider } from './ramp/mock.js'
import { mockChainProvider } from './chain/mock.js'
import { mockPayoutProvider } from './payout/mock.js'
import type { CollectionProvider } from './collection/interface.js'
import type { RampProvider } from './ramp/interface.js'
import type { ChainProvider } from './chain/interface.js'
import type { PayoutProvider } from './payout/interface.js'

export type { CollectionProvider, RampProvider, ChainProvider, PayoutProvider }

const mode = process.env.PROVIDER_MODE ?? 'mock'

export function getCollectionProvider(): CollectionProvider {
  if (mode === 'mock') return mockCollectionProvider
  throw new Error(`Unknown PROVIDER_MODE: ${mode}`)
}

export function getRampProvider(): RampProvider {
  if (mode === 'mock') return mockRampProvider
  throw new Error(`Unknown PROVIDER_MODE: ${mode}`)
}

export function getChainProvider(): ChainProvider {
  if (mode === 'mock') return mockChainProvider
  throw new Error(`Unknown PROVIDER_MODE: ${mode}`)
}

export function getPayoutProvider(): PayoutProvider {
  if (mode === 'mock') return mockPayoutProvider
  throw new Error(`Unknown PROVIDER_MODE: ${mode}`)
}
