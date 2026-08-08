import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Constantes — style flat bracket compact
const SLOT_H  = 20            // hauteur d'un slot
const MATCH_H = SLOT_H * 2 + 1  // 41px (2 slots + 1px séparateur)
const R1_GAP  = 4             // espace entre matchs dans un pair
const CONN    = 10            // longueur des connecteurs
const CARD_W  = 108           // largeur des cartes

// Calculs d'alignement
// R1 exits: M1=20, M2=41+4+20=65 → mid=42.5 → R2_PT=42.5-20=22
const R2_PT  = 22
// R1 P2 starts at 86+4=90, P2_M1_exit=110, P2_M2_exit=155, mid=132.5 → R2_M2_top=112.5 → R2_GAP=112.5-22-41=49
const R2_GAP = 49
// R2 exits: M1=22+20=42, M2=22+41+49+20=132 → mid=87 → R3_PT=87-20=67
const R3_PT  = 67

const emptyBracket = () => {
  const b = {}
  ;[[1,8],[2,4],[3,2],[4,1]].forEach(([r,n]) => {
    b[r] = {}
    for (let m = 1; m <= n; m++) b[r][m] = { team1: null, team2: null, winner: null }
  })
  return b
}

export default function BracketTab({ battle, crews }) {
  const [validated,     setValidated]     = useState(false)
  const [bracketLocked, setBracketLocked] = useState(false)
  const [top16,         setTop16]         = useState([])
  const [bracket,       setBracket]       = useState(emptyBracket())
  const [selecting,     setSelecting]     = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [locking,       setLocking]       = useState(false)

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    setLoading(true)
    const { data: bData } = await supabase.from('battles')
      .select('top16_validated, bracket_locked').eq('id', battle.id).single()
    if (!bData?.top16_validated) { setLoading(false); return }
    setValidated(true)
    if (bData?.bracket_locked) setBracketLocked(true)

    const [{ data: scoreRows }, { data: guests }] = await Promise.all([
      supabase.from('top16_scores').select('crew_id, score').eq('battle_id', battle.id),
      supabase.from('top16_guests').select('*').eq('battle_id', battle.id).order('position'),
    ])
    const totalsMap = {}
    ;(scoreRows || []).forEach(s => {
      totalsMap[s.crew_id] = (totalsMap[s.crew_id] || 0) + (Number(s.score) || 0)
    })
    const crewsRanked = crews
      .map(c => ({ ...c, total: totalsMap[c.id] || 0, isGuest: false }))
      .sort((a, b) => b.total - a.total)
    const guestEntries = (guests || []).map(g => ({
      id: 'g_'+g.id, name: g.name, member1: g.member1||'', member2: g.member2||'',
      isGuest: true, cypher: null, sticker: null, total: null,
    }))
    setTop16([...guestEntries, ...crewsRanked].slice(0, 16))

    const { data: slots } = await supabase.from('bracket_slots')
      .select('*').eq('battle_id', battle.id)
    if (slots?.length) {
      const newB = emptyBracket()
      slots.forEach(s => {
        if (!newB[s.round]?.[s.match_number]) return
        const slotKey = s.position === 1 ? 'team1' : 'team2'
        if (s.is_winner) {
          newB[s.round][s.match_number].winner = slotKey
        } else {
          newB[s.round][s.match_number][slotKey] = {
            id: s.crew_id || ('g_'+s.id), name: s.team_name,
            sticker: s.sticker, cypher: s.cypher, isGuest: s.is_guest,
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
    setBracket(prev => ({
      ...prev,
      [round]: { ...prev[round], [match]: { ...prev[round][match], [slot]: team } }
    }))
    setSelecting(null)
    await supabase.from('bracket_slots').upsert({
      battle_id: battle.id, round, match_number: match,
      position:  slot === 'team1' ? 1 : 2,
      crew_id:   team.isGuest ? null : team.id,
      team_name: team.name, sticker: team.sticker||null,
      cypher:    team.cypher||null, is_guest: team.isGuest||false, is_winner: false,
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
        battle_id: battle.id, round: nextRound, match_number: nextMatch,
        position:  nextSlot === 'team1' ? 1 : 2,
        crew_id:   winner.isGuest ? null : winner.id,
        team_name: winner.name, sticker: winner.sticker||null,
        cypher:    winner.cypher||null, is_guest: winner.isGuest||false, is_winner: false,
      }, { onConflict: 'battle_id,round,match_number,position' })
    }
    setBracket(newB)
    await supabase.from('bracket_slots').update({ is_winner: true })
      .eq('battle_id', battle.id).eq('round', round).eq('match_number', match)
      .eq('position', slot === 'team1' ? 1 : 2)
  }

  const undoWinner = async (round, match) => {
    const m = bracket[round][match]
    if (!m.winner) return
    const winnerSlot = m.winner
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match].winner = null
    await supabase.from('bracket_slots').update({ is_winner: false })
      .eq('battle_id', battle.id).eq('round', round).eq('match_number', match)
      .eq('position', winnerSlot === 'team1' ? 1 : 2)
    if (round < 4) {
      const nextRound = round + 1
      const nextMatch = Math.ceil(match / 2)
      const nextSlot  = match % 2 === 1 ? 'team1' : 'team2'
      newB[nextRound][nextMatch][nextSlot] = null
      newB[nextRound][nextMatch].winner = null
      await supabase.from('bracket_slots').delete()
        .eq('battle_id', battle.id).eq('round', nextRound)
        .eq('match_number', nextMatch).eq('position', nextSlot === 'team1' ? 1 : 2)
      await supabase.from('bracket_slots').update({ is_winner: false })
        .eq('battle_id', battle.id).eq('round', nextRound).eq('match_number', nextMatch)
    }
    setBracket(newB)
  }

  const lockBracket = async () => {
    setLocking(true)
    await supabase.from('battles').update({ bracket_locked: true }).eq('id', battle.id)
    setBracketLocked(true)
    setLocking(false)
  }

  const allR1Filled = Object.values(bracket[1]).every(m => m.team1 && m.team2)
  const champion = bracket[4][1].winner ? bracket[4][1][bracket[4][1].winner] : null

  const printBracket = () => {
    const S = 34, M = 69, G1 = 8, G2 = 77
    const PT2 = Math.round((M + G1) / 2)
    const PT3 = Math.round(PT2 + (M + G2) / 2)
    const CW = 138, CONN_P = 11, COL_P = CW + CONN_P * 2
    const teamRow = (t, isW, isL) => {
      if (!t) return `<div class="slot"><span class="name" style="color:#ccc">—</span></div>`
      return `<div class="slot${isW ? ' win' : isL ? ' los' : ''}">
        ${t.sticker ? `<span class="stk">${t.sticker}</span>` : ''}
        <span class="name">${t.name}${t.total != null ? ` <span class="pts">${t.total}p</span>` : ''}</span>
        ${isW ? '<span class="tick">✓</span>' : ''}
      </div>`
    }
    const card = (round, match, side, isF = false) => {
      const m = bracket[round]?.[match]
      if (!m) return ''
      const t1W = m.winner === 'team1', t2W = m.winner === 'team2'
      const hConn = side === 'left'
        ? `<div class="ch" style="right:${-CONN_P}px;top:${S/2}px;width:${CONN_P}px"></div>`
        : side === 'right'
          ? `<div class="ch" style="left:${-CONN_P}px;top:${S/2}px;width:${CONN_P}px"></div>`
          : ''
      return `<div style="position:relative"><div class="match${isF?' final':''}">
        ${teamRow(m.team1,t1W,t2W)}<div class="div"></div>${teamRow(m.team2,t2W,t1W)}
      </div>${hConn}</div>`
    }
    const pair = (round, mA, mB, side, gap) => {
      const vH = M + gap
      const vc = side === 'left'
        ? `<div class="cv" style="right:${-CONN_P}px;top:${S/2}px;height:${vH}px"></div>`
        : `<div class="cv" style="left:${-CONN_P}px;top:${S/2}px;height:${vH}px"></div>`
      return `<div style="position:relative">${card(round,mA,side)}<div style="height:${gap}px"></div>${card(round,mB,side)}${vc}</div>`
    }
    const hdrs = ['TOP 16','TOP 8','Demi-finales','⚡ Finale ⚡','Demi-finales','TOP 8','TOP 16']
    const hRow = hdrs.map(h => `<div style="width:${COL_P}px;flex-shrink:0;text-align:center;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#666">${h}</div>`).join('')
    const cols = [
      `<div style="width:${COL_P}px;flex-shrink:0;padding:0 ${CONN_P}px">${pair(1,1,2,'left',G1)}<div style="height:${G1}px"></div>${pair(1,3,4,'left',G1)}</div>`,
      `<div style="width:${COL_P}px;flex-shrink:0;padding:${PT2}px ${CONN_P}px 0">${pair(2,1,2,'left',G2)}</div>`,
      `<div style="width:${COL_P}px;flex-shrink:0;padding:${PT3}px ${CONN_P}px 0">${card(3,1,'left')}</div>`,
      `<div style="width:${COL_P}px;flex-shrink:0;padding:${PT3}px ${CONN_P}px 0">${card(4,1,'none',true)}</div>`,
      `<div style="width:${COL_P}px;flex-shrink:0;padding:${PT3}px ${CONN_P}px 0">${card(3,2,'right')}</div>`,
      `<div style="width:${COL_P}px;flex-shrink:0;padding:${PT2}px ${CONN_P}px 0">${pair(2,3,4,'right',G2)}</div>`,
      `<div style="width:${COL_P}px;flex-shrink:0;padding:0 ${CONN_P}px">${pair(1,5,6,'right',G1)}<div style="height:${G1}px"></div>${pair(1,7,8,'right',G1)}</div>`,
    ].join('')
    const champ = champion ? `<div style="text-align:center;margin-top:12px;padding:6px;background:#fffbea;border:2px solid gold;border-radius:4px;font-weight:900;font-size:13px;text-transform:uppercase">🏆 ${champion.name}</div>` : ''
    const html = `<!DOCTYPE html><html><head><title>${battle.name} — Bracket</title>
      <style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0}
      .match{background:#fff;border:1px solid #ccc;border-radius:3px;overflow:hidden;width:${CW}px}
      .match.final{border:2px solid goldenrod}.slot{height:${S}px;display:flex;align-items:center;padding:0 5px;gap:3px;font-size:9px}
      .slot.win{background:#e8f5e9}.slot.los{opacity:.38;text-decoration:line-through}
      .name{flex:1;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-transform:uppercase}
      .pts{font-size:8px;color:#999;font-weight:400}.stk{font-size:8px;font-weight:800;color:#777;min-width:20px;flex-shrink:0}
      .tick{color:#2e7d32;font-weight:900;font-size:11px;flex-shrink:0}.div{height:1px;background:#e0e0e0}
      .ch{position:absolute;height:1px;background:#aaa}.cv{position:absolute;width:1px;background:#aaa}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
    </head><body>
      <div style="text-align:center;margin-bottom:8px">
        <div style="font-size:15px;font-weight:900;text-transform:uppercase">${battle.name}</div>
        <div style="font-size:9px;color:#777;margin-top:2px">TOP 16 Knock-Out — ${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
      <div style="display:flex;margin-bottom:5px">${hRow}</div>
      <div style="display:flex;align-items:flex-start">${cols}</div>
      ${champ}
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups'); return }
    w.document.write(html); w.document.close(); w.print()
  }

  // ── Slot : rangée plate avec nom équipe
  const renderSlot = (round, match, slotKey, side) => {
    const m = bracket[round][match]
    const team = m[slotKey]
    const isWinner = m.winner === slotKey
    const isLoser  = m.winner && m.winner !== slotKey
    const isFinale = round === 4
    const canPlace   = !bracketLocked && round === 1
    const canDeclare = bracketLocked && !m.winner && m.team1 && m.team2

    return (
      <div
        style={{
          height: SLOT_H, display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: side === 'right' ? 5 : 4, paddingRight: side === 'left' ? 4 : 5,
          background: isWinner ? '#0d2d14' : 'transparent',
          cursor: canDeclare ? 'pointer' : canPlace ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
        onClick={
          canDeclare ? () => declareWinner(round, match, slotKey)
          : canPlace   ? () => setSelecting({ round, match, slot: slotKey })
          : undefined
        }
      >
        {team?.sticker && (
          <span style={{
            fontSize: 7, fontWeight: 800, flexShrink: 0,
            color: team.cypher === 'A' ? '#666' : '#cc0000',
            textDecoration: isLoser ? 'line-through' : 'none',
          }}>{team.sticker}</span>
        )}
        {team?.isGuest && <span style={{ fontSize: 8, color: 'var(--gold)', flexShrink: 0 }}>⭐</span>}
        <span style={{
          flex: 1, fontSize: isFinale ? 10 : 9,
          fontWeight: team ? 700 : 400,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          textTransform: team ? 'uppercase' : 'none',
          color: isWinner ? 'var(--green)' : isLoser ? '#3a3a3a' : team ? 'var(--text)' : 'var(--text3)',
          textDecoration: isLoser ? 'line-through' : 'none',
        }}>
          {team ? team.name : canPlace ? '+ Placer' : '—'}
        </span>
        {team?.total != null && (
          <span style={{ fontSize: 7, color: '#555', flexShrink: 0 }}>{team.total}p</span>
        )}
        {isWinner && <span style={{ fontSize: 8, color: 'var(--green)', fontWeight: 900, flexShrink: 0 }}>✓</span>}
      </div>
    )
  }

  // ── Match : carte plate avec connecteurs
  const renderMatch = (round, match, side) => {
    const m = bracket[round][match]
    const isFinale = round === 4
    const canUndo = bracketLocked && !!m.winner
    const lineColor = '#3a3a3a'

    return (
      <div key={`${round}-${match}`} style={{ position: 'relative', width: CARD_W }}>
        {canUndo && (
          <button onClick={() => undoWinner(round, match)} style={{
            position: 'absolute', top: 1,
            [side === 'right' ? 'left' : 'right']: side === 'right' ? -18 : 2,
            zIndex: 10, background: 'rgba(0,0,0,.7)', border: '1px solid #333',
            borderRadius: 3, padding: '0 3px', fontSize: 7, color: '#777', cursor: 'pointer', lineHeight: '14px',
          }}>↩</button>
        )}

        {/* Carte */}
        <div style={{
          border: isFinale ? '1px solid var(--gold)' : '1px solid #2a2a2a',
          borderRadius: 3, overflow: 'hidden',
          background: isFinale ? 'var(--surface)' : '#0e0e0e',
          boxShadow: isFinale ? '0 0 8px rgba(212,160,23,.2)' : 'none',
        }}>
          {renderSlot(round, match, 'team1', side)}
          <div style={{ height: 1, background: '#222' }} />
          {renderSlot(round, match, 'team2', side)}
        </div>

        {/* Connecteur horizontal sortant */}
        {!isFinale && side === 'left' && (
          <div style={{ position: 'absolute', right: -CONN, top: SLOT_H - 0.5, width: CONN, height: 1, background: lineColor }} />
        )}
        {!isFinale && side === 'right' && (
          <div style={{ position: 'absolute', left: -CONN, top: SLOT_H - 0.5, width: CONN, height: 1, background: lineColor }} />
        )}
      </div>
    )
  }

  // ── Paire de matchs avec connecteur vertical
  const renderPair = (round, mA, mB, side, gap = R1_GAP) => {
    const vTop    = SLOT_H / 2
    const vHeight = MATCH_H + gap + SLOT_H / 2 - SLOT_H / 2
    const lineColor = '#3a3a3a'

    return (
      <div style={{ position: 'relative' }}>
        {renderMatch(round, mA, side)}
        <div style={{ height: gap }} />
        {renderMatch(round, mB, side)}

        {/* Connecteur vertical */}
        {side === 'left' && (
          <div style={{ position: 'absolute', right: -CONN, top: SLOT_H - 0.5, height: MATCH_H + gap, width: 1, background: lineColor }} />
        )}
        {side === 'right' && (
          <div style={{ position: 'absolute', left: -CONN, top: SLOT_H - 0.5, height: MATCH_H + gap, width: 1, background: lineColor }} />
        )}
      </div>
    )
  }

  if (loading) return <div className="caption" style={{ padding: 24 }}>Chargement…</div>
  if (!validated) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔒</div>
        <div className="title-sm" style={{ marginBottom: 8 }}>Bracket non généré</div>
        <div className="muted">Allez dans l'onglet "TOP 16" → "Voir le classement" → "Envoyer au bracket".</div>
      </div>
    )
  }

  const COL = CARD_W + CONN * 2

  return (
    <div>
      {/* ── Bannière avant lancement ── */}
      {!bracketLocked && (
        <div style={{
          background: allR1Filled ? '#0d2d14' : '#1a1200',
          border: `1px solid ${allR1Filled ? 'var(--green-dim)' : 'var(--gold-dim)'}`,
          borderRadius: 8, padding: '10px 16px', marginBottom: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: allR1Filled ? 'var(--green)' : 'var(--gold)' }}>
              {allR1Filled ? '✓ Bracket complet — prêt à lancer' : '⏳ Slots encore vides'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {allR1Filled ? 'Repositionnez si besoin, puis lancez.' : 'Cliquez sur les slots vides pour placer une équipe.'}
            </div>
          </div>
          <button className="btn btn-white"
            style={{ padding: '8px 20px', fontWeight: 800, opacity: allR1Filled ? 1 : 0.4 }}
            disabled={!allR1Filled || locking} onClick={lockBracket}>
            {locking ? '…' : '🚀 Lancer le battle'}
          </button>
        </div>
      )}

      {bracketLocked && !champion && (
        <div className="alert-ok" style={{ marginBottom: 8, fontSize: 11, padding: '7px 12px' }}>
          🚀 Battle lancé — cliquez sur un nom pour déclarer le vainqueur. ↩ pour annuler.
        </div>
      )}

      {/* ── Champion ── */}
      {champion && (
        <div style={{
          background: 'linear-gradient(135deg,#2d1800,#1a1200)',
          border: '1px solid var(--gold)', borderRadius: 8,
          padding: '10px 20px', marginBottom: 10, textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 4 }}>🏆 Champion</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase' }}>{champion.name}</div>
        </div>
      )}

      {/* ── Bouton impression ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={printBracket}>🖨 Imprimer</button>
      </div>

      {/* ══════ BRACKET ARBRE ══════ */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* ── GAUCHE R1 — 1,2,3,4 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN }}>
          {renderPair(1, 1, 2, 'left')}
          <div style={{ height: R1_GAP }} />
          {renderPair(1, 3, 4, 'left')}
        </div>

        {/* ── GAUCHE QF — 1,2 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R2_PT }}>
          {renderPair(2, 1, 2, 'left', R2_GAP)}
        </div>

        {/* ── GAUCHE SF — 1 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R3_PT }}>
          {renderMatch(3, 1, 'left')}
        </div>

        {/* ── FINALE ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R3_PT }}>
          <div style={{ position: 'relative', width: CARD_W }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--gold)',
              borderRadius: 4, overflow: 'hidden',
              boxShadow: '0 0 10px rgba(212,160,23,.15)',
            }}>
              {renderSlot(4, 1, 'team1', 'none')}
              <div style={{ height: 1, background: '#333' }} />
              {renderSlot(4, 1, 'team2', 'none')}
            </div>
            {bracket[4][1].winner && (
              <button onClick={() => undoWinner(4, 1)} style={{
                position: 'absolute', top: 2, right: 2, zIndex: 10,
                background: 'rgba(0,0,0,.7)', border: '1px solid #333',
                borderRadius: 3, padding: '0 3px', fontSize: 7, color: '#777', cursor: 'pointer', lineHeight: '14px',
              }}>↩</button>
            )}
          </div>
        </div>

        {/* ── DROITE SF — 2 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R3_PT }}>
          {renderMatch(3, 2, 'right')}
        </div>

        {/* ── DROITE QF — 3,4 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R2_PT }}>
          {renderPair(2, 3, 4, 'right', R2_GAP)}
        </div>

        {/* ── DROITE R1 — 5,6,7,8 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN }}>
          {renderPair(1, 5, 6, 'right')}
          <div style={{ height: R1_GAP }} />
          {renderPair(1, 7, 8, 'right')}
        </div>

      </div>

      {/* ── Modale sélection équipe ── */}
      {selecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440 }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <div className="title-sm">Choisir une équipe</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelecting(null)}>✕</button>
            </div>
            {top16.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 8 }}
                onClick={() => placeTeam(t)}>
                {t.sticker && <span className={t.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{t.sticker}</span>}
                {t.isGuest && <span style={{ color: 'var(--gold)', fontSize: 15 }}>⭐</span>}
                <span style={{ flex: 1, fontWeight: 600, textTransform: 'uppercase', color: t.isGuest ? 'var(--gold)' : 'var(--text)' }}>{t.name}</span>
                {t.total != null && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.total} pts</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
