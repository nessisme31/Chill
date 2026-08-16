import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage({ onNewBattle, onOpenBattle }) {
  const [battles,  setBattles]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { loadBattles() }, [])

  const loadBattles = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('battles').select('*').order('created_at', { ascending: false })
    if (!error) setBattles(data || [])
    setLoading(false)
  }

  const handleDelete = async (battle) => {
    setDeleting(battle.id)
    await supabase.from('battles').delete().eq('id', battle.id)
    setBattles(prev => prev.filter(b => b.id !== battle.id))
    setConfirmDelete(null)
    setDeleting(null)
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

      {/* Modale confirmation suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ maxWidth: 360, width: '100%', textAlign: 'center', padding: '36px 28px' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🗑️</div>
            <div className="title-sm" style={{ marginBottom: 8 }}>Supprimer ce battle ?</div>
            <div className="muted" style={{ marginBottom: 6 }}>
              <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong>
            </div>
            <div className="muted" style={{ marginBottom: 28 }}>
              Toutes les données seront effacées définitivement (équipes, scores, bracket…).
            </div>
            <div className="flex-center" style={{ gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Annuler</button>
              <button
                className="btn btn-red"
                style={{ padding: '8px 20px' }}
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
              >
                {deleting === confirmDelete.id ? '…' : '🗑 Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-between" style={{ marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 6 }}>
            Battle Management
          </div>
          <div className="title-lg">Les Chill</div>
        </div>
        <button className="btn btn-white" onClick={onNewBattle}>+ Nouveau Battle</button>
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
          {/* Actifs */}
          {activeBattles.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div className="label" style={{ marginBottom: 12 }}>Battles actifs</div>
              {activeBattles.map(b => {
                const st = statusLabel(b.status)
                return (
                  <div key={b.id} className="card" style={{ cursor: 'pointer', transition: 'border-color .15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    onClick={() => onOpenBattle(b)}>
                    <div className="flex-between">
                      <div>
                        <div className="flex" style={{ marginBottom: 6 }}>
                          <span className={st.dot}></span>
                          <span style={{ fontWeight: 700, fontSize: 16 }}>{b.name}</span>
                        </div>
                        <div className="flex" style={{ gap: 16 }}>
                          {b.date  && <span className="muted">📅 {new Date(b.date).toLocaleDateString('fr-FR')}</span>}
                          {b.venue && <span className="muted">📍 {b.venue}</span>}
                          <span className="muted">{st.label}</span>
                        </div>
                      </div>
                      <div className="flex" style={{ alignItems: 'center', gap: 10, marginLeft: 16 }}>
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                          {b.status === 'paused' ? 'Reprendre →' : 'Ouvrir →'}
                        </span>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Supprimer ce battle"
                          style={{ color: 'var(--red)', borderColor: 'var(--red-dim)', padding: '4px 10px' }}
                          onClick={e => { e.stopPropagation(); setConfirmDelete(b) }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Archives */}
          {completedBattles.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 12 }}>Archives</div>
              {completedBattles.map(b => (
                <div key={b.id} className="card" style={{ transition: 'border-color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div className="flex-between">
                    <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => onOpenBattle(b)}>
                      <div className="flex" style={{ marginBottom: 6 }}>
                        <span className="dot-done"></span>
                        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text2)' }}>{b.name}</span>
                      </div>
                      <div className="flex" style={{ gap: 16, marginBottom: b.champion_name ? 8 : 0 }}>
                        {b.date  && <span className="muted">📅 {new Date(b.date).toLocaleDateString('fr-FR')}</span>}
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
                    <div className="flex" style={{ gap: 8, marginLeft: 16 }}>
                      <span style={{ color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }} onClick={() => onOpenBattle(b)}>Consulter →</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red)', borderColor: 'var(--red-dim)', padding: '4px 10px' }}
                        onClick={e => { e.stopPropagation(); setConfirmDelete(b) }}
                      >
                        🗑
                      </button>
                    </div>
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
