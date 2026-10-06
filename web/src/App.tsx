import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SessionProvider } from './context'
import Banner from './components/Banner'
import Nav from './components/Nav'
import SettlementList from './pages/SettlementList'
import NewInvoice from './pages/NewInvoice'
import SettlementDetail from './pages/SettlementDetail'

export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Banner />
        <Nav />
        <main className="main">
          <Routes>
            <Route path="/" element={<SettlementList />} />
            <Route path="/settlements/new" element={<NewInvoice />} />
            <Route path="/settlements/:id" element={<SettlementDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </HashRouter>
    </SessionProvider>
  )
}
