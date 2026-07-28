import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function QualificationTab({ battle, judges, crews }) {
  const [cypher,    setCypher]    = useState('A')
  const [judgeIdx,  setJudgeIdx]  = useState(0)
  const [scores,    setScores]    = useState({})
  const [assignments, setAssignments] = useState({})
  const [view,      setView]      = useState('scores')
  const [saving,    setSaving]    = useState(false)

  const filtered = crews.filter(c => c.cypher === cypher)
  const judgesForCypher = judges.filter(j => !assignments[j.id] || assignments[j.id] === cypher || assignments[j.id] === 'both')
  const currentJudge = judgesForCypher[judgeIdx] || judges[0]

  useEffect(() => { loadData() }, [battle.id])

  const loadData = async () => {
    const { data: jData } = await supabase.from('judges').select('id, cypher').eq('battle_id', battle.id)
    if (jData) {
      const map = {}
      jData.forEach(j => { if (j.cypher) map[j.id] = j.cypher })
      setAssignments(map)
    }
    const { data: sData } = await supabase.from('qual_scores').select('*').eq('battle_id', battle.id)
    if (sData) {
      const map = {}
      sData.forEach(s => {
        if (!map[s.crew_id]) map[s.crew_id] = {}
        map[s.crew_id][s.judge_id] = s.score
      })
      setScores(map)
    }
  }

  const assignJudge = async (judgeId, val) => {
    setAssignments(prev => ({ ...prev, [judgeId]: val }))
    await supabase.from('judges').update({ cypher: val }).eq('id', judgeId)
  }

  const updateScore = async (crewId, judgeId, val) => {
    const num = val === '' ? null : Math.min(5, Math.max(0, parseFloat(val) || 0))
    setScores(prev => ({ ...prev, [crewId]: { ...(prev[crewId] || {}), [judgeId]: num } }))
    setSaving(true)
    const existing = scores[crewId]?.[judgeId]
    if (existing !== undefined) {
      await supabase.from('qual_scores')
        .update({ score: num })
        .eq('battle_id', battle.id).eq('crew_id', crewId).eq('judge_id', judgeId)
    } else {
      await supabase.from('qual_scores')
        .upsert({ battle_id: battle.id, crew_id: crewId, judge_id: judgeId, score: num })
    }
    setSaving(false)
  }

  const print = () => {
    const assignedJudges = judges.filter(j => assignments[j.id] === cypher || assignments[j.id] === 'both')
    const rows = filtered.map(c => {
      const sc = scores[c.id]?.[currentJudge?.id]
      return `<tr>
        <td style="font-weight:800;color:${cypher === 'A' ? '#c0392b' : '#555'}">${c.sticker}</td>
        <td style="font-weight:600">${c.name}</td>
        <td style="color:#666">${c.member1} & ${c.member2}</td>
        <td style="text-align:center;border:2px solid #ddd;font-size:20px;font-weight:800;min-width:60px">${sc != null ? sc : ''}</td>
        <td style="border:1px solid #ddd;min-width:180px">&nbsp;</td>
      </tr>`
    }).join('')
    const judgeNames = assignedJudges.length > 0
      ? assignedJudges.map(j => j.name).join(', ')
      : (currentJudge?.name || '—')
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Feuille notation</title>
      <style>body{font-family:Arial;padding:24px;color:#000}
      h2{margin-bottom:4px}p{color:#666;margin-bottom:20px;font-size:13px}
      table{width:100%;border-collapse:collapse}
      th{background:#f5f5f5;padding:10px;border:1px solid #ddd;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
      td{padding:11px 10px;border:1px solid #eee}</style></head>
      <body>
      <h2>${battle.name} — Cypher ${cypher}</h2>
      <p>Juges assignés : <strong>${judgeNames}</strong> &nbsp;|&nbsp; ${new Date().toLocaleDateString('fr-FR')}</p>
      <table><thead><tr><th>Sticker</th><th>Crew</th><th>Membres</th><th>Score (0–5)</th><th>Commentaire</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div className="flex" style={{ gap: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Cypher</div>
            <div className="flex" style={{ gap: 6 }}>
              <button className="btn btn-sm" style={{ background: cypher === 'A' ? 'var(--red-dim)' : 'var(--surface2)', color: cypher === 'A' ? 'var(--red)' : 'var(--text2)', border: `1px solid ${cypher === 'A' ? 'var(--red-dim)' : 'var(--border2)'}` }} onClick={() => { setCypher('A'); setJudgeIdx(0) }}>Cypher A</button>
              <button className="btn btn-sm" style={{ background: cypher === 'B' ? 'var(--surface)' : 'var(--surface2)', color: cypher === 'B' ? 'var(--text)' : 'var(--text2)', border: `1px solid ${cypher === 'B' ? 'var(--border2)' : 'var(--border)'}` }} onClick={() => { setCypher('B'); setJudgeIdx(0) }}>Cypher B</button>
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Juge</div>
            <select
              className="input input-sm"
              style={{ width: 'auto', minWidth: 130 }}
              value={judgeIdx}
              onChange={e => setJudgeIdx(Number(e.target.value))}
            >
              {judgesForCypher.map((j, i) => <option key={j.id} value={i}>{j.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex" style={{ gap: 8, alignItems: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setView(v => v === 'assign' ? 'scores' : 'assign')}>
            {view === 'assign' ? '← Notation' : '⚙ Assigner juges'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={print}>🖨 Imprimer</button>
        </div>
      </div>

      {view === 'assign' && (
        <div className="card">
          <div className="title-sm" style={{ marginBottom: 16 }}>Assigner les juges à un cypher</div>
          {judges.map(j => (
            <div key={j.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>{j.name}</span>
              <div className="flex" style={{ gap: 6 }}>
                {['A', 'B', 'both'].map(v => (
                  <button
                    key={v}
                    className="btn btn-sm"
                    style={{
                      background: assignments[j.id] === v ? (v === 'A' ? 'var(--red-dim)' : v === 'B' ? 'var(--surface2)' : '#1a2a1a') : 'transparent',
                      color: assignments[j.id] === v ? (v === 'A' ? 'var(--red)' : v === 'B' ? 'var(--text)' : 'var(--green)') : 'var(--text3)',
                      border: '1px solid var(--border2)',
                    }}
                    onClick={() => assignJudge(j.id, v)}
                  >
                    {v === 'both' ? 'A & B' : `Cypher ${v}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'scores' && (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <div>
              <span className="muted">Cypher </span>
              <strong style={{ color: cypher === 'A' ? 'var(--red)' : 'var(--text)' }}>{cypher}</strong>
              <span className="muted"> — Juge : </span>
              <strong>{currentJudge?.name || '—'}</strong>
            </div>
            {saving && <span className="caption">Enregistrement…</span>}
          </div>
          {filtered.length === 0
            ? <div className="caption">Aucune équipe dans ce cypher.</div>
            : <table className="tbl">
                <thead>
                  <tr>
                    <th>Sticker</th>
                    <th>Crew</th>
                    <th>Membres</th>
                    <th style={{ textAlign: 'center' }}>Score (0–5)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id}>
                      <td><span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{c.sticker}</span></td>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td className="muted">{c.member1} &amp; {c.member2}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0" max="5" step="0.5"
                          className="input-score"
                          value={scores[c.id]?.[currentJudge?.id] ?? ''}
                          onChange={e => currentJudge && updateScore(c.id, currentJudge.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}
    </div>
  )
}
