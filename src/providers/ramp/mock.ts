import type { RampProvider } from './interface.js'

export const mockRampProvider: RampProvider = {
  mint:    async (orderId, _amount) => ({ providerRef: `mock-mint-${orderId}`,   status: 'SUCCESS' }),
  redeem:  async (orderId, _amount) => ({ providerRef: `mock-redeem-${orderId}`, status: 'SUCCESS' }),
  getStatus: async (ref) => ({ providerRef: ref, status: 'SUCCESS' }),
}
