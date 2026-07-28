export default function StatsTab({ crews, judges, djs }) {
  const cA   = crews.filter(c => c.cypher === 'A').length
  const cB   = crews.filter(c => c.cypher === 'B').length
  const diff = Math.abs(cA - cB)
  const weaker = cA < cB ? 'A' : 'B'

  return (
    <div>
      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="card" style={{ border: '1px solid #3d0000', textAlign: 'center', padding: '32px 16px' }}>
          <div className="label" style={{ marginBottom: 12 }}>Cypher A</div>
          <div style={{ fontSize: 72, fontWeight: 900, color: 'var(--red)', lineHeight: 1 }}>{cA}</div>
          <div className="muted" style={{ marginTop: 8 }}>équipes</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div className="label" style={{ marginBottom: 12 }}>Cypher B</div>
          <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{cB}</div>
          <div className="muted" style={{ marginTop: 8 }}>équipes</div>
        </div>
      </div>

      <div className="card" style={{ textAlign: 'center', padding: '28px 16px', marginBottom: 16 }}>
        <div className="label" style={{ marginBottom: 12 }}>Total inscrit</div>
        <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1 }}>{crews.length}</div>
      </div>

      {crews.length > 0 && diff > 3 && (
        <div className="alert-warn">
          ⚠️ <strong>Déséquilibre !</strong> Différence de {diff} équipes — orientez les prochaines inscriptions vers le Cypher {weaker}.
        </div>
      )}
      {crews.length > 0 && diff <= 3 && (
        <div className="alert-ok">
          ✓ Cyphers équilibrés — différence de {diff} équipe(s) seulement.
        </div>
      )}
      {crews.length === 0 && (
        <div className="caption" style={{ textAlign: 'center', padding: 20 }}>Aucune équipe inscrite pour l'instant.</div>
      )}

      <div className="grid2">
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 10 }}>Juges ({judges.length})</div>
          {judges.map(j => (
            <div key={j.id} className="flex-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{j.name}</span>
              {j.cypher && (
                <span className={j.cypher === 'A' ? 'badge-a' : j.cypher === 'both' ? 'badge-score' : 'badge-b'}>
                  {j.cypher === 'both' ? 'A & B' : `Cypher ${j.cypher}`}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="card card-sm">
          <div className="label" style={{ marginBottom: 10 }}>DJs ({djs.length})</div>
          {djs.map(d => (
            <div key={d.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              {d.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
