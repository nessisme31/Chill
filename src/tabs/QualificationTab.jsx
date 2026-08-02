import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { crewDisplay } from '../lib/countries'

export default function QualificationTab({ battle, judges, djs, speakers, crews, setCrews }) {
  const [cypher,      setCypher]      = useState('A')
  const [assignments, setAssignments] = useState({})
  const [view,        setView]        = useState('list')
  const [editing,     setEditing]     = useState(null)
  const [editForm,    setEditForm]    = useState({})
  const [confirmDel,  setConfirmDel]  = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  const filtered = crews.filter(c => c.cypher === cypher)
  const cA = crews.filter(c => c.cypher === 'A').length
  const cB = crews.filter(c => c.cypher === 'B').length
  const diff = Math.abs(cA - cB)
  const weaker = cA < cB ? 'A' : 'B'

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
  const isAssigned = assignedJudges.length > 0

  // ── Édition
  const openEdit = (crew) => {
    setEditing(crew)
    setEditForm({ name: crew.name, member1: crew.member1, member2: crew.member2 })
  }

  const saveEdit = async () => {
    if (!editForm.name.trim() || !editForm.member1.trim() || !editForm.member2.trim()) {
      alert('Nom du crew et membres obligatoires'); return
    }
    setSaving(true)
    const updates = { name: editForm.name.trim(), member1: editForm.member1.trim(), member2: editForm.member2.trim() }
    await supabase.from('crews').update(updates).eq('id', editing.id)
    setCrews(prev => prev.map(c => c.id === editing.id ? { ...c, ...updates } : c))
    setEditing(null); setSaving(false)
  }

  // ── Suppression
  const deleteCrew = async () => {
    if (!confirmDel) return
    setDeleting(true)
    await supabase.from('crews').delete().eq('id', confirmDel.id)
    setCrews(prev => prev.filter(c => c.id !== confirmDel.id))
    setConfirmDel(null); setDeleting(false)
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

  // ── Impression feuille juges
  const print = () => {
    const rows = filtered.map(c => `<tr>
      <td style="font-weight:800;color:${cypher === 'A' ? '#555' : '#c0392b'};width:60px">${c.sticker}</td>
      <td style="font-weight:600;text-transform:uppercase">${crewDisplay(c)}</td>
      <td style="color:#666;text-transform:lowercase">${c.member1} &amp; ${c.member2}</td>
      <td style="text-align:center;border:2px solid #ddd;font-size:20px;font-weight:800;min-width:60px">&nbsp;</td>
      <td style="border:1px solid #ddd;min-width:200px">&nbsp;</td>
    </tr>`).join('')
    const judgeNames = assignedJudges.length > 0 ? assignedJudges.map(j => j.name).join(', ') : '—'
    const w = window.open('', '_blank')
    if (!w) { alert('Autorisez les popups pour imprimer'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>Feuille — Cypher ${cypher}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#000}h2{margin-bottom:4px}p{color:#666;margin-bottom:20px;font-size:13px}table{width:100%;border-collapse:collapse}th{background:#f5f5f5;padding:10px 12px;border:1px solid #ddd;font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left}td{padding:12px 10px;border-bottom:1px solid #eee;vertical-align:middle}@media print{body{padding:12px}}</style>
    </head><body>
      <h2>${battle.name} — Cypher ${cypher}</h2>
      <p>Juges : <strong>${judgeNames}</strong> &nbsp;|&nbsp; ${new Date().toLocaleDateString('fr-FR')} &nbsp;|&nbsp; ${filtered.length} équipe(s)</p>
      <table><thead><tr><th>Sticker</th><th>Crew</th><th>Membres</th><th style="text-align:center">Score (0–5)</th><th>Commentaire</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`)
    w.document.close(); w.print()
  }

  return (
    <div>
      {/* ── Modales ── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: '28px' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <div className="title-sm">Modifier l'inscription</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div className="label">Sticker</div>
              <div style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)', fontSize: 13 }}>
                {editing.sticker} — Cypher {editing.cypher} <span style={{ fontSize: 11 }}>(non modifiable)</span>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Nom du crew</div>
              <input className="input" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Membre 1</div>
              <input className="input" value={editForm.member1} onChange={e => setEditForm(p => ({ ...p, member1: e.target.value }))} placeholder="prénom nom" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Membre 2</div>
              <input className="input" value={editForm.member2} onChange={e => setEditForm(p => ({ ...p, member2: e.target.value }))} placeholder="prénom nom" />
            </div>
            <div className="flex-center" style={{ gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn btn-white" onClick={saveEdit} disabled={saving}>{saving ? '…' : '💾 Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center', padding: '36px 28px' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
            <div className="title-sm" style={{ marginBottom: 8 }}>Supprimer cette équipe ?</div>
            <div style={{ fontWeight: 700, fontSize: 15, textTransform: 'uppercase', marginBottom: 4 }}>{confirmDel.sticker} — {crewDisplay(confirmDel)}</div>
            <div className="muted" style={{ marginBottom: 8, textTransform: 'lowercase' }}>{confirmDel.member1} &amp; {confirmDel.member2}</div>
            <div className="alert-warn" style={{ marginBottom: 20, textAlign: 'left' }}>Action irréversible. Les scores associés seront aussi supprimés.</div>
            <div className="flex-center" style={{ gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Annuler</button>
              <button className="btn btn-red" style={{ padding: '8px 20px' }} onClick={deleteCrew} disabled={deleting}>
                {deleting ? '…' : 'Oui, supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          SECTION STATS — en haut
      ══════════════════════════════════════ */}
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
        <div className="alert-warn" style={{ marginBottom: 12 }}>⚠️ <strong>Déséquilibre !</strong> Différence de {diff} équipes — orientez les inscriptions vers le Cypher {weaker}.</div>
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
          <div className="label" style={{ marginBottom: 8 }}>DJs ({(djs || []).length})</div>
          {(djs || []).length === 0 && <div className="caption">Aucun DJ</div>}
          {(djs || []).map(d => (
            <div key={d.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{d.name}</div>
          ))}
        </div>
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 8 }}>Speakers ({(speakers || []).length})</div>
          {(speakers || []).length === 0 && <div className="caption">Aucun speaker</div>}
          {(speakers || []).map(s => (
            <div key={s.id} style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>{s.name}</div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          SÉPARATEUR
      ══════════════════════════════════════ */}
      <div style={{ borderTop: '1px solid var(--border2)', marginBottom: 20 }} />

      {/* ══════════════════════════════════════
          SECTION QUALIFICATION — en bas
          Ordre : Assigner → Panel → Cypher A/B → Table
      ══════════════════════════════════════ */}

      {/* Ligne export + bouton Assigner */}
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <button
          className="btn"
          style={{
            background: view === 'assign' ? 'var(--surface2)' : isAssigned ? 'var(--green-dim)' : 'var(--white)',
            color:      view === 'assign' ? 'var(--text2)'    : isAssigned ? 'var(--green)'     : '#000',
            border:     `1px solid ${view === 'assign' ? 'var(--border2)' : isAssigned ? 'var(--green-dim)' : 'transparent'}`,
            fontWeight: 700,
            padding: '9px 18px',
          }}
          onClick={() => setView(v => v === 'assign' ? 'list' : 'assign')}
        >
          {view === 'assign'
            ? '← Retour liste'
            : isAssigned
              ? `✓ Juges assignés (${assignedJudges.length})`
              : '⚙ Assigner les juges'
          }
        </button>

        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportDanseurs}>⬇ Danseurs.csv</button>
          <button className="btn btn-ghost btn-sm" onClick={print}>🖨 Imprimer feuille</button>
        </div>
      </div>

      {/* Panel d'assignation — s'ouvre ici, au-dessus des boutons cypher */}
      {view === 'assign' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="title-sm" style={{ marginBottom: 16 }}>
            Assigner les juges à un cypher
          </div>
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

      {/* Sélecteur Cypher A / B — juste au-dessus du tableau */}
      <div className="flex" style={{ gap: 8, marginBottom: 12 }}>
        <button
          className="btn btn-sm"
          style={{
            background: cypher === 'A' ? 'var(--surface)' : 'var(--surface2)',
            color: cypher === 'A' ? 'var(--text)' : 'var(--text2)',
            border: `1px solid ${cypher === 'A' ? 'var(--border)' : 'var(--border2)'}`,
          }}
          onClick={() => setCypher('A')}
        >
          Cypher A
        </button>
        <button
          className="btn btn-sm"
          style={{
            background: cypher === 'B' ? 'var(--red-dim)' : 'var(--surface2)',
            color: cypher === 'B' ? 'var(--red)' : 'var(--text2)',
            border: `1px solid ${cypher === 'B' ? 'var(--red-dim)' : 'var(--border2)'}`,
          }}
          onClick={() => setCypher('B')}
        >
          Cypher B
        </button>
      </div>

      {/* Tableau équipes */}
      {view === 'list' && (
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <div>
              <span className="muted">Cypher </span>
              <strong style={{ color: cypher === 'A' ? 'var(--text)' : 'var(--red)' }}>{cypher}</strong>
              {isAssigned && (
                <span className="muted"> — Juges : <strong>{assignedJudges.map(j => j.name).join(', ')}</strong></span>
              )}
            </div>
            <span className="muted">{filtered.length} équipe(s)</span>
          </div>
          {filtered.length === 0 ? <div className="caption">Aucune équipe dans ce cypher.</div> : (
            <table className="tbl">
              <thead><tr><th>Sticker</th><th>Crew</th><th>Membres</th><th></th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td><span className={c.cypher === 'A' ? 'sticker-a' : 'sticker-b'}>{c.sticker}</span></td>
                    <td style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{crewDisplay(c)}</td>
                    <td className="muted" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" style={{ marginRight: 4 }} onClick={() => openEdit(c)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red-dim)' }} onClick={() => setConfirmDel(c)}>🗑</button>
                    </td>
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
