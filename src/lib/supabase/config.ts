// Supabase project for shared campaign content (GM-1, #37).
//
// These two values are PUBLIC by design: the anon key only grants what the
// row-level security policies in supabase/migrations allow. Never put the
// service_role key or the database password in this repo.
export const SUPABASE_URL = 'https://hntlvhspyllaaidvxlox.supabase.co';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhudGx2aHNweWxsYWFpZHZ4bG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MjI2NDUsImV4cCI6MjEwOTE5ODY0NX0.nsQCySUassQ2kf43jCFu0ZCOnSdIy-SGkm89-NfFmjE';
