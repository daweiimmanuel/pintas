export interface CollectionInstruction {
  provider: string
  virtualAccountRef: string
  paymentReference: string
  bankDetails: Record<string, string>
}

export interface IncomingPaymentEvent {
  providerPaymentId: string
  paymentReference: string
  amountCents: bigint
  payerName?: string
  receivedAt: Date
}

export interface CollectionProvider {
  createInstruction(orderId: string, amountCents: bigint): Promise<CollectionInstruction>
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean
  parseIncomingPayment(body: unknown): IncomingPaymentEvent
}
