import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import InscriptionTab  from '../tabs/InscriptionTab'
import QualificationTab from '../tabs/QualificationTab'
import StatsTab        from '../tabs/StatsTab'
import Top16Tab        from '../tabs/Top16Tab'
import BracketTab      from '../tabs/BracketTab'

const TABS = [
  { id: 'inscription',   label: 'Inscriptions' },
  { id: 'qualification', label: 'Qualification' },
  { id: 'stats',         label: 'Stats' },
  { id: 'top16',         label: 'TOP 16' },
  { id: 'bracket',       label: 'Bracket' },
]

export default function BattlePage({ battle, onPause }) {
  const [tab,    setTab]    = useState('inscription')
  const [judges, setJudges] = useState([])
  const [djs,    setDjs]    = useState([])
  const [crews,  setCrews]  = useState([])
  const [loading, setLoading] = useState(true)
  const [pausing, setPausing] = useState(false)

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    setLoading(true)
    const [{ data: j }, { data: d }, { data: c }] = await Promise.all([
      supabase.from('judges').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('djs').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('crews').select('*').eq('battle_id', battle.id).order('created_at'),
    ])
    setJudges(j || [])
    setDjs(d || [])
    setCrews(c || [])
    setLoading(false)
  }

  const handlePause = async () => {
    setPausing(true)
    await supabase.from('battles').update({ status: 'paused' }).eq('id', battle.id)
    onPause()
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>
        Chargement…
      </div>
    )
  }

  const sharedProps = {
    battle,
    judges,
    djs,
    crews,
    setCrews,
  }

  return (
    <div className="page">
      {/* Top bar */}
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>
            Les Chill
          </div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{battle.name}</div>
          <div className="flex" style={{ gap: 16, marginTop: 4 }}>
            {battle.date && <span className="muted">📅 {new Date(battle.date).toLocaleDateString('fr-FR')}</span>}
            {battle.venue && <span className="muted">📍 {battle.venue}</span>}
            <span className="muted">{crews.length} équipe(s)</span>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }}
          onClick={handlePause}
          disabled={pausing}
        >
          {pausing ? '…' : '⏸ Mettre en pause'}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'inscription'   && <InscriptionTab   {...sharedProps} />}
      {tab === 'qualification' && <QualificationTab {...sharedProps} />}
      {tab === 'stats'         && <StatsTab         {...sharedProps} />}
      {tab === 'top16'         && <Top16Tab         {...sharedProps} />}
      {tab === 'bracket'       && <BracketTab       {...sharedProps} />}
    </div>
  )
}
