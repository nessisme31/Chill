import { useState } from 'react'

export default function LoginPage({ credentials, onLogin }) {
  const [email, setEmail] = useState('')
  const [pwd,   setPwd]   = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (email.trim() === credentials.email && pwd === credentials.password) {
      onLogin()
    } else {
      setError('Identifiants incorrects.')
    }
  }

  return (
    <div className="page-center">
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: 12 }}>
            Battle Management
          </div>
          <div className="title-lg">Les Chill</div>
        </div>

        <div className="card">
          <div style={{ marginBottom: 14 }}>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="email@exemple.com"
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="label">Mot de passe</label>
            <input
              className="input"
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>
          {error && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 14 }}>{error}</div>
          )}
          <button className="btn btn-white btn-lg btn-full" onClick={submit}>
            Connexion
          </button>
        </div>
      </div>
    </div>
  )
}
