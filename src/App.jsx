import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage   from './pages/LoginPage'
import HomePage    from './pages/HomePage'
import ConfigPage  from './pages/ConfigPage'
import BattlePage  from './pages/BattlePage'

const CREDENTIALS = { email: 'nessisme@gmail.com', password: '1234ness' }

export default function App() {
  const [isLoggedIn, setIsLoggedIn]       = useState(false)
  const [page, setPage]                   = useState('home')
  const [currentBattle, setCurrentBattle] = useState(null)
  const [editingBattle, setEditingBattle] = useState(null)
  const [restoring, setRestoring]         = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    const savedId = localStorage.getItem('citc_battle_id')
    if (!savedId) return
    setRestoring(true)
    supabase.from('battles').select('*').eq('id', savedId).single()
      .then(({ data }) => {
        if (data) {
          setCurrentBattle(data)
          setPage('battle')
        } else {
          localStorage.removeItem('citc_battle_id')
        }
        setRestoring(false)
      })
  }, [isLoggedIn])

  const goHome = () => {
    localStorage.removeItem('citc_battle_id')
    setPage('home')
  }

  const goConfig = (b) => {
    setEditingBattle(b ?? null)
    setPage('config')
  }

  const goBattle = (b) => {
    setCurrentBattle(b)
    localStorage.setItem('citc_battle_id', b.id)
    setPage('battle')
  }

  if (!isLoggedIn) {
    return <LoginPage credentials={CREDENTIALS} onLogin={() => setIsLoggedIn(true)} />
  }

  if (restoring) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)', fontSize: 14 }}>
        Restauration de la session…
      </div>
    )
  }

  if (page === 'config') {
    return (
      <ConfigPage
        battle={editingBattle}
        onSave={(b) => goBattle(b)}
        onCancel={editingBattle ? () => goBattle(editingBattle) : goHome}
      />
    )
  }

  if (page === 'battle') {
    return (
      <BattlePage
        battle={currentBattle}
        onPause={goHome}
        onConfig={() => goConfig(currentBattle)}
        onClose={goHome}
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
