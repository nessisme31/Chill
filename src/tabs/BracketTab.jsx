import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ROUNDS = [
  { id: 1, label: 'TOP 16',       matches: 8 },
  { id: 2, label: 'TOP 8',        matches: 4 },
  { id: 3, label: 'Demi-finales', matches: 2 },
  { id: 4, label: 'Finale',       matches: 1 },
]

const emptyBracket = () => {
  const b = {}
  ROUNDS.forEach(r => {
    b[r.id] = {}
    for (let m = 1; m <= r.matches; m++) {
      b[r.id][m] = { team1: null, team2: null, winner: null }
    }
  })
  return b
}

export default function BracketTab({ battle, crews }) {
  const [validated, setValidated] = useState(false)
  const [top16,     setTop16]     = useState([])
  const [bracket,   setBracket]   = useState(emptyBracket())
  const [selecting, setSelecting] = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    setLoading(true)

    const { data: bData } = await supabase.from('battles').select('top16_validated').eq('id', battle.id).single()
    if (!bData?.top16_validated) { setLoading(false); return }
    setValidated(true)

    const [{ data: scoreRows }, { data: guests }] = await Promise.all([
      supabase.from('top16_scores').select('crew_id, judge_id, score').eq('battle_id', battle.id),
      supabase.from('top16_guests').select('*').eq('battle_id', battle.id).order('position'),
    ])

    // Totaux par crew_id
    const totalsMap = {}
    ;(scoreRows || []).forEach(s => {
      totalsMap[s.crew_id] = (totalsMap[s.crew_id] || 0) + (Number(s.score) || 0)
    })

    // Construire la liste top16 (guests en premier, puis crews triés)
    const crewsRanked = crews
      .map(c => ({ ...c, total: totalsMap[c.id] || 0, isGuest: false }))
      .sort((a, b) => b.total - a.total)
    const guestEntries = (guests || []).map(g => ({
      id: 'g_' + g.id,
      name: g.name,
      member1: g.member1 || '',
      member2: g.member2 || '',
      isGuest: true,
      cypher: null,
      sticker: null,
      total: null,
    }))
    setTop16([...guestEntries, ...crewsRanked].slice(0, 16 + guestEntries.length))

    // Charger les slots du bracket
    const { data: slots } = await supabase.from('bracket_slots').select('*').eq('battle_id', battle.id)
    if (slots?.length) {
      const newB = emptyBracket()
      slots.forEach(s => {
        if (!newB[s.round]?.[s.match_number]) return
        const slotKey = s.position === 1 ? 'team1' : 'team2'

        if (s.is_winner) {
          if (newB[s.round][s.match_number][slotKey]) {
            newB[s.round][s.match_number][slotKey].isWinner = true
          }
          newB[s.round][s.match_number].winner = slotKey
        } else {
          newB[s.round][s.match_number][slotKey] = {
            id:           s.crew_id || ('g_' + s.id),
            name:         s.team_name,
            sticker:      s.sticker,
            cypher:       s.cypher,
            isGuest:      s.is_guest,
            country_code: s.country_code,
            // Récupérer le total depuis totalsMap si c'est une équipe réelle
            total: s.crew_id ? (totalsMap[s.crew_id] ?? null) : null,
          }
        }
      })
      setBracket(newB)
    }

    setLoading(false)
  }

  const placeTeam = async (team) => {
    if (!selecting) return
    const { round, match, slot } = selecting
    const newB = {
      ...bracket,
      [round]: {
        ...bracket[round],
        [match]: { ...bracket[round][match], [slot]: team },
      },
    }
    setBracket(newB)
    setSelecting(null)

    await supabase.from('bracket_slots').upsert({
      battle_id:    battle.id,
      round,
      match_number: match,
      position:     slot === 'team1' ? 1 : 2,
      crew_id:      team.isGuest ? null : team.id,
      team_name:    team.name,
      sticker:      team.sticker      || null,
      cypher:       team.cypher       || null,
      is_guest:     team.isGuest      || false,
      is_winner:    false,
      country_code: team.country_code || null,
    }, { onConflict: 'battle_id,round,match_number,position' })
  }

  const declareWinner = async (round, match, slot) => {
    const winner = bracket[round][match][slot]
    if (!winner) return

    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match].winner = slot

    if (round < 4) {
      const nextRound = round + 1
      const nextMatch = Math.ceil(match / 2)
      const nextSlot  = match % 2 === 1 ? 'team1' : 'team2'
      newB[nextRound][nextMatch][nextSlot] = winner

      await supabase.from('bracket_slots').upsert({
        battle_id:    battle.id,
        round:        nextRound,
        match_number: nextMatch,
        position:     nextSlot === 'team1' ? 1 : 2,
        crew_id:      winner.isGuest ? null : winner.id,
        team_name:    winner.name,
        sticker:      winner.sticker      || null,
        cypher:       winner.cypher       || null,
        is_guest:     winner.isGuest      || false,
        is_winner:    false,
        country_code: winner.country_code || null,
      }, { onConflict: 'battle_id,round,match_number,position' })
    }

    setBracket(newB)
    await supabase.from('bracket_slots').update({ is_winner: true })
      .eq('battle_id', battle.id)
      .eq('round', round)
      .eq('match_number', match)
      .eq('position', slot === 'team1' ? 1 : 2)
  }

  // Équipes non encore placées au R1
  const unplaced = top16.filter(t => {
    const r1 = bracket[1]
    return !Object.values(r1).some(m => m.team1?.id === t.id || m.team2?.id === t.id)
  })

  if (loading) return <div className="caption" style={{ padding: 24 }}>Chargement…</div>

  if (!validated) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
        <div className="title-sm" style={{ marginBottom: 8 }}>Bracket non généré</div>
        <div className="muted">
          Allez dans l'onglet "TOP 16", notez les équipes, puis cliquez sur "Voir le classement" → "Envoyer au bracket".
        </div>
      </div>
    )
  }

  const champion = bracket[4][1].winner ? bracket[4][1][bracket[4][1].winner] : null

  return (
    <div>
      {/* Bannière champion */}
      {champion && (
        <div style={{
          background: 'linear-gradient(135deg, #2d1800, #1a1200)',
          border: '1px solid var(--gold)', borderRadius: 10,
          padding: '20px 24px', marginBottom: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>Champion</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)' }}>{champion.name}</div>
          {champion.sticker && <div style={{ color: 'var(--gold)', opacity: .7, marginTop: 4 }}>{champion.sticker}</div>}
        </div>
      )}

      {/* Bracket scrollable horizontalement */}
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 16 }}>
        {ROUNDS.map(r => (
          <div key={r.id} style={{ minWidth: 220, flex: '0 0 220px' }}>
            {/* En-tête colonne */}
            <div style={{
              textAlign: 'center', padding: '8px 12px',
              fontSize: 11, fontWeight: 700, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8,
            }}>
              {r.label}
            </div>

            {/* Matchs */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              gap: r.id === 1 ? 8 : r.id === 2 ? 40 : r.id === 3 ? 96 : 208,
              padding: '0 6px',
            }}>
              {Array.from({ length: r.matches }, (_, i) => i + 1).map(match => {
                const m    = bracket[r.id][match]
                const isR1 = r.id === 1
                return (
                  <div key={match} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <TeamSlot
                      team={m.team1}
                      isWinner={m.winner === 'team1'}
                      isLoser={m.winner === 'team2'}
                      canPlace={isR1 && !m.team1}
                      canDeclare={!m.winner && m.team1 && m.team2}
                      onPlace={() => setSelecting({ round: r.id, match, slot: 'team1' })}
                      onDeclare={() => declareWinner(r.id, match, 'team1')}
                    />
                    <div style={{ height: 1, background: 'var(--border)' }} />
                    <TeamSlot
                      team={m.team2}
                      isWinner={m.winner === 'team2'}
                      isLoser={m.winner === 'team1'}
                      canPlace={isR1 && !m.team2}
                      canDeclare={!m.winner && m.team1 && m.team2}
                      onPlace={() => setSelecting({ round: r.id, match, slot: 'team2' })}
                      onDeclare={() => declareWinner(r.id, match, 'team2')}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modale de sélection manuelle d'équipe */}
      {selecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 460 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Choisir une équipe</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelecting(null)}>✕</button>
            </div>
            {unplaced.length === 0
              ? <div className="caption">Toutes les équipes sont déjà placées.</div>
              : unplaced.map(t => (
                  <div
                    key={t.id}
                    className="flex"
                    style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center', gap: 8 }}
                    onClick={() => placeTeam(t)}
                  >
                    {t.sticker && (
                      <span className={t.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{t.sticker}</span>
                    )}
                    {t.isGuest && <span style={{ color: 'var(--gold)', fontSize: 15 }}>⭐</span>}
                    <span style={{ flex: 1, fontWeight: 600, color: t.isGuest ? 'var(--gold)' : 'var(--text)', textTransform: 'uppercase' }}>
                      {t.name}
                      {t.isGuest && <span className="badge-gold" style={{ marginLeft: 6 }}>GUEST</span>}
                    </span>
                    {t.total != null && (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.total} pts</span>
                    )}
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ── Composant d'un slot d'équipe dans le bracket
function TeamSlot({ team, isWinner, isLoser, canPlace, canDeclare, onPlace, onDeclare }) {
  const bg    = isWinner ? '#0d2d14' : 'transparent'
  const color = isWinner ? 'var(--green)'
              : isLoser  ? 'var(--text3)'
              : team     ? 'var(--text)'
              :             'var(--text3)'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px', background: bg, minHeight: 42,
        cursor: canDeclare ? 'pointer' : canPlace ? 'pointer' : 'default',
      }}
      onClick={canDeclare ? onDeclare : canPlace ? onPlace : undefined}
    >
      {/* Sticker */}
      {team?.sticker && (
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: team.cypher === 'A' ? 'var(--red)' : 'var(--text2)',
          minWidth: 28, textDecoration: isLoser ? 'line-through' : 'none',
        }}>
          {team.sticker}
        </span>
      )}
      {team?.isGuest && <span style={{ fontSize: 12, color: 'var(--gold)' }}>⭐</span>}

      {/* Nom */}
      <span style={{
        flex: 1, fontSize: 12, fontWeight: team ? 600 : 400,
        color, textDecoration: isLoser ? 'line-through' : 'none',
        textTransform: team ? 'uppercase' : 'none',
      }}>
        {team ? team.name : canPlace ? '+ Placer équipe' : '—'}
      </span>

      {/* Score */}
      {team?.total != null && (
        <span style={{
          fontSize: 10, color: isLoser ? 'var(--text3)' : 'var(--text3)',
          opacity: isLoser ? 0.5 : 0.8, marginLeft: 2, flexShrink: 0,
        }}>
          {team.total}pts
        </span>
      )}

      {/* Indicateurs */}
      {isWinner && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, flexShrink: 0 }}>✓</span>}
      {canDeclare && !isWinner && !isLoser && (
        <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>tap = gagne</span>
      )}
    </div>
  )
}
