import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { COUNTRIES, flagEmoji, crewDisplay } from '../lib/countries'

export default function InscriptionTab({ battle, crews, setCrews }) {
  const [form,    setForm]    = useState({ name: '', m1: '', m2: '', email: '', country_code: 'FR' })
  const [pending, setPending] = useState(null)
  const [saving,  setSaving]  = useState(false)

  const crewsA = crews.filter(c => c.cypher === 'A')
  const crewsB = crews.filter(c => c.cypher === 'B')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!pending) return
    const handle = (e) => { if (e.key === 'Enter' && !saving) confirmInscription() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [pending, saving])

  const preview = (cypher) => {
    if (!form.name.trim() || !form.m1.trim() || !form.m2.trim()) {
      alert('Remplissez le nom du crew et les deux danseurs')
      return
    }
    const num = (cypher === 'A' ? crewsA.length : crewsB.length) + 1
    setPending({ ...form, cypher, sticker: cypher + num })
  }

  const confirmInscription = async () => {
    if (!pending || saving) return
    setSaving(true)
    const { data, error } = await supabase.from('crews').insert({
      battle_id:    battle.id,
      name:         pending.name.trim(),
      member1:      pending.m1.trim(),
      member2:      pending.m2.trim(),
      email:        pending.email.trim() || null,
      country_code: pending.country_code || 'FR',
      cypher:       pending.cypher,
      sticker:      pending.sticker,
    }).select().single()
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    setCrews(prev => [...prev, data])
    setForm({ name: '', m1: '', m2: '', email: '', country_code: 'FR' })
    setPending(null)
    setSaving(false)
  }

  if (pending) {
    const flag = flagEmoji(pending.country_code)
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="card" style={{
          maxWidth: 420, width: '100%', textAlign: 'center',
          border: `2px solid ${pending.cypher === 'A' ? 'var(--red)' : 'var(--border2)'}`,
          padding: '36px 24px',
        }}>
          <div className="muted" style={{ marginBottom: 12, letterSpacing: '1px', textTransform: 'uppercase', fontSize: 11 }}>Sticker attribué</div>
          <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1, color: pending.cypher === 'A' ? 'var(--red)' : 'var(--text)', marginBottom: 20 }}>
            {pending.sticker}
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {pending.name} {flag}
          </div>
          <div className="muted" style={{ marginBottom: 4, textTransform: 'lowercase' }}>{pending.m1} &amp; {pending.m2}</div>
          {pending.email && <div className="caption" style={{ marginBottom: 4 }}>{pending.email}</div>}
          <div className="caption" style={{ marginBottom: 28, color: 'var(--text3)' }}>Entrée ou cliquer pour confirmer</div>
          <div className="flex-center" style={{ gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setPending(null)}>← Modifier</button>
            <button className="btn btn-white" onClick={confirmInscription} disabled={saving}>{saving ? '…' : '✓ Confirmer'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid2">
      <div>
        <div className="card">
          <div className="title-sm" style={{ marginBottom: 16 }}>Nouvelle inscription</div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Nom du crew</div>
            <input className="input" value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ex: WILD STYLES" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Membre 1</div>
            <input className="input" value={form.m1} onChange={e => f('m1', e.target.value)} placeholder="prénom nom" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Membre 2</div>
            <input className="input" value={form.m2} onChange={e => f('m2', e.target.value)} placeholder="prénom nom" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Email <span style={{ color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span></div>
            <input className="input" type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="crew@exemple.com" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div className="label">Pays</div>
            <select className="input" value={form.country_code} onChange={e => f('country_code', e.target.value)}>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>
              ))}
            </select>
          </div>
          <div className="label" style={{ marginBottom: 8 }}>Choisir le cypher</div>
          <div className="grid2" style={{ gap: 8 }}>
            <button className="btn btn-red" style={{ padding: '14px 8px', flexDirection: 'column', gap: 4 }} onClick={() => preview('A')}>
              <span style={{ fontSize: 15 }}>Cypher A</span>
              <span style={{ fontSize: 11, fontWeight: 400, opacity: .6 }}>{crewsA.length} équipes</span>
            </button>
            <button className="btn btn-ghost" style={{ padding: '14px 8px', flexDirection: 'column', gap: 4 }} onClick={() => preview('B')}>
              <span style={{ fontSize: 15 }}>Cypher B</span>
              <span style={{ fontSize: 11, fontWeight: 400, opacity: .6 }}>{crewsB.length} équipes</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card" style={{ border: '1px solid #3d0000' }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="title-sm" style={{ color: 'var(--red)' }}>Cypher A</div>
            <span className="badge-a">{crewsA.length}</span>
          </div>
          {crewsA.length === 0 ? <div className="caption">Aucune équipe inscrite</div>
            : crewsA.map(c => (
              <div key={c.id} className="flex" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="sticker-a">{c.sticker}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{crewDisplay(c)}</div>
                  <div className="caption" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</div>
                </div>
              </div>
            ))}
        </div>
        <div className="card" style={{ border: '1px solid var(--border2)' }}>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="title-sm">Cypher B</div>
            <span className="badge-b">{crewsB.length}</span>
          </div>
          {crewsB.length === 0 ? <div className="caption">Aucune équipe inscrite</div>
            : crewsB.map(c => (
              <div key={c.id} className="flex" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="sticker-b">{c.sticker}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{crewDisplay(c)}</div>
                  <div className="caption" style={{ textTransform: 'lowercase' }}>{c.member1} &amp; {c.member2}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
