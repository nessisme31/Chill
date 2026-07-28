import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const defaultJudges = () => Array(5).fill('').map((_, i) => ({ id: null, name: '', pos: i }))
const defaultDjs    = () => Array(2).fill('').map((_, i) => ({ id: null, name: '', pos: i }))

export default function ConfigPage({ battle, onSave, onCancel }) {
  const isEditing = !!battle

  const [name,   setName]   = useState(battle?.name   || 'Chill in the City')
  const [date,   setDate]   = useState(battle?.date   || '')
  const [venue,  setVenue]  = useState(battle?.venue  || '')
  const [judges, setJudges] = useState(defaultJudges())
  const [djs,    setDjs]    = useState(defaultDjs())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isEditing) loadExistingData()
  }, [])

  const loadExistingData = async () => {
    const [{ data: jData }, { data: dData }] = await Promise.all([
      supabase.from('judges').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('djs').select('*').eq('battle_id', battle.id).order('position'),
    ])
    if (jData?.length) setJudges(jData.map((j, i) => ({ id: j.id, name: j.name, pos: i })))
    if (dData?.length) setDjs(dData.map((d, i) => ({ id: d.id, name: d.name, pos: i })))
  }

  const updJudge = (i, v) => setJudges(a => a.map((x, k) => k === i ? { ...x, name: v } : x))
  const addJudge = () => setJudges(a => [...a, { id: null, name: '', pos: a.length }])
  const rmJudge  = (i) => setJudges(a => a.filter((_, k) => k !== i))

  const updDj = (i, v) => setDjs(a => a.map((x, k) => k === i ? { ...x, name: v } : x))
  const addDj = () => setDjs(a => [...a, { id: null, name: '', pos: a.length }])
  const rmDj  = (i) => setDjs(a => a.filter((_, k) => k !== i))

  const submit = async () => {
    if (!name.trim())  { alert("Donnez un nom à l'événement"); return }
    if (!venue.trim()) { alert('Renseignez le lieu'); return }
    const cleanJudges = judges.filter(j => j.name.trim())
    if (!cleanJudges.length) { alert('Ajoutez au moins un juge'); return }

    setSaving(true)
    try {
      let battleId = battle?.id

      // Upsert battle
      if (!isEditing) {
        const { data, error } = await supabase
          .from('battles')
          .insert({ name: name.trim(), date: date || null, venue: venue.trim(), status: 'active' })
          .select()
          .single()
        if (error) throw error
        battleId = data.id
      } else {
        await supabase.from('battles').update({ name: name.trim(), date: date || null, venue: venue.trim() }).eq('id', battleId)
        await Promise.all([
          supabase.from('judges').delete().eq('battle_id', battleId),
          supabase.from('djs').delete().eq('battle_id', battleId),
        ])
      }

      // Insert judges
      if (cleanJudges.length) {
        await supabase.from('judges').insert(
          cleanJudges.map((j, i) => ({ battle_id: battleId, name: j.name.trim(), cypher: null, position: i }))
        )
      }

      // Insert DJs
      const cleanDjs = djs.filter(d => d.name.trim())
      if (cleanDjs.length) {
        await supabase.from('djs').insert(
          cleanDjs.map((d, i) => ({ battle_id: battleId, name: d.name.trim(), position: i }))
        )
      }

      const { data: savedBattle } = await supabase.from('battles').select('*').eq('id', battleId).single()
      onSave(savedBattle)
    } catch (err) {
      alert('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-sm">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 24 }} onClick={onCancel}>
        ← Retour
      </button>

      <div style={{ marginBottom: 28 }}>
        <div className="title-md" style={{ marginBottom: 4 }}>
          {isEditing ? 'Modifier le battle' : 'Nouveau battle'}
        </div>
        <div className="muted">Renseignez les informations avant de commencer</div>
      </div>

      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <div className="label">Nom de l'événement</div>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Chill in the City" />
        </div>
        <div className="grid2" style={{ marginBottom: 20 }}>
          <div>
            <div className="label">Date</div>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <div className="label">Lieu</div>
            <input className="input" value={venue} onChange={e => setVenue(e.target.value)} placeholder="Salle, ville…" />
          </div>
        </div>

        <hr className="divider" />

        <div style={{ marginBottom: 20 }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="label" style={{ margin: 0 }}>Juges</div>
            <button className="btn btn-ghost btn-sm" onClick={addJudge}>+ Juge</button>
          </div>
          {judges.map((j, i) => (
            <div key={i} className="flex" style={{ marginBottom: 8 }}>
              <input
                className="input"
                value={j.name}
                onChange={e => updJudge(i, e.target.value)}
                placeholder={`Juge ${i + 1}`}
                style={{ flex: 1 }}
              />
              {judges.length > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={() => rmJudge(i)}>✕</button>
              )}
            </div>
          ))}
        </div>

        <hr className="divider" />

        <div style={{ marginBottom: 24 }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="label" style={{ margin: 0 }}>DJs</div>
            <button className="btn btn-ghost btn-sm" onClick={addDj}>+ DJ</button>
          </div>
          {djs.map((d, i) => (
            <div key={i} className="flex" style={{ marginBottom: 8 }}>
              <input
                className="input"
                value={d.name}
                onChange={e => updDj(i, e.target.value)}
                placeholder={`DJ ${i + 1}`}
                style={{ flex: 1 }}
              />
              {djs.length > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={() => rmDj(i)}>✕</button>
              )}
            </div>
          ))}
        </div>

        <button className="btn btn-white btn-lg btn-full" onClick={submit} disabled={saving}>
          {saving ? 'Enregistrement…' : isEditing ? '💾 Enregistrer' : '🚀 Lancer le battle'}
        </button>
      </div>
    </div>
  )
}
