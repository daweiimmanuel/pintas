import type { CollectionProvider } from './interface.js'

export const mockCollectionProvider: CollectionProvider = {
  createInstruction: async (orderId, _amountCents) => ({
    provider: 'mock',
    virtualAccountRef: `va-mock-${orderId}`,
    paymentReference: `PNT-${orderId}`,
    bankDetails: {
      bankName: 'Mock Bank',
      accountNumber: '0000-MOCK',
      routingNumber: '021000021',
      swiftCode: 'MOCKUS33',
    },
  }),

  verifyWebhook: (_headers, _rawBody) => true,

  parseIncomingPayment: (body) => {
    const b = body as Record<string, unknown>
    return {
      providerPaymentId: String(b['providerPaymentId'] ?? `mock-pay-${Date.now()}`),
      paymentReference:  String(b['paymentReference'] ?? ''),
      amountCents:       BigInt(String(b['amountCents'] ?? 0)),
      payerName:         b['payerName'] ? String(b['payerName']) : undefined,
      receivedAt:        new Date(),
    }
  },
}
