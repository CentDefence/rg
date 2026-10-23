# Rill

Rill is a local-first music player preview with an Apple Music Web inspired interface. Your personal library starts empty; the Discover page can browse real independent music from Jamendo. It is a static browser application with no build step. Optional Google and email-link sign-in needs a Supabase project; see [AUTH-SETUP.md](./AUTH-SETUP.md).

## Run it

Open `index.html` in a modern browser, or serve this folder locally:

```powershell
cd outputs
python -m http.server 4173
```

Then visit `http://localhost:4173`. A local server gives the browser reliable access to IndexedDB and audio APIs.

## Features

- Add audio files from your device; audio and metadata stay in this browser profile.
- Import a folder of audio, review likely duplicate files, and keep the newest copy when desired.
- Create regular or smart playlists, like tracks, build a queue, and review local listening history.
- Paste lyrics or import `.lrc` files. Multiple timestamps per line, LRC offsets, manual sync correction, and seeking are supported.
- Crossfade between local tracks and see a live waveform or frequency spectrum while listening.
- Install Rill as a PWA. The app shell is cached for offline use, and imported audio remains in browser storage.
- See a live waveform or frequency spectrum while listening to local audio.
- Tune bass, midrange, and treble with the three-band equalizer.
- Customize the color theme, accent color, interface spacing, cover shape, text size, playback speed, and motion.
- Use a responsive mobile layout with safe-area spacing, a compact player, and touch-sized controls.
- Use keyboard shortcuts and the browser's media controls where supported.
- Browse artist profiles from Jamendo; manual artist-profile creation has been removed.
- Import a Spotify playlist link. Connect with a Spotify Client ID to show a compact, attributed track list for playlists you own or collaborate on; all playlists keep Spotify's official player for playback.
- Open lyrics from a playlist row. Jamendo may provide lyrics; add text or an LRC file for other tracks. Lyrics stay in this browser.
- Import from link (sidebar, `playlist-import.js`): paste a YouTube, YouTube Music or SoundCloud playlist link to get a song list with artwork, play it in the service's official player, and read synced lyrics from LRCLIB. Choose a new playlist or add to an existing import. YouTube needs a YouTube Data API v3 key: put it in `SITE_KEY` at the top of `playlist-import.js` and restrict it to your site's domain in Google Cloud. Spotify and Apple Music do not expose track lists for other people's playlists.
- Browse and search the Jamendo catalog, open artist profiles, inspect each track's Creative Commons license, and stream tracks in the Rill player. Jamendo results and artist metadata are cached in this browser for faster reloads.

The app does not add Jamendo tracks to your personal library automatically. You can discover them from Home or Explore and add them to playlists. A migration clears the previous preview's sample playlists, likes, history, and current track while keeping music files already imported by the user.

## Provider-backed features

Jamendo is connected in read-only mode with its documented test client ID. Replace it on Explore with an ID from your own Jamendo developer app before publishing. Track streams, artwork, and artist metadata are supplied by Jamendo; each track's license remains specific to that track. Jamendo results require an internet connection. Spotify track metadata uses Authorization Code with PKCE. Create a Spotify app, register the redirect URI shown in the playlist import dialog, and enter the app's Client ID there. Spotify's current development mode requires Premium for the app owner and limits the app to five authorized users. Playlists that are not owned or shared collaboratively remain available through Spotify's official embed, but their song metadata is not exposed to this view. Spotify playback stays in Spotify. Spotify metadata is cached in session storage for 15 minutes; lyrics you add are stored separately in Rill. Personalized radio, account data sync, social features, and offline catalog downloads need additional services. Google and email-link account sign-in are ready to connect once the Supabase and Google provider setup in [AUTH-SETUP.md](./AUTH-SETUP.md) is complete. Sign-in does not sync local audio or playlists yet.
