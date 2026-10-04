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
The Timer button opens a round dial clock. Drag around the dial to set the time: one full turn is 60 minutes, and you can keep turning for more (up to 12 hours). The −5, −1, +1 and +5 buttons (or the arrow keys on the dial) fine-tune it. While the timer runs, the green arc and the hand show the time left, and amber dots mark the break reminders still to come in the current turn.

Break reminders are adjustable: tick the box and set how many minutes apart they are. Beeps repeat every 2 seconds until dismissed. The app keeps the screen awake while it runs; beeps may not play if the phone is locked or the app is in the background.

## Habits
- **Tap a day** to mark it done or not done. **Hold a day** (or tap today's total at the top right of the habit) to enter an exact amount, like 20 of 30 minutes.
- **Pencil button**: edit a habit's name, unit, target, icon and days. History is kept. Changing the target also changes which past days count as done.
- **Days**: a habit can be scheduled on chosen days only (for example weekdays). Days it isn't scheduled don't count in the week totals and don't break its streak.
- **Archive** hides a habit but keeps its history (find it under Archived at the bottom, and Restore it any time). **Delete** removes it for good.
- **Streaks**: each habit shows its current and best streak. The calendar button opens a month view where you can also fill in past days.
- **Backup reminder**: a banner appears if you have never saved a backup (after 3 days of use) or the last one is over 7 days old. "Later" hides it for 2 days.
- **Timer**: when a timer ends, tap Stop and you can add its minutes to a habit measured in minutes or hours. The time is added to today's total.

## Menu (top right)
The menu button at the top right opens a dropdown with:
- **Save backup**: downloads all your habits and history as a file.
- **Restore backup**: upload a backup file (it replaces what is in the app).
- **Export CSV**: downloads your history as a spreadsheet file.
- **Haptic feedback**: an on/off switch, and a Strength setting (Light, Medium, Strong).

Tap outside the menu, press Escape, or tap the button again to close it.

## Vibration (haptic feedback)
The phone vibrates lightly on every button tap, once per minute as you turn the timer dial, with a double buzz when a habit is checked off or added, and with different longer patterns for the break and end-of-timer alarms. Phones can only change how long a buzz lasts, not how hard it is, so Strength changes the length of each buzz. The on/off switch and Strength are remembered on that phone. It uses the browser's Vibration API: it works in Chrome on Android, and does nothing on browsers without it, such as Safari on iPhone (the vibration part of the menu is hidden there). The base lengths are in `src/lib/haptics.ts`.

## Your data
- It lives in the browser/app on that phone. Clearing site data, uninstalling, or switching
  phones loses it unless you saved a backup.
- Use the Backup button (floppy icon) to save a .json file, and Restore (upload icon) to load
  it on any device. Do this regularly.
- Data is NOT shared between devices (phone and laptop have separate data).
