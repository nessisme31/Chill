# Les Chill — Battle Management

## Stack
React 18 + Vite + Supabase + Vercel

## Setup

### 1. Supabase
- Créer un projet sur supabase.com
- Aller dans SQL Editor → coller et exécuter `supabase-schema.sql`
- Récupérer : Project URL + anon public key

### 2. Variables d'environnement
```
cp .env.example .env
# Remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
```

### 3. Développement local
```
npm install
npm run dev
```

### 4. Vercel
- Importer le repo GitHub sur vercel.com
- Ajouter les variables d'env dans Settings → Environment Variables
- Deploy !

## Connexion
- Email : nessisme@gmail.com
- Mot de passe : 1234ness
