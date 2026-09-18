import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { COUNTRIES, crewDisplay, flagEmoji } from '../lib/countries'

const emptyForm = { name: '', m1: '', m2: '', country_code: 'FR' }

export default function InscriptionTab({ battle, crews, setCrews }) {
  const [form,    setForm]    = useState(emptyForm)
  const [pending, setPending] = useState(null)
  const [editing, setEditing] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [deleting, setDeleting] = useState(null)

  const crewsA = crews.filter(c => c.cypher === 'A')
  const crewsB = crews.filter(c => c.cypher === 'B')

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Réutilise toujours le plus petit numéro libre du cercle.
  // Exemple : A1, A2, A3, puis suppression de A2, la prochaine équipe sera A2.
  const nextSticker = (cypher) => {
    const used = new Set(
      crews
        .filter(c => c.cypher === cypher)
        .map(c => Number(String(c.sticker || '').match(new RegExp(`^${cypher}(\\d+)$`))?.[1]))
        .filter(Number.isInteger)
    )
    let number = 1
    while (used.has(number)) number += 1
    return `${cypher}${number}`
  }

  const preview = (cypher) => {
    if (!form.name.trim() || !form.m1.trim() || !form.m2.trim()) {
      alert('Remplissez tous les champs')
      return
    }
    setPending({ ...form, cypher, sticker: nextSticker(cypher) })
  }

  const confirm = async () => {
    if (!pending) return
    setSaving(true)
    const { data, error } = await supabase
      .from('crews')
      .insert({
        battle_id: battle.id,
        name:    pending.name.trim(),
        member1: pending.m1.trim(),
        member2: pending.m2.trim(),
        country_code: pending.country_code || 'FR',
        cypher:  pending.cypher,
        sticker: pending.sticker,
      })
      .select()
      .single()

    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    setCrews(prev => [...prev, data])
    setForm(emptyForm)
    setPending(null)
    setSaving(false)
  }

  const beginEdit = (crew) => {
    setEditing({
      id: crew.id,
      name: crew.name || '',
      m1: crew.member1 || '',
      m2: crew.member2 || '',
      country_code: crew.country_code || 'FR',
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    if (!editing.name.trim() || !editing.m1.trim() || !editing.m2.trim()) {
      alert('Remplissez tous les champs')
      return
    }

    setSaving(true)
    const changes = {
      name: editing.name.trim(),
      member1: editing.m1.trim(),
      member2: editing.m2.trim(),
      country_code: editing.country_code || 'FR',
    }
    const { data, error } = await supabase
      .from('crews')
      .update(changes)
      .eq('id', editing.id)
      .eq('battle_id', battle.id)
      .select()
      .single()

    if (error) {
      alert('Impossible de modifier l’équipe : ' + error.message)
      setSaving(false)
      return
    }

    setCrews(prev => prev.map(c => c.id === editing.id ? { ...c, ...data } : c))
    setEditing(null)
    setSaving(false)
  }

  const deleteCrew = async (crew) => {
    if (deleting) return
    const confirmed = window.confirm(
      `Supprimer ${crew.name} (${crew.sticker}) ?\n\n` +
      'Cette équipe sera retirée des qualifications et du bracket. Son numéro redeviendra disponible pour la prochaine inscription.'
    )
    if (!confirmed) return

    setDeleting(crew.id)

    // Les notes sont supprimées automatiquement par ON DELETE CASCADE.
    // Les slots du bracket doivent être supprimés explicitement pour éviter
    // qu’un ancien nom reste affiché dans un emplacement devenu vide.
    const { error: bracketError } = await supabase
      .from('bracket_slots')
      .delete()
      .eq('battle_id', battle.id)
      .eq('crew_id', crew.id)

    if (bracketError) {
      alert('Impossible de retirer l’équipe du bracket : ' + bracketError.message)
      setDeleting(null)
      return
    }

    const { error } = await supabase
      .from('crews')
      .delete()
      .eq('id', crew.id)
      .eq('battle_id', battle.id)

    if (error) {
      alert('Impossible de supprimer l’équipe : ' + error.message)
      setDeleting(null)
      return
    }

    setCrews(prev => prev.filter(c => c.id !== crew.id))
    setDeleting(null)
  }

  const renderCrew = (c, isB = false) => (
    <div key={c.id} className="flex" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', gap: 8 }}>
      <span className={isB ? 'sticker-b' : 'sticker-a'}>{c.sticker}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{crewDisplay(c)}</div>
        <div className="caption">{c.member1} &amp; {c.member2}</div>
      </div>
      <div className="flex" style={{ gap: 4, flexShrink: 0 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => beginEdit(c)}
          title="Modifier cette équipe"
          aria-label={`Modifier ${c.name}`}
        >
          ✎
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--red)' }}
          onClick={() => deleteCrew(c)}
          disabled={deleting === c.id}
          title="Supprimer cette équipe"
          aria-label={`Supprimer ${c.name}`}
        >
          {deleting === c.id ? '…' : '🗑'}
        </button>
      </div>
    </div>
  )

  // Confirmation screen
  if (pending) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="card" style={{
          maxWidth: 400, width: '100%', textAlign: 'center',
          border: `2px solid ${pending.cypher === 'A' ? 'var(--border2)' : 'var(--red)'}`,
          padding: '36px 24px',
        }}>
          <div className="muted" style={{ marginBottom: 12, letterSpacing: '1px', textTransform: 'uppercase', fontSize: 11 }}>
            Sticker attribué
          </div>
          <div style={{
            fontSize: 96, fontWeight: 900, lineHeight: 1,
            color: pending.cypher === 'A' ? 'var(--text)' : 'var(--red)',
            marginBottom: 20,
          }}>
            {pending.sticker}
          </div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{pending.name} {flagEmoji(pending.country_code)}</div>
          <div className="muted" style={{ marginBottom: 28 }}>{pending.m1} &amp; {pending.m2}</div>
          <div className="flex-center" style={{ gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setPending(null)}>← Modifier</button>
            <button className="btn btn-white" onClick={confirm} disabled={saving}>
              {saving ? '…' : '✓ Confirmer'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Modale de modification */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div className="card" style={{ maxWidth: 440, width: '100%' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div className="title-sm">Modifier l’équipe</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} disabled={saving}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Nom du crew</div>
              <input className="input" value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} autoFocus />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Membre 1</div>
              <input className="input" value={editing.m1} onChange={e => setEditing(p => ({ ...p, m1: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Membre 2</div>
              <input className="input" value={editing.m2} onChange={e => setEditing(p => ({ ...p, m2: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div className="label">Pays du crew</div>
              <select className="input" value={editing.country_code} onChange={e => setEditing(p => ({ ...p, country_code: e.target.value }))}>
                {COUNTRIES.map(country => (
                  <option key={country.code} value={country.code}>
                    {flagEmoji(country.code)} {country.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-center" style={{ gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Annuler</button>
              <button className="btn btn-white" onClick={saveEdit} disabled={saving}>
                {saving ? '…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid2">
        {/* Form */}
        <div>
          <div className="card">
            <div className="title-sm" style={{ marginBottom: 16 }}>Nouvelle inscription</div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Nom du crew</div>
              <input className="input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ex: Wild Styles" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Membre 1</div>
              <input className="input" value={form.m1} onChange={e => f('m1', e.target.value)} placeholder="Prénom Nom" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Membre 2</div>
              <input className="input" value={form.m2} onChange={e => f('m2', e.target.value)} placeholder="Prénom Nom" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div className="label">Pays du crew</div>
              <select className="input" value={form.country_code} onChange={e => f('country_code', e.target.value)}>
                {COUNTRIES.map(country => (
                  <option key={country.code} value={country.code}>
                    {flagEmoji(country.code)} {country.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="label" style={{ marginBottom: 8 }}>Choisir le cypher</div>
            <div className="grid2" style={{ gap: 8 }}>
              <button
                className="btn btn-dark"
                style={{ padding: '14px 8px', flexDirection: 'column', gap: 4 }}
                onClick={() => preview('A')}
              >
                <span style={{ fontSize: 15 }}>Cercle A</span>
                <span style={{ fontSize: 11, fontWeight: 400, opacity: .6 }}>{crewsA.length} équipes</span>
              </button>
              <button
                className="btn btn-red"
                style={{ padding: '14px 8px', flexDirection: 'column', gap: 4 }}
                onClick={() => preview('B')}
              >
                <span style={{ fontSize: 15 }}>Cercle B</span>
                <span style={{ fontSize: 11, fontWeight: 400, opacity: .6 }}>{crewsB.length} équipes</span>
              </button>
            </div>
          </div>
        </div>

        {/* Two-column list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cypher A */}
          <div className="card" style={{ border: '1px solid var(--border2)' }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <div className="title-sm">Cercle A</div>
              <span className="badge-a">{crewsA.length}</span>
            </div>
            {crewsA.length === 0
              ? <div className="caption">Aucune équipe inscrite</div>
              : crewsA.map(c => renderCrew(c))
            }
          </div>

          {/* Cypher B */}
          <div className="card" style={{ border: '1px solid #3d0000' }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <div className="title-sm" style={{ color: 'var(--red)' }}>Cercle B</div>
              <span className="badge-b">{crewsB.length}</span>
            </div>
            {crewsB.length === 0
              ? <div className="caption">Aucune équipe inscrite</div>
              : crewsB.map(c => renderCrew(c, true))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
