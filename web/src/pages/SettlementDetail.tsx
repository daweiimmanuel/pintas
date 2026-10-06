import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api, type SettlementOrder, type OrderEvent } from '../api'
import StatusBadge from '../components/StatusBadge'

const TERMINAL_STATES = new Set([
  'RECONCILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'MANUAL_REVIEW',
])

function usdToCents(usdStr: string): string {
  return String(Math.round(parseFloat(usdStr) * 100))
}

export default function SettlementDetail() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<SettlementOrder | null>(null)
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function loadData() {
    if (!id) return
    try {
      const [o, evts] = await Promise.all([
        api.get<SettlementOrder>(`/v1/settlements/${id}`),
        api.get<OrderEvent[]>(`/v1/settlements/${id}/events`),
      ])
      setOrder(o)
      setEvents(evts)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    intervalRef.current = setInterval(loadData, 2000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sandboxAction(action: 'fund' | 'fund-partial' | 'advance' | 'fail') {
    if (!id || !order) return
    setActionMsg(null)
    try {
      let endpoint: string
      let body: unknown

      if (action === 'fund' || action === 'fund-partial') {
        const fullCents = usdToCents(order.invoiceAmountUsd)
        const cents = action === 'fund'
          ? fullCents
          : String(Math.floor(parseInt(fullCents) / 2))
        endpoint = `/v1/sandbox/settlements/${id}/fund`
        body = { amountCents: cents }
      } else if (action === 'advance') {
        endpoint = `/v1/sandbox/settlements/${id}/advance`
        body = {}
      } else {
        endpoint = `/v1/sandbox/settlements/${id}/fail`
        body = { reason: 'Simulated failure' }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } }
        throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
      }

      setActionMsg(
        action === 'fund' ? 'Full payment simulated ✓' :
        action === 'fund-partial' ? '50% payment simulated ✓' :
        action === 'advance' ? 'Step advanced ✓' :
        'Step failed ✓'
      )
      await loadData()
    } catch (e) {
      setActionMsg(`Error: ${String(e)}`)
    }
  }

  if (loading && !order) return <div className="loading">Loading settlement…</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!order) return <div className="alert alert-error">Settlement not found</div>

  const isTerminal = TERMINAL_STATES.has(order.status)
  const canFund = ['DRAFT', 'AWAITING_FUNDS'].includes(order.status)
  const canAdvance = ['FUNDED', 'MINTED', 'IN_TRANSIT', 'ARRIVED', 'REDEEMED', 'PAID_OUT'].includes(order.status)
  const canFail = order.status === 'IN_TRANSIT'

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <Link to="/" className="back-link">← All Settlements</Link>
          <h1>{order.invoiceRef}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Amounts summary */}
      <div className="card amounts-grid">
        <div>
          <span className="label">Invoice Amount</span>
          <strong>${order.invoiceAmountUsd}</strong>
        </div>
        <div>
          <span className="label">Funded</span>
          <strong>${order.fundedAmountUsd}</strong>
        </div>
        <div>
          <span className="label">Fee</span>
          <strong>${order.feeUsd}</strong>
        </div>
        <div>
          <span className="label">Net Payout</span>
          <strong>${order.netPayoutUsd}</strong>
        </div>
      </div>

      {/* Collection instruction */}
      {order.collectionInstruction && (
        <div className="card">
          <h3>Payment Details</h3>
          <div className="detail-row">
            <span>Payment Reference</span>
            <code>{order.collectionInstruction.paymentReference}</code>
          </div>
          <div className="detail-row">
            <span>Virtual Account</span>
            <code>{order.collectionInstruction.virtualAccountRef}</code>
          </div>
          {Object.entries(order.collectionInstruction.bankDetails ?? {}).map(([k, v]) => (
            <div key={k} className="detail-row">
              <span>{k}</span>
              <code>{v}</code>
            </div>
          ))}
        </div>
      )}

      {/* Sandbox action panel */}
      {!isTerminal && (
        <div className="card sandbox-panel">
          <h3>Sandbox Actions</h3>
          {actionMsg && (
            <div className={`alert ${actionMsg.startsWith('Error') ? 'alert-error' : 'alert-success'}`}>
              {actionMsg}
            </div>
          )}
          <div className="btn-row">
            <button
              onClick={() => sandboxAction('fund')}
              disabled={!canFund}
              className="btn btn-primary"
              title={canFund ? 'Simulate buyer sending the full invoice amount' : 'Only available in DRAFT or AWAITING_FUNDS'}
            >
              Simulate Full Payment
            </button>
            <button
              onClick={() => sandboxAction('fund-partial')}
              disabled={!canFund}
              className="btn btn-secondary"
              title={canFund ? 'Simulate buyer sending 50% of the invoice amount' : 'Only available in DRAFT or AWAITING_FUNDS'}
            >
              Simulate 50% Payment
            </button>
          </div>
          <div className="btn-row">
            <button
              onClick={() => sandboxAction('advance')}
              disabled={!canAdvance}
              className="btn btn-primary"
              title={canAdvance ? 'Advance to the next settlement step' : 'Only available after FUNDED'}
            >
              Advance Step
            </button>
            <button
              onClick={() => sandboxAction('fail')}
              disabled={!canFail}
              className="btn btn-danger"
              title={canFail ? 'Fail the current step' : 'Only available at IN_TRANSIT'}
            >
              Fail Next Step
            </button>
          </div>
          <p className="muted small" style={{ marginTop: '8px' }}>
            Current status: <strong>{order.status}</strong>
          </p>
        </div>
      )}

      {/* Status timeline */}
      <div className="card">
        <h3>Status Timeline</h3>
        {events.length === 0 ? (
          <p className="muted">No transitions yet.</p>
        ) : (
          <div className="timeline">
            {events.map(evt => (
              <div key={evt.id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-status">
                    <span className="muted">{evt.fromStatus}</span>
                    <span className="arrow">→</span>
                    <strong>{evt.toStatus}</strong>
                  </div>
                  <div className="muted small">
                    {new Date(evt.createdAt).toLocaleString()} · {evt.trigger} · {evt.actor}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="muted small" style={{ textAlign: 'right', marginTop: '8px' }}>
        Polling every 2s · version {order.version}
      </div>
    </div>
  )
}
