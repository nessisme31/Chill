import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { crewDisplay } from '../lib/countries'

export default function Top16Tab({ battle, judges, crews }) {
  const [scores,           setScores]           = useState({})
  const [view,             setView]             = useState('scores') // 'scores' | 'ranking'
  const [scoringCypher,    setScoringCypher]    = useState('A')      // cypher sélectionné en notation
  const [judgeAssignments, setJudgeAssignments] = useState({})       // { judgeId: 'A' | 'B' }
  const [guests,           setGuests]           = useState([])
  const [guestForm,        setGuestForm]        = useState({ name: '', member1: '', member2: '' })
  const [validated,        setValidated]        = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [sending,          setSending]          = useState(false)
  const [bracketSent,      setBracketSent]      = useState(false)
  const [selectedWaiting,  setSelectedWaiting]  = useState(new Set())

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    // Scores
    const { data: sData } = await supabase.from('top16_scores').select('*').eq('battle_id', battle.id)
    if (sData) {
      const map = {}
      sData.forEach(s => {
        if (!map[s.crew_id]) map[s.crew_id] = {}
        map[s.crew_id][s.judge_id] = s.score
      })
      setScores(map)
    }
    // Statut validation
    const { data: bData } = await supabase.from('battles').select('top16_validated').eq('id', battle.id).single()
    if (bData?.top16_validated) setValidated(true)
    // Guests
    const { data: gData } = await supabase.from('top16_guests').select('*').eq('battle_id', battle.id).order('position')
    if (gData) setGuests(gData)
    // Assignation des juges aux cyphers (pour filtrer en notation)
    const { data: jData } = await supabase.from('judges').select('id, cypher').eq('battle_id', battle.id)
    if (jData) {
      const map = {}
      jData.forEach(j => { if (j.cypher) map[j.id] = j.cypher })
      setJudgeAssignments(map)
    }
  }

  // Total pour un crew = somme de toutes ses notes (tous juges confondus)
  const getTotal = (crewId) =>
    Object.values(scores[crewId] || {}).reduce((a, b) => a + (Number(b) || 0), 0)

  // Juges assignés au cypher sélectionné
  const judgesForCypher = judges.filter(j => judgeAssignments[j.id] === scoringCypher)

  // Équipes du cypher sélectionné
  const crewsForCypher = crews.filter(c => c.cypher === scoringCypher)

  // Crews triés par total décroissant (pour le classement)
  const crewsRanked = useMemo(() =>
    [...crews].map(c => ({ ...c, total: getTotal(c.id) })).sort((a, b) => b.total - a.total),
  [crews, scores])

  const guestCount         = guests.length
  const regularSpotsNeeded = Math.max(0, 16 - guestCount)

  // Zone verte (auto) / zone orange (attente)
  const { autoQualified, waitingList, spotsForWaiting } = useMemo(() => {
    if (crewsRanked.length === 0 || regularSpotsNeeded === 0)
      return { autoQualified: [], waitingList: [], spotsForWaiting: 0 }

    if (crewsRanked.length <= regularSpotsNeeded)
      return { autoQualified: crewsRanked, waitingList: [], spotsForWaiting: 0 }

    const cutoffScore = crewsRanked[regularSpotsNeeded - 1].total
    const aboveCut    = crewsRanked.filter(c => c.total > cutoffScore)
    const atCut       = crewsRanked.filter(c => c.total === cutoffScore)
    const spots       = regularSpotsNeeded - aboveCut.length

    if (spots >= atCut.length)
      return { autoQualified: crewsRanked.slice(0, regularSpotsNeeded), waitingList: [], spotsForWaiting: 0 }

    return { autoQualified: aboveCut, waitingList: atCut, spotsForWaiting: spots }
  }, [crewsRanked, regularSpotsNeeded])

  // Équipes hors TOP 16 (éliminées)
  const eliminatedCrews = useMemo(() => {
    const qualifiedIds = new Set([...autoQualified.map(c => c.id), ...waitingList.map(c => c.id)])
    return crewsRanked.filter(c => !qualifiedIds.has(c.id))
  }, [crewsRanked, autoQualified, waitingList])

  // Les 16 finaux pour le bracket
  const final16 = useMemo(() => {
    const guestEntries = guests.map(g => ({
      id: 'g_' + g.id, name: g.name,
      member1: g.member1 || '', member2: g.member2 || '',
      isGuest: true, cypher: null, sticker: null, country_code: null, total: null,
    }))
    return [
      ...guestEntries,
      ...autoQualified,
      ...waitingList.filter(c => selectedWaiting.has(c.id)),
    ]
  }, [guests, autoQualified, waitingList, selectedWaiting])

  const canSendToBracket =
    (spotsForWaiting === 0 || selectedWaiting.size >= spotsForWaiting) &&
    final16.length >= 16

  // ── Notation (0–10)
  const updateScore = async (crewId, judgeId, val) => {
    const num = val === '' ? null : Math.min(10, Math.max(0, parseFloat(val) || 0))
    setScores(prev => ({ ...prev, [crewId]: { ...(prev[crewId] || {}), [judgeId]: num } }))
    setSaving(true)
    await supabase.from('top16_scores').upsert({
      battle_id: battle.id, crew_id: crewId, judge_id: judgeId, score: num,
    })
    setSaving(false)
  }

  // ── Guests
  const addGuest = async () => {
    if (!guestForm.name.trim()) return
    const { data } = await supabase.from('top16_guests').insert({
      battle_id: battle.id, name: guestForm.name.trim(),
      member1: guestForm.member1.trim(), member2: guestForm.member2.trim(),
      position: guests.length,
    }).select().single()
    if (data) setGuests(prev => [...prev, data])
    setGuestForm({ name: '', member1: '', member2: '' })
  }

  const removeGuest = async (id) => {
    await supabase.from('top16_guests').delete().eq('id', id)
    setGuests(prev => prev.filter(g => g.id !== id))
  }

  // ── Sélection liste d'attente
  const toggleWaiting = (crewId) => {
    setSelectedWaiting(prev => {
      const next = new Set(prev)
      if (next.has(crewId)) { next.delete(crewId) }
      else if (next.size < spotsForWaiting) { next.add(crewId) }
      return next
    })
  }

  // ── Envoi au bracket avec seeding + gestion d'erreur
  const sendToBracket = async () => {
    if (!canSendToBracket) return
    setSending(true)
    setBracketSent(false)

    // Supprimer les slots R1 existants
    const { error: delErr } = await supabase
      .from('bracket_slots').delete()
      .eq('battle_id', battle.id).eq('round', 1)

    if (delErr) {
      alert('Erreur suppression anciens slots : ' + delErr.message)
      setSending(false); return
    }

    // Seeding : #1 vs #16, #2 vs #15, …, #8 vs #9
    const inserts = []
    for (let i = 0; i < 8; i++) {
      const teamA = final16[i]
      const teamB = final16[15 - i]
      const match = i + 1
      ;[{ t: teamA, pos: 1 }, { t: teamB, pos: 2 }].forEach(({ t, pos }) => {
        inserts.push({
          battle_id:    battle.id,
          round:        1,
          match_number: match,
          position:     pos,
          crew_id:      t.isGuest ? null : t.id,
          team_name:    t.name,
          sticker:      t.sticker  || null,
          cypher:       t.cypher   || null,
          is_guest:     t.isGuest  || false,
          is_winner:    false,
        })
      })
    }

    const { error: insErr } = await supabase.from('bracket_slots').insert(inserts)
    if (insErr) {
      alert('Erreur génération bracket : ' + insErr.message)
      setSending(false); return
    }

    await supabase.from('battles').update({ top16_validated: true }).eq('id', battle.id)
    setValidated(true)
    setBracketSent(true)
    setSending(false)
  }

  // ─────────────────────────────────────────────────
  return (
    <div>
      {/* En-tête */}
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
            <>
              <button className="btn btn-ghost" onClick={() => setView('scores')}>← Retour</button>
              <button
                className="btn btn-white"
                disabled={!canSendToBracket || sending}
                style={{
                  opacity: canSendToBracket ? 1 : 0.4,
                  cursor: canSendToBracket ? 'pointer' : 'not-allowed',
                  background: validated ? 'transparent' : undefined,
                  color: validated ? 'var(--green)' : undefined,
                  border: validated ? '1px solid var(--green-dim)' : undefined,
                }}
                onClick={sendToBracket}
              >
                {sending ? '…' : validated ? '↺ Regénérer le bracket' : '🏆 Envoyer au bracket'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ════════ VUE NOTATION ════════ */}
      {view === 'scores' && (
        <div>
          {/* Sélecteur Cypher */}
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <div className="flex" style={{ gap: 8 }}>
              <button
                className="btn btn-sm"
                style={{
                  background: scoringCypher === 'A' ? 'var(--surface)' : 'var(--surface2)',
                  color: scoringCypher === 'A' ? 'var(--text)' : 'var(--text2)',
                  border: `1px solid ${scoringCypher === 'A' ? 'var(--border)' : 'var(--border2)'}`,
                }}
                onClick={() => setScoringCypher('A')}
              >Cercle A</button>
              <button
                className="btn btn-sm"
                style={{
                  background: scoringCypher === 'B' ? 'var(--red-dim)' : 'var(--surface2)',
                  color: scoringCypher === 'B' ? 'var(--red)' : 'var(--text2)',
                  border: `1px solid ${scoringCypher === 'B' ? 'var(--red-dim)' : 'var(--border2)'}`,
                }}
                onClick={() => setScoringCypher('B')}
              >Cercle B</button>
            </div>
            <div className="flex" style={{ gap: 12, alignItems: 'center' }}>
              {judgesForCypher.length > 0
                ? <span className="muted" style={{ fontSize: 12 }}>
                    Juges : <strong>{judgesForCypher.map(j => j.name).join(', ')}</strong>
                  </span>
                : <span className="muted" style={{ fontSize: 12 }}>
                    ⚠️ Aucun juge assigné au Cercle {scoringCypher}
                  </span>
              }
            </div>
          </div>

          <div className="card">
            {crewsForCypher.length === 0
              ? <div className="caption">Aucune équipe dans le Cypher {scoringCypher}.</div>
              : judgesForCypher.length === 0
                ? <div className="caption">Assignez d'abord des juges au Cercle {scoringCypher} dans l'onglet "Qualification & Stats".</div>
                : <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ minWidth: 400 }}>
                      <thead>
                        <tr>
                          <th>Sticker</th>
                          <th>Crew</th>
                          {judgesForCypher.map(j => (
                            <th key={j.id} style={{ textAlign: 'center' }}>{j.name}</th>
                          ))}
                          <th style={{ textAlign: 'center' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crewsForCypher.map(c => (
                          <tr key={c.id}>
                            <td>
                              <span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{c.sticker}</span>
                            </td>
                            <td style={{ fontWeight: 600, textTransform: 'uppercase' }}>{crewDisplay(c)}</td>
                            {judgesForCypher.map(j => (
                              <td key={j.id} style={{ textAlign: 'center' }}>
                                <input
                                  type="number" min="0" max="10" step="0.5"
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
        </div>
      )}

      {/* ════════ VUE CLASSEMENT ════════ */}
      {view === 'ranking' && (
        <div>
          {/* Feedback succès */}
          {bracketSent && (
            <div className="alert-ok" style={{ marginBottom: 16 }}>
              ✓ Bracket généré avec succès ! Allez dans l'onglet <strong>Bracket</strong> pour le visualiser.
            </div>
          )}

          {/* Barre de statut */}
          <div style={{
            background: canSendToBracket ? '#0d2d14' : '#1a1200',
            border: `1px solid ${canSendToBracket ? 'var(--green-dim)' : 'var(--gold-dim)'}`,
            borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13,
            color: canSendToBracket ? 'var(--green)' : 'var(--gold)',
          }}>
            {canSendToBracket
              ? `✓ ${final16.length} équipes confirmées — prêt à envoyer au bracket`
              : spotsForWaiting > 0
                ? `⏳ Sélectionnez encore ${spotsForWaiting - selectedWaiting.size} équipe(s) dans la liste d'attente`
                : `⏳ ${final16.length} / 16 équipes — inscrivez plus d'équipes`
            }
          </div>

          {/* Ajout guest */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 10 }}>Ajouter un guest (tête de série)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                className="input"
                value={guestForm.name}
                onChange={e => setGuestForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addGuest()}
                placeholder="Nom du crew / guest"
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" style={{ flex: 1 }}
                  value={guestForm.member1}
                  onChange={e => setGuestForm(p => ({ ...p, member1: e.target.value }))}
                  placeholder="Membre 1 (optionnel)" />
                <input className="input" style={{ flex: 1 }}
                  value={guestForm.member2}
                  onChange={e => setGuestForm(p => ({ ...p, member2: e.target.value }))}
                  placeholder="Membre 2 (optionnel)" />
              </div>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addGuest}>+ Ajouter guest</button>
          </div>

          {/* Classement */}
          <div className="card">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Classement</div>
              <span className="muted">{guestCount + autoQualified.length} / 16 confirmés</span>
            </div>

            {/* Guests */}
            {guests.map((g, i) => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 8px', marginBottom: 4, borderRadius: 4,
                background: 'linear-gradient(90deg, #2d1a00 0%, transparent 100%)',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--gold)', width: 36, textAlign: 'center' }}>#{i + 1}</div>
                <span style={{ fontSize: 16, marginRight: 8 }}>⭐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)', textTransform: 'uppercase' }}>
                    {g.name} <span style={{ fontSize: 11, fontWeight: 400, opacity: .8 }}>GUEST</span>
                  </div>
                  {(g.member1 || g.member2) && (
                    <div className="caption" style={{ textTransform: 'lowercase' }}>
                      {g.member1}{g.member1 && g.member2 ? ' & ' : ''}{g.member2}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => removeGuest(g.id)}>✕</button>
              </div>
            ))}

            {/* Auto-qualifiés */}
            {autoQualified.map((c, i) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--text2)', width: 36, textAlign: 'center' }}>
                  #{guestCount + i + 1}
                </div>
                <span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'} style={{ marginRight: 4 }}>{c.sticker}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'uppercase' }}>{crewDisplay(c)}</div>
                  <div className="caption" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</div>
                </div>
                <span className="badge-score">{c.total} pts</span>
              </div>
            ))}

            {/* Liste d'attente */}
            {waitingList.length > 0 && spotsForWaiting > 0 && (
              <>
                <div style={{
                  margin: '16px 0 10px', padding: '10px 14px',
                  background: '#1a1200', border: '1px solid var(--gold-dim)', borderRadius: 6,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700, marginBottom: 2 }}>
                    ⏳ Liste d'attente — Égalité au rang {guestCount + autoQualified.length + 1}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {spotsForWaiting} place(s) disponible(s) sur {waitingList.length} équipes à égalité
                  </div>
                </div>

                {waitingList.map(c => {
                  const isSelected = selectedWaiting.has(c.id)
                  const isDisabled = !isSelected && selectedWaiting.size >= spotsForWaiting
                  return (
                    <div
                      key={c.id}
                      onClick={() => !isDisabled && toggleWaiting(c.id)}
                      style={{
                        display: 'flex', alignItems: 'center',
                        padding: '11px 10px', marginBottom: 6, borderRadius: 6,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        border: `1px solid ${isSelected ? 'var(--green-dim)' : 'var(--gold-dim)'}`,
                        background: isSelected ? '#0d2d14' : isDisabled ? 'transparent' : 'rgba(255,160,0,0.04)',
                        opacity: isDisabled ? 0.45 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'} style={{ marginRight: 4 }}>{c.sticker}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: 700, fontSize: 14, textTransform: 'uppercase',
                          color: isSelected ? 'var(--green)' : 'var(--gold)',
                        }}>
                          {crewDisplay(c)}
                          {isSelected
                            ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400 }}>✓ sélectionné</span>
                            : <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, opacity: .6 }}>cliquer pour sélectionner</span>
                          }
                        </div>
                        <div className="caption" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</div>
                      </div>
                      <span className="badge-score">{c.total} pts</span>
                    </div>
                  )
                })}
              </>
            )}

            {/* Classement complet — équipes hors TOP 16 */}
            {eliminatedCrews.length > 0 && (
              <>
                <div style={{
                  margin: '20px 0 10px',
                  paddingTop: 16,
                  borderTop: '1px solid var(--border2)',
                  fontSize: 11, fontWeight: 600, color: 'var(--text3)',
                  textTransform: 'uppercase', letterSpacing: '1px',
                }}>
                  Hors TOP 16
                </div>
                {eliminatedCrews.map((c, i) => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center',
                    padding: '9px 0', borderBottom: '1px solid var(--border)',
                    opacity: 0.35,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text3)', width: 36, flexShrink: 0, textAlign: 'center' }}>
                      #{guestCount + autoQualified.length + waitingList.length + i + 1}
                    </div>
                    <span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'} style={{ marginRight: 4 }}>{c.sticker}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: 'var(--text3)' }}>{crewDisplay(c)}</div>
                      <div className="caption" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{c.total} pts</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
