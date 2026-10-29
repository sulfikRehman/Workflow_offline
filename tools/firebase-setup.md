# Setting up Cloud sync (free, about 10 minutes, once)

You need a Google account and a browser. No card is asked for on Firebase's free "Spark" plan.
The Firebase website changes its layout now and then, so a button may be worded a little differently:
look for the same idea.

## 1. Create the project
1. Open https://console.firebase.google.com and sign in with the Google account you want to use.
2. **Create a project** (or "Add project"). Name it `habitflow`. Continue.
3. If it asks about Google Analytics, switch it **off**. Create project, then Continue.

## 2. Register the web app and copy its settings
1. On the project's home page tap the **web** icon (`</>`).
2. Nickname: `HabitFlow`. Leave "Firebase Hosting" **unticked**. **Register app**.
3. You will see a block that starts `const firebaseConfig = {`. **Copy that block** (everything from `const` to `};`).
   You can always find it again in Project settings (the gear) → General → Your apps.

## 3. Turn on Google sign-in
1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method → Google → Enable**. Choose your email as the support email. **Save**.
3. **Settings → Authorized domains → Add domain**: add `habitflow-offline.vercel.app`
   (and your own domain if you ever use one). `localhost` is already there.

## 4. Create the database
1. Left menu: **Build → Firestore Database → Create database**.
2. Choose the **Standard** edition if asked.
3. Location: pick the one nearest to you (for India, `asia-south1` Mumbai). It cannot be changed later.
4. Start in **production mode**. Create.

## 5. Publish the rules
1. Firestore Database → **Rules** tab.
2. Delete what is there and paste the whole of `tools/firestore.rules` from this project. **Publish**.

## 6. Connect each device
1. In HabitFlow: Menu → **Cloud sync**. Paste the block from step 2. **Save settings**.
2. **Sign in with Google and turn on.** Use the same Google account on every device.
3. Do the same on the other device (paste the block again there; it is only saved per device).

If you see "Google refused access" the rules are not published (step 5) or you used a different Google account.
If you see "This website address is not on the allowed list" add the address in step 3.
If the sign-in window does not open, allow pop-ups for the site.

## Good to know
- Free limits (Firebase Spark plan, from their pricing page): 1 GiB stored, 50,000 reads and 20,000 writes per day.
  One person's habits use a tiny fraction of that.
- To remove everything: Cloud sync window → **Delete my cloud data**. Or delete the project in Firebase's settings.
