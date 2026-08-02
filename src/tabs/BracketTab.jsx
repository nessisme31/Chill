import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Constantes de dimensionnement
const SLOT_H  = 40    // hauteur fixe d'un slot équipe (px)
const MATCH_H = SLOT_H * 2 + 1   // hauteur d'un match (2 slots + 1px séparateur)
const R1_GAP  = 8     // espace entre matchs R1
const CONN    = 14    // longueur des connecteurs horizontaux (px)

// Padding-top calculé pour aligner chaque colonne sur la précédente
// Centre de M1 R1 = 20, centre de M2 R1 = 20+81+8 = 109
// Centre R2 M1 = (20+109)/2 = 64.5 → paddingTop = 64.5 - 20 = 44.5 ≈ 45
const R2_PT  = 45
const R2_GAP = MATCH_H + R1_GAP   // 89px — espace entre matchs R2
// Centre R2 M1 (absolu) = R2_PT + 20 = 65
// Centre R2 M2 (absolu) = R2_PT + 81 + 89 + 20 = 65 + 170 = 235... recalc:
// R2_M1_center = R2_PT + SLOT_H/2 = 45 + 20 = 65
// R2_M2_center = R2_PT + MATCH_H + R2_GAP + SLOT_H/2 = 45 + 81 + 89 + 20 = 235
// R3_PT = (65 + 235)/2 - 20 = 150 - 20 = 130
const R3_PT  = 130

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

  // ── Impression bracket A4 paysage
  const printBracket = () => {
    const S = 34, M = 69, G1 = 8, G2 = 77
    const PT2 = Math.round((M + G1) / 2)       // 38
    const PT3 = Math.round(PT2 + (M + G2) / 2) // 113
    const CW = 138, CONN = 11, COL = CW + CONN * 2

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
        ? `<div class="ch" style="right:${-CONN}px;top:${S/2}px;width:${CONN}px"></div>`
        : side === 'right'
          ? `<div class="ch" style="left:${-CONN}px;top:${S/2}px;width:${CONN}px"></div>`
          : ''
      return `<div style="position:relative">
        <div class="match${isF ? ' final' : ''}">
          ${teamRow(m.team1, t1W, t2W)}
          <div class="div"></div>
          ${teamRow(m.team2, t2W, t1W)}
        </div>${hConn}</div>`
    }

    const pair = (round, mA, mB, side, gap) => {
      const vH = M + gap
      const vc = side === 'left'
        ? `<div class="cv" style="right:${-CONN}px;top:${S/2}px;height:${vH}px"></div>`
        : `<div class="cv" style="left:${-CONN}px;top:${S/2}px;height:${vH}px"></div>`
      return `<div style="position:relative">${card(round,mA,side)}<div style="height:${gap}px"></div>${card(round,mB,side)}${vc}</div>`
    }

    const hdrs = ['TOP 16','TOP 8','Demi-finales','⚡ Finale ⚡','Demi-finales','TOP 8','TOP 16']
    const hRow = hdrs.map(h => `<div style="width:${COL}px;flex-shrink:0;text-align:center;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#666">${h}</div>`).join('')

    const cols = [
      `<div style="width:${COL}px;flex-shrink:0;padding:0 ${CONN}px">${pair(1,1,2,'left',G1)}<div style="height:${G1}px"></div>${pair(1,3,4,'left',G1)}</div>`,
      `<div style="width:${COL}px;flex-shrink:0;padding:${PT2}px ${CONN}px 0">${pair(2,1,2,'left',G2)}</div>`,
      `<div style="width:${COL}px;flex-shrink:0;padding:${PT3}px ${CONN}px 0">${card(3,1,'left')}</div>`,
      `<div style="width:${COL}px;flex-shrink:0;padding:${PT3}px ${CONN}px 0">${card(4,1,'none',true)}</div>`,
      `<div style="width:${COL}px;flex-shrink:0;padding:${PT3}px ${CONN}px 0">${card(3,2,'right')}</div>`,
      `<div style="width:${COL}px;flex-shrink:0;padding:${PT2}px ${CONN}px 0">${pair(2,3,4,'right',G2)}</div>`,
      `<div style="width:${COL}px;flex-shrink:0;padding:0 ${CONN}px">${pair(1,5,6,'right',G1)}<div style="height:${G1}px"></div>${pair(1,7,8,'right',G1)}</div>`,
    ].join('')

    const champ = champion ? `<div style="text-align:center;margin-top:12px;padding:6px;background:#fffbea;border:2px solid gold;border-radius:4px;font-weight:900;font-size:13px;text-transform:uppercase">🏆 ${champion.name}</div>` : ''

    const html = `<!DOCTYPE html><html><head>
      <title>${battle.name} — Bracket</title>
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 0; }
        .match { background: #fff; border: 1px solid #ccc; border-radius: 3px; overflow: hidden; width: ${CW}px; }
        .match.final { border: 2px solid goldenrod; }
        .slot { height: ${S}px; display: flex; align-items: center; padding: 0 5px; gap: 3px; font-size: 9px; }
        .slot.win { background: #e8f5e9; }
        .slot.los { opacity: 0.38; text-decoration: line-through; }
        .name { flex: 1; font-weight: 700; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-transform: uppercase; }
        .pts { font-size: 8px; color: #999; font-weight: 400; }
        .stk { font-size: 8px; font-weight: 800; color: #777; min-width: 20px; flex-shrink: 0; }
        .tick { color: #2e7d32; font-weight: 900; font-size: 11px; flex-shrink: 0; }
        .div { height: 1px; background: #e0e0e0; }
        .ch { position: absolute; height: 1px; background: #aaa; }
        .cv { position: absolute; width: 1px; background: #aaa; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
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
    if (!w) { alert('Autorisez les popups pour imprimer'); return }
    w.document.write(html)
    w.document.close()
    w.print()
  }

  // ── Rendu d'un slot équipe
  const renderSlot = (round, match, slotKey) => {
    const m = bracket[round][match]
    const team = m[slotKey]
    const isWinner = m.winner === slotKey
    const isLoser  = m.winner && m.winner !== slotKey
    const isR1 = round === 1
    const canPlace   = !bracketLocked && isR1
    const canDeclare = bracketLocked && !m.winner && m.team1 && m.team2

    return (
      <div
        style={{
          height: SLOT_H, display: 'flex', alignItems: 'center', gap: 5,
          padding: '0 8px', cursor: canDeclare ? 'pointer' : canPlace ? 'pointer' : 'default',
          background: isWinner ? '#0d2d14' : 'transparent',
          overflow: 'hidden',
        }}
        onClick={canDeclare ? () => declareWinner(round, match, slotKey)
               : canPlace   ? () => setSelecting({ round, match, slot: slotKey })
               : undefined}
      >
        {team?.sticker && (
          <span style={{ fontSize: 9, fontWeight: 800, minWidth: 20, flexShrink: 0,
            color: team.cypher === 'A' ? 'var(--text2)' : 'var(--red)',
            textDecoration: isLoser ? 'line-through' : 'none' }}>
            {team.sticker}
          </span>
        )}
        {team?.isGuest && <span style={{ fontSize: 10, color: 'var(--gold)', flexShrink: 0 }}>⭐</span>}
        <span style={{
          flex: 1, fontSize: 11, fontWeight: team ? 700 : 400, overflow: 'hidden',
          whiteSpace: 'nowrap', textOverflow: 'ellipsis', textTransform: team ? 'uppercase' : 'none',
          color: isWinner ? 'var(--green)' : isLoser ? 'var(--text3)' : team ? 'var(--text)' : 'var(--text3)',
          textDecoration: isLoser ? 'line-through' : 'none',
        }}>
          {team ? team.name : canPlace ? '+ Placer' : '—'}
        </span>
        {team?.total != null && (
          <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0, opacity: 0.7 }}>
            {team.total}p
          </span>
        )}
        {isWinner && <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 900, flexShrink: 0 }}>✓</span>}
        {canDeclare && !team && <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0 }}>tap</span>}
      </div>
    )
  }

  // ── Rendu d'un bloc match complet (card + connecteurs)
  const renderMatch = (round, match, side) => {
    const m      = bracket[round][match]
    const canUndo = bracketLocked && !!m.winner

    return (
      <div key={`${round}-${match}`} style={{ position: 'relative', width: 175 }}>
        {/* Bouton annuler */}
        {canUndo && (
          <button onClick={() => undoWinner(round, match)} style={{
            position: 'absolute', top: 2, right: side === 'right' ? 'auto' : 2, left: side === 'right' ? 2 : 'auto',
            zIndex: 10, background: 'rgba(0,0,0,.6)', border: '1px solid var(--border2)',
            borderRadius: 4, padding: '1px 5px', fontSize: 9, color: 'var(--text3)', cursor: 'pointer',
          }}>↩</button>
        )}

        {/* Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {renderSlot(round, match, 'team1')}
          <div style={{ height: 1, background: 'var(--border)' }} />
          {renderSlot(round, match, 'team2')}
        </div>

        {/* Connecteur horizontal → vers le round suivant */}
        {side === 'left' && (
          <div style={{ position: 'absolute', right: -CONN, top: SLOT_H - 0.5, width: CONN, height: 1, background: 'var(--border2)' }} />
        )}
        {side === 'right' && (
          <div style={{ position: 'absolute', left: -CONN, top: SLOT_H - 0.5, width: CONN, height: 1, background: 'var(--border2)' }} />
        )}
      </div>
    )
  }

  // ── Rendu d'une paire de matchs (avec connecteur vertical)
  const renderPair = (round, mA, mB, side, gap = R1_GAP) => {
    // Centre de mA dans la paire = SLOT_H/2 = 20
    // Centre de mB dans la paire = MATCH_H + gap + SLOT_H/2
    const vTop    = SLOT_H / 2
    const vBottom = MATCH_H + gap + SLOT_H / 2
    const vHeight = vBottom - vTop

    return (
      <div style={{ position: 'relative' }}>
        {renderMatch(round, mA, side)}
        <div style={{ height: gap }} />
        {renderMatch(round, mB, side)}

        {/* Connecteur vertical entre les deux matchs */}
        {side === 'left' && (
          <div style={{ position: 'absolute', right: -CONN, top: vTop, height: vHeight, width: 1, background: 'var(--border2)' }} />
        )}
        {side === 'right' && (
          <div style={{ position: 'absolute', left: -CONN, top: vTop, height: vHeight, width: 1, background: 'var(--border2)' }} />
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
        <div className="muted">
          Allez dans l'onglet "TOP 16" → "Voir le classement" → "Envoyer au bracket".
        </div>
      </div>
    )
  }

  const COL = 175 + CONN * 2  // largeur totale d'une colonne (card + connecteurs)

  return (
    <div>
      {/* ── Bannière statut avant lancement ── */}
      {!bracketLocked && (
        <div style={{
          background: allR1Filled ? '#0d2d14' : '#1a1200',
          border: `1px solid ${allR1Filled ? 'var(--green-dim)' : 'var(--gold-dim)'}`,
          borderRadius: 8, padding: '14px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: allR1Filled ? 'var(--green)' : 'var(--gold)' }}>
              {allR1Filled ? '✓ Bracket complet — prêt à lancer' : '⏳ Modifiez le bracket avant de lancer'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {allR1Filled
                ? 'Cliquez sur une équipe pour la repositionner. Validez quand vous êtes prêt.'
                : 'Des slots sont encore vides — cliquez pour placer une équipe.'}
            </div>
          </div>
          <button
            className="btn btn-white"
            style={{ padding: '10px 24px', fontWeight: 800, opacity: allR1Filled ? 1 : 0.4 }}
            disabled={!allR1Filled || locking}
            onClick={lockBracket}
          >
            {locking ? '…' : '🚀 Lancer le battle'}
          </button>
        </div>
      )}

      {bracketLocked && !champion && (
        <div className="alert-ok" style={{ marginBottom: 20 }}>
          🚀 Battle lancé — cliquez sur une équipe pour déclarer le vainqueur d'un match. Bouton ↩ pour annuler.
        </div>
      )}

      {/* ── Champion ── */}
      {champion && (
        <div style={{
          background: 'linear-gradient(135deg, #2d1800, #1a1200)',
          border: '1px solid var(--gold)', borderRadius: 10,
          padding: '20px 24px', marginBottom: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6 }}>🏆 Champion</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--gold)', textTransform: 'uppercase' }}>{champion.name}</div>
          {champion.sticker && <div style={{ color: 'var(--gold)', opacity: .6, marginTop: 4, fontSize: 13 }}>{champion.sticker}</div>}
        </div>
      )}

      {/* ── Bouton impression ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={printBracket}>🖨 Imprimer le bracket</button>
      </div>

      {/* ══════════════════════════════════════
          LAYOUT BRACKET EN ARBRE SYMÉTRIQUE
          LEFT: R1(1-4) QF(1-2) SF(1)
          CENTER: Finale
          RIGHT: SF(2) QF(3-4) R1(5-8)
      ══════════════════════════════════════ */}
      <div style={{ overflowX: 'auto', paddingBottom: 16 }}>

        {/* En-têtes de colonnes */}
        <div style={{ display: 'flex', marginBottom: 10 }}>
          {[
            { label: 'TOP 16', w: COL },
            { label: 'TOP 8',  w: COL },
            { label: 'Demi-finales', w: COL },
            { label: '⚡ Finale ⚡', w: COL },
            { label: 'Demi-finales', w: COL },
            { label: 'TOP 8',  w: COL },
            { label: 'TOP 16', w: COL },
          ].map(({ label, w }, i) => (
            <div key={i} style={{
              width: w, flexShrink: 0, textAlign: 'center',
              fontSize: 10, fontWeight: 700, color: i === 3 ? 'var(--gold)' : 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: '1px',
            }}>{label}</div>
          ))}
        </div>

        {/* Corps du bracket */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>

          {/* ── GAUCHE R1 — matchs 1,2,3,4 ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN }}>
            {renderPair(1, 1, 2, 'left')}
            <div style={{ height: R1_GAP }} />
            {renderPair(1, 3, 4, 'left')}
          </div>

          {/* ── GAUCHE QF — matchs 1,2 ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R2_PT }}>
            {renderPair(2, 1, 2, 'left', R2_GAP)}
          </div>

          {/* ── GAUCHE SF — match 1 ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R3_PT }}>
            {renderMatch(3, 1, 'left')}
          </div>

          {/* ── FINALE ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R3_PT }}>
            <div style={{ position: 'relative', width: 175 }}>
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--gold)',
                borderRadius: 6, overflow: 'hidden',
                boxShadow: '0 0 12px rgba(212,160,23,.15)',
              }}>
                {renderSlot(4, 1, 'team1')}
                <div style={{ height: 1, background: 'var(--border)' }} />
                {renderSlot(4, 1, 'team2')}
              </div>
              {bracket[4][1].winner && (
                <button onClick={() => undoWinner(4, 1)} style={{
                  position: 'absolute', top: 2, right: 2, zIndex: 10,
                  background: 'rgba(0,0,0,.6)', border: '1px solid var(--border2)',
                  borderRadius: 4, padding: '1px 5px', fontSize: 9, color: 'var(--text3)', cursor: 'pointer',
                }}>↩</button>
              )}
            </div>
          </div>

          {/* ── DROITE SF — match 2 ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R3_PT }}>
            {renderMatch(3, 2, 'right')}
          </div>

          {/* ── DROITE QF — matchs 3,4 ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN, paddingTop: R2_PT }}>
            {renderPair(2, 3, 4, 'right', R2_GAP)}
          </div>

          {/* ── DROITE R1 — matchs 5,6,7,8 ── */}
          <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN }}>
            {renderPair(1, 5, 6, 'right')}
            <div style={{ height: R1_GAP }} />
            {renderPair(1, 7, 8, 'right')}
          </div>

        </div>
      </div>

      {/* ── Modale sélection équipe ── */}
      {selecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Choisir une équipe</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelecting(null)}>✕</button>
            </div>
            <div className="muted" style={{ marginBottom: 12, fontSize: 12 }}>
              Cliquez sur une équipe pour la placer dans ce slot.
            </div>
            {top16.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', gap: 8 }}
                onClick={() => placeTeam(t)}>
                {t.sticker && <span className={t.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{t.sticker}</span>}
                {t.isGuest && <span style={{ color: 'var(--gold)', fontSize: 15 }}>⭐</span>}
                <span style={{ flex: 1, fontWeight: 600, textTransform: 'uppercase', color: t.isGuest ? 'var(--gold)' : 'var(--text)' }}>
                  {t.name}
                </span>
                {t.total != null && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.total} pts</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
