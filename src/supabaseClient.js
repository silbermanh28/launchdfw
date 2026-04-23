import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://chhyoprrfecbpiattkzi.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoaHlvcHJyZmVjYnBpYXR0a3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTUyNDksImV4cCI6MjA5MTA3MTI0OX0.sw6e2l6FTftiuWKlbVtmKt8mT3bQt5FvQGObulaZ99k'

let supabase = null
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
} catch (e) {
  console.warn('Supabase init failed, running in demo mode')
  supabase = null
}

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY }
