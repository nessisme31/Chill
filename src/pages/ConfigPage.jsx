import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ⚠️ Section doit être en dehors de ConfigPage pour éviter le bug de refocus
function Section({ label, items, onAdd, onRm, onUpd, addLabel }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div className="label" style={{ margin: 0 }}>{label}</div>
        <button className="btn btn-ghost btn-sm" onClick={onAdd}>+ {addLabel}</button>
      </div>
      {items.map((x, i) => (
        <div key={x.uid ?? x.id ?? i} className="flex" style={{ marginBottom: 8 }}>
          <input
            className="input"
            value={x.name}
            onChange={e => onUpd(i, e.target.value)}
            placeholder={`${addLabel} ${i + 1}`}
            style={{ flex: 1 }}
          />
          {items.length > 1 && (
            <button className="btn btn-ghost btn-sm" onClick={() => onRm(i)}>✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

const mkJudges   = () => Array(5).fill('').map((_, i) => ({ id: null, uid: i, name: '' }))
const mkDjs      = () => [{ id: null, uid: 0, name: 'Loony' }, { id: null, uid: 1, name: '' }]
const mkSpeakers = () => [{ id: null, uid: 0, name: 'Youval' }, { id: null, uid: 1, name: 'Skezzo' }]
let uidCounter = 100

export default function ConfigPage({ battle, onSave, onCancel }) {
  const isEditing = !!battle

  const [name,   setName]   = useState(battle?.name  || 'Chill in the City')
  const [date,   setDate]   = useState(battle?.date  || '')
  const [venue,  setVenue]  = useState(battle?.venue || '')
  const [judges,   setJudges]   = useState(mkJudges())
  const [djs,      setDjs]      = useState(mkDjs())
  const [speakers, setSpeakers] = useState(mkSpeakers())
  const [saving,   setSaving]   = useState(false)

  const [origJudgeIds,   setOrigJudgeIds]   = useState([])
  const [origDjIds,      setOrigDjIds]      = useState([])
  const [origSpeakerIds, setOrigSpeakerIds] = useState([])

  useEffect(() => { if (isEditing) loadExistingData() }, [])

  const loadExistingData = async () => {
    const [{ data: jData }, { data: dData }, { data: sData }] = await Promise.all([
      supabase.from('judges').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('djs').select('*').eq('battle_id', battle.id).order('position'),
      supabase.from('speakers').select('*').eq('battle_id', battle.id).order('position'),
    ])
    if (jData?.length) {
      setJudges(jData.map(j => ({ id: j.id, uid: j.id, name: j.name })))
      setOrigJudgeIds(jData.map(j => j.id))
    }
    if (dData?.length) {
      setDjs(dData.map(d => ({ id: d.id, uid: d.id, name: d.name })))
      setOrigDjIds(dData.map(d => d.id))
    }
    if (sData?.length) {
      setSpeakers(sData.map(s => ({ id: s.id, uid: s.id, name: s.name })))
      setOrigSpeakerIds(sData.map(s => s.id))
    }
  }

  const updItem = (setter) => (i, v) =>
    setter(a => a.map((x, k) => k === i ? { ...x, name: v } : x))

  const addItem = (setter) => () =>
    setter(a => [...a, { id: null, uid: ++uidCounter, name: '' }])

  const rmItem = (setter) => (i) =>
    setter(a => a.filter((_, k) => k !== i))

  const smartSave = async (table, items, origIds, battleId) => {
    const toUpdate = items.filter(x => x.id !== null && x.name.trim())
    const toInsert = items.filter(x => x.id === null && x.name.trim())
    const toDelete = origIds.filter(id => !toUpdate.find(x => x.id === id))
    await Promise.all([
      ...toUpdate.map((x, i) => supabase.from(table).update({ name: x.name.trim(), position: i }).eq('id', x.id)),
      ...toDelete.map(id => supabase.from(table).delete().eq('id', id)),
    ])
    if (toInsert.length) {
      await supabase.from(table).insert(
        toInsert.map((x, i) => ({ battle_id: battleId, name: x.name.trim(), position: toUpdate.length + i }))
      )
    }
  }

  const submit = async () => {
    if (!name.trim())  { alert("Donnez un nom à l'événement"); return }
    if (!venue.trim()) { alert('Renseignez le lieu'); return }
    const cleanJudges = judges.filter(j => j.name.trim())
    if (!cleanJudges.length) { alert('Ajoutez au moins un juge'); return }
    setSaving(true)
    try {
      let battleId = battle?.id
      if (!isEditing) {
        const { data, error } = await supabase.from('battles')
          .insert({ name: name.trim(), date: date || null, venue: venue.trim(), status: 'active' })
          .select().single()
        if (error) throw error
        battleId = data.id
        await supabase.from('judges').insert(cleanJudges.map((j, i) => ({ battle_id: battleId, name: j.name.trim(), cypher: null, position: i })))
        const cleanDjs = djs.filter(d => d.name.trim())
        if (cleanDjs.length) await supabase.from('djs').insert(cleanDjs.map((d, i) => ({ battle_id: battleId, name: d.name.trim(), position: i })))
        const cleanSpeakers = speakers.filter(s => s.name.trim())
        if (cleanSpeakers.length) await supabase.from('speakers').insert(cleanSpeakers.map((s, i) => ({ battle_id: battleId, name: s.name.trim(), position: i })))
      } else {
        await supabase.from('battles').update({ name: name.trim(), date: date || null, venue: venue.trim() }).eq('id', battleId)
        await smartSave('judges',   judges,   origJudgeIds,   battleId)
        await smartSave('djs',      djs,      origDjIds,      battleId)
        await smartSave('speakers', speakers, origSpeakerIds, battleId)
      }
      const { data: saved } = await supabase.from('battles').select('*').eq('id', battleId).single()
      onSave(saved)
    } catch (err) {
      alert('Erreur : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-sm">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 24 }} onClick={onCancel}>← Retour</button>
      <div style={{ marginBottom: 28 }}>
        <div className="title-md" style={{ marginBottom: 4 }}>{isEditing ? 'Modifier le battle' : 'Nouveau battle'}</div>
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
        <Section label="Juges" items={judges} addLabel="Juge"
          onAdd={addItem(setJudges)} onRm={rmItem(setJudges)} onUpd={updItem(setJudges)} />
        <hr className="divider" />
        <Section label="DJs" items={djs} addLabel="DJ"
          onAdd={addItem(setDjs)} onRm={rmItem(setDjs)} onUpd={updItem(setDjs)} />
        <hr className="divider" />
        <Section label="Speakers" items={speakers} addLabel="Speaker"
          onAdd={addItem(setSpeakers)} onRm={rmItem(setSpeakers)} onUpd={updItem(setSpeakers)} />
        <button className="btn btn-white btn-lg btn-full" style={{ marginTop: 8 }} onClick={submit} disabled={saving}>
          {saving ? 'Enregistrement…' : isEditing ? '💾 Enregistrer' : '🚀 Lancer le battle'}
        </button>
      </div>
    </div>
  )
}
