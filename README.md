# HabitFlow

Personal habit tracker (Vite + React + TypeScript). Works offline, installs on your phone.
All data is stored **on your device only** (browser localStorage). There is no server, no
database and no account, so nobody else can see it.

## Run / build
    npm install
    npm run dev        # local development
    npm run build      # static site in dist/

## Deploy (custom domain)
Upload `dist/` to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) and add
your domain in the host's settings. HTTPS is required for installing and offline mode.
No environment variables are needed.

## Install on your phone
- Android (Chrome): open your site, tap the menu (three dots), then "Install app" or
  "Add to Home screen".
- iPhone (Safari): tap Share, then "Add to Home Screen".
Open it once while online so the app files get cached; after that it works offline.

## Timer
The Timer button opens a countdown with an adjustable break reminder. Beeps repeat every 2 seconds until dismissed. The app keeps the screen awake while it runs; beeps may not play if the phone is locked or the app is in the background.

## Your data
- It lives in the browser/app on that phone. Clearing site data, uninstalling, or switching
  phones loses it unless you saved a backup.
- Use the Backup button (floppy icon) to save a .json file, and Restore (upload icon) to load
  it on any device. Do this regularly.
- Data is NOT shared between devices (phone and laptop have separate data).
