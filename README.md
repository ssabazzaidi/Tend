# Tend — habits & weight

A tiny, installable habit and weight tracker. There's no account, no server and no tracking. Your data stays on your phone.

## Put it on your phone (about 5 minutes, one time)

Chrome can only install a web app that's served over HTTPS, so you have to host these files somewhere once. Either free option below works.

**Option A — GitHub Pages**
1. On github.com, create a new **public** repository (for example `tend`).
2. Click **Add file → Upload files**, then drag in **everything in this folder** (including the `icons` folder). Commit.
3. Go to **Settings → Pages**. Set Source to *Deploy from a branch*, choose Branch `main` and folder `/ (root)`, then Save.
4. After about a minute your app is live at `https://<your-username>.github.io/tend/`.

**Option B — Netlify Drop**
1. Go to app.netlify.com/drop and drag this whole folder onto the page.
2. Sign up (free) to keep the site permanently. You'll get a `https://….netlify.app` link.

**Install on Android**
1. Open the link in **Chrome** on your phone.
2. Tap **⋮ → Install app** (or accept the "Install" banner).
3. Tend now shows up in your app drawer with its own icon. It opens full-screen and works offline.

**Want a real .apk instead?** Paste your hosted link into pwabuilder.com and choose **Package for stores → Android**. It builds a signed APK that you can sideload.

## Using it
- **Tabs** along the bottom switch between trackers. **+** adds a new one.
- **Long-press a tab** (or tap **⋯**) to rename it, change its icon or color, move it or delete it. Appearance and backup settings are also there.
- **Number trackers** (like Weight): tap the big number and type. It saves automatically.
- **Check trackers** (like Dental): tap the circle.
- **‹ Today ›** lets you fill in earlier days. Tapping a point on the graph jumps to that day too.
- **Drag across the graph** to see exact values. Check trackers graph your rolling 7-day consistency.
- **Theme** follows the time of day: light from 6:30am to 7pm, dark otherwise. You can pin it to light or dark in settings.

## Your data
- It's stored in IndexedDB on the device, and the app asks Android to keep it permanently.
- Use **⋯ → Export backup** now and then. **Import backup** restores it, including on a new phone.
- Clearing Chrome's site data for your app's address, or uninstalling the app, erases the data. Export first.
- Keep the app at the same web address. Data is tied to the address it was installed from.

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell |
| `styles.css` | Design: gradients, light/dark tokens, layout |
| `app.js` | State, IndexedDB storage, theme timing, input, charts, settings |
| `icons.js` | Line icon set |
| `sw.js` | Offline cache |
| `manifest.webmanifest`, `icons/` | Install metadata and app icons |
