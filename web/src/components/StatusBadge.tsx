function statusClass(status: string): string {
  if (status === 'RECONCILED') return 'success'
  if (['PAID_OUT', 'PAYING_OUT'].includes(status)) return 'green'
  if (['REDEEMED', 'REDEEMING', 'ARRIVED', 'IN_TRANSIT'].includes(status)) return 'teal'
  if (['FUNDED', 'MINTING', 'MINTED'].includes(status)) return 'blue'
  if (status === 'AWAITING_FUNDS') return 'amber'
  if (['REFUND_PENDING', 'REFUNDED'].includes(status)) return 'orange'
  if (status.endsWith('_FAILED') || status === 'MANUAL_REVIEW') return 'danger'
  return 'neutral' // DRAFT, CANCELLED, EXPIRED
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${statusClass(status)}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
