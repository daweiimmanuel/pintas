import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../context'
import { api, type Quote, type SettlementOrder, type Buyer } from '../api'

type Step = 'form' | 'quote' | 'done'

export default function NewInvoice() {
  const { exporterId, buyerId } = useSession()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('form')
  const [buyer, setBuyer] = useState<Buyer | null>(null)
  const [amount, setAmount] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [order, setOrder] = useState<SettlementOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get<Buyer>(`/v1/buyers/${buyerId}`)
      .then(b => setBuyer(b))
      .catch(() => {/* buyer name is cosmetic */ })
  }, [buyerId])

  async function getQuote() {
    if (!amount || !invoiceRef) return
    setLoading(true)
    setError(null)
    try {
      const invoiceAmountUsd = parseFloat(amount).toFixed(2)
      const q = await api.post<Quote>('/v1/quotes', { exporterId, invoiceAmountUsd })
      setQuote(q)
      setStep('quote')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    if (!quote) return
    setLoading(true)
    setError(null)
    try {
      const o = await api.post<SettlementOrder>('/v1/settlements', {
        exporterId,
        buyerId,
        quoteId: quote.id,
        invoiceRef,
      })
      setOrder(o)
      setStep('done')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {/* clipboard API may be blocked in insecure context */ })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const stepIndex = { form: 0, quote: 1, done: 2 }[step]

  return (
    <div className="page page-narrow">
      <h1>New Invoice</h1>

      <div className="steps">
        {(['Invoice Details', 'Confirm Quote', 'Payment Info'] as const).map((label, i) => (
          <div
            key={label}
            className={`step ${i === stepIndex ? 'step-active' : i < stepIndex ? 'step-done' : ''}`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {step === 'form' && (
        <div className="card">
          <div className="field">
            <label>Buyer</label>
            <input
              value={buyer ? buyer.legalName : buyerId}
              disabled
              className="input"
            />
          </div>
          <div className="field">
            <label>Invoice Amount (USD)</label>
            <input
              type="number"
              min="100"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 5000.00"
              className="input"
            />
          </div>
          <div className="field">
            <label>Invoice Reference</label>
            <input
              value={invoiceRef}
              onChange={e => setInvoiceRef(e.target.value)}
              placeholder="e.g. INV-2026-001"
              className="input"
            />
          </div>
          <button
            onClick={getQuote}
            disabled={!amount || !invoiceRef || loading}
            className="btn btn-primary btn-full"
          >
            {loading ? 'Getting quote…' : 'Get Quote →'}
          </button>
        </div>
      )}

      {step === 'quote' && quote && (
        <div className="card">
          <h2>Quote</h2>
          <div className="quote-grid">
            <div className="quote-row">
              <span>Invoice Amount</span>
              <strong>${quote.invoiceAmountUsd}</strong>
            </div>
            <div className="quote-row">
              <span>Platform Fee</span>
              <strong>−${quote.feeUsd}</strong>
            </div>
            <div className="quote-row quote-row-total">
              <span>Net Payout (USD)</span>
              <strong>${quote.netPayoutUsd}</strong>
            </div>
          </div>
          <p className="muted small" style={{ marginBottom: '16px' }}>
            Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}
          </p>
          <div className="btn-row">
            <button onClick={() => setStep('form')} className="btn btn-ghost">← Back</button>
            <button onClick={confirm} disabled={loading} className="btn btn-primary">
              {loading ? 'Creating…' : 'Confirm Invoice →'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && order && (
        <div className="card">
          <div className="success-icon">✓</div>
          <h2 style={{ textAlign: 'center', marginBottom: '4px' }}>Invoice Created</h2>
          <p className="muted small" style={{ textAlign: 'center', marginBottom: '20px' }}>
            ID: <code>{order.id}</code>
          </p>

          {order.collectionInstruction && (
            <div className="collection-details">
              <h3>Payment Instructions</h3>
              <p className="muted small" style={{ marginBottom: '12px' }}>
                Share these details with {buyer?.legalName ?? 'the buyer'} to receive payment.
              </p>

              <div className="detail-row">
                <span>Payment Reference</span>
                <div className="copy-row">
                  <code>{order.collectionInstruction.paymentReference}</code>
                  <button
                    onClick={() => copy(order.collectionInstruction!.paymentReference)}
                    className="btn btn-sm btn-ghost"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="detail-row">
                <span>Virtual Account</span>
                <code>{order.collectionInstruction.virtualAccountRef}</code>
              </div>

              {Object.entries(order.collectionInstruction.bankDetails).map(([k, v]) => (
                <div key={k} className="detail-row">
                  <span>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <code>{v}</code>
                </div>
              ))}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: '20px' }}>
            <button onClick={() => navigate(`/settlements/${order.id}`)} className="btn btn-primary btn-full">
              View Settlement →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
