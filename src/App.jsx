import { useState } from 'react'
import LoginPage   from './pages/LoginPage'
import HomePage    from './pages/HomePage'
import ConfigPage  from './pages/ConfigPage'
import BattlePage  from './pages/BattlePage'

const CREDENTIALS = { email: 'nessisme@gmail.com', password: '1234ness' }

export default function App() {
  const [isLoggedIn, setIsLoggedIn]     = useState(false)
  const [page, setPage]                 = useState('home')   // home | config | battle
  const [currentBattle, setCurrentBattle] = useState(null)  // battle row from Supabase
  const [editingBattle, setEditingBattle] = useState(null)  // null = new, otherwise existing

  const goHome    = ()  => setPage('home')
  const goConfig  = (b) => { setEditingBattle(b ?? null); setPage('config') }
  const goBattle  = (b) => { setCurrentBattle(b);         setPage('battle') }

  if (!isLoggedIn) {
    return <LoginPage credentials={CREDENTIALS} onLogin={() => setIsLoggedIn(true)} />
  }

  if (page === 'config') {
    return (
      <ConfigPage
        battle={editingBattle}
        onSave={(b) => goBattle(b)}
        onCancel={goHome}
      />
    )
  }

  if (page === 'battle') {
    return (
      <BattlePage
        battle={currentBattle}
        onPause={goHome}
        onUpdate={(b) => setCurrentBattle(b)}
      />
    )
  }

  return (
    <HomePage
      onNewBattle={() => goConfig(null)}
      onOpenBattle={(b) => goBattle(b)}
    />
  )
}
