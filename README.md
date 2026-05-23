# Open Abundance

Offline-first PWA prototype for the new Abundance app.

## Current Iteration

`Offline Notes Pilot`

- One notes screen
- Local IndexedDB storage
- Offline create/edit/delete
- Sync queue
- PWA manifest
- Service worker shell cache

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Manual Check

1. Open the app online.
2. Create a note.
3. Turn the network off.
4. Reload/open the notes screen after the first visit.
5. Create or edit a note offline.
6. Turn the network on.
7. Press sync or wait for the app to sync.
8. Confirm note status changes to `synced`.
