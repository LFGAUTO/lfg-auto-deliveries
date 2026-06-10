// ============================================================================
// LFG AUTO DELIVERIES — reset-driver-password Edge Function
// Lets Jessica (admin) reset the SHARED driver login password from inside the app.
// Runs here (not the browser) because changing a password needs elevated rights.
//
// Deploy (Dashboard, no install):
//   Supabase -> Edge Functions -> Create a function -> name it "reset-driver-password"
//   -> paste this whole file -> Deploy.
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const DRIVER_EMAIL = 'driver@lfgauto.app'   // the single shared driver login

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

  // caller must be a signed-in admin
  const caller = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not signed in' }, 401)

  const admin = createClient(URL, SERVICE)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', u.user.id).single()
  if (prof?.role !== 'admin') return json({ error: 'Admins only' }, 403)

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const password = String(body.password || '')
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400)

  // find the shared driver user and set the new password
  const { data: list, error: lerr } = await admin.auth.admin.listUsers()
  if (lerr) return json({ error: lerr.message }, 500)
  const driver = list.users.find((x) => x.email === DRIVER_EMAIL)
  if (!driver) return json({ error: `No user ${DRIVER_EMAIL}. Create it in Authentication first.` }, 404)

  const { error } = await admin.auth.admin.updateUserById(driver.id, { password })
  if (error) return json({ error: error.message }, 400)
  return json({ ok: true })
})
