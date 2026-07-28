import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function QualificationTab({ battle, judges, crews }) {
  const [cypher,      setCypher]      = useState('A')
  const [assignments, setAssignments] = useState({})
  const [view,        setView]        = useState('list')

  const filtered = crews.filter(c => c.cypher === cypher)

  useEffect(() => { loadAssignments() }, [battle.id])

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

  const assignedJudges = judges.filter(j => assignments[j.id] === cypher)

  // ── Export CSV Danseurs — 1 ligne par crew : Blasé 01 | Blasé 02 | Crew | Email
  const exportDanseurs = () => {
    const rows = [['Blasé 01', 'Blasé 02', 'Crew', 'Email']]
    crews.forEach(c => {
      rows.push([
        c.member1 || '',
        c.member2 || '',
        c.name    || '',
        c.email   || '',
      ])
    })
    const csv = '\uFEFF' + rows.map(r =>
      r.map(cell => `"${String(cell).replace(/"/g, '""')}"`)
       .join(';')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${battle.name.replace(/\s+/g, '_')}_danseurs.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Impression feuille juges
  const print = () => {
    const rows = filtered.map(c => `
      <tr>
        <td style="font-weight:800;color:${cypher === 'A' ? '#c0392b' : '#555'};width:60px">${c.sticker}</td>
        <td style="font-weight:600;text-transform:uppercase">${c.name}</td>
        <td style="color:#666;text-transform:lowercase">${c.member1} &amp; ${c.member2}</td>
        <td style="text-align:center;border:2px solid #ddd;font-size:20px;font-weight:800;min-width:60px">&nbsp;</td>
        <td style="border:1px solid #ddd;min-width:200px">&nbsp;</td>
      </tr>`).join('')
    const judgeNames = assignedJudges.length > 0 ? assignedJudges.map(j => j.name).join(', ') : '—'
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups pour imprimer'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Feuille — Cypher ${cypher}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#000}h2{margin-bottom:4px;font-size:20px}p{color:#666;margin-bottom:20px;font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left}td{padding:12px 10px;border-bottom:1px solid #eee;vertical-align:middle}@media print{body{padding:12px}}</style>
    </head><body>
      <h2>${battle.name} — Cypher ${cypher}</h2>
      <p>Juges : <strong>${judgeNames}</strong> &nbsp;|&nbsp; ${new Date().toLocaleDateString('fr-FR')} &nbsp;|&nbsp; ${filtered.length} équipe(s)</p>
      <table><thead><tr><th>Sticker</th><th>Crew</th><th>Membres</th><th style="text-align:center">Score (0–5)</th><th>Commentaire</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-sm" style={{ background: cypher === 'A' ? 'var(--red-dim)' : 'var(--surface2)', color: cypher === 'A' ? 'var(--red)' : 'var(--text2)', border: `1px solid ${cypher === 'A' ? 'var(--red-dim)' : 'var(--border2)'}` }} onClick={() => setCypher('A')}>Cypher A</button>
          <button className="btn btn-sm" style={{ background: cypher === 'B' ? 'var(--surface)' : 'var(--surface2)', color: cypher === 'B' ? 'var(--text)' : 'var(--text2)', border: `1px solid ${cypher === 'B' ? 'var(--border)' : 'var(--border2)'}` }} onClick={() => setCypher('B')}>Cypher B</button>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setView(v => v === 'assign' ? 'list' : 'assign')}>
            {view === 'assign' ? '← Liste' : '⚙ Assigner juges'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportDanseurs}>
            ⬇ Danseurs.csv
          </button>
          <button className="btn btn-ghost btn-sm" onClick={print}>
            🖨 Imprimer feuille
          </button>
        </div>
      </div>

      {view === 'list' && assignedJudges.length > 0 && (
        <div className="alert-info" style={{ marginBottom: 16 }}>
          Juges assignés au Cypher {cypher} : <strong>{assignedJudges.map(j => j.name).join(', ')}</strong>
        </div>
      )}

      {view === 'assign' && (
        <div className="card">
          <div className="title-sm" style={{ marginBottom: 16 }}>Assigner les juges à un cypher</div>
          {judges.length === 0 && <div className="caption">Aucun juge configuré.</div>}
          {judges.map(j => (
            <div key={j.id} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600 }}>{j.name}</span>
              <div className="flex" style={{ gap: 6 }}>
                {['A', 'B'].map(v => (
                  <button key={v} className="btn btn-sm" style={{
                    background: assignments[j.id] === v ? (v === 'A' ? 'var(--red-dim)' : 'var(--surface2)') : 'transparent',
                    color: assignments[j.id] === v ? (v === 'A' ? 'var(--red)' : 'var(--text)') : 'var(--text3)',
                    border: `1px solid ${assignments[j.id] === v ? (v === 'A' ? 'var(--red-dim)' : 'var(--border2)') : 'var(--border2)'}`,
                  }} onClick={() => assignJudge(j.id, v)}>
                    Cypher {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <div><span className="muted">Cypher </span><strong style={{ color: cypher === 'A' ? 'var(--red)' : 'var(--text)' }}>{cypher}</strong></div>
            <span className="muted">{filtered.length} équipe(s)</span>
          </div>
          {filtered.length === 0 ? <div className="caption">Aucune équipe dans ce cypher.</div> : (
            <table className="tbl">
              <thead><tr><th>Sticker</th><th>Crew</th><th>Membres</th><th>Email</th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td><span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{c.sticker}</span></td>
                    <td style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.name}</td>
                    <td className="muted" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</td>
                    <td className="muted">{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
