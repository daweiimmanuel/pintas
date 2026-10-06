import type { PayoutProvider } from './interface.js'

export const mockPayoutProvider: PayoutProvider = {
  payout:    async (orderId, _accountRef, _amount) => ({ providerRef: `mock-payout-${orderId}`, status: 'SUCCESS' }),
  getStatus: async (ref) => ({ providerRef: ref, status: 'SUCCESS' }),
}
