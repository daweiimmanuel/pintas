import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../context'
import { api, type SettlementOrder } from '../api'
import StatusBadge from '../components/StatusBadge'

export default function SettlementList() {
  const { exporterId } = useSession()
  const [orders, setOrders] = useState<SettlementOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.get<SettlementOrder[]>(`/v1/settlements?exporterId=${exporterId}`)
      .then(data => { setOrders(data); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [exporterId])

  if (loading) return <div className="loading">Loading settlements...</div>
  if (error) return <div className="alert alert-error">{error}</div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settlements</h1>
        <Link to="/settlements/new" className="btn btn-primary">New Invoice</Link>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <p>No settlements yet.</p>
          <Link to="/settlements/new" className="btn btn-primary">Create your first invoice</Link>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Invoice Ref</th>
              <th>Buyer</th>
              <th>Status</th>
              <th>Invoice Amount</th>
              <th>Net Payout</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td className="mono">{o.invoiceRef}</td>
                <td>{o.buyerName ?? o.buyerId}</td>
                <td><StatusBadge status={o.status} /></td>
                <td className="amount">${o.invoiceAmountUsd}</td>
                <td className="amount">${o.netPayoutUsd}</td>
                <td className="muted">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td>
                  <Link to={`/settlements/${o.id}`} className="btn btn-sm btn-ghost">
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
