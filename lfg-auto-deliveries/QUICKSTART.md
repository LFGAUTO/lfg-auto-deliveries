# LFG AUTO DELIVERIES — Quick Start (the fast path)

You have two files:
- **lfg-deliveries-prototype.html** — a clickable demo. Want to just SEE it working right now?
  Go to **app.netlify.com/drop** and drag this file on. Live in 10 seconds.
  (Demo only — data lives on that one device, no real logins. Good for a look, not for daily use.)
- **lfg-auto-deliveries.zip** — the REAL app (shared across all phones + the office TV). Set up once below.

---

## Get the real app live — ~20 minutes, one time

### 1. Database (Supabase)
1. supabase.com → sign up → **New project** (name it `lfg-deliveries`, save the password). Wait ~2 min.
2. Left menu **SQL Editor → New query** → open `supabase/setup.sql`, copy ALL of it, paste, **Run**.

### 2. The two logins (that's all you need)
1. Left menu **Authentication → Users → Add user → Create new user**:
   - **Admin:** email `jessica@lfgauto.app`, password `LFG1120`, **Auto Confirm User** ON.
   - **Driver (shared):** email `driver@lfgauto.app`, password `LFGDRIVE`, **Auto Confirm User** ON.
2. **SQL Editor → New query** → paste `supabase/make-admin.sql` → **Run**.

### 3. (Optional) In-app driver password reset
Left menu **Edge Functions → Create a function** → name it exactly `reset-driver-password` →
paste `supabase/functions/reset-driver-password/index.ts` → **Deploy**.
(Skip if you don't care — you can always reset it in Supabase.)

### 4. Get your 2 keys
Left menu **Project Settings → API** → copy **Project URL** and the **anon public** key.

### 5. Put it online (Netlify)
1. Upload this whole folder to a new **github.com** repo (drag files in the browser).
2. **netlify.com** → **Add new site → Import from GitHub** → pick the repo.
3. Before deploying: **Site configuration → Environment variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
4. **Deploy.** ~1 minute → you get a link like `lfg-deliveries.netlify.app`.

---

## Who logs in with what
- **Admin (you / Jessica):** username **Jessica**, password **LFG1120** → full control. Shows as "Admin" in the app.
- **All drivers:** username **driver**, password **LFGDRIVE** (one shared login on every phone).
- **Office TV:** open your site link with **/board** on the end → press ⛶ Fullscreen. Auto-refreshes.

## What each person sees
- **Admin:** Dashboard, Deliveries (create/edit, assign 1 or 2 drivers, trade/lease VIN + where it goes), Drivers roster, Archive, CSV exports, resolve issues.
- **Drivers:** every active delivery (assigned or unassigned), with big AT DEALER / EN ROUTE / DELIVERED / REPORT ISSUE buttons. At DELIVERED they sign + tick Bluetooth / LFG box / vehicle app / review and snap the photos.
- **TV Board:** live status columns, Daily or Weekly, with unassigned jobs flagged red.

Full detail is in `README.md`.
