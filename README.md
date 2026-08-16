# PTO Fund Ledger

A small website for tracking Parent-Teacher Organisation fund payments,
class by class. No server to run — it's plain HTML/CSS/JS that talks
directly to a free Firebase project, and it hosts for free on GitHub Pages.

Roles:
- **Admin** (you) — creates classes, sets each class's yearly fee, creates
  teacher/principal accounts, renames the 5 moneybox labels.
- **Teacher** — uploads their class list from Excel, marks students paid,
  prints placeholder receipts, searches students, sees their class totals.
- **Principal** — read-only dashboard of every class and the school-wide total.

Nobody needs to be technical to *use* the site day-to-day — only the
one-time setup below needs a bit of care.

---

## Part 1 — Create your Firebase project (free)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   and sign in with a Google account.
2. Click **Add project**, give it a name (e.g. `pto-fund-ledger`), and
   finish the wizard (you can turn off Google Analytics — not needed).
3. In the left sidebar, click **Build > Authentication**, then **Get started**.
   Under **Sign-in method**, enable **Email/Password**.
4. In the left sidebar, click **Build > Firestore Database**, then
   **Create database**. Choose a location close to you, and start in
   **production mode** (we'll paste in proper rules next).
5. Once created, click the **Rules** tab in Firestore, delete the default
   text, and paste in the contents of `firestore.rules` from this project.
   Click **Publish**.
6. Back in the project overview (gear icon, top left, > **Project settings**),
   scroll to **Your apps**, click the **</>** (web) icon, give it any
   nickname, and click **Register app**. Firebase will show you a
   `firebaseConfig` object.
7. Open `js/firebase-config.js` in this project and replace the placeholder
   values with the real ones Firebase just gave you. Save the file.

## Part 2 — Create your first Admin account

Because the very first account has to be created by hand (there's no admin
yet to create it for you):

1. In Firebase Console, go to **Authentication > Users > Add user**.
   Enter your own email and a password. Click **Add user**.
2. Copy the new user's **User UID** (shown in the users list).
3. Go to **Firestore Database > Data**, click **Start collection**, name it
   `users`, and for the **Document ID** paste the UID you copied. Add these
   fields to the document:
   - `email` (string) — your email
   - `displayName` (string) — your name
   - `role` (string) — `admin`
   - `classId` (string) — leave blank/null
4. Save. You can now log in to the site with that email/password and land
   on the Admin panel — from there, create your teacher and principal
   accounts through the UI instead of the Firebase Console.

## Part 3 — Try it locally in VS Code

1. Open this folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) from the
   Extensions panel.
3. Right-click `index.html` → **Open with Live Server**.
4. Log in with the admin account you created above.

You can't just double-click `index.html` to open it as a `file://` page —
Firebase requires a real `http://` address, which Live Server gives you.

## Part 4 — Put it on GitHub Pages (free hosting)

1. Create a new repository on [github.com](https://github.com) (public or
   private both work with Pages on a free personal account, but a private
   repo requires GitHub Pro for Pages — use **public** if you're on a free
   plan).
2. Push this folder to that repository. Easiest ways:
   - In VS Code: **Source Control** panel → **Initialize Repository** →
     stage and commit all files → **Publish Branch** (this walks you
     through connecting to GitHub).
   - Or from a terminal in this folder:
     ```
     git init
     git add .
     git commit -m "Initial version"
     git branch -M main
     git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
     git push -u origin main
     ```
3. On GitHub, open the repository → **Settings** → **Pages** (left sidebar).
4. Under **Build and deployment**, set **Source** to **Deploy from a
   branch**, branch `main`, folder `/ (root)`. Save.
5. After a minute, GitHub shows your live URL, something like
   `https://YOUR-USERNAME.github.io/YOUR-REPO/`. That's the link to share
   with your principal and teachers.

One more Firebase step once you know your real URL: in Firebase Console →
**Authentication → Settings → Authorized domains**, add your
`YOUR-USERNAME.github.io` domain (localhost is already allowed by default).

## Update: Years, moneybox splits, and a ledger

The data structure changed to support school years:
- Classes and students now live under `years/{yearId}/classes/...` instead
  of at the top level. **Redeploy `firestore.rules`** (Firestore Console →
  Rules → paste the updated file → Publish) or teachers and the principal
  will lose access.
- Go to **Admin → Years** first and create your first year (e.g. the
  current one) — everything else (Classes, Moneyboxes ledger, Staff
  assignments) is scoped to whichever year is selected.
- **Admin → Classes** now has a "Moneybox split" button per class, letting
  you divide that class's fee across moneyboxes (can't exceed the fee).
- **Admin → Moneyboxes** now has two parts: the labels (rename or add new
  boxes) up top, and a **ledger** below — per box, how much has been
  collected, a field to record a withdrawal/expense, and the remaining
  balance, plus the school's current total collected fees at the bottom.
- **Admin → Staff accounts**: when creating a teacher, you now also pick
  the year and class to assign them to. Use the 📋 button on an existing
  teacher to (re)assign them for a different year — this is required every
  time you start a new year, since new years start with no classes.
- Old moneybox data (a plain list of 5 label strings) is auto-migrated the
  first time you open Admin → Moneyboxes after this update.

## Notes and limits, honestly stated

- **Removing a staff account** in the Admin panel removes their access to
  the site, but their login itself still exists in Firebase's system —
  fully deleting it requires one extra step in the Firebase Console
  (Authentication → Users → delete). This is a limitation of not running a
  backend server; it's a two-click cleanup, not a security hole.
- **Receipts are placeholders.** They print student name, class, amount,
  and date with a generic layout — swap in your school's real letterhead
  and wording in `printReceipt()` inside `js/common.js` whenever you're ready.
- **Free tier limits:** Firebase's free (Spark) plan comfortably covers a
  school PTO's worth of data and traffic; you won't need to add billing
  for this use case.
- **Fee changes don't rewrite history.** If Admin changes a class's fee,
  already-paid students keep the amount they were recorded as paying;
  only new payments use the new fee.
