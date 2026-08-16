import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Créer des paires de battles (impair → trio final)
function makePairs(arr) {
  if (arr.length === 0) return []
  const p = []
  if (arr.length % 2 === 0) {
    for (let i = 0; i < arr.length; i += 2) p.push([arr[i], arr[i+1]])
  } else {
    for (let i = 0; i < arr.length - 3; i += 2) p.push([arr[i], arr[i+1]])
    if (arr.length >= 3)
      p.push([arr[arr.length-3], arr[arr.length-2], arr[arr.length-1]])
    else if (arr.length === 1)
      p.push([arr[0]])
  }
  return p
}

function sortByCypher(crews, cypher) {
  return [...crews]
    .filter(c => c.cypher === cypher)
    .sort((a, b) => (parseInt(a.sticker?.slice(1)) || 0) - (parseInt(b.sticker?.slice(1)) || 0))
}

export default function QualificationTab({ battle, judges, djs, speakers, crews }) {
  const [assignments, setAssignments] = useState({})
  const [showAssign,  setShowAssign]  = useState(false)
  const [idxA,        setIdxA]        = useState(0)
  const [idxB,        setIdxB]        = useState(0)
  const channelRef = useRef(null)

  const cA = crews.filter(c => c.cypher === 'A').length
  const cB = crews.filter(c => c.cypher === 'B').length
  const diff = Math.abs(cA - cB)
  const weaker = cA < cB ? 'A' : 'B'

  const pairsA = useMemo(() => makePairs(sortByCypher(crews, 'A')), [crews])
  const pairsB = useMemo(() => makePairs(sortByCypher(crews, 'B')), [crews])

  useEffect(() => { loadAssignments() }, [battle.id])

  useEffect(() => {
    channelRef.current = new BroadcastChannel('citc_qualif_' + battle.id)
    return () => channelRef.current?.close()
  }, [battle.id])

  const loadAssignments = async () => {
    const { data } = await supabase.from('judges').select('id, cypher').eq('battle_id', battle.id)
    if (data) {
      const map = {}
      data.forEach(j => { if (j.cypher) map[j.id] = j.cypher })
      setAssignments(map)
    }
  }

  const assignJudge = async (judgeId, val) => {
    setAssignments(prev => ({ ...prev, [judgeId]: val }))
    await supabase.from('judges').update({ cypher: val }).eq('id', judgeId)
  }

  const navigate = (side, delta) => {
    if (side === 'A') {
      const newIdx = Math.max(0, Math.min(pairsA.length, idxA + delta))
      setIdxA(newIdx)
      channelRef.current?.postMessage({ idxA: newIdx, idxB })
    } else {
      const newIdx = Math.max(0, Math.min(pairsB.length, idxB + delta))
      setIdxB(newIdx)
      channelRef.current?.postMessage({ idxA, idxB: newIdx })
    }
  }

  const exportDanseurs = () => {
    const rows = [['Blasé 01', 'Blasé 02', 'Crew']]
    crews.forEach(c => rows.push([c.member1 || '', c.member2 || '', c.name || '']))
    const csv = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${battle.name.replace(/\s+/g, '_')}_danseurs.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const printSheets = (cypher) => {
    const filtered = sortByCypher(crews, cypher)
    const battles = makePairs(filtered)
    const assignedJudges = judges.filter(j => assignments[j.id] === cypher)
    const judgeNames = assignedJudges.length > 0 ? assignedJudges.map(j => j.name).join(', ') : '—'
    const accent = cypher === 'A' ? '#555' : '#c0392b'
    const safe = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    const teamPanel = (crew) => `<div class="team-panel">
      <div class="team-id" style="color:${accent}">${safe(crew.sticker)}</div>
      <div class="team-body">
        <div class="crew-value">${safe(crew.name)}</div>
        <div class="score-stack">
          <div class="score-label">Danseur 1</div>
          <div class="score-box">&nbsp;</div>
          <div class="score-label">Danseur 2</div>
          <div class="score-box">&nbsp;</div>
        </div>
      </div>
    </div>`

    const battleCards = battles.map((battleTeams, index) => {
      const names = battleTeams.map(t => safe(t.sticker)).join(' <span class="versus">VS</span> ')
      const versusLayout = battleTeams.map((team, teamIndex) =>
        `${teamIndex > 0 ? '<div class="vs-divider">VS</div>' : ''}${teamPanel(team)}`
      ).join('')
      return `<section class="battle-card">
        <div class="battle-heading"><strong>Battle ${index + 1}</strong><span>${names}</span></div>
        <div class="battle-versus">${versusLayout}</div>
      </section>`
    }).join('')

    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups pour ouvrir la feuille des juges'); return }
    w.document.write(`<!DOCTYPE html><html lang="fr"><head>
      <meta charset="UTF-8">
      <title>${safe(battle.name)} — Feuille juges Cercle ${cypher}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:0;background:#fff}
        h1{font-size:18px;margin:0 0 3px;text-transform:uppercase;letter-spacing:.2px}
        .meta{font-size:10px;color:#555;margin:0 0 4px}
        .instruction{font-size:9px;color:#555;margin:0 0 7px;padding-bottom:5px;border-bottom:2px solid ${accent}}
        .battle-grid{display:flex;flex-direction:column;gap:5px}
        .battle-card{page-break-inside:avoid;break-inside:avoid;border:1px solid #aaa;margin:0;min-width:0}
        .battle-heading{display:flex;justify-content:space-between;align-items:center;gap:5px;background:#f1f1f1;border-bottom:1px solid #aaa;padding:3px 5px;font-size:8px;text-transform:uppercase}
        .battle-heading strong{font-size:9px;white-space:nowrap}
        .versus{font-weight:800;color:#888;margin:0 2px}
        .battle-versus{display:flex;width:100%;align-items:stretch}
        .team-panel{flex:1;min-width:0}
        .team-id{height:24px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #777;font-size:12px;font-weight:900}
        .team-body{display:grid;grid-template-columns:46% 54%;min-height:88px}
        .crew-value{display:flex;align-items:flex-start;padding:6px 5px;border-right:1px solid #777;font-size:10px;font-weight:900;text-transform:uppercase;line-height:1.1;overflow-wrap:anywhere}
        .score-stack{display:grid;grid-template-rows:16px 27px 16px 27px}
        .score-label{display:flex;align-items:center;justify-content:center;border-bottom:1px solid #777;background:#fafafa;font-size:8px;font-weight:800;text-transform:uppercase;line-height:1}
        .score-box{border-bottom:1px solid #777;min-height:27px}
        .vs-divider{flex:0 0 42px;display:flex;align-items:center;justify-content:center;border-left:1px solid #777;border-right:1px solid #777;font-size:17px;font-weight:900;color:#333}
        .empty{padding:20px;text-align:center;color:#666;border:1px dashed #aaa;font-size:10px}
        @page{size:A4 portrait;margin:8mm}
        @media print{body{padding:0}.battle-grid{display:flex;flex-direction:column;gap:4px}.battle-card{page-break-inside:avoid;break-inside:avoid}}
        @media screen{body{max-width:800px;margin:0 auto;padding:18px;background:#fafafa}.battle-grid{gap:8px}.battle-card{background:#fff}}
      </style>
    </head><body>
      <h1>${safe(battle.name)} — Cercle ${cypher}</h1>
      <p class="meta">Juges : <strong>${safe(judgeNames)}</strong> &nbsp;|&nbsp; ${new Date().toLocaleDateString('fr-FR')} &nbsp;|&nbsp; ${filtered.length} équipe(s)</p>
      <p class="instruction">Noter chaque danseur de chaque équipe séparément sur 5.</p>
      ${battleCards ? `<div class="battle-grid">${battleCards}</div>` : '<div class="empty">Aucune équipe inscrite dans le Cercle ' + cypher + '.</div>'}
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 250)
  }

  const openDisplayMode = () => {
    const sA = sortByCypher(crews, 'A')
    const sB = sortByCypher(crews, 'B')
    const origin = window.location.origin

    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>${battle.name} — Qualifications</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden}
  body{background:#000;color:#fff;font-family:'Arial Black',Arial,sans-serif;display:flex;flex-direction:column;aspect-ratio:16/9}

  /* ── Header compact pour écran 16/9 ── */
  .hdr{position:relative;display:flex;align-items:center;height:13vh;padding:1.4vh 2.5vw;flex-shrink:0}
  .hdr-a{flex:1;display:flex;justify-content:center}
  .hdr-a .lbl{display:inline-flex;align-items:center;border:clamp(2px,.2vw,4px) solid #fff;padding:1vh 2vw}
  .hdr-a .lbl span{font-size:clamp(20px,3.1vw,56px);font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:clamp(1px,.2vw,3px)}
  .hdr-logo{position:absolute;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none}
  .hdr-logo img{height:clamp(90px,16vh,230px);max-width:15vw;object-fit:contain}
  .hdr-b{flex:1;display:flex;justify-content:center}
  .hdr-b .lbl{display:inline-flex;align-items:center;background:#cc0000;padding:1vh 2vw}
  .hdr-b .lbl span{font-size:clamp(20px,3.1vw,56px);font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:clamp(1px,.2vw,3px)}

  /* ── Arena ── */
  .arena{display:flex;flex:1;min-height:0;overflow:hidden}
  .side{flex:1;min-width:0;min-height:0;padding:1.8vh 2.2vw;display:flex;flex-direction:column;overflow:hidden}
  .side-a{border-right:clamp(2px,.2vw,3px) solid #fff}

  /* ── Battle box — dimensionné pour tenir en 16/9 ── */
  .bx-a,.bx-b{display:flex;flex-direction:column;gap:.7vh;margin-bottom:1.5vh;flex-shrink:0}
  .brow{display:flex;align-items:center;justify-content:center;gap:1vw;padding:1.5vh 1.3vw;min-height:7vh;overflow:hidden}
  .brow-a{background:#fff}
  .brow-b{background:#cc0000}
  .bstk-a{font-size:clamp(11px,1.15vw,18px);font-weight:900;color:#888;flex-shrink:0;min-width:clamp(24px,2.2vw,36px)}
  .bstk-b{font-size:clamp(11px,1.15vw,18px);font-weight:900;color:rgba(255,255,255,.5);flex-shrink:0;min-width:clamp(24px,2.2vw,36px)}
  .bnm-a,.bnm-b{font-size:clamp(18px,2.45vw,44px);font-weight:900;text-transform:uppercase;letter-spacing:1px;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bnm-a{color:#000}.bnm-b{color:#fff}

  /* ── À suivre ── */
  .st{font-size:clamp(9px,.75vw,12px);font-weight:700;letter-spacing:clamp(1px,.2vw,3px);text-transform:uppercase;color:#fff;margin-bottom:.7vh;flex-shrink:0;text-align:center}
  .sl{display:flex;flex-direction:column;gap:.45vh;overflow:hidden;flex:1;min-height:0}
  .si-a,.si-b{border:clamp(1px,.12vw,2px) solid;padding:.8vh 1vw;font-size:clamp(10px,1.1vw,18px);font-weight:700;text-transform:uppercase;letter-spacing:.3px;text-align:left;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .si-a{border-color:#fff;color:#fff}.si-b{border-color:#cc0000;color:#cc0000}
  .stk-a{color:#555;font-size:.85em}.stk-b{color:#8b0000;font-size:.85em}

  .fin-a,.fin-b{font-size:clamp(18px,2.5vw,38px);font-weight:900;text-transform:uppercase;text-align:center;padding:4vh 0;flex:1}
  .fin-a{color:#1a1a1a}.fin-b{color:#4d0000}
  .ctr{font-size:clamp(9px,.7vw,11px);color:#555;letter-spacing:1px;margin-top:.8vh;flex-shrink:0;text-align:center}
</style>
</head><body>
<div class="hdr">
  <div class="hdr-a"><div class="lbl"><span>CERCLE A</span></div></div>
  <div class="hdr-logo"><img src="${origin}/CITC-Stamp-White.png" alt="CITC"></div>
  <div class="hdr-b"><div class="lbl"><span>CERCLE B</span></div></div>
</div>
<div class="arena">
  <div class="side side-a" id="sideA"></div>
  <div class="side" id="sideB"></div>
</div>
<script>
  const crewsA = ${JSON.stringify(sA)};
  const crewsB = ${JSON.stringify(sB)};

  function makePairs(arr) {
    if (!arr.length) return [];
    const p = [];
    if (arr.length % 2 === 0) {
      for (let i = 0; i < arr.length; i += 2) p.push([arr[i], arr[i+1]]);
    } else {
      for (let i = 0; i < arr.length - 3; i += 2) p.push([arr[i], arr[i+1]]);
      if (arr.length >= 3) p.push([arr[arr.length-3], arr[arr.length-2], arr[arr.length-1]]);
    }
    return p;
  }

  const pairsA = makePairs(crewsA);
  const pairsB = makePairs(crewsB);
  let iA = ${idxA}, iB = ${idxB};

  function renderSide(side, pairs, idx) {
    const el = document.getElementById('side' + side);
    const isA = side === 'A';
    if (!pairs.length) {
      el.innerHTML = '<div class="' + (isA?'fin-a':'fin-b') + '">Aucune équipe<br>Cercle ' + side + '</div>';
      return;
    }
    if (idx >= pairs.length) {
      el.innerHTML = '<div class="' + (isA?'fin-a':'fin-b') + '">✓ Fin du<br>Cercle ' + side + '</div>';
      return;
    }
    const cur = pairs[idx];
    const upcoming = pairs.slice(idx + 1, idx + 6);

    const rows = cur.map(t =>
      '<div class="brow ' + (isA?'brow-a':'brow-b') + '">' +
      '<span class="bstk-' + (isA?'a':'b') + '">' + t.sticker + '</span>' +
      '<span class="bnm-' + (isA?'a':'b') + '">' + t.name + '</span>' +
      '</div>'
    ).join('');

    let suivre = '';
    if (upcoming.length) {
      suivre = '<div class="st">À SUIVRE</div><div class="sl">' +
        upcoming.map(pair =>
          '<div class="si-' + (isA?'a':'b') + '">' +
          pair.map(t => '<span class="stk-' + (isA?'a':'b') + '">' + t.sticker + '</span> ' + t.name).join(' <span style="opacity:.5">vs</span> ') +
          '</div>'
        ).join('') + '</div>';
    }

    el.innerHTML =
      '<div class="bx-' + (isA?'a':'b') + '">' + rows + '</div>' +
      suivre +
      '<div class="ctr">' + (idx+1) + ' / ' + pairs.length + '</div>';
  }

  const ch = new BroadcastChannel('citc_qualif_${battle.id}');
  ch.onmessage = (e) => {
    iA = e.data.idxA; iB = e.data.idxB;
    renderSide('A', pairsA, iA);
    renderSide('B', pairsB, iB);
  };

  renderSide('A', pairsA, iA);
  renderSide('B', pairsB, iB);
</script>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups pour ouvrir le mode affichage'); return }
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      {/* ══════ STATS ══════ */}
      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div className="label" style={{ marginBottom: 8 }}>Cercle A</div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{cA}</div>
          <div className="muted" style={{ marginTop: 6 }}>équipes</div>
        </div>
        <div className="card" style={{ border: '1px solid #3d0000', textAlign: 'center', padding: '24px 16px' }}>
          <div className="label" style={{ marginBottom: 8 }}>Cercle B</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--red)', lineHeight: 1 }}>{cB}</div>
          <div className="muted" style={{ marginTop: 6 }}>équipes</div>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '20px 16px', marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>Total inscrit</div>
        <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{crews.length}</div>
      </div>

      {crews.length > 0 && diff > 3 && (
        <div className="alert-warn" style={{ marginBottom: 12 }}>⚠️ <strong>Déséquilibre !</strong> Différence de {diff} équipes — orientez vers le Cercle {weaker}.</div>
      )}
      {crews.length > 0 && diff <= 3 && (
        <div className="alert-ok" style={{ marginBottom: 12 }}>✓ Cercles équilibrés — différence de {diff} équipe(s).</div>
      )}

      <div className="grid3" style={{ marginBottom: 24 }}>
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 8 }}>Juges ({judges.length})</div>
          {judges.length === 0 && <div className="caption">Aucun juge</div>}
          {judges.map(j => (
            <div key={j.id} className="flex-between" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{j.name}</span>
              {assignments[j.id] && <span className={assignments[j.id] === 'A' ? 'badge-a' : 'badge-b'}>Cercle {assignments[j.id]}</span>}
            </div>
          ))}
        </div>
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 8 }}>DJs ({(djs||[]).length})</div>
          {(djs||[]).length === 0 && <div className="caption">Aucun DJ</div>}
          {(djs||[]).map(d => (
            <div key={d.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{d.name}</div>
          ))}
        </div>
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 8 }}>Speakers ({(speakers||[]).length})</div>
          {(speakers||[]).length === 0 && <div className="caption">Aucun speaker</div>}
          {(speakers||[]).map(s => (
            <div key={s.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{s.name}</div>
          ))}
        </div>
      </div>

      {/* ══════ SÉPARATEUR ══════ */}
      <div style={{ borderTop: '1px solid var(--border2)', marginBottom: 20 }} />

      {/* ══════ ACTIONS ══════ */}
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <button
          className="btn"
          style={{
            background: showAssign ? 'var(--surface2)' : judges.some(j => assignments[j.id]) ? 'var(--green-dim)' : 'var(--white)',
            color:      showAssign ? 'var(--text2)'    : judges.some(j => assignments[j.id]) ? 'var(--green)'     : '#000',
            border:     `1px solid ${showAssign ? 'var(--border2)' : judges.some(j => assignments[j.id]) ? 'var(--green-dim)' : 'transparent'}`,
            fontWeight: 700, padding: '9px 18px',
          }}
          onClick={() => setShowAssign(v => !v)}
        >
          {showAssign
            ? '← Fermer'
            : judges.some(j => assignments[j.id])
              ? `✓ Juges assignés`
              : '⚙ Assigner les juges'
          }
        </button>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={openDisplayMode}>🖥 Affichage</button>
          <button className="btn btn-ghost btn-sm" onClick={exportDanseurs}>⬇ CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => printSheets('A')}>🖨 Imprimer Cercle A</button>
          <button className="btn btn-ghost btn-sm" onClick={() => printSheets('B')}>🖨 Imprimer Cercle B</button>
        </div>
      </div>

      {/* Panel assignation juges */}
      {showAssign && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="title-sm" style={{ marginBottom: 16 }}>Assigner les juges à un cercle</div>
          {judges.length === 0 && <div className="caption">Aucun juge configuré.</div>}
          {judges.map(j => (
            <div key={j.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>{j.name}</span>
              <div className="flex" style={{ gap: 6 }}>
                {['A', 'B'].map(v => (
                  <button key={v} className="btn btn-sm" style={{
                    background: assignments[j.id] === v ? (v === 'A' ? 'var(--surface)' : 'var(--red-dim)') : 'transparent',
                    color: assignments[j.id] === v ? (v === 'A' ? 'var(--text)' : 'var(--red)') : 'var(--text3)',
                    border: `1px solid ${assignments[j.id] === v ? (v === 'A' ? 'var(--border)' : 'var(--red-dim)') : 'var(--border2)'}`,
                  }} onClick={() => assignJudge(j.id, v)}>Cercle {v}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════ GESTION BATTLES ══════ */}
      <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 20 }}>
        <div className="grid2" style={{ gap: 12 }}>
          {[{ side: 'A', pairs: pairsA, idx: idxA }, { side: 'B', pairs: pairsB, idx: idxB }].map(({ side, pairs, idx }) => {
            const isB    = side === 'B'
            const cur    = pairs[idx]
            const isTrio = cur?.length === 3
            const upcoming = pairs.slice(idx + 1, idx + 6)

            return (
              <div key={side} className="card" style={{ border: isB ? '1px solid #3d0000' : '1px solid var(--border2)' }}>
                <div className="flex-between" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: isB ? 'var(--red)' : 'var(--text2)' }}>
                    Cercle {side}{isTrio ? ' — BATTLE À 3' : ''}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {pairs.length === 0 ? '—' : idx >= pairs.length ? 'Terminé' : `${idx + 1} / ${pairs.length}`}
                  </div>
                </div>

                {pairs.length === 0 ? (
                  <div className="caption" style={{ textAlign: 'center', padding: '20px 0' }}>Aucune équipe</div>
                ) : idx >= pairs.length ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: isB ? 'var(--red)' : 'var(--text2)', fontWeight: 700, fontSize: 14 }}>
                    ✓ Fin du Cercle {side}
                  </div>
                ) : (
                  <>
                    <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
                      {cur.map((t, i) => (
                        <div key={t.id}>
                          {i > 0 && <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, letterSpacing: 3, margin: '8px 0' }}>VS</div>}
                          <div style={{ fontSize: 11, fontWeight: 800, color: isB ? 'var(--red)' : 'var(--text2)', letterSpacing: 2, marginBottom: 2 }}>{t.sticker}</div>
                          <div style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', color: isB ? 'var(--red)' : 'var(--text)' }}>{t.name}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex-center" style={{ gap: 8, marginBottom: 14 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={idx <= 0}
                        onClick={() => navigate(side, -1)}
                        style={{ opacity: idx <= 0 ? 0.3 : 1 }}
                      >← Précédent</button>
                      <button
                        className="btn btn-sm"
                        disabled={idx >= pairs.length}
                        onClick={() => navigate(side, 1)}
                        style={{
                          opacity: idx >= pairs.length ? 0.3 : 1,
                          background: isB ? 'var(--red-dim)' : 'var(--surface)',
                          color: isB ? 'var(--red)' : 'var(--text)',
                          border: `1px solid ${isB ? 'var(--red-dim)' : 'var(--border)'}`,
                        }}
                      >Suivant →</button>
                    </div>

                    {upcoming.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 10 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text3)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>À suivre</div>
                        {upcoming.map((pair, i) => (
                          <div key={i} style={{ fontSize: 11, fontWeight: 600, padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text3)', textTransform: 'uppercase' }}>
                            {pair.map(t => `${t.sticker} ${t.name}`).join(' vs ')}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
