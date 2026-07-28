import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Top16Tab({ battle, judges, crews }) {
  const [scores,    setScores]    = useState({})
  const [view,      setView]      = useState('scores')
  const [guests,    setGuests]    = useState([])
  const [guestInput, setGuestInput] = useState('')
  const [validated, setValidated]  = useState(false)
  const [saving,    setSaving]    = useState(false)

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    const { data: sData } = await supabase.from('top16_scores').select('*').eq('battle_id', battle.id)
    if (sData) {
      const map = {}
      sData.forEach(s => {
        if (!map[s.crew_id]) map[s.crew_id] = {}
        map[s.crew_id][s.judge_id] = s.score
      })
      setScores(map)
    }
    const { data: bData } = await supabase.from('battles').select('top16_validated').eq('id', battle.id).single()
    if (bData?.top16_validated) setValidated(true)
    const { data: gData } = await supabase.from('top16_guests').select('*').eq('battle_id', battle.id).order('position')
    if (gData) setGuests(gData)
  }

  const getTotal = (crewId) =>
    Object.values(scores[crewId] || {}).reduce((a, b) => a + (Number(b) || 0), 0)

  const ranking = useMemo(() => {
    const sorted = crews
      .map(c => ({ ...c, total: getTotal(c.id) }))
      .sort((a, b) => b.total - a.total)
    if (sorted.length <= 16) return sorted
    const cut = sorted[15].total
    return sorted.filter(c => c.total >= cut)
  }, [crews, scores])

  const updateScore = async (crewId, judgeId, val) => {
    const num = val === '' ? null : Math.min(5, Math.max(0, parseFloat(val) || 0))
    setScores(prev => ({ ...prev, [crewId]: { ...(prev[crewId] || {}), [judgeId]: num } }))
    setSaving(true)
    await supabase.from('top16_scores').upsert({ battle_id: battle.id, crew_id: crewId, judge_id: judgeId, score: num })
    setSaving(false)
  }

  const addGuest = async () => {
    if (!guestInput.trim()) return
    const pos = guests.length
    const { data } = await supabase.from('top16_guests').insert({ battle_id: battle.id, name: guestInput.trim(), position: pos }).select().single()
    if (data) setGuests(prev => [...prev, data])
    setGuestInput('')
  }

  const removeGuest = async (id) => {
    await supabase.from('top16_guests').delete().eq('id', id)
    setGuests(prev => prev.filter(g => g.id !== id))
  }

  const validate = async () => {
    await supabase.from('battles').update({ top16_validated: true }).eq('id', battle.id)
    setValidated(true)
    alert("✅ TOP 16 validé ! Les équipes sont maintenant disponibles dans l'onglet Bracket.")
  }

  const fullRanking = [
    ...guests.map((g, i) => ({ isGuest: true, name: g.name, id: g.id, rank: i + 1 })),
    ...ranking.map((c, i) => ({ ...c, isGuest: false, rank: guests.length + i + 1 })),
  ]

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <div className="title-sm">TOP 16 — Notation finale</div>
        <div className="flex" style={{ gap: 8 }}>
          {saving && <span className="caption">Enregistrement…</span>}
          {view === 'scores' && (
            <button className="btn btn-white" onClick={() => setView('ranking')}>
              Voir le classement →
            </button>
          )}
          {view === 'ranking' && (
            <button className="btn btn-ghost" onClick={() => setView('scores')}>
              ← Retour
            </button>
          )}
        </div>
      </div>

      {view === 'scores' && (
        <div className="card">
          {crews.length === 0
            ? <div className="caption">Aucune équipe inscrite.</div>
            : <div style={{ overflowX: 'auto' }}>
                <table className="tbl" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th>Sticker</th>
                      <th>Crew</th>
                      {judges.map(j => <th key={j.id} style={{ textAlign: 'center' }}>{j.name}</th>)}
                      <th style={{ textAlign: 'center' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crews.map(c => (
                      <tr key={c.id}>
                        <td><span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{c.sticker}</span></td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        {judges.map(j => (
                          <td key={j.id} style={{ textAlign: 'center' }}>
                            <input
                              type="number" min="0" max="5" step="0.5"
                              className="input-score"
                              value={scores[c.id]?.[j.id] ?? ''}
                              onChange={e => updateScore(c.id, j.id, e.target.value)}
                            />
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge-score">{getTotal(c.id)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

      {view === 'ranking' && (
        <div>
          {validated && (
            <div className="alert-ok" style={{ marginBottom: 16 }}>
              ✓ TOP 16 validé — les équipes sont disponibles dans l'onglet Bracket.
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 10 }}>Ajouter un guest (prend la place #1)</div>
            <div className="flex" style={{ gap: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={guestInput}
                onChange={e => setGuestInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addGuest()}
                placeholder="Nom du guest / crew invité"
              />
              <button className="btn btn-ghost" onClick={addGuest}>+ Ajouter</button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Classement</div>
              <span className="muted">{fullRanking.length} équipe(s)</span>
            </div>
            {fullRanking.map((c, i) => (
              <div
                key={c.id}
                className="flex"
                style={{
                  padding: '11px 0',
                  borderBottom: '1px solid var(--border)',
                  background: c.isGuest ? 'linear-gradient(90deg, #2d1a00 0%, transparent 100%)' : 'transparent',
                  paddingLeft: c.isGuest ? 8 : 0,
                  borderRadius: c.isGuest ? 4 : 0,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 18, color: c.isGuest ? 'var(--gold)' : 'var(--text2)', width: 36, flexShrink: 0, textAlign: 'center' }}>
                  #{c.rank}
                </div>
                {!c.isGuest && (
                  <span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'} style={{ marginRight: 4 }}>{c.sticker}</span>
                )}
                {c.isGuest && <span style={{ fontSize: 16 }}>⭐</span>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: c.isGuest ? 'var(--gold)' : 'var(--text)' }}>
                    {c.name}
                    {c.isGuest && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--gold)', opacity: .8 }}>GUEST</span>}
                  </div>
                  {!c.isGuest && <div className="caption">{c.member1} &amp; {c.member2}</div>}
                </div>
                {c.isGuest
                  ? <button className="btn btn-ghost btn-sm" onClick={() => removeGuest(c.id)}>✕</button>
                  : <span className="badge-score">{c.total} pts</span>
                }
              </div>
            ))}

            {!validated && (
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
