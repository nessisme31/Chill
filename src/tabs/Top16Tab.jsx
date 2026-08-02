import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { crewDisplay } from '../lib/countries'

export default function Top16Tab({ battle, judges, crews }) {
  const [scores,          setScores]          = useState({})
  const [view,            setView]            = useState('scores') // 'scores' | 'ranking'
  const [guests,          setGuests]          = useState([])
  const [guestForm,       setGuestForm]       = useState({ name: '', member1: '', member2: '' })
  const [validated,       setValidated]       = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [sending,         setSending]         = useState(false)
  const [selectedWaiting, setSelectedWaiting] = useState(new Set()) // Set de crew IDs choisis

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

  // Crews triés par total décroissant
  const crewsRanked = useMemo(() =>
    [...crews].map(c => ({ ...c, total: getTotal(c.id) })).sort((a, b) => b.total - a.total),
  [crews, scores])

  const guestCount        = guests.length
  const regularSpotsNeeded = Math.max(0, 16 - guestCount)

  // Calcul de la zone verte (auto-qualifiés) et zone orange (liste d'attente)
  const { autoQualified, waitingList, spotsForWaiting } = useMemo(() => {
    if (crewsRanked.length === 0 || regularSpotsNeeded === 0)
      return { autoQualified: [], waitingList: [], spotsForWaiting: 0 }

    if (crewsRanked.length <= regularSpotsNeeded)
      return { autoQualified: crewsRanked, waitingList: [], spotsForWaiting: 0 }

    const cutoffScore = crewsRanked[regularSpotsNeeded - 1].total
    const aboveCut    = crewsRanked.filter(c => c.total > cutoffScore)
    const atCut       = crewsRanked.filter(c => c.total === cutoffScore)
    const spots       = regularSpotsNeeded - aboveCut.length

    // Pas d'égalité problématique (ex: 1 seule équipe au score limite)
    if (spots >= atCut.length)
      return { autoQualified: crewsRanked.slice(0, regularSpotsNeeded), waitingList: [], spotsForWaiting: 0 }

    // Égalité → liste d'attente
    return { autoQualified: aboveCut, waitingList: atCut, spotsForWaiting: spots }
  }, [crewsRanked, regularSpotsNeeded])

  // Les 16 équipes finales pour le bracket (ordre = rang)
  const final16 = useMemo(() => {
    const guestEntries = guests.map(g => ({
      id: 'g_' + g.id,
      name: g.name,
      member1: g.member1 || '',
      member2: g.member2 || '',
      isGuest: true,
      cypher: null,
      sticker: null,
      country_code: null,
      total: null,
    }))
    const regularEntries = [
      ...autoQualified,
      ...waitingList.filter(c => selectedWaiting.has(c.id)),
    ]
    return [...guestEntries, ...regularEntries]
  }, [guests, autoQualified, waitingList, selectedWaiting])

  const canSendToBracket =
    (spotsForWaiting === 0 || selectedWaiting.size >= spotsForWaiting) &&
    final16.length >= 16

  // ── Scores
  const updateScore = async (crewId, judgeId, val) => {
    const num = val === '' ? null : Math.min(5, Math.max(0, parseFloat(val) || 0))
    setScores(prev => ({ ...prev, [crewId]: { ...(prev[crewId] || {}), [judgeId]: num } }))
    setSaving(true)
    await supabase.from('top16_scores').upsert({ battle_id: battle.id, crew_id: crewId, judge_id: judgeId, score: num })
    setSaving(false)
  }

  // ── Guests
  const addGuest = async () => {
    if (!guestForm.name.trim()) return
    const pos = guests.length
    const { data } = await supabase.from('top16_guests').insert({
      battle_id: battle.id,
      name:      guestForm.name.trim(),
      member1:   guestForm.member1.trim(),
      member2:   guestForm.member2.trim(),
      position:  pos,
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
      if (next.has(crewId)) {
        next.delete(crewId)
      } else if (next.size < spotsForWaiting) {
        next.add(crewId)
      }
      return next
    })
  }

  // ── Envoi au bracket (génération seedée)
  const sendToBracket = async () => {
    if (!canSendToBracket) return
    setSending(true)

    // Supprimer les slots R1 existants (en cas de re-génération)
    await supabase.from('bracket_slots').delete().eq('battle_id', battle.id).eq('round', 1)

    // Seeding : #1 vs #16, #2 vs #15, ..., #8 vs #9
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
          country_code: t.country_code || null,
        })
      })
    }

    await supabase.from('bracket_slots').insert(inserts)
    await supabase.from('battles').update({ top16_validated: true }).eq('id', battle.id)
    setValidated(true)
    setSending(false)
  }

  // ──────────────────────────────────────────────────
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

              {/* Bouton Envoyer au bracket */}
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
                {sending
                  ? '…'
                  : validated
                    ? '↺ Regénérer le bracket'
                    : '🏆 Envoyer au bracket'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ════════════════ VUE NOTATION ════════════════ */}
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
                        <td style={{ fontWeight: 600, textTransform: 'uppercase' }}>{crewDisplay(c)}</td>
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

      {/* ════════════════ VUE CLASSEMENT ════════════════ */}
      {view === 'ranking' && (
        <div>
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
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={guestForm.member1}
                  onChange={e => setGuestForm(p => ({ ...p, member1: e.target.value }))}
                  placeholder="Membre 1 (optionnel)"
                />
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={guestForm.member2}
                  onChange={e => setGuestForm(p => ({ ...p, member2: e.target.value }))}
                  placeholder="Membre 2 (optionnel)"
                />
              </div>
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={addGuest}>+ Ajouter guest</button>
          </div>

          {/* Liste du classement */}
          <div className="card">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Classement</div>
              <span className="muted">{guestCount + autoQualified.length} / 16 confirmés</span>
            </div>

            {/* Guests — tête de série (gold) */}
            {guests.map((g, i) => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 8px', marginBottom: 4,
                background: 'linear-gradient(90deg, #2d1a00 0%, transparent 100%)',
                borderRadius: 4, borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--gold)', width: 36, flexShrink: 0, textAlign: 'center' }}>
                  #{i + 1}
                </div>
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

            {/* Équipes auto-qualifiées */}
            {autoQualified.map((c, i) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: 'var(--text2)', width: 36, flexShrink: 0, textAlign: 'center' }}>
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

            {/* ── Séparateur liste d'attente ── */}
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
                    {spotsForWaiting} place(s) restante(s) — sélectionnez {spotsForWaiting} équipe(s) parmi {waitingList.length}
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
          </div>
        </div>
      )}
    </div>
  )
}
