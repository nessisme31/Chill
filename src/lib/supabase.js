import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('⚠️ Variables Supabase manquantes. Copiez .env.example en .env et renseignez vos clés.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
