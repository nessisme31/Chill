import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Constantes bracket flat (style référence)
const TH   = 22    // hauteur d'une boîte équipe
const TW   = 88    // largeur d'une boîte équipe
const GI   = 5     // espace entre team1 et team2 dans le même match
const GB   = 10    // espace entre deux matchs dans un pair
const ARM  = 8     // bras horizontal (boîte → vertical bracket)
const OUT  = 6     // bras de sortie (milieu vertical → col suivante)
const CONN = ARM + OUT  // = 14, padding de chaque côté dans la colonne

// Milieu d'un match (entre T1 center et T2 center)
// T1_CY = TH/2 = 11, T2_CY = TH+GI+TH/2 = 38, MID = 24.5
const MID_Y    = Math.round((TH / 2 + TH + GI + TH / 2) / 2)  // = 24
const MATCH_H  = TH * 2 + GI                                    // = 49

// Alignements calculés
// R1 pair: M1_mid=24, M2_mid=83 → pair_mid=53.5 → R2_PT=53.5-24≈30
const R2_PT  = 30
// R1 P2 starts at 118, P2_mid=171.5 → R2_M2_top=148, R2_M1_bottom=79 → R2_GAP=69
const R2_GAP = 69
// R2 M1_mid=54, M2_mid=172 → SF_mid=113 → R3_PT=89
const R3_PT  = 89

const COL  = CONN * 2 + TW  // = 116px par colonne → 7×116 = 812px total

const LC = '#505050'  // couleur des lignes de bracket

const emptyBracket = () => {
  const b = {}
  ;[[1,8],[2,4],[3,2],[4,1]].forEach(([r,n]) => {
    b[r] = {}
    for (let m = 1; m <= n; m++) b[r][m] = { team1: null, team2: null, winner: null }
  })
  return b
}

