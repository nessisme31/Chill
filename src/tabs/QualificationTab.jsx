import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { crewDisplay } from '../lib/countries'

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

  // Paires de battles
  const pairsA = useMemo(() => makePairs(sortByCypher(crews, 'A')), [crews])
  const pairsB = useMemo(() => makePairs(sortByCypher(crews, 'B')), [crews])

  useEffect(() => { loadAssignments() }, [battle.id])

  // BroadcastChannel pour synchroniser avec la page projetée
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

  // Navigation battles (sync avec page projetée)
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

  // ── Export CSV
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

  // ── Impression feuille juges (les deux cyphers, page-break entre)
  const printSheets = () => {
    const sheet = (cypher) => {
      const filtered = crews.filter(c => c.cypher === cypher)
      const assignedJudges = judges.filter(j => assignments[j.id] === cypher)
      const judgeNames = assignedJudges.length > 0 ? assignedJudges.map(j => j.name).join(', ') : '—'
      const rows = filtered.map(c => `<tr>
        <td style="font-weight:800;color:${cypher === 'A' ? '#555' : '#c0392b'};width:60px">${c.sticker}</td>
        <td style="font-weight:600;text-transform:uppercase">${crewDisplay(c)}</td>
        <td style="color:#666;text-transform:lowercase">${c.member1} &amp; ${c.member2}</td>
        <td style="text-align:center;border:2px solid #ddd;font-size:20px;font-weight:800;min-width:60px">&nbsp;</td>
        <td style="border:1px solid #ddd;min-width:200px">&nbsp;</td>
      </tr>`).join('')
      return `<div>
        <h2>${battle.name} — Cypher ${cypher}</h2>
        <p>Juges : <strong>${judgeNames}</strong> &nbsp;|&nbsp; ${new Date().toLocaleDateString('fr-FR')} &nbsp;|&nbsp; ${filtered.length} équipe(s)</p>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;text-align:left">Sticker</th>
            <th style="background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;text-align:left">Crew</th>
            <th style="background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;text-align:left">Membres</th>
            <th style="background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;text-align:center">Score</th>
            <th style="background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;text-align:left">Commentaire</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    }
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Feuilles juges</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}h2{margin-bottom:4px}p{color:#666;font-size:13px;margin-bottom:16px}td{padding:10px 8px;border-bottom:1px solid #eee}@media print{.break{page-break-before:always}}</style>
    </head><body>${sheet('A')}<div class="break"></div>${sheet('B')}</body></html>`)
    w.document.close(); w.print()
  }

  // ── Mode affichage (nouvel onglet, BroadcastChannel, À suivre)
  const openDisplayMode = () => {
    const sA = sortByCypher(crews, 'A')
    const sB = sortByCypher(crews, 'B')

    const html = `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8">
<title>${battle.name} — Qualifications</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#000;color:#fff;font-family:'Arial Black',Arial,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  header{text-align:center;padding:12px 24px;border-bottom:2px solid #111;flex-shrink:0}
  header h1{font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:3px}
  header .sub{font-size:10px;color:#333;letter-spacing:2px;margin-top:2px}
  .arena{display:flex;flex:1;overflow:hidden}
  .side{flex:1;display:flex;flex-direction:column;align-items:center;padding:24px 20px;overflow:hidden}
  .side.A{border-right:2px solid #111}
  .cypher-label{font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;padding:3px 12px;border-radius:20px;margin-bottom:20px;flex-shrink:0}
  .side.A .cypher-label{color:#666;border:1px solid #1a1a1a}
  .side.B .cypher-label{color:#ff3333;border:1px solid #3d0000}
  .battle{text-align:center;flex-shrink:0;width:100%}
  .team{margin:4px 0}
  .sticker{font-size:13px;font-weight:900;letter-spacing:2px;margin-bottom:1px}
  .side.A .sticker{color:#444}
  .side.B .sticker{color:#6b0000}
  .cname{font-size:clamp(26px,3.5vw,58px);font-weight:900;text-transform:uppercase;line-height:1.05;letter-spacing:1px}
  .side.A .cname{color:#fff}
  .side.B .cname{color:#ff3333}
  .vs{font-size:clamp(12px,1.5vw,22px);color:#222;font-weight:900;margin:10px 0;letter-spacing:4px}
  .sep{width:80%;height:1px;background:#111;margin:16px auto;flex-shrink:0}
  .suivre-block{width:100%;flex:1;overflow:hidden}
  .suivre-title{font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#2a2a2a;margin-bottom:8px;text-align:center}
  .suivre-item{font-size:clamp(11px,1.3vw,16px);font-weight:700;text-transform:uppercase;padding:5px 8px;color:#2a2a2a;text-align:center;letter-spacing:1px}
  .side.B .suivre-item{color:#3d0000}
  .counter{font-size:10px;color:#1a1a1a;margin-top:8px;flex-shrink:0;letter-spacing:1px}
  .end-msg{font-size:clamp(18px,2.5vw,36px);color:#1a1a1a;font-weight:900;text-transform:uppercase;text-align:center;letter-spacing:2px;margin-top:40px}
</style>
</head><body>
<header>
  <h1>${battle.name}</h1>
  <div class="sub">QUALIFICATIONS EN COURS</div>
</header>
<div class="arena">
  <div class="side A" id="sideA"></div>
  <div class="side B" id="sideB"></div>
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
    const isB = side === 'B';
    if (!pairs.length) { el.innerHTML = '<div class="end-msg">Aucune équipe<br>Cypher ' + side + '</div>'; return; }
    if (idx >= pairs.length) { el.innerHTML = '<div class="end-msg">✓ Fin du<br>Cypher ' + side + '</div>'; return; }
    const cur = pairs[idx];
    const isTrio = cur.length === 3;
    let battleHTML = '';
    cur.forEach((t, i) => {
      if (i > 0) battleHTML += '<div class="vs">VS</div>';
      battleHTML += '<div class="team"><div class="sticker">' + t.sticker + '</div><div class="cname">' + t.name + '</div></div>';
    });
    const upcoming = pairs.slice(idx + 1, idx + 6);
    let upHTML = '';
    if (upcoming.length) {
      upHTML = '<div class="suivre-title">À SUIVRE</div>';
      upcoming.forEach(pair => {
        upHTML += '<div class="suivre-item">' + pair.map(t => t.sticker + ' ' + t.name).join(' vs ') + '</div>';
      });
    }
    el.innerHTML =
      '<div class="cypher-label">CYPHER ' + side + (isTrio ? ' — BATTLE À 3' : '') + '</div>' +
      '<div class="battle">' + battleHTML + '</div>' +
      '<div class="sep"></div>' +
      '<div class="suivre-block">' + upHTML + '</div>' +
      '<div class="counter">' + (idx + 1) + ' / ' + pairs.length + '</div>';
  }

  // Écouter les mises à jour depuis la page principale
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

  // ──────────────────────────────────────────────────
  return (
    <div>
      {/* ══════ STATS ══════ */}
      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div className="label" style={{ marginBottom: 8 }}>Cypher A</div>
          <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1 }}>{cA}</div>
          <div className="muted" style={{ marginTop: 6 }}>équipes</div>
        </div>
        <div className="card" style={{ border: '1px solid #3d0000', textAlign: 'center', padding: '24px 16px' }}>
          <div className="label" style={{ marginBottom: 8 }}>Cypher B</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--red)', lineHeight: 1 }}>{cB}</div>
          <div className="muted" style={{ marginTop: 6 }}>équipes</div>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '20px 16px', marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>Total inscrit</div>
        <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }}>{crews.length}</div>
      </div>

      {crews.length > 0 && diff > 3 && (
        <div className="alert-warn" style={{ marginBottom: 12 }}>⚠️ <strong>Déséquilibre !</strong> Différence de {diff} équipes — orientez vers le Cypher {weaker}.</div>
      )}
      {crews.length > 0 && diff <= 3 && (
        <div className="alert-ok" style={{ marginBottom: 12 }}>✓ Cyphers équilibrés — différence de {diff} équipe(s).</div>
      )}

      <div className="grid3" style={{ marginBottom: 24 }}>
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 8 }}>Juges ({judges.length})</div>
          {judges.length === 0 && <div className="caption">Aucun juge</div>}
          {judges.map(j => (
            <div key={j.id} className="flex-between" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{j.name}</span>
              {assignments[j.id] && <span className={assignments[j.id] === 'A' ? 'badge-a' : 'badge-b'}>Cypher {assignments[j.id]}</span>}
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
          <button className="btn btn-ghost btn-sm" onClick={printSheets}>🖨 Imprimer</button>
        </div>
      </div>

      {/* Panel assignation juges */}
      {showAssign && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="title-sm" style={{ marginBottom: 16 }}>Assigner les juges à un cypher</div>
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
                  }} onClick={() => assignJudge(j.id, v)}>Cypher {v}</button>
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
                {/* Header */}
                <div className="flex-between" style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: isB ? 'var(--red)' : 'var(--text2)' }}>
                    Cypher {side}{isTrio ? ' — BATTLE À 3' : ''}
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {pairs.length === 0 ? '—' : idx >= pairs.length ? 'Terminé' : `${idx + 1} / ${pairs.length}`}
                  </div>
                </div>

                {/* Battle courant */}
                {pairs.length === 0 ? (
                  <div className="caption" style={{ textAlign: 'center', padding: '20px 0' }}>Aucune équipe</div>
                ) : idx >= pairs.length ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: isB ? 'var(--red)' : 'var(--text2)', fontWeight: 700, fontSize: 14 }}>
                    ✓ Fin du Cypher {side}
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

                    {/* Boutons navigation */}
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

                    {/* À suivre */}
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
