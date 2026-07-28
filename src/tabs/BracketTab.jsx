import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { flagEmoji } from '../lib/countries'

const ROUNDS = [
  { id: 1, label: 'TOP 16',       matches: 8 },
  { id: 2, label: 'TOP 8',        matches: 4 },
  { id: 3, label: 'Demi-finales', matches: 2 },
  { id: 4, label: 'Finale',       matches: 1 },
]

const emptyBracket = () => {
  const b = {}
  ROUNDS.forEach(r => { b[r.id] = {}; for (let m = 1; m <= r.matches; m++) b[r.id][m] = { team1: null, team2: null, winner: null } })
  return b
}

const teamLabel = (team) => {
  if (!team) return ''
  const flag = team.country_code ? flagEmoji(team.country_code) : ''
  return flag ? `${team.name} ${flag}` : team.name
}

export default function BracketTab({ battle, crews }) {
  const [validated, setValidated] = useState(false)
  const [locked,    setLocked]    = useState(false)
  const [top16,     setTop16]     = useState([])
  const [bracket,   setBracket]   = useState(emptyBracket())
  const [selecting, setSelecting] = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    setLoading(true)
    const { data: bData } = await supabase.from('battles').select('top16_validated, bracket_locked').eq('id', battle.id).single()
    if (!bData?.top16_validated) { setLoading(false); return }
    setValidated(true)
    if (bData?.bracket_locked) setLocked(true)

    const [{ data: scores }, { data: guests }] = await Promise.all([
      supabase.from('top16_scores').select('crew_id, score').eq('battle_id', battle.id),
      supabase.from('top16_guests').select('*').eq('battle_id', battle.id).order('position'),
    ])
    const totals = {}
    ;(scores || []).forEach(s => { totals[s.crew_id] = (totals[s.crew_id] || 0) + (s.score || 0) })
    const crewsRanked = crews.map(c => ({ ...c, total: totals[c.id] || 0, isGuest: false })).sort((a, b) => b.total - a.total)
    const guestEntries = (guests || []).map(g => ({ id: 'g_' + g.id, name: g.name, member1: g.member1, member2: g.member2, isGuest: true, cypher: null, sticker: null, country_code: null }))
    setTop16([...guestEntries, ...crewsRanked].slice(0, 16))

    const { data: slots } = await supabase.from('bracket_slots').select('*').eq('battle_id', battle.id)
    if (slots?.length) {
      const newB = emptyBracket()
      slots.forEach(s => {
        if (!newB[s.round]?.[s.match_number]) return
        const slot = s.position === 1 ? 'team1' : 'team2'
        newB[s.round][s.match_number][slot] = { id: s.crew_id || ('g_' + s.id), name: s.team_name, sticker: s.sticker, cypher: s.cypher, isGuest: s.is_guest, country_code: s.country_code || null }
        if (s.is_winner) newB[s.round][s.match_number].winner = slot
      })
      setBracket(newB)
    }
    setLoading(false)
  }

  const placeTeam = async (team) => {
    if (!selecting || locked) return
    const { round, match, slot } = selecting
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match][slot] = team
    setBracket(newB); setSelecting(null)
    await supabase.from('bracket_slots').upsert({
      battle_id: battle.id, round, match_number: match, position: slot === 'team1' ? 1 : 2,
      crew_id: team.isGuest ? null : team.id, team_name: team.name, sticker: team.sticker || null,
      cypher: team.cypher || null, is_guest: team.isGuest || false, is_winner: false,
      country_code: team.country_code || null,
    }, { onConflict: 'battle_id,round,match_number,position' })
  }

  const removeFromSlot = async (match, slot) => {
    if (locked) return
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[1][match][slot] = null
    setBracket(newB)
    await supabase.from('bracket_slots').delete()
      .eq('battle_id', battle.id).eq('round', 1).eq('match_number', match).eq('position', slot === 'team1' ? 1 : 2)
  }

  const declareWinner = async (round, match, slot) => {
    const m = bracket[round][match]
    const winner = m[slot]
    if (!winner || m.winner) return
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match].winner = slot
    if (round < 4) {
      const nextRound = round + 1; const nextMatch = Math.ceil(match / 2); const nextSlot = match % 2 === 1 ? 'team1' : 'team2'
      newB[nextRound][nextMatch][nextSlot] = winner
      await supabase.from('bracket_slots').upsert({
        battle_id: battle.id, round: nextRound, match_number: nextMatch, position: nextSlot === 'team1' ? 1 : 2,
        crew_id: winner.isGuest ? null : winner.id, team_name: winner.name, sticker: winner.sticker || null,
        cypher: winner.cypher || null, is_guest: winner.isGuest || false, is_winner: false,
        country_code: winner.country_code || null,
      }, { onConflict: 'battle_id,round,match_number,position' })
    }
    setBracket(newB)
    await supabase.from('bracket_slots').update({ is_winner: true })
      .eq('battle_id', battle.id).eq('round', round).eq('match_number', match).eq('position', slot === 'team1' ? 1 : 2)
  }

  const undoWinner = async (round, match) => {
    const m = bracket[round][match]
    if (!m.winner) return
    const winner = m[m.winner]
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match].winner = null
    if (round < 4) {
      const nextRound = round + 1; const nextMatch = Math.ceil(match / 2); const nextSlot = match % 2 === 1 ? 'team1' : 'team2'
      const nextM = newB[nextRound][nextMatch]
      if (nextM.winner && nextM[nextM.winner]?.id === winner?.id) {
        newB[nextRound][nextMatch].winner = null
        if (nextRound < 4) {
          const nr2 = nextRound + 1; const nm2 = Math.ceil(nextMatch / 2); const ns2 = nextMatch % 2 === 1 ? 'team1' : 'team2'
          newB[nr2][nm2][ns2] = null
          await supabase.from('bracket_slots').delete().eq('battle_id', battle.id).eq('round', nr2).eq('match_number', nm2).eq('position', ns2 === 'team1' ? 1 : 2)
          await supabase.from('bracket_slots').update({ is_winner: false }).eq('battle_id', battle.id).eq('round', nextRound).eq('match_number', nextMatch)
        }
      }
      newB[nextRound][nextMatch][nextSlot] = null
      await supabase.from('bracket_slots').delete().eq('battle_id', battle.id).eq('round', nextRound).eq('match_number', nextMatch).eq('position', nextSlot === 'team1' ? 1 : 2)
    }
    await supabase.from('bracket_slots').update({ is_winner: false }).eq('battle_id', battle.id).eq('round', round).eq('match_number', match)
    setBracket(newB)
  }

  const lockBracket = async () => {
    await supabase.from('battles').update({ bracket_locked: true }).eq('id', battle.id)
    setLocked(true)
  }

  // ── Impression du bracket
  const printBracket = () => {
    const r1 = bracket[1]
    const matchRows = Array.from({ length: 8 }, (_, i) => i + 1).map(match => {
      const m = r1[match]
      const t1 = m.team1 ? `${m.team1.sticker ? `<strong>${m.team1.sticker}</strong> ` : ''}${teamLabel(m.team1)}` : '<span style="color:#ccc">—</span>'
      const t2 = m.team2 ? `${m.team2.sticker ? `<strong>${m.team2.sticker}</strong> ` : ''}${teamLabel(m.team2)}` : '<span style="color:#ccc">—</span>'
      return `<div class="match"><div class="team">${t1}</div><div class="team">${t2}</div></div>`
    }).join('')

    const emptyRound = (n) => Array.from({ length: n }, () =>
      `<div class="match"><div class="team empty">&nbsp;</div><div class="team empty">&nbsp;</div></div>`
    ).join('')

    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Bracket — ${battle.name}</title>
    <style>
      @page { size: landscape; margin: 14mm; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p  { color: #666; margin: 0 0 14px; font-size: 11px; }
      .bracket { display: flex; gap: 12px; align-items: flex-start; }
      .round { flex: 1; }
      .round-label { text-align: center; font-weight: 700; font-size: 10px; text-transform: uppercase;
        letter-spacing: 1px; color: #888; padding: 4px 0 8px; border-bottom: 1px solid #eee; margin-bottom: 8px; }
      .match { border: 1px solid #ddd; border-radius: 4px; margin-bottom: 8px; overflow: hidden; }
      .team { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 11px; min-height: 30px; line-height: 1.4; }
      .team:last-child { border-bottom: none; }
      .team.empty { color: #ddd; background: #fafafa; min-height: 30px; }
      .round-2 .match { margin-top: 16px; margin-bottom: 16px; }
      .round-3 .match { margin-top: 64px; margin-bottom: 64px; }
      .round-4 .match { margin-top: 158px; }
    </style></head><body>
    <h1>${battle.name} — Bracket TOP 16</h1>
    <p>${new Date().toLocaleDateString('fr-FR')} &nbsp;·&nbsp; Les cases vides sont à remplir par les speakers</p>
    <div class="bracket">
      <div class="round"><div class="round-label">TOP 16</div>${matchRows}</div>
      <div class="round round-2"><div class="round-label">TOP 8</div>${emptyRound(4)}</div>
      <div class="round round-3"><div class="round-label">Demi-finales</div>${emptyRound(2)}</div>
      <div class="round round-4"><div class="round-label">Finale</div>${emptyRound(1)}</div>
    </div>
    </body></html>`)
    w.document.close(); w.print()
  }

  const allPlaced = Object.values(bracket[1]).every(m => m.team1 && m.team2)
  const unplaced  = top16.filter(t => !Object.values(bracket[1]).some(m => m.team1?.id === t.id || m.team2?.id === t.id))

  if (loading) return <div className="caption" style={{ padding: 24 }}>Chargement…</div>

  if (!validated) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
        <div className="title-sm" style={{ marginBottom: 8 }}>Bracket verrouillé</div>
        <div className="muted">Validez d'abord le TOP 16 dans l'onglet "TOP 16" pour débloquer le bracket.</div>
      </div>
    )
  }

  const finaleMatch = bracket[4][1]
  const champion = finaleMatch.winner ? finaleMatch[finaleMatch.winner] : null

  return (
    <div>
      {champion && (
        <div style={{ background: 'linear-gradient(135deg, #2d1800, #1a1200)', border: '1px solid var(--gold)', borderRadius: 10, padding: '20px 24px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>Champion</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase' }}>🏆 {teamLabel(champion)}</div>
          {champion.sticker && <div style={{ color: 'var(--gold)', opacity: .7, marginTop: 4 }}>{champion.sticker}</div>}
        </div>
      )}

      {!locked && allPlaced && (
        <div className="alert-ok" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✓ Les 16 équipes sont placées — prêt à lancer !</span>
          <button className="btn btn-white btn-sm" onClick={lockBracket} style={{ marginLeft: 16, whiteSpace: 'nowrap' }}>🚀 Lancer le battle</button>
        </div>
      )}
      {locked && (
        <div className="flex" style={{ gap: 10, marginBottom: 16 }}>
          <div className="alert-info" style={{ flex: 1, margin: 0 }}>
            🔒 Bracket lancé{!champion ? ' — cliquez sur une équipe pour déclarer le gagnant' : ''}.
          </div>
          <button className="btn btn-ghost btn-sm" onClick={printBracket} style={{ whiteSpace: 'nowrap' }}>🖨 Imprimer le bracket</button>
        </div>
      )}
      {!locked && !allPlaced && (
        <div className="alert-info" style={{ marginBottom: 16 }}>{unplaced.length} équipe(s) restante(s) à placer.</div>
      )}

      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 16 }}>
        {ROUNDS.map(r => (
          <div key={r.id} style={{ minWidth: 210, flex: '0 0 210px' }}>
            <div style={{ textAlign: 'center', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>{r.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: r.id === 1 ? 8 : r.id === 2 ? 40 : r.id === 3 ? 96 : 208, padding: '0 6px' }}>
              {Array.from({ length: r.matches }, (_, i) => i + 1).map(match => {
                const m = bracket[r.id][match]
                const isR1 = r.id === 1
                return (
                  <div key={match} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    <TeamSlot team={m.team1} isWinner={m.winner === 'team1'} isLoser={m.winner === 'team2'}
                      canPlace={isR1 && !m.team1 && !locked} canRemove={isR1 && !!m.team1 && !m.winner && !locked}
                      canDeclare={locked && !m.winner && !!m.team1 && !!m.team2}
                      onPlace={() => setSelecting({ round: r.id, match, slot: 'team1' })}
                      onRemove={() => removeFromSlot(match, 'team1')}
                      onDeclare={() => declareWinner(r.id, match, 'team1')} />
                    <div style={{ height: 1, background: 'var(--border)' }} />
                    <TeamSlot team={m.team2} isWinner={m.winner === 'team2'} isLoser={m.winner === 'team1'}
                      canPlace={isR1 && !m.team2 && !locked} canRemove={isR1 && !!m.team2 && !m.winner && !locked}
                      canDeclare={locked && !m.winner && !!m.team1 && !!m.team2}
                      onPlace={() => setSelecting({ round: r.id, match, slot: 'team2' })}
                      onRemove={() => removeFromSlot(match, 'team2')}
                      onDeclare={() => declareWinner(r.id, match, 'team2')} />
                    {m.winner && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '4px 8px', textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red)', borderColor: 'var(--red-dim)' }} onClick={() => undoWinner(r.id, match)}>↩ Annuler</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 460 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Choisir une équipe</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelecting(null)}>✕</button>
            </div>
            {unplaced.length === 0 ? <div className="caption">Toutes les équipes qualifiées sont déjà placées.</div>
              : unplaced.map(t => (
                <div key={t.id} className="flex" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => placeTeam(t)}>
                  {t.sticker && <span className={t.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{t.sticker}</span>}
                  {t.isGuest && <span style={{ color: 'var(--gold)', fontSize: 15 }}>⭐</span>}
                  <span style={{ fontWeight: 700, fontSize: 13, textTransform: t.isGuest ? 'none' : 'uppercase', color: t.isGuest ? 'var(--gold)' : 'var(--text)' }}>{teamLabel(t)}</span>
                  {t.isGuest && <span className="badge-gold" style={{ marginLeft: 4 }}>GUEST</span>}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function TeamSlot({ team, isWinner, isLoser, canPlace, canRemove, canDeclare, onPlace, onRemove, onDeclare }) {
  const bg    = isWinner ? '#0d3b1e' : 'transparent'
  const color = isWinner ? '#fff' : isLoser ? 'var(--text3)' : team ? 'var(--text)' : 'var(--text3)'
  const flag  = team?.country_code ? flagEmoji(team.country_code) : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: bg, minHeight: 40, cursor: (canPlace || canDeclare) ? 'pointer' : 'default' }}
      onClick={canDeclare ? onDeclare : canPlace ? onPlace : undefined}>
      {team?.sticker && <span style={{ fontSize: 11, fontWeight: 800, color: team.cypher === 'A' ? 'var(--red)' : 'var(--text2)', minWidth: 28 }}>{team.sticker}</span>}
      {team?.isGuest && <span style={{ fontSize: 12, color: isWinner ? '#ffd700' : 'var(--gold)' }}>⭐</span>}
      <span style={{ flex: 1, fontSize: 12, fontWeight: team ? 700 : 400, color, textDecoration: isLoser ? 'line-through' : 'none', textTransform: (team && !team.isGuest) ? 'uppercase' : 'none', letterSpacing: team ? '0.3px' : 0 }}>
        {team ? `${team.name}${flag ? ' ' + flag : ''}` : canPlace ? '+ Placer équipe' : '—'}
      </span>
      {isWinner && <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>✓</span>}
      {canDeclare && <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>tap = gagne</span>}
      {canRemove && (
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--text3)', marginLeft: 4 }}
          onClick={e => { e.stopPropagation(); onRemove() }}>✕</button>
      )}
    </div>
  )
}
