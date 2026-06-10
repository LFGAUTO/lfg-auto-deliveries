# LFG AUTO DELIVERIES

A live delivery board + driver app that replaces Jessica's printed delivery sheet.

- **Admin (Jessica):** create/edit/assign/delete deliveries, manage drivers, view archive, export CSV.
- **Drivers:** all share ONE login. They see every active delivery, tap **AT DEALER → EN ROUTE → DELIVERED**, sign at the end (the signature shows who completed it), or **REPORT ISSUE**.
- **TV Board:** a read-only, auto-refreshing screen for the office TV at `/board`, with **Daily** and **Weekly** views.

Built with React + Vite (frontend), Supabase (database, login, photo storage), Netlify (hosting).

---

## Folder structure
```
lfg-auto-deliveries/
├─ index.html
├─ package.json
├─ vite.config.js
├─ netlify.toml              ← Netlify build settings (already done)
├─ .env.example             ← template for your 2 secret values
├─ supabase/
│  ├─ setup.sql             ← run ONCE to build the database
│  ├─ make-admin.sql        ← run ONCE to make Jessica an admin
│  └─ functions/reset-driver-password/index.ts  ← lets Jess reset the driver password in-app
└─ src/
   ├─ main.jsx, App.jsx, index.css
   ├─ lib/        (supabase connection + helpers)
   ├─ context/    (login state)
   ├─ components/ (form, signature pad, nav, etc.)
   └─ pages/      (Dashboard, Deliveries, Drivers, Archive, TVBoard, DriverPortal)
```

---

## SETUP — do this once, in order. ~20 minutes.

### STEP 1 — Make a Supabase project (free)
1. Go to **supabase.com** → sign up → **New project**.
2. Name it `lfg-deliveries`, pick a password (save it somewhere), choose a region near NJ, create.
3. Wait ~2 minutes for it to finish.

### STEP 2 — Build the database
1. Left menu → **SQL Editor** → **New query**.
2. Open `supabase/setup.sql`, copy the **whole** file, paste it in, click **Run**.
3. You should see "Success". This creates all tables, security rules, and the photo storage bucket.

### STEP 3 — Create the two logins
You only need **two** logins for the whole company: Jessica (admin) and one **shared driver** login.

1. Left menu → **Authentication** → **Users** → **Add user** → **Create new user**.
   - Jessica: Email `jessica@lfgauto.app` · Password `LFG1120` · turn ON **Auto Confirm User**.
2. **Add user** again for the shared driver:
   - Driver: Email `driver@lfgauto.app` · Password `LFGDRIVE` (or your choice) · **Auto Confirm User** ON.
3. Back to **SQL Editor** → **New query** → paste the contents of `supabase/make-admin.sql` → **Run**. (This makes Jessica an admin; the driver account stays a normal driver.)

> Jessica logs in with username **Jessica**. All drivers log in with the single username **driver** — the app turns these into the emails automatically. Because each driver signs at the end of a delivery, the signature on the record shows who actually did it.

### STEP 4 — Add the password-reset function
This one small function lets Jessica reset the shared driver password from inside the app.
1. Left menu → **Edge Functions** → **Create a function** (or "Deploy a new function").
2. Name it exactly **`reset-driver-password`**.
3. Open `supabase/functions/reset-driver-password/index.ts`, copy the whole file, paste it in, **Deploy**. (It already has the keys it needs.)

> Skipping this is fine — Jessica can also reset the driver password directly in Supabase under Authentication → Users. But deploying it makes the in-app button work.

### STEP 5 — Copy your 2 connection values
1. Left menu → **Project Settings** → **API**.
2. Copy **Project URL** and the **anon public** key. You'll paste these into Netlify next.

---

## DEPLOY TO NETLIFY (recommended: auto-deploy from GitHub)

**A. Put the code on GitHub**
1. Create a free **github.com** account if needed.
2. New repository → name it `lfg-auto-deliveries` → upload this whole folder (GitHub lets you drag files in the browser), or use GitHub Desktop. Commit.

**B. Connect Netlify**
1. **netlify.com** → sign up → **Add new site → Import an existing project → GitHub** → pick your repo.
2. Build settings are auto-detected from `netlify.toml` (Build command `npm run build`, Publish `dist`). Leave them.
3. Before the first deploy, open **Site configuration → Environment variables → Add a variable** and add these two:
   - `VITE_SUPABASE_URL` = your Project URL from Step 5
   - `VITE_SUPABASE_ANON_KEY` = your anon public key from Step 5
4. Click **Deploy**. In ~1 minute you get a live link like `lfg-deliveries.netlify.app`.
5. (Optional) **Domain management → Change site name** to make the link nicer.

> Every time you push a change to GitHub, Netlify rebuilds automatically.

**Alternative (no GitHub): build on your computer, drag the folder**
1. Install Node.js (nodejs.org). In this folder, copy `.env.example` to `.env` and paste your 2 values.
2. Run `npm install` then `npm run build`. This creates a `dist` folder.
3. Go to **app.netlify.com/drop** and drag the **`dist`** folder onto it.
   (With this method you must rebuild and re-drag whenever values or code change.)

---

## DAILY USE

- **Jessica:** open the site, log in (Jessica / LFG1120). Create deliveries, assign a driver, manage everything.
- **Drivers:** all share the single **driver** login (password from Step 3). They open the **same site link**, log in once on their phone, and see every active delivery with big buttons. On the **Drivers** page Jessica keeps a roster of driver *names* — those appear in the assignment dropdowns and on the board, and a delivery can have **two drivers**. At delivery, the driver ticks the task checkboxes (Bluetooth, LFG box, vehicle app, review) and signs — the signature shows who did it.
- **Office TV:** open the site link with **`/board`** on the end (e.g. `lfg-deliveries.netlify.app/board`), then press **⛶ Fullscreen**. It refreshes itself every 30 seconds. Admins also have a "TV Board" tab.

## How deliveries flow
`Assigned → At Dealer → En Route → Delivered`. When a driver taps **Delivered** and the customer signs, the record is automatically saved to the **Archive** (your permanent record) and leaves the active board. **Report Issue** flags a delivery red and shows an alert on Jessica's dashboard.

## Exports
On **Deliveries** and **Archive**, the **⬇ CSV** button downloads a spreadsheet.

## Change the admin password later
Supabase → **Authentication → Users** → click Jessica → set a new password. The **shared driver** password is reset right in the app on the **Drivers** page (the "Reset Driver Password" button), or in Supabase the same way.

## Security notes (plain English)
- Drivers share one login and can see/update active deliveries; the signature captured at delivery is the record of who completed each one. Customers' signed records, photos, and payment info live in your private Supabase project.
- Issues raised by a driver show as red alerts on Jessica's dashboard; she clicks **Mark Resolved**, types the solution, and the delivery returns to its normal status. The issue + solution stay on the permanent record.
- The "anon public" key is safe to put in the website; the powerful service key stays inside the Edge Function only.
