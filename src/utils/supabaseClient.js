import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lhzpukkzzalhnrmolckm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoenB1a2t6emFsaG5ybW9sY2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjU5OTIsImV4cCI6MjA5OTk0MTk5Mn0.-tLwDPcxB61EYuXs8iu05DeZA5wSi1IFxiSeZygka0g'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
