import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://chhyoprrfecbpiattkzi.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_-g2_hRp1eGTzAsVwdxhCHw_9NYD9WXn'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)