import crypto from 'crypto'
import type { ChainProvider } from './interface.js'

export const mockChainProvider: ChainProvider = {
  transfer: async (_orderId, _toAddress, _amount) => ({
    txHash: '0x' + crypto.randomBytes(32).toString('hex'),
    status: 'CONFIRMED',
  }),
  getConfirmations: async (_txHash) => 12,
}
