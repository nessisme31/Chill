import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Top16Tab({ battle, judges, crews }) {
  const [scores,      setScores]      = useState({})
  const [view,        setView]        = useState('scores')
  const [cypher,      setCypher]      = useState('A')
  const [guests,      setGuests]      = useState([])
  const [guestForm,   setGuestForm]   = useState({ name: '', m1: '', m2: '' })
  const [validated,   setValidated]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [assignments, setAssignments] = useState({})

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    const { data: sData } = await supabase.from('top16_scores').select('*').eq('battle_id', battle.id)
    if (sData) {
      const map = {}
      sData.forEach(s => { if (!map[s.crew_id]) map[s.crew_id] = {}; map[s.crew_id][s.judge_id] = s.score })
      setScores(map)
    }
    const { data: bData } = await supabase.from('battles').select('top16_validated').eq('id', battle.id).single()
    if (bData?.top16_validated) setValidated(true)
    const { data: gData } = await supabase.from('top16_guests').select('*').eq('battle_id', battle.id).order('position')
    if (gData) setGuests(gData)
    const { data: jData } = await supabase.from('judges').select('id, cypher').eq('battle_id', battle.id)
    if (jData) {
      const map = {}
      jData.forEach(j => { if (j.cypher) map[j.id] = j.cypher })
      setAssignments(map)
    }
  }

  const judgesForCypher = judges.filter(j => assignments[j.id] === cypher)
  const crewsForCypher  = crews.filter(c => c.cypher === cypher)

  const getTotal = (crewId) => Object.values(scores[crewId] || {}).reduce((a, b) => a + (Number(b) || 0), 0)

  const ranking = useMemo(() => {
    return [...crews].map(c => ({ ...c, total: getTotal(c.id) })).sort((a, b) => b.total - a.total)
  }, [crews, scores])

  const updateScore = async (crewId, judgeId, val) => {
    const num = val === '' ? null : Math.min(5, Math.max(0, parseFloat(val) || 0))
    setScores(prev => ({ ...prev, [crewId]: { ...(prev[crewId] || {}), [judgeId]: num } }))
    setSaving(true)
    await supabase.from('top16_scores').upsert({
      battle_id: battle.id, crew_id: crewId, judge_id: judgeId, score: num
    }, { onConflict: 'battle_id,crew_id,judge_id' })
    setSaving(false)
  }

  const gf = (k, v) => setGuestForm(p => ({ ...p, [k]: v }))

  const addGuest = async () => {
    if (!guestForm.name.trim()) return
    const { data } = await supabase.from('top16_guests').insert({
      battle_id: battle.id,
      name:     guestForm.name.trim(),
      member1:  guestForm.m1.trim(),
      member2:  guestForm.m2.trim(),
      position: guests.length,
    }).select().single()
    if (data) setGuests(prev => [...prev, data])
    setGuestForm({ name: '', m1: '', m2: '' })
  }

  const removeGuest = async (id) => {
    await supabase.from('top16_guests').delete().eq('id', id)
    setGuests(prev => prev.filter(g => g.id !== id))
  }

  const validate = async () => {
    await supabase.from('battles').update({ top16_validated: true }).eq('id', battle.id)
    setValidated(true)
    alert("✅ TOP 16 validé ! Les équipes sont disponibles dans l'onglet Bracket.")
  }

  const fullRanking = [
    ...guests.map((g, i) => ({
      isGuest: true,
      name: g.name,
      member1: g.member1 || '',
      member2: g.member2 || '',
      id: g.id,
      rank: i + 1,
    })),
    ...ranking.map((c, i) => ({ ...c, isGuest: false, rank: guests.length + i + 1 })),
  ]
  const TOP_N = 16

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div className="title-sm">TOP 16 — Notation finale</div>
        <div className="flex" style={{ gap: 8 }}>
          {saving && <span className="caption">Enregistrement…</span>}
          {view === 'scores'  && <button className="btn btn-white" onClick={() => setView('ranking')}>Voir le classement →</button>}
          {view === 'ranking' && <button className="btn btn-ghost" onClick={() => setView('scores')}>← Retour</button>}
        </div>
      </div>

      {/* ── VUE NOTATION ── */}
      {view === 'scores' && (
        <div>
          <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
            <button className="btn btn-sm" style={{ background: cypher === 'A' ? 'var(--red-dim)' : 'var(--surface2)', color: cypher === 'A' ? 'var(--red)' : 'var(--text2)', border: `1px solid ${cypher === 'A' ? 'var(--red-dim)' : 'var(--border2)'}` }} onClick={() => setCypher('A')}>Cypher A</button>
            <button className="btn btn-sm" style={{ background: cypher === 'B' ? 'var(--surface)' : 'var(--surface2)', color: cypher === 'B' ? 'var(--text)' : 'var(--text2)', border: `1px solid ${cypher === 'B' ? 'var(--border)' : 'var(--border2)'}` }} onClick={() => setCypher('B')}>Cypher B</button>
          </div>
          {judgesForCypher.length === 0 && (
            <div className="alert-warn" style={{ marginBottom: 12 }}>⚠️ Aucun juge assigné au Cypher {cypher}. Allez dans Qualification → Assigner juges.</div>
          )}
          <div className="card">
            <div style={{ marginBottom: 12 }}>
              <span className="muted">Cypher </span><strong style={{ color: cypher === 'A' ? 'var(--red)' : 'var(--text)' }}>{cypher}</strong>
              <span className="muted"> — {crewsForCypher.length} équipes — {judgesForCypher.length} juge(s)</span>
            </div>
            {crewsForCypher.length === 0 ? <div className="caption">Aucune équipe dans ce cypher.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ minWidth: 400 }}>
                  <thead>
                    <tr>
                      <th>Sticker</th><th>Crew</th>
                      {judgesForCypher.map(j => <th key={j.id} style={{ textAlign: 'center' }}>{j.name}</th>)}
                      <th style={{ textAlign: 'center' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crewsForCypher.map(c => (
                      <tr key={c.id}>
                        <td><span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{c.sticker}</span></td>
                        <td style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.name}</td>
                        {judgesForCypher.map(j => (
                          <td key={j.id} style={{ textAlign: 'center' }}>
                            <input type="number" min="0" max="5" step="0.5" className="input-score"
                              value={scores[c.id]?.[j.id] ?? ''} onChange={e => updateScore(c.id, j.id, e.target.value)} />
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}><span className="badge-score">{getTotal(c.id)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VUE CLASSEMENT ── */}
      {view === 'ranking' && (
        <div>
          {validated && <div className="alert-ok" style={{ marginBottom: 16 }}>✓ TOP 16 validé — les équipes sont disponibles dans l'onglet Bracket.</div>}

          {/* Formulaire guest */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 12 }}>Ajouter un guest (prend la place #1)</div>
            <div style={{ marginBottom: 8 }}>
              <input className="input" value={guestForm.name}
                onChange={e => gf('name', e.target.value)}
                placeholder="Nom du crew guest"
                style={{ marginBottom: 8 }}
              />
              <div className="grid2" style={{ gap: 8 }}>
                <input className="input" value={guestForm.m1}
                  onChange={e => gf('m1', e.target.value)}
                  placeholder="Danseur 1"
                />
                <input className="input" value={guestForm.m2}
                  onChange={e => gf('m2', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addGuest()}
                  placeholder="Danseur 2"
                />
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={addGuest} disabled={!guestForm.name.trim()}>
              + Ajouter le guest
            </button>
          </div>

          {/* Classement */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Classement</div>
              <span className="muted">{fullRanking.length} équipe(s)</span>
            </div>

            {fullRanking.map((c, i) => {
              const inTop16 = i < TOP_N
              return (
                <div key={c.id}>
                  {i === TOP_N && fullRanking.length > TOP_N && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', opacity: .6 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>hors TOP 16</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border2)' }} />
                    </div>
                  )}
                  <div className="flex" style={{
                    padding: inTop16 ? '11px 0' : '7px 0',
                    borderBottom: '1px solid var(--border)',
                    opacity: inTop16 ? 1 : 0.35,
                    background: c.isGuest ? 'linear-gradient(90deg, #2d1a00 0%, transparent 100%)' : 'transparent',
                    paddingLeft: c.isGuest ? 8 : 0,
                  }}>
                    {/* Rang */}
                    <div style={{ fontWeight: 900, fontSize: inTop16 ? 17 : 13, color: c.isGuest ? 'var(--gold)' : inTop16 ? 'var(--text2)' : 'var(--text3)', width: 36, flexShrink: 0, textAlign: 'center' }}>
                      #{c.rank}
                    </div>

                    {/* Sticker ou étoile guest */}
                    {!c.isGuest && (
                      <span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'} style={{ marginRight: 4, fontSize: inTop16 ? 15 : 12 }}>{c.sticker}</span>
                    )}
                    {c.isGuest && (
                      <span style={{ fontSize: inTop16 ? 15 : 12, color: 'var(--gold)', minWidth: 28, textAlign: 'center' }}>⭐</span>
                    )}

                    {/* Nom + membres */}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: inTop16 ? 700 : 500,
                        fontSize: inTop16 ? 14 : 12,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        color: c.isGuest ? 'var(--gold)' : inTop16 ? 'var(--text)' : 'var(--text3)',
                      }}>
                        {c.name}
                        {c.isGuest && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, textTransform: 'none', color: 'var(--gold)', opacity: .7 }}>GUEST</span>
                        )}
                      </div>
                      {/* Membres — guests et crews */}
                      {(c.member1 || c.member2) && (
                        <div className="caption" style={{ textTransform: 'lowercase', opacity: inTop16 ? 1 : 0.6, color: c.isGuest ? 'var(--gold)' : 'var(--text3)' }}>
                          {[c.member1, c.member2].filter(Boolean).join(' & ')}
                        </div>
                      )}
                    </div>

                    {/* Score ou bouton supprimer */}
                    {c.isGuest
                      ? <button className="btn btn-ghost btn-sm" onClick={() => removeGuest(c.id)}>✕</button>
                      : <span style={{ fontSize: inTop16 ? 12 : 11, color: inTop16 ? 'var(--text)' : 'var(--text3)' }}>{c.total} pts</span>
                    }
                  </div>
                </div>
              )
            })}

            {!validated && fullRanking.length > 0 && (
              <button className="btn btn-white btn-lg btn-full" style={{ marginTop: 20 }} onClick={validate}>
                ✓ Valider le TOP 16 → Bracket
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