export default function BracketTab({ battle, crews }) {
  const backgroundKey = `citc_bracket_background_${battle.id}`
  const [validated,     setValidated]     = useState(false)
  const [bracketLocked, setBracketLocked] = useState(false)
  const [top16,         setTop16]         = useState([])
  const [bracket,       setBracket]       = useState(emptyBracket())
  const [selecting,     setSelecting]     = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [locking,       setLocking]       = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth)
  const [background, setBackground] = useState(() => {
    try { return typeof window === 'undefined' ? '' : (localStorage.getItem(backgroundKey) || '') } catch (e) { return '' }
  })
  const displayChannelRef = useRef(null)
  const backgroundInputRef = useRef(null)

  useEffect(() => { loadData() }, [battle.id])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
        if (s.is_winner) newB[s.round][s.match_number].winner = slotKey
        else newB[s.round][s.match_number][slotKey] = {
          id: s.crew_id || ('g_'+s.id), name: s.team_name,
          sticker: s.sticker, cypher: s.cypher, isGuest: s.is_guest,
          total: s.crew_id ? (totalsMap[s.crew_id] ?? null) : null,
        }
      })
      setBracket(newB)
    }
    setLoading(false)
  }

  const isTeamPlacedElsewhere = (teamId, except = selecting) => {
    return Object.entries(bracket).some(([roundKey, round]) =>
      Object.entries(round).some(([matchKey, m]) =>
        ['team1', 'team2'].some(slotKey => {
          const isExceptedSlot = except
            && Number(roundKey) === except.round
            && Number(matchKey) === except.match
            && slotKey === except.slot
          return !isExceptedSlot && String(m[slotKey]?.id) === String(teamId)
        })
      )
    )
  }

  const placeTeam = async (team) => {
    if (!selecting || isTeamPlacedElsewhere(team.id)) return
    const { round, match, slot } = selecting
    setBracket(prev => ({ ...prev, [round]: { ...prev[round], [match]: { ...prev[round][match], [slot]: team } } }))
    setSelecting(null)
    await supabase.from('bracket_slots').upsert({
      battle_id: battle.id, round, match_number: match,
      position: slot === 'team1' ? 1 : 2,
      crew_id: team.isGuest ? null : team.id,
      team_name: team.name, sticker: team.sticker||null,
      cypher: team.cypher||null, is_guest: team.isGuest||false, is_winner: false,
    }, { onConflict: 'battle_id,round,match_number,position' })
  }

  const removeTeam = async (round, match, slot) => {
    if (bracketLocked || round !== 1 || !bracket[round]?.[match]?.[slot]) return
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match][slot] = null
    setBracket(newB)
    await supabase.from('bracket_slots').delete()
      .eq('battle_id', battle.id)
      .eq('round', round)
      .eq('match_number', match)
      .eq('position', slot === 'team1' ? 1 : 2)
  }

  const declareWinner = async (round, match, slot) => {
    const winner = bracket[round][match][slot]
    if (!winner) return
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match].winner = slot
    if (round < 4) {
      const nr = round + 1, nm = Math.ceil(match / 2), ns = match % 2 === 1 ? 'team1' : 'team2'
      newB[nr][nm][ns] = winner
      await supabase.from('bracket_slots').upsert({
        battle_id: battle.id, round: nr, match_number: nm,
        position: ns === 'team1' ? 1 : 2,
        crew_id: winner.isGuest ? null : winner.id,
        team_name: winner.name, sticker: winner.sticker||null,
        cypher: winner.cypher||null, is_guest: winner.isGuest||false, is_winner: false,
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
    const ws = m.winner
    const newB = JSON.parse(JSON.stringify(bracket))
    newB[round][match].winner = null
    await supabase.from('bracket_slots').update({ is_winner: false })
      .eq('battle_id', battle.id).eq('round', round).eq('match_number', match)
      .eq('position', ws === 'team1' ? 1 : 2)
    if (round < 4) {
      const nr = round + 1, nm = Math.ceil(match / 2), ns = match % 2 === 1 ? 'team1' : 'team2'
      newB[nr][nm][ns] = null
      newB[nr][nm].winner = null
      await supabase.from('bracket_slots').delete()
        .eq('battle_id', battle.id).eq('round', nr).eq('match_number', nm).eq('position', ns === 'team1' ? 1 : 2)
      await supabase.from('bracket_slots').update({ is_winner: false })
        .eq('battle_id', battle.id).eq('round', nr).eq('match_number', nm)
    }
    setBracket(newB)
  }

  const lockBracket = async () => {
    setLocking(true)
    await supabase.from('battles').update({ bracket_locked: true }).eq('id', battle.id)
    setBracketLocked(true)
    setLocking(false)
  }

  const resetBracket = async () => {
    if (!window.confirm('Refaire le bracket va effacer les vainqueurs et les tours déjà avancés. Continuer ?')) return
    setLocking(true)
    await supabase.from('bracket_slots').delete().eq('battle_id', battle.id)
    await supabase.from('battles').update({ bracket_locked: false }).eq('id', battle.id)
    setBracket(emptyBracket())
    setBracketLocked(false)
    setLocking(false)
  }

  const handleBackgroundImport = (event) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setBackground(dataUrl)
      try { localStorage.setItem(backgroundKey, dataUrl) } catch (e) {}
      event.target.value = ''
    }
    reader.readAsDataURL(file)
  }

  const allR1Filled = Object.values(bracket[1]).every(m => m.team1 && m.team2)
  const champion = bracket[4][1].winner ? bracket[4][1][bracket[4][1].winner] : null
  const bracketBaseWidth = COL * 7
  const bracketBaseHeight = Math.max(
    MATCH_H * 2 + GB * 2,
    R2_PT + MATCH_H * 2 + R2_GAP,
    R3_PT + MATCH_H,
  ) + 18
  const bracketScale = Math.min(2.15, Math.max(0.78, (viewportWidth - 96) / bracketBaseWidth))
  const bracketViewportWidth = bracketBaseWidth * bracketScale
  const bracketViewportHeight = bracketBaseHeight * bracketScale

  useEffect(() => {
    displayChannelRef.current?.postMessage({ bracket, champion, background })
  }, [bracket, champion, background])

  useEffect(() => () => displayChannelRef.current?.close(), [])

  // ─── Rendu d'une boîte équipe individuelle ───────────────────────────────────
  const renderTeamBox = (round, match, slotKey, side) => {
    const m = bracket[round][match]
    const team = m[slotKey]
    const isWinner = m.winner === slotKey
    const isLoser  = m.winner && m.winner !== slotKey
    const isR1     = round === 1
    const canPlace   = !bracketLocked && round === 1
    const canDeclare = bracketLocked && !m.winner && m.team1 && m.team2

    return (
      <div
        style={{
          position: 'relative',
          height: TH, display: 'flex', alignItems: 'center', gap: 4,
          paddingLeft: 5, paddingRight: 4,
          background: isWinner ? '#122a12' : isR1 ? '#202020' : '#141414',
          border: `1px solid ${isWinner ? '#1e4a1e' : isR1 ? '#363636' : '#222'}`,
          borderRadius: 2, overflow: 'hidden',
          opacity: isLoser ? 0.22 : 1,
          cursor: canDeclare ? 'pointer' : canPlace ? 'pointer' : 'default',
        }}
        onClick={
          canDeclare ? () => declareWinner(round, match, slotKey)
          : canPlace ? () => setSelecting({ round, match, slot: slotKey })
          : undefined
        }
      >
        {canPlace && team && (
          <button
            onClick={(event) => { event.stopPropagation(); removeTeam(round, match, slotKey) }}
            title="Retirer cette équipe"
            style={{
              position: 'absolute', top: 1, right: 2, zIndex: 2,
              width: 14, height: 14, padding: 0, lineHeight: '12px',
              border: '1px solid #555', borderRadius: '50%',
              background: '#111', color: '#aaa', cursor: 'pointer', fontSize: 10,
            }}
          >×</button>
        )}
        {team?.sticker && (
          <span style={{ fontSize: 7, fontWeight: 800, flexShrink: 0, color: team.cypher === 'A' ? '#666' : '#cc0000' }}>
            {team.sticker}
          </span>
        )}
        {team?.isGuest && <span style={{ fontSize: 8, color: 'var(--gold)', flexShrink: 0 }}>⭐</span>}
        <span style={{
          flex: 1, fontSize: 9, fontWeight: team ? 700 : 400,
          textTransform: team ? 'uppercase' : 'none',
          color: isWinner ? '#6aff6a' : team ? '#d0d0d0' : '#444',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {team ? team.name : (canPlace ? '+ Placer' : '—')}
        </span>
        {team?.total != null && (
          <span style={{ fontSize: 7, color: '#505050', flexShrink: 0 }}>{team.total}p</span>
        )}
        {isWinner && <span style={{ fontSize: 8, color: '#6aff6a', flexShrink: 0, marginLeft: 2 }}>✓</span>}
      </div>
    )
  }

  // ─── Rendu d'un match : 2 boîtes séparées + lignes de bracket ────────────────
  const renderMatch = (round, match, side) => {
    const m = bracket[round][match]
    const isFinale = round === 4
    const canUndo = bracketLocked && !!m.winner

    // Finale : boîte partagée dorée
    if (isFinale) {
      return (
        <div key={`r${round}-m${match}`} style={{ position: 'relative', width: TW }}>
          {canUndo && (
            <button onClick={() => undoWinner(round, match)} style={{
              position: 'absolute', top: 2, right: 2, zIndex: 10,
              background: 'rgba(0,0,0,.8)', border: '1px solid #444',
              borderRadius: 3, padding: '0 3px', fontSize: 7, color: '#888', cursor: 'pointer', lineHeight: '14px',
            }}>↩</button>
          )}
          <div style={{ border: '1px solid var(--gold)', borderRadius: 3, overflow: 'hidden', background: 'var(--surface)', boxShadow: '0 0 10px rgba(212,160,23,.18)' }}>
            {renderTeamBox(round, match, 'team1', 'none')}
            <div style={{ height: 1, background: '#333' }} />
            {renderTeamBox(round, match, 'team2', 'none')}
          </div>
        </div>
      )
    }

    // T1 center, T2 center, midpoint
    const T1_Y = TH / 2 - 0.5
    const T2_Y = TH + GI + TH / 2 - 0.5

    return (
      <div key={`r${round}-m${match}`} style={{ position: 'relative', width: TW }}>
        {canUndo && (
          <button onClick={() => undoWinner(round, match)} style={{
            position: 'absolute', top: 1,
            [side === 'right' ? 'left' : 'right']: side === 'right' ? -18 : 2,
            zIndex: 10, background: 'rgba(0,0,0,.8)', border: '1px solid #333',
            borderRadius: 3, padding: '0 3px', fontSize: 7, color: '#777', cursor: 'pointer', lineHeight: '14px',
          }}>↩</button>
        )}

        {/* Boîte équipe 1 */}
        {renderTeamBox(round, match, 'team1', side)}
        <div style={{ height: GI }} />
        {/* Boîte équipe 2 */}
        {renderTeamBox(round, match, 'team2', side)}

        {/* ── Lignes de bracket ── */}
        {side === 'left' && (
          <>
            {/* Bras horizontal T1 */}
            <div style={{ position: 'absolute', left: TW, top: T1_Y, width: ARM, height: 1, background: LC }} />
            {/* Bras horizontal T2 */}
            <div style={{ position: 'absolute', left: TW, top: T2_Y, width: ARM, height: 1, background: LC }} />
            {/* Ligne verticale reliant T1 et T2 */}
            <div style={{ position: 'absolute', left: TW + ARM - 1, top: T1_Y, height: T2_Y - T1_Y + 1, width: 1, background: LC }} />
            {/* Ligne de sortie (milieu → colonne suivante) */}
            <div style={{ position: 'absolute', left: TW + ARM, top: MID_Y - 0.5, width: OUT, height: 1, background: LC }} />
            {/* Ligne entrante depuis colonne précédente (round > 1) */}
            {round > 1 && (
              <div style={{ position: 'absolute', right: TW, top: MID_Y - 0.5, width: CONN - ARM, height: 1, background: LC }} />
            )}
          </>
        )}
        {side === 'right' && (
          <>
            <div style={{ position: 'absolute', right: TW, top: T1_Y, width: ARM, height: 1, background: LC }} />
            <div style={{ position: 'absolute', right: TW, top: T2_Y, width: ARM, height: 1, background: LC }} />
            <div style={{ position: 'absolute', right: TW + ARM - 1, top: T1_Y, height: T2_Y - T1_Y + 1, width: 1, background: LC }} />
            <div style={{ position: 'absolute', right: TW + ARM, top: MID_Y - 0.5, width: OUT, height: 1, background: LC }} />
            {round > 1 && (
              <div style={{ position: 'absolute', left: TW, top: MID_Y - 0.5, width: CONN - ARM, height: 1, background: LC }} />
            )}
          </>
        )}
      </div>
    )
  }

  // ─── Paire de 2 matchs + connecteur vertical inter-matchs ────────────────────
  const renderPair = (round, mA, mB, side, gap = GB) => {
    const MID_A = MID_Y  // milieu de match A (relatif à renderPair)
    const MID_B = MATCH_H + gap + MID_Y  // milieu de match B

    return (
      <div style={{ position: 'relative' }}>
        {renderMatch(round, mA, side)}
        <div style={{ height: gap }} />
        {renderMatch(round, mB, side)}

        {/* Ligne verticale reliant les sorties des deux matchs */}
        {side === 'left' && (
          <div style={{ position: 'absolute', left: TW + ARM - 1, top: MID_A, height: MID_B - MID_A, width: 1, background: LC }} />
        )}
        {side === 'right' && (
          <div style={{ position: 'absolute', right: TW + ARM - 1, top: MID_A, height: MID_B - MID_A, width: 1, background: LC }} />
        )}
      </div>
    )
  }

  // ─── Affichage écran public ───────────────────────────────────────────────────
  const openDisplayMode = () => {
    const channelName = `citc_bracket_display_${battle.id}`
    const initialState = JSON.stringify({ bracket, champion, background }).replace(/</g, '\\u003c')
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups pour ouvrir l’affichage du bracket'); return }

    displayChannelRef.current?.close()
    displayChannelRef.current = new BroadcastChannel(channelName)

    const html = `<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${battle.name} — Bracket écran</title>
      <style>
        *{box-sizing:border-box}
        html,body{margin:0;min-height:100%;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif}
        body{padding:24px 32px;overflow:auto}
        .bracket{display:grid;grid-template-columns:1.35fr 1fr .85fr .85fr .85fr 1fr 1.35fr;gap:clamp(12px,1.4vw,28px);min-height:100vh;align-items:stretch}
        .round{display:flex;flex-direction:column;justify-content:space-around;gap:clamp(10px,1vw,20px);min-width:0}
        .round>div[id]{display:flex;flex:1;flex-direction:column;justify-content:space-around;gap:clamp(10px,1vw,20px)}
        .round.left{text-align:left}.round.right{text-align:right}
        .round.final{justify-content:center}
        .match{background:#111;border:1px solid #333;border-radius:7px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.28)}
        .final .match{border-color:#c79617;box-shadow:0 0 18px rgba(212,160,23,.2)}
        .team{min-height:clamp(46px,5.2vh,72px);display:flex;align-items:center;padding:8px 14px;font-size:clamp(15px,1.2vw,28px);font-weight:800;text-transform:uppercase;line-height:1.08;overflow-wrap:anywhere}
        .team + .team{border-top:1px solid #333}
        .team.pending{color:#555;font-weight:600;text-transform:none}
        .team.win{background:#3a2a05;color:#f1c84b}
        .team.los{background:#2a0e0e;color:#e06a6a;opacity:.55}
        .round-label{color:#666;font-size:clamp(10px,.75vw,14px);font-weight:800;letter-spacing:2px;text-transform:uppercase;text-align:center;margin-bottom:5px}
        @media (max-width:900px){body{padding:16px}.bracket{grid-template-columns:repeat(7,minmax(150px,1fr));overflow-x:auto;min-height:calc(100vh - 100px)}.team{font-size:16px}}
      </style>
      </head><body>
        <div class="bracket">
          <div class="round left"><div class="round-label">1/8 finale</div><div id="leftR1"></div></div>
          <div class="round left"><div class="round-label">Quarts</div><div id="leftR2"></div></div>
          <div class="round left"><div class="round-label">Demi-finale</div><div id="leftR3"></div></div>
          <div class="round final"><div class="round-label">Finale</div><div id="final"></div></div>
          <div class="round right"><div class="round-label">Demi-finale</div><div id="rightR3"></div></div>
          <div class="round right"><div class="round-label">Quarts</div><div id="rightR2"></div></div>
          <div class="round right"><div class="round-label">1/8 finale</div><div id="rightR1"></div></div>
        </div>
        <script>
          const initial = ${initialState};
          const channel = new BroadcastChannel(${JSON.stringify(channelName)});
          const backgroundKey = ${JSON.stringify(`citc_bracket_background_${battle.id}`)};
          const applyBackground = (dataUrl) => {
            document.body.style.backgroundImage = dataUrl
              ? 'linear-gradient(rgba(0,0,0,.58),rgba(0,0,0,.58)),url("' + dataUrl + '")'
              : '';
            document.body.style.backgroundSize = dataUrl ? 'cover' : '';
            document.body.style.backgroundPosition = dataUrl ? 'center' : '';
            document.body.style.backgroundAttachment = dataUrl ? 'fixed' : '';
            try { dataUrl ? localStorage.setItem(backgroundKey, dataUrl) : localStorage.removeItem(backgroundKey); } catch (e) {}
          };
          try {
            const savedBackground = initial.background || localStorage.getItem(backgroundKey);
            if (savedBackground) applyBackground(savedBackground);
          } catch (e) {}
          const esc = (value) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          const matchHtml = (m) => {
            const match = m || { team1:null, team2:null, winner:null };
            const row = (team, slot) => {
              const win = match.winner === slot;
              const los = match.winner && match.winner !== slot;
              const cls = win ? ' win' : los ? ' los' : (!team ? ' pending' : '');
              return '<div class="team' + cls + '">' + (team ? esc(team.name) : 'À déterminer') + '</div>';
            };
            return '<div class="match">' + row(match.team1,'team1') + row(match.team2,'team2') + '</div>';
          };
          const renderColumn = (id, data, round, matches) => {
            document.getElementById(id).innerHTML = matches.map(m => matchHtml(data.bracket?.[round]?.[m])).join('');
          };
          const render = (data) => {
            renderColumn('leftR1', data, 1, [1,2,3,4]);
            renderColumn('leftR2', data, 2, [1,2]);
            renderColumn('leftR3', data, 3, [1]);
            renderColumn('final', data, 4, [1]);
            renderColumn('rightR3', data, 3, [2]);
            renderColumn('rightR2', data, 2, [3,4]);
            renderColumn('rightR1', data, 1, [5,6,7,8]);
          };
          render(initial);
          channel.onmessage = (event) => {
            if (event.data.background !== undefined) applyBackground(event.data.background);
            render(event.data);
          };
        </script>
      </body></html>`
    w.document.write(html)
    w.document.close()
    w.focus()
    displayChannelRef.current.postMessage({ bracket, champion, background })
  }

  // ─── Impression ──────────────────────────────────────────────────────────────
  const printBracket = () => {
    const S = 30, M = 61, G1 = 8, G2 = 77
    const PT2 = Math.round((M + G1) / 2), PT3 = Math.round(PT2 + (M + G2) / 2)
    const CW = 120, CN = 10, CP = CW + CN * 2
    const row = (t, w, l) => !t
      ? `<div class="slot"><span class="nm" style="color:#aaa">—</span></div>`
      : `<div class="slot${w?' win':l?' los':''}"><span class="stk">${t.sticker||''}</span><span class="nm">${t.name}${t.total!=null?` <span class="pts">${t.total}p</span>`:''}</span>${w?'<span class="ck">✓</span>':''}</div>`
    const card = (r, m, s, f=false) => {
      const mm = bracket[r]?.[m]; if(!mm) return ''
      const t1W=mm.winner==='team1',t2W=mm.winner==='team2'
      const hc = s==='left'?`<div class="ch" style="right:${-CN}px;top:${S/2}px;width:${CN}px"></div>`:s==='right'?`<div class="ch" style="left:${-CN}px;top:${S/2}px;width:${CN}px"></div>`:''
      return `<div style="position:relative"><div class="mc${f?' fn':''}">${row(mm.team1,t1W,t2W)}<div class="dv"></div>${row(mm.team2,t2W,t1W)}</div>${hc}</div>`
    }
    const pair = (r, a, b, s, g) => {
      const vH=M+g; const vc=s==='left'?`<div class="cv" style="right:${-CN}px;top:${S/2}px;height:${vH}px"></div>`:`<div class="cv" style="left:${-CN}px;top:${S/2}px;height:${vH}px"></div>`
      return `<div style="position:relative">${card(r,a,s)}<div style="height:${g}px"></div>${card(r,b,s)}${vc}</div>`
    }
    const cols = [
      `<div style="width:${CP}px;flex-shrink:0;padding:0 ${CN}px">${pair(1,1,2,'left',G1)}<div style="height:${G1}px"></div>${pair(1,3,4,'left',G1)}</div>`,
      `<div style="width:${CP}px;flex-shrink:0;padding:${PT2}px ${CN}px 0">${pair(2,1,2,'left',G2)}</div>`,
      `<div style="width:${CP}px;flex-shrink:0;padding:${PT3}px ${CN}px 0">${card(3,1,'left')}</div>`,
      `<div style="width:${CP}px;flex-shrink:0;padding:${PT3}px ${CN}px 0">${card(4,1,'none',true)}</div>`,
      `<div style="width:${CP}px;flex-shrink:0;padding:${PT3}px ${CN}px 0">${card(3,2,'right')}</div>`,
      `<div style="width:${CP}px;flex-shrink:0;padding:${PT2}px ${CN}px 0">${pair(2,3,4,'right',G2)}</div>`,
      `<div style="width:${CP}px;flex-shrink:0;padding:0 ${CN}px">${pair(1,5,6,'right',G1)}<div style="height:${G1}px"></div>${pair(1,7,8,'right',G1)}</div>`,
    ].join('')
    const html = `<!DOCTYPE html><html><head><title>${battle.name} — Bracket</title>
<style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0}
.mc{background:#fff;border:1px solid #ccc;border-radius:2px;overflow:hidden;width:${CW}px}
.mc.fn{border:2px solid goldenrod}
.slot{height:${S}px;display:flex;align-items:center;padding:0 5px;gap:3px;font-size:9px}
.slot.win{background:#e8f5e9}.slot.los{opacity:.3;text-decoration:line-through}
.nm{flex:1;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-transform:uppercase}
.pts{font-size:8px;color:#999;font-weight:400}.stk{font-size:8px;font-weight:800;color:#777;min-width:20px}
.ck{color:#2e7d32;font-weight:900}.dv{height:1px;background:#e0e0e0}
.ch{position:absolute;height:1px;background:#999}.cv{position:absolute;width:1px;background:#999}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
</head><body>
<div style="text-align:center;margin-bottom:8px"><div style="font-size:14px;font-weight:900;text-transform:uppercase">${battle.name}</div>
<div style="font-size:9px;color:#777">TOP 16 — ${new Date().toLocaleDateString('fr-FR')}</div></div>
<div style="display:flex;align-items:flex-start">${cols}</div>
${champion?`<div style="text-align:center;margin-top:10px;padding:6px;background:#fffbea;border:2px solid gold;border-radius:4px;font-weight:900;font-size:12px;text-transform:uppercase">🏆 ${champion.name}</div>`:''}
</body></html>`
    const w = window.open('', '_blank'); if (!w) { alert('Autorisez les popups'); return }
    w.document.write(html); w.document.close(); w.print()
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

      {/* ── Actions bracket ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
        {bracketLocked && (
          <button className="btn btn-ghost btn-sm" onClick={resetBracket} disabled={locking}
            style={{ color: 'var(--gold)', borderColor: 'var(--gold-dim)' }}>
            {locking ? '…' : '↻ Refaire le bracket'}
          </button>
        )}
        <label className="btn btn-ghost btn-sm" htmlFor="bracketBackgroundInput">🖼 Importer un fond</label>
        <input
          ref={backgroundInputRef}
          id="bracketBackgroundInput"
          type="file"
          accept="image/*"
          onChange={handleBackgroundImport}
          style={{ display: 'none' }}
        />
        <button className="btn btn-ghost btn-sm" onClick={openDisplayMode}>🖥 Afficher</button>
        <button className="btn btn-ghost btn-sm" onClick={printBracket}>🖨 Imprimer</button>
      </div>

      {/* ══════ BRACKET ══════ */}
      <div style={{
        position: 'relative', left: '50%', transform: 'translateX(-50%)',
        width: bracketViewportWidth, height: bracketViewportHeight,
        marginBottom: 18, overflow: 'visible',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', userSelect: 'none',
          width: bracketBaseWidth, transform: `scale(${bracketScale})`, transformOrigin: 'top left',
        }}>

        {/* ── GAUCHE R1 — 1,2,3,4 ── */}
        <div style={{ width: COL, flexShrink: 0, paddingLeft: CONN, paddingRight: CONN }}>
          {renderPair(1, 1, 2, 'left')}
          <div style={{ height: GB }} />
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
          {renderMatch(4, 1, 'none')}
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
          <div style={{ height: GB }} />
          {renderPair(1, 7, 8, 'right')}
        </div>

        </div>
      </div>

      {/* ── Modale sélection équipe ── */}
      {selecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 440 }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <div className="title-sm">Choisir une équipe</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelecting(null)}>✕</button>
            </div>
            {top16.map(t => {
              const alreadyPlaced = isTeamPlacedElsewhere(t.id)
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', padding: '8px 0',
                  borderBottom: '1px solid var(--border)', gap: 8,
                  cursor: alreadyPlaced ? 'not-allowed' : 'pointer',
                  opacity: alreadyPlaced ? 0.35 : 1,
                }}
                  onClick={() => !alreadyPlaced && placeTeam(t)}>
                  {t.sticker && <span className={t.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{t.sticker}</span>}
                  {t.isGuest && <span style={{ color: 'var(--gold)', fontSize: 15 }}>⭐</span>}
                  <span style={{ flex: 1, fontWeight: 600, textTransform: 'uppercase', color: t.isGuest ? 'var(--gold)' : 'var(--text)' }}>{t.name}</span>
                  {alreadyPlaced
                    ? <span style={{ fontSize: 10, color: 'var(--green)' }}>✓ Déjà placé</span>
                    : t.total != null && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.total} pts</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
