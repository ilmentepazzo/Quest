const SUPABASE_URL = "https://fkubtvumsxifovevsvzk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrdWJ0dnVtc3hpZm92ZXZzdnprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzUwNDgsImV4cCI6MjA5Mjg1MTA0OH0.I5AYGJ7givY0xnoI96l3ldIbUGaVFrvjh3J4bx7JNnc";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);