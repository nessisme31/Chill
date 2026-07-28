import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage({ onNewBattle, onOpenBattle }) {
  const [battles, setBattles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadBattles() }, [])

  const loadBattles = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('battles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setBattles(data || [])
    setLoading(false)
  }

  const statusLabel = (s) => {
    if (s === 'active') return { dot: 'dot-active', label: 'En cours' }
    if (s === 'paused') return { dot: 'dot-paused', label: 'En pause' }
    return { dot: 'dot-done', label: 'Terminé' }
  }

  const activeBattles    = battles.filter(b => b.status !== 'completed')
  const completedBattles = battles.filter(b => b.status === 'completed')

  return (
    <div className="page">
      <div className="flex-between" style={{ marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 6 }}>
            Battle Management
          </div>
          <div className="title-lg">Les Chill</div>
        </div>
        <button className="btn btn-white" onClick={onNewBattle}>
          + Nouveau Battle
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>Chargement…</div>
      ) : battles.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎤</div>
          <div className="title-sm" style={{ marginBottom: 8 }}>Aucun battle pour l'instant</div>
          <div className="muted" style={{ marginBottom: 24 }}>Créez votre premier événement pour commencer.</div>
          <button className="btn btn-white" onClick={onNewBattle}>+ Créer un battle</button>
        </div>
      ) : (
        <div>
          {activeBattles.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="label" style={{ marginBottom: 12 }}>Battles actifs</div>
              {activeBattles.map(b => {
                const st = statusLabel(b.status)
                return (
                  <div
                    key={b.id}
                    className="card"
                    style={{ cursor: 'pointer', transition: 'border-color .15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    onClick={() => onOpenBattle(b)}
                  >
                    <div className="flex-between">
                      <div>
                        <div className="flex" style={{ marginBottom: 6 }}>
                          <span className={st.dot}></span>
                          <span style={{ fontWeight: 700, fontSize: 16 }}>{b.name}</span>
                        </div>
                        <div className="flex" style={{ gap: 16 }}>
                          {b.date && <span className="muted">📅 {new Date(b.date).toLocaleDateString('fr-FR')}</span>}
                          {b.venue && <span className="muted">📍 {b.venue}</span>}
                          <span className="muted">{st.label}</span>
                        </div>
                      </div>
                      <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                        {b.status === 'paused' ? 'Reprendre →' : 'Ouvrir →'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {completedBattles.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 12 }}>Archives</div>
              {completedBattles.map(b => (
                <div
                  key={b.id}
                  className="card"
                  style={{ cursor: 'pointer', transition: 'border-color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  onClick={() => onOpenBattle(b)}
                >
                  <div className="flex-between">
                    <div>
                      <div className="flex" style={{ marginBottom: 6 }}>
                        <span className="dot-done"></span>
                        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text2)' }}>{b.name}</span>
                      </div>
                      <div className="flex" style={{ gap: 16, marginBottom: b.champion_name ? 8 : 0 }}>
                        {b.date && <span className="muted">📅 {new Date(b.date).toLocaleDateString('fr-FR')}</span>}
                        {b.venue && <span className="muted">📍 {b.venue}</span>}
                        <span className="muted">Clôturé</span>
                      </div>
                      {b.champion_name && (
                        <div className="flex" style={{ gap: 6, marginTop: 4 }}>
                          <span style={{ fontSize: 13 }}>🏆</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>{b.champion_name}</span>
                        </div>
                      )}
                    </div>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>Consulter →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
