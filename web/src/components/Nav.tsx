import { Link } from 'react-router-dom'

export default function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">Pintas Sandbox</Link>
      <div className="nav-links">
        <Link to="/" className="nav-link">Settlements</Link>
        <Link to="/settlements/new" className="nav-link nav-link-cta">New Invoice</Link>
      </div>
    </nav>
  )
}
