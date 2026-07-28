import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import InscriptionTab   from '../tabs/InscriptionTab'
import QualificationTab from '../tabs/QualificationTab'
import Top16Tab         from '../tabs/Top16Tab'
import BracketTab       from '../tabs/BracketTab'

const TABS = [
  { id: 'inscription',   label: 'Inscriptions' },
  { id: 'qualification', label: 'Qualification & Stats' },
  { id: 'top16',         label: 'TOP 16' },
  { id: 'bracket',       label: 'Bracket' },
]

export default function BattlePage({ battle, onPause, onConfig, onClose }) {
  const [tab,      setTab]      = useState(() => localStorage.getItem(`citc_tab_${battle.id}`) || 'inscription')
  const [judges,   setJudges]   = useState([])
  const [djs,      setDjs]      = useState([])
  const [speakers, setSpeakers] = useState([])
  const [crews,    setCrews]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [pausing,  setPausing]  = useState(false)
  const [closing,  setClosing]  = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => { loadData() }, [battle.id])

  const changeTab = (t) => { setTab(t); localStorage.setItem(`citc_tab_${battle.id}`, t) }

  const loadData = async () => {
    setLoading(true)
    const [{ data: j }, { data: d }, { data: s }, { data: c }] = await Promise.all([
      supabase.from('judges').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('djs').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('speakers').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('crews').select('*').eq('battle_id', battle.id).order('created_at'),
    ])
    setJudges(j || []); setDjs(d || []); setSpeakers(s || []); setCrews(c || [])
    setLoading(false)
  }

  const handlePause = async () => {
    setPausing(true)
    await supabase.from('battles').update({ status: 'paused' }).eq('id', battle.id)
    onPause()
  }

  const handleClose = async () => {
    setClosing(true)
    const { data: slot } = await supabase.from('bracket_slots').select('team_name')
      .eq('battle_id', battle.id).eq('round', 4).eq('match_number', 1).eq('is_winner', true).maybeSingle()
    await supabase.from('battles').update({ status: 'completed', champion_name: slot?.team_name || null }).eq('id', battle.id)
    localStorage.removeItem('citc_battle_id')
    localStorage.removeItem(`citc_tab_${battle.id}`)
    onClose()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text3)' }}>Chargement…</div>
  )

  const sharedProps = { battle, judges, djs, speakers, crews, setCrews }

  return (
    <div className="page">
      {confirmClose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: '36px 28px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏆</div>
            <div className="title-sm" style={{ marginBottom: 8 }}>Clôturer ce battle ?</div>
            <div className="muted" style={{ marginBottom: 28 }}>Le battle passera en archives avec le nom du champion. Action irréversible.</div>
            <div className="flex-center" style={{ gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmClose(false)}>Annuler</button>
              <button className="btn btn-white" onClick={() => { setConfirmClose(false); handleClose() }} disabled={closing}>
                {closing ? '…' : '✓ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 4 }}>Les Chill</div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{battle.name}</div>
          <div className="flex" style={{ gap: 16, marginTop: 4 }}>
            {battle.date  && <span className="muted">📅 {new Date(battle.date).toLocaleDateString('fr-FR')}</span>}
            {battle.venue && <span className="muted">📍 {battle.venue}</span>}
            <span className="muted">{crews.length} équipe(s)</span>
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onConfig}>⚙ Configuration</button>
          <button className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--gold-dim)', color: 'var(--gold)' }} onClick={handlePause} disabled={pausing}>
            {pausing ? '…' : '⏸ Pause'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ borderColor: 'var(--red-dim)', color: 'var(--red)' }} onClick={() => setConfirmClose(true)} disabled={closing}>
            {closing ? '…' : '✓ Clôturer'}
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => changeTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'inscription'   && <InscriptionTab   {...sharedProps} />}
      {tab === 'qualification' && <QualificationTab {...sharedProps} />}
      {tab === 'top16'         && <Top16Tab         {...sharedProps} />}
      {tab === 'bracket'       && <BracketTab       {...sharedProps} />}
    </div>
  )
}
