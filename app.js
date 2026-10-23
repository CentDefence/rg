(function () {
  'use strict';

  var DB_NAME = 'rill-local-library';
  var DB_VERSION = 1;
  var DB_STORE = 'uploads';
  var stateKey = 'rill-app-state-v1';
  var JAMENDO_TEST_CLIENT_ID = '709fa152';
  var palettes = ['moss', 'ochre', 'blue', 'rose', 'violet', 'sand', 'charcoal', 'teal'];
  var defaultSettings = { theme: 'light', accent: '#fa233b', density: 'comfortable', reducedMotion: false, autoplay: false, playbackRate: 1, crossfadeSeconds: 0, textSize: 'Standard', coverShape: 'square', waveformStyle: 'waveform', eqBass: 0, eqMid: 0, eqTreble: 0, eqPreset: 'flat', startPage: 'home', openQueueOnStart: true, rememberPosition: true, pauseWhenHidden: false, confirmDelete: true, defaultVolume: 72, sleepTimerMinutes: 0, showArtwork: true, compactRows: false, librarySort: 'recent', likedSort: 'recent', showHistoryOnLibrary: true, saveHistory: true, clearHistoryOnExit: false, highContrast: false, loadingDuration: 1500, contentWidth: 1440, sidebarWidth: 240, queueWidth: 310, playerHeight: 88, pagePadding: 32, coverRadius: 6, cardRadius: 8, buttonRadius: 8, rowHeight: 58, sectionSpacing: 28, textScale: 100, lineHeight: 1.5, iconSize: 18, albumColumns: 4, waveformHeight: 26, waveformLine: 1.6, waveformSensitivity: 85, analyserSmoothing: 78, seekStep: 5, volumeStep: 5, searchDelay: 120, historyLimit: 80, searchResultLimit: 50, fontWeight: 600, letterSpacing: 0, pageTitleSize: 28, sectionTitleSize: 16, trackTitleSize: 12, trackMetaSize: 10, coverSize: 42, modalWidth: 620, modalBackdrop: 55, hoverLift: 2, navFontSize: 12, playerControlSize: 34, buttonHeight: 34, searchFieldHeight: 42, playlistGridGap: 18, topbarHeight: 56, settingRowHeight: 58, queueRowHeight: 54, sidebarItemHeight: 37, lyricLineSize: 20, lyricLineGap: 10, analyserFftSize: 1024, showTrackNumbers: true, showAlbumColumn: true, showDurationColumn: true, showLikeButtons: true, showQueueCount: true, showVolumeControl: true, showLyricsControl: true, showPageDescriptions: true, showQueueArtwork: true, showShortcutHints: true };
  defaultSettings.meshBrightness = 0;
  var artists = [];
  var albums = [];
  var tracks = [];
  var jamendoTracks = [];
  var jamendoArtists = [];
  var jamendoLoading = false;
  var jamendoError = '';
  var jamendoStatusMessage = '';
  var jamendoRequestId = 0;
  var jamendoCallbackId = 0;
  var jamendoSearchSequence = 0;
  var jamendoArtistLoads = {};
  var jamendoArtistLoaded = {};
  var jamendoArtistSummariesLoaded = {};
  var defaultPlaylists = [];
  var saved = loadState();
  var needsEmptyCatalogMigration = !!(saved && saved.catalogVersion !== 2);
  var needsAppleStyleMigration = !!(saved && saved.uiStyleVersion !== 1);
  var needsLoadingDurationMigration = !!(saved && saved.settings && Number(saved.settings.loadingDuration) === 1180);
  var state = Object.assign({
    page: 'home', liked: [], following: [], playlists: defaultPlaylists, queue: [], currentId: null, catalogVersion: 2, uiStyleVersion: 1, lyrics: {}, jamendoClientId: JAMENDO_TEST_CLIENT_ID, jamendoTracks: [], jamendoArtists: [],
    elapsed: 0, playing: false, shuffle: false, repeat: 0, history: [], search: '', searchFilter: 'All', sleepTimerEndsAt: 0,
    collapsed: false, queueOpen: true, mobileNavOpen: false, volume: 72,
    settings: defaultSettings
  }, saved || {});
  if (!Array.isArray(state.playlists)) state.playlists = defaultPlaylists;
  if (!Array.isArray(state.queue)) state.queue = [];
  if (!Array.isArray(state.history)) state.history = [];
  if (!Array.isArray(state.liked)) state.liked = [];
  if (!Array.isArray(state.externalArtists)) state.externalArtists = [];
  if (!Array.isArray(state.externalPlaylists)) state.externalPlaylists = [];
  state.spotifyClientId = String(state.spotifyClientId || '').trim();
  if (!state.lyrics || typeof state.lyrics !== 'object') state.lyrics = {};
  if (!state.lyricOffsets || typeof state.lyricOffsets !== 'object') state.lyricOffsets = {};
  state.jamendoClientId = String(state.jamendoClientId || JAMENDO_TEST_CLIENT_ID).trim();
  jamendoTracks = Array.isArray(state.jamendoTracks) ? state.jamendoTracks.filter(function (track) { return track && track.kind === 'jamendo' && track.id; }) : [];
  jamendoArtists = Array.isArray(state.jamendoArtists) ? state.jamendoArtists.filter(function (artist) { return artist && artist.id && String(artist.id).indexOf('jamendo-') === 0; }) : [];
  if (!state.settings) state.settings = {};
  state.settings = Object.assign({}, defaultSettings, state.settings);
  if (state.settings.meshBrightness == null) state.settings.meshBrightness = 0;
  if (needsLoadingDurationMigration) state.settings.loadingDuration = 1500;
  if (needsEmptyCatalogMigration) { state.playlists = []; state.liked = []; state.following = []; state.queue = []; state.history = []; state.currentId = null; state.sessionIds = []; state.elapsed = 0; state.playing = false; state.lyrics = {}; state.search = ''; state.searchFilter = 'All'; state.catalogVersion = 2; if (state.settings.accent === '#c9d8aa') state.settings.accent = '#1ed760'; }
  if (needsAppleStyleMigration) { if (state.settings.theme === 'dark' && ['#1ed760','#c9d8aa'].indexOf(state.settings.accent.toLowerCase()) >= 0) { state.settings.theme = 'light'; state.settings.accent = '#fa233b'; } state.uiStyleVersion = 1; }

  var localTracks = [];
  var spotifyPlaylistCache = Object.create(null);
  var spotifyPlaylistLoads = Object.create(null);
  var playlistSearch = '';
  var playlistSort = 'recent';
  var selectedSettings = 'general';
  var settingsQuery = '';
  var pausedByVisibility = false;
  var searchTimer = null;
  var audioElement = new Audio();
  audioElement.preload = 'metadata';
  audioElement.volume = Number(state.volume || 72) / 100;
  var audioContext = null;
  var masterGain = null;
  var analyserNode = null;
  var mediaElementSource = null;
  var eqFilters = [];
  var frequencyData = null;
  var timeData = null;
  var signalSeen = false;
  var lastActiveLyricIndex = -2;
  var editingLyricsId = '';
  var activeOscillators = [];
  var synthStartedAt = 0;
  var synthOffset = 0;
  var animationFrame = 0;
  var activeObjectUrl = null;
  var secondaryObjectUrl = null;
  var secondaryAudioElement = new Audio();
  secondaryAudioElement.preload = 'metadata';
  secondaryAudioElement.volume = 0;
  var secondaryMediaElementSource = null;
  var crossfadeState = null;
  var crossfadeTimer = 0;
  var crossfadeRequest = 0;
  var crossfadePendingId = '';
  var deferredInstallPrompt = null;
  var authClient = null;
  var authUser = null;
  var authDisplayName = '';
  var draggedQueueIndex = -1;
  var draggedPlaylistRow = null;
  var sleepTimerHandle = 0;

  function loadState() { try { return JSON.parse(localStorage.getItem(stateKey) || 'null'); } catch (e) { return null; } }
  function persist() { try { localStorage.setItem(stateKey, JSON.stringify(state)); } catch (e) { toast('Browser storage is full. Some changes may not persist.'); } }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(id) { return '<svg aria-hidden="true"><use href="#i-' + id + '"/></svg>'; }
  function externalArtistById(id) { return (state.externalArtists || []).find(function (a) { return a.id === id; }) || null; }
  function jamendoArtistById(id) { return jamendoArtists.find(function (artist) { return artist.id === id; }) || null; }
  function artistById(id) { return artists.find(function (a) { return a.id === id; }) || jamendoArtistById(id) || externalArtistById(id) || { id: 'local', name: 'Local upload', genre: 'Your library', initials: '♪', tint: '#64735c', image: 'linear-gradient(120deg,#69785c,#242b24)', bio: 'A track from your local collection.' }; }
  function albumById(id) { return albums.find(function (a) { return a.id === id; }) || null; }
  function allTracks() { return tracks.concat(localTracks, jamendoTracks); }
  function spotifyTrackById(id) {
    var keys = Object.keys(spotifyPlaylistCache);
    for (var i = 0; i < keys.length; i++) {
      var playlist = spotifyPlaylistCache[keys[i]];
      var found = playlist && (playlist.tracks || []).find(function (track) { return track.id === id; });
      if (found) return found;
    }
    return null;
  }
  function trackById(id) { return allTracks().find(function (t) { return t.id === id; }) || spotifyTrackById(id) || null; }
  function trackArtistLabel(track) { return track && track.artistNames && track.artistNames.length ? track.artistNames.join(', ') : artistName(track && track.artistId); }
  function albumTracks(id) { return allTracks().filter(function (t) { return t.albumId === id; }); }
  function playlistById(id) { return state.playlists.find(function (p) { return p.id === id; }) || null; }
  function fmt(seconds) { seconds = Math.max(0, Math.floor(Number(seconds) || 0)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
  function cover(t, extra) { var c = (t && t.cover) || 'charcoal'; var symbol = esc((t && t.symbol) || '◌'); var label = esc((t && t.label) || 'RILL / LISTENING NOTES'); var art = t && safeHttpsUrl(t.image) ? '<img class="cover-art" src="' + esc(safeHttpsUrl(t.image)) + '" alt="" loading="lazy">' : ''; return '<div class="cover ' + (extra || '') + (art ? ' cover-photo' : '') + '" data-cover="' + esc(c) + '">' + art + '<span class="cover-symbol">' + symbol + '</span><span class="cover-label">' + label + '</span></div>'; }
  function artistName(id) { return artistById(id).name; }
  function albumTitle(id) { var a = albumById(id); return a ? a.title : 'Local files'; }
  function displayDuration(t) { return fmt(t && t.duration ? t.duration : 0); }
  function toast(message) { var region = document.getElementById('toastRegion'); if (!region) return; var item = document.createElement('div'); item.className = 'toast'; item.innerHTML = '<span class="toast-dot"></span>' + esc(message); region.appendChild(item); setTimeout(function () { item.classList.add('fade'); setTimeout(function () { item.remove(); }, 270); }, 2600); }
  function nav(page) { state.mobileNavOpen = false; setShell(); location.hash = page; }
  function currentRoute() { var raw = decodeURIComponent(location.hash.replace(/^#/, '') || 'home'); var parts = raw.split('/'); return { page: parts[0], id: parts[1] || null, sub: parts[2] || null }; }
  function setTheme() {
    var body = document.body; var accent = state.settings.accent || '#1ed760';
    body.classList.remove('theme-light', 'theme-oled', 'theme-graphite');
    if (state.settings.theme === 'light') body.classList.add('theme-light');
    if (state.settings.theme === 'oled') body.classList.add('theme-oled');
    if (state.settings.theme === 'graphite') body.classList.add('theme-graphite');
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-strong', accent);
    document.documentElement.style.setProperty('--accent-ink', '#ffffff');
    document.documentElement.style.setProperty('--user-accent', accent);
    document.documentElement.style.setProperty('--user-accent-strong', accent);
    document.documentElement.style.setProperty('--user-accent-ink', '#ffffff');
    var themeColor = document.querySelector('meta[name="theme-color"]'); if (themeColor) themeColor.content = state.settings.theme === 'light' ? '#ffffff' : state.settings.theme === 'oled' ? '#000000' : '#1c1c1e';
    document.documentElement.style.setProperty('--ease', state.settings.reducedMotion ? 'linear' : 'cubic-bezier(.22,.61,.36,1)');
    body.dataset.density = state.settings.density || 'comfortable';
    body.dataset.coverShape = state.settings.coverShape || 'square';
    body.dataset.waveformStyle = state.settings.waveformStyle || 'waveform';
    body.classList.toggle('text-large', state.settings.textSize === 'Large');
    body.classList.toggle('text-small', state.settings.textSize === 'Small');
    body.classList.toggle('reduce-motion', !!state.settings.reducedMotion);
    body.classList.toggle('high-contrast', !!state.settings.highContrast);
    body.classList.toggle('compact-rows', !!state.settings.compactRows);
    body.classList.toggle('artwork-hidden', state.settings.showArtwork === false);
    ['showTrackNumbers','showAlbumColumn','showDurationColumn','showLikeButtons','showQueueCount','showVolumeControl','showLyricsControl','showPageDescriptions','showQueueArtwork','showShortcutHints'].forEach(function (key) { body.dataset[key] = String(state.settings[key] !== false); });
    applyFineTuning();
    applyEqualizer();
  }
  function applyFineTuning() {
    var root = document.documentElement;
    var pxVars = { contentWidth:'content-width', sidebarWidth:'sidebar-width', queueWidth:'queue-width', playerHeight:'player-height', pagePadding:'page-padding', coverRadius:'cover-radius', cardRadius:'card-radius', buttonRadius:'button-radius', rowHeight:'row-height', sectionSpacing:'section-spacing', iconSize:'icon-size', albumColumns:'album-columns', waveformHeight:'waveform-height', waveformLine:'waveform-line', modalWidth:'modal-width', hoverLift:'hover-lift', navFontSize:'nav-font-size', playerControlSize:'player-control-size', buttonHeight:'button-height', searchFieldHeight:'search-field-height', playlistGridGap:'playlist-grid-gap', topbarHeight:'topbar-height', settingRowHeight:'setting-row-height', queueRowHeight:'queue-row-height', sidebarItemHeight:'sidebar-item-height', lyricLineSize:'lyric-line-size', lyricLineGap:'lyric-line-gap', pageTitleSize:'page-title-size', sectionTitleSize:'section-title-size', trackTitleSize:'track-title-size', trackMetaSize:'track-meta-size', coverSize:'cover-size', waveformSensitivity:'waveform-sensitivity' };
    Object.keys(pxVars).forEach(function (key) { root.style.setProperty('--custom-' + pxVars[key], String(Number(state.settings[key]) || 0) + (key === 'albumColumns' ? '' : 'px')); });
    root.style.setProperty('--custom-text-scale', String((Number(state.settings.textScale) || 100) / 100));
    root.style.setProperty('--custom-line-height', String(Number(state.settings.lineHeight) || 1.5));
    root.style.setProperty('--custom-modal-backdrop', String(Math.max(0, Math.min(90, Number(state.settings.modalBackdrop) || 0)) / 100));
    root.style.setProperty('--custom-font-weight', String(Number(state.settings.fontWeight) || 600));
    root.style.setProperty('--custom-letter-spacing', String((Number(state.settings.letterSpacing) || 0) / 1000) + 'em');
    root.style.setProperty('--custom-analyser-smoothing', String(Math.max(.1, Math.min(.95, (Number(state.settings.analyserSmoothing) || 78) / 100))));
    root.style.setProperty('--custom-mesh-brightness', String(Math.max(0, Math.min(100, Number(state.settings.meshBrightness) || 0)) / 6) + '%');
    var body = document.body;
    if (analyserNode) {
      var fftSize = Math.max(256, Math.min(4096, Number(state.settings.analyserFftSize) || 1024));
      if (analyserNode.fftSize !== fftSize) { analyserNode.fftSize = fftSize; frequencyData = new Uint8Array(analyserNode.frequencyBinCount); timeData = new Uint8Array(analyserNode.fftSize); timeData.fill(128); }
      analyserNode.smoothingTimeConstant = Number(root.style.getPropertyValue('--custom-analyser-smoothing'));
    }
    if (body) body.dataset.waveformSensitivity = String(Math.max(.2, Math.min(1.5, (Number(state.settings.waveformSensitivity) || 85) / 100)));
  }
  function setShell() { var shell = document.getElementById('appShell'); shell.classList.toggle('sidebar-collapsed', !!state.collapsed); shell.classList.toggle('queue-hidden', !state.queueOpen); shell.classList.toggle('mobile-nav-open', !!state.mobileNavOpen); var menu = document.querySelector('.mobile-menu'); if (menu) { menu.setAttribute('aria-label', state.mobileNavOpen ? 'Close navigation' : 'Open navigation'); menu.title = state.mobileNavOpen ? 'Close navigation' : 'Navigation'; } document.querySelectorAll('[data-action="queue"]').forEach(function (item) { item.setAttribute('aria-label', state.queueOpen ? 'Close queue' : 'Open queue'); item.title = state.queueOpen ? 'Close queue' : 'Queue'; }); }
  function openQueue() { state.queueOpen = true; persist(); setShell(); }
  function safeTracks(ids) { return (ids || []).map(trackById).filter(Boolean); }
  function playlistTracks(playlist) {
    if (!playlist) return [];
    if (!playlist.smart) return safeTracks(playlist.trackIds || []);
    var list = allTracks(); var smart = playlist.smart; var played = state.history || [];
    if (smart.criteria === 'liked') list = safeTracks(state.liked || []);
    else if (smart.criteria === 'recent-played') list = safeTracks(played);
    else if (smart.criteria === 'added-week') list = list.filter(function (t) { return Date.now() - Number(t.created || 0) <= 7 * 86400000; });
    else if (smart.criteria === 'unplayed') list = list.filter(function (t) { return played.indexOf(t.id) < 0; });
    else if (smart.criteria === 'short') list = list.filter(function (t) { return t.duration > 0 && t.duration < 180; });
    else if (smart.criteria === 'long') list = list.filter(function (t) { return t.duration >= 300; });
    if (smart.criteria === 'recent-played') {
      var order = {}; played.forEach(function (id, index) { if (order[id] == null) order[id] = index; });
      list.sort(function (a, b) { return order[a.id] - order[b.id]; });
    } else if (smart.sort === 'title') list.sort(function (a, b) { return a.title.localeCompare(b.title); });
    else if (smart.sort === 'oldest') list.sort(function (a, b) { return Number(a.created || 0) - Number(b.created || 0); });
    else list.sort(function (a, b) { return Number(b.created || 0) - Number(a.created || 0); });
    return list.slice(0, Math.max(1, Math.min(500, Number(smart.limit) || 100)));
  }
  function audioSrcTrack(t) { return !!(t && (t.kind === 'upload' || t.kind === 'jamendo')); }
  function allIds() { return allTracks().map(function (t) { return t.id; }); }
  function addToHistory(id) { if (state.settings.saveHistory === false) return; state.history = [id].concat((state.history || []).filter(function (x) { return x !== id; })).slice(0, Math.max(10, Number(state.settings.historyLimit) || 80)); }
  function sortTracks(items, mode) {
    var sorted = items.slice();
    if (mode === 'title') sorted.sort(function (a, b) { return a.title.localeCompare(b.title); });
    else if (mode === 'artist') sorted.sort(function (a, b) { return artistName(a.artistId).localeCompare(artistName(b.artistId)) || a.title.localeCompare(b.title); });
    return sorted;
  }

  function sectionHead(title, subtitle, action, actionText) {
    return '<div class="section-head"><div><h2>' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div>' + (action ? '<button class="link-button" data-page="' + esc(action) + '">' + esc(actionText || 'See all') + icon('arrow') + '</button>' : '') + '</div>';
  }
  function albumCard(a) {
    var artist = artistById(a.artistId); var first = albumTracks(a.id)[0];
    return '<article class="album-card" data-album="' + esc(a.id) + '">' + cover(a) + (first ? '<button class="inline-play" data-action="play-album" data-id="' + esc(a.id) + '" aria-label="Play ' + esc(a.title) + '">' + icon('play') + '</button>' : '') + '<h3>' + esc(a.title) + '</h3><p>' + esc(artist.name) + ' · ' + esc(a.year) + '</p></article>';
  }
  function artistCard(a) { var portrait = safeHttpsUrl(a.image) ? '<img class="artist-portrait" src="' + esc(safeHttpsUrl(a.image)) + '" alt="" loading="lazy">' : '<span class="artist-portrait" style="--portrait:' + esc(a.tint || '#41463d') + '">' + esc(a.initials || String(a.name || '♪').slice(0, 1).toUpperCase()) + '</span>'; return '<div class="artist-row" data-artist="' + esc(a.id) + '">' + portrait + '<span><b>' + esc(a.name) + '</b><small>' + esc(a.genre || 'Artist profile') + '</small></span><button class="follow-button ' + (state.following.indexOf(a.id) >= 0 ? 'following' : '') + '" data-action="follow" data-id="' + esc(a.id) + '">' + (state.following.indexOf(a.id) >= 0 ? 'Following' : 'Follow') + '</button></div>'; }
  function trackTable(items, options) {
    options = options || {}; if (!items.length) return emptyState('No tracks here yet', options.emptyText || 'Add tracks to start building your listening space.', options.emptyAction || 'explore', 'Explore music', 'disc');
    return '<table class="track-table"><thead><tr><th>#</th><th>Title</th><th>Album</th><th></th><th>Time</th></tr></thead><tbody>' + items.map(function (t, i) {
      var playing = state.currentId === t.id && state.playing; var liked = state.liked.indexOf(t.id) >= 0; var tag = t.kind === 'upload' ? '<span class="tag local">Local</span>' : t.kind === 'jamendo' ? '<span class="tag jamendo">Jamendo</span>' : '<span class="tag demo">Studio demo</span>';
      var lyricButton = options.showLyrics ? '<button class="row-lyrics ' + ((state.lyrics[t.id] || t.lyrics) ? 'has-lyrics' : '') + '" data-action="open-track-lyrics" data-id="' + esc(t.id) + '" aria-label="Open lyrics for ' + esc(t.title) + '" title="Lyrics">' + icon('mic') + '</button>' : '';
      return '<tr data-row-track="' + esc(t.id) + '" data-session-ids="' + esc(items.map(function (x) { return x.id; }).join(',')) + '"' + (options.playlistId ? ' draggable="true" data-playlist-index="' + i + '" data-playlist-id="' + esc(options.playlistId) + '"' : '') + ' class="' + (playing ? 'is-playing' : '') + '"><td class="track-index">' + (playing ? '♫' : String(i + 1).padStart(2, '0')) + '</td><td><div class="track-title-cell">' + cover(t, 'small-cover') + '<span class="track-title"><b>' + esc(t.title) + '</b><small>' + esc(trackArtistLabel(t)) + (options.showTag ? ' · ' + tag : '') + '</small></span></div></td><td>' + esc(t.albumName || albumTitle(t.albumId)) + '</td><td><div class="row-tools">' + lyricButton + '<button class="row-like ' + (liked ? 'liked' : '') + '" data-action="like-track" data-id="' + esc(t.id) + '" aria-label="' + (liked ? 'Unlike' : 'Like') + ' ' + esc(t.title) + '">' + icon('heart') + '</button></div></td><td class="duration"><div class="track-actions"><span>' + displayDuration(t) + '</span><button class="quiet-button" data-action="track-menu" data-id="' + esc(t.id) + '" aria-label="More options for ' + esc(t.title) + '">' + icon('more') + '</button></div></td></tr>';
    }).join('') + '</tbody></table>';
  }
  function emptyState(title, text, page, label, iconName) { return '<div class="empty-state"><div class="empty-icon">' + icon(iconName || 'disc') + '</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (page ? '<button class="button small" data-page="' + esc(page) + '">' + esc(label || 'Take a look') + '</button>' : '') + '</div>'; }
  function pageHead(eyebrow, title, subtitle, actions) { return '<div class="page-head"><div><span class="eyebrow">' + esc(eyebrow) + '</span><h1>' + esc(title) + '</h1>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div>' + (actions ? '<div class="head-actions">' + actions + '</div>' : '') + '</div>'; }
  function jamendoArtistId(value) { var id = String(value || '').replace(/\D/g, ''); return id ? 'jamendo-' + id : ''; }
  function mergeJamendoArtist(row) {
    if (!row) return null;
    var id = jamendoArtistId(row.id || row.artist_id); if (!id) return null;
    var existing = jamendoArtistById(id) || {};
    var artist = Object.assign({}, existing, { id: id, apiId: id.slice(8), name: row.name || row.artist_name || existing.name || 'Independent artist', image: safeHttpsUrl(row.image || row.artist_image || existing.image), genre: row.genre || existing.genre || 'Independent artist', bio: row.bio || row.short_description || existing.bio || 'Independent music from Jamendo.', website: safeHttpsUrl(row.website || existing.website), jamendoUrl: 'https://www.jamendo.com/artist/' + id.slice(8) });
    var index = jamendoArtists.findIndex(function (item) { return item.id === id; });
    if (index < 0) jamendoArtists.unshift(artist); else jamendoArtists[index] = artist;
    jamendoArtists = jamendoArtists.slice(0, 100); state.jamendoArtists = jamendoArtists;
    return artist;
  }
  function normalizeJamendoTrack(row) {
    var numericId = String(row && row.id || '').replace(/\D/g, '');
    if (!numericId || !row.name) return null;
    var artistId = jamendoArtistId(row.artist_id); if (!artistId) return null;
    mergeJamendoArtist({ id: row.artist_id, name: row.artist_name, image: row.artist_image });
    var musicInfo = row.musicinfo || {}; var tags = musicInfo.tags || {}; var genres = tags.genres || tags.genre || [];
    if (!Array.isArray(genres)) genres = genres ? [genres] : [];
    var genre = genres.map(function (item) { return typeof item === 'string' ? item : item && (item.name || item.tag); }).filter(Boolean)[0] || '';
    var license = String(row.license_ccurl || row.license_url || '').replace(/^http:/i, 'https:');
    if (!/^https:\/\/creativecommons\.org\//i.test(license)) license = '';
    return { id: 'jm-' + numericId, apiId: numericId, kind: 'jamendo', source: 'Jamendo', title: String(row.name), artistId: artistId, albumId: null, albumName: String(row.album_name || ''), releaseDate: String(row.releasedate || ''), duration: Math.max(0, Number(row.duration) || 0), image: safeHttpsUrl(row.image || row.album_image), audio: safeHttpsUrl(row.audio), genre: genre, mood: genre.toLowerCase(), lyrics: typeof row.lyrics === 'string' ? row.lyrics : '', licenseUrl: license, jamendoUrl: 'https://www.jamendo.com/track/' + numericId, label: 'JAMENDO / INDEPENDENT MUSIC', cover: 'charcoal', symbol: '♪' };
  }
  function cacheJamendoTracks(rows) {
    var incoming = (rows || []).map(normalizeJamendoTrack).filter(function (track) { return !!(track && track.audio); });
    var byId = {};
    incoming.concat(jamendoTracks).forEach(function (track) { if (track && track.id && !byId[track.id]) byId[track.id] = track; });
    jamendoTracks = incoming.concat(jamendoTracks.filter(function (track) { return !byId[track.id] || byId[track.id] === track; })).filter(function (track, index, list) { return list.findIndex(function (item) { return item.id === track.id; }) === index; }).slice(0, 120);
    state.jamendoTracks = jamendoTracks; state.jamendoArtists = jamendoArtists; persist();
    var artistIds = incoming.map(function (track) { return track.artistId; });
    loadJamendoArtistSummaries(artistIds);
    return incoming;
  }
  function jamendoApi(path, params) {
    if (!state.jamendoClientId) return Promise.reject(new Error('Add a Jamendo client ID to browse music.'));
    return new Promise(function (resolve, reject) {
      var query = new URLSearchParams(); query.set('client_id', state.jamendoClientId); query.set('format', 'json');
      Object.keys(params || {}).forEach(function (key) { if (params[key] != null && params[key] !== '') query.set(key, String(params[key])); });
      var callbackName = '__rillJamendo' + (++jamendoCallbackId); var script = document.createElement('script'); var settled = false; var timeout = window.setTimeout(function () { finish(new Error('Jamendo took too long to respond.')); }, 12000);
      function finish(error, result) { if (settled) return; settled = true; window.clearTimeout(timeout); script.onerror = null; if (script.parentNode) script.parentNode.removeChild(script); try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; } if (error) reject(error); else resolve(result); }
      window[callbackName] = function (data) { if (!data || !data.headers || data.headers.status !== 'success') { finish(new Error(data && data.headers && data.headers.error_message || 'Jamendo could not return music.')); return; } finish(null, data.results || []); };
      query.set('callback', callbackName); script.async = true; script.src = 'https://api.jamendo.com/v3.0/' + path + '/?' + query.toString(); script.onerror = function () { finish(new Error('Could not reach Jamendo. Check the connection and try again.')); }; document.head.appendChild(script);
    });
  }
  function loadJamendoArtistSummaries(ids) {
    var unique = Array.from(new Set((ids || []).filter(function (id) { return id && !jamendoArtistSummariesLoaded[id]; })));
    if (!unique.length) return Promise.resolve([]);
    unique.forEach(function (id) { jamendoArtistSummariesLoaded[id] = true; });
    return jamendoApi('artists', { id: unique.map(function (id) { return id.slice(8); }).join(' '), limit: Math.min(unique.length, 50) }).then(function (rows) {
      rows.forEach(mergeJamendoArtist); state.jamendoArtists = jamendoArtists; persist();
      if (currentRoute().page === 'explore' || currentRoute().page === 'artists') renderPage(); else if (currentRoute().page === 'search') refreshSearchContent();
      return rows;
    }).catch(function () { unique.forEach(function (id) { jamendoArtistSummariesLoaded[id] = false; }); return []; });
  }
  function jamendoStatusMarkup() {
    var text = jamendoError || (jamendoLoading ? 'Finding independent music on Jamendo…' : jamendoTracks.length ? jamendoTracks.length + ' tracks ready to play · Jamendo catalog' : 'Loading music from Jamendo…');
    return '<p class="jamendo-status' + (jamendoError ? ' is-error' : '') + '" id="jamendoStatus" aria-live="polite">' + esc(jamendoStatusMessage || text) + '</p>';
  }
  function setJamendoStatus(message, isError) {
    jamendoStatusMessage = message;
    var status = document.getElementById('jamendoStatus');
    if (status) { status.textContent = message; status.classList.toggle('is-error', !!isError); }
    var searchStatus = document.getElementById('jamendoSearchStatus');
    if (searchStatus) { searchStatus.textContent = message; searchStatus.classList.toggle('is-error', !!isError); }
  }
  function refreshSearchContent() {
    var host = document.getElementById('searchResults'); if (!host) return;
    var temp = document.createElement('div'); temp.innerHTML = renderSearchPage(); var updated = temp.querySelector('#searchResults');
    if (updated) host.innerHTML = updated.innerHTML;
    var status = document.getElementById('jamendoSearchStatus'); var nextStatus = temp.querySelector('#jamendoSearchStatus');
    if (status && nextStatus) { status.textContent = nextStatus.textContent; status.classList.toggle('is-error', nextStatus.classList.contains('is-error')); }
    var clear = document.querySelector('[data-action="clear-search"]'); if (clear) clear.hidden = !state.search;
  }
  function searchJamendo(query) {
    query = String(query || '').trim(); var sequence = ++jamendoSearchSequence;
    if (query.length < 2) { jamendoLoading = false; jamendoError = ''; setJamendoStatus(jamendoTracks.length + ' tracks ready to play · Jamendo catalog'); return Promise.resolve([]); }
    jamendoLoading = true; jamendoError = ''; setJamendoStatus('Searching Jamendo for “' + query + '”…');
    return jamendoApi('tracks', { search: query, limit: 24, audioformat: 'mp32', imagesize: 200, include: 'musicinfo licenses lyrics', type: 'single albumtrack' }).then(function (rows) {
      if (sequence !== jamendoSearchSequence) return [];
      var results = cacheJamendoTracks(rows); jamendoLoading = false; jamendoError = '';
      setJamendoStatus(results.length ? results.length + ' Jamendo tracks found for “' + query + '”.' : 'No Jamendo tracks found for “' + query + '”. Try another search.');
      refreshSearchContent(); if (currentRoute().page === 'explore') renderPage(); return results;
    }).catch(function (error) {
      if (sequence !== jamendoSearchSequence) return [];
      jamendoLoading = false; jamendoError = error.message || 'Jamendo search failed.'; setJamendoStatus(jamendoError, true); refreshSearchContent(); if (currentRoute().page === 'explore') renderPage(); return [];
    });
  }
  var jamendoFeaturedPromise = null;
  function loadJamendoFeatured(force) {
    if (jamendoFeaturedPromise) return jamendoFeaturedPromise;
    if (jamendoTracks.length && !force) return Promise.resolve(jamendoTracks);
    jamendoLoading = true; jamendoError = ''; setJamendoStatus('Loading independent artists and tracks…');
    var params = { featured: 1, limit: 24, boost: 'popularity_month', groupby: 'artist_id', audioformat: 'mp32', imagesize: 200, include: 'musicinfo licenses lyrics', type: 'single albumtrack' };
    jamendoFeaturedPromise = jamendoApi('tracks', params).then(function (rows) {
      if (!rows.length) return jamendoApi('tracks', { limit: 24, order: 'popularity_month', audioformat: 'mp32', imagesize: 200, include: 'musicinfo licenses lyrics', type: 'single albumtrack' });
      return rows;
    }).then(function (rows) {
      cacheJamendoTracks(rows); jamendoLoading = false; jamendoError = ''; jamendoFeaturedPromise = null;
      setJamendoStatus(jamendoTracks.length + ' tracks ready to play · Jamendo catalog');
      if (['home','explore','charts','new-releases','artists'].indexOf(currentRoute().page) >= 0) renderPage();
      return jamendoTracks;
    }).catch(function (error) {
      jamendoLoading = false; jamendoFeaturedPromise = null; jamendoError = error.message || 'Jamendo catalog could not be loaded.'; setJamendoStatus(jamendoError, true);
      if (['home','explore','charts','new-releases','artists'].indexOf(currentRoute().page) >= 0) renderPage(); return [];
    });
    return jamendoFeaturedPromise;
  }
  function ensureJamendoArtistTracks(id) {
    var artist = jamendoArtistById(id); if (!artist || jamendoArtistLoaded[id]) return Promise.resolve(artist);
    if (jamendoArtistLoads[id]) return jamendoArtistLoads[id];
    jamendoArtistLoads[id] = jamendoApi('artists/tracks', { id: artist.apiId || id.slice(8), limit: 24, audioformat: 'mp32', imagesize: 200, include: 'musicinfo licenses lyrics', track_type: 'single albumtrack' }).then(function (rows) {
      var result = rows[0]; if (result) { mergeJamendoArtist(result); jamendoArtistSummariesLoaded[id] = true; cacheJamendoTracks((result.tracks || []).map(function (track) { return Object.assign({}, track, { artist_id: track.artist_id || result.id, artist_name: track.artist_name || result.name, artist_image: track.artist_image || result.image }); })); }
      jamendoArtistLoaded[id] = true; delete jamendoArtistLoads[id];
      if (currentRoute().page === 'artist' && currentRoute().id === id) renderPage(); return jamendoArtistById(id);
    }).catch(function () { jamendoArtistLoaded[id] = true; delete jamendoArtistLoads[id]; return artist; });
    return jamendoArtistLoads[id];
  }
  function pageHome() {
    var library = tracks.concat(localTracks); var recent = safeTracks(state.history.slice(0, 8));
    return pageHead('YOUR MUSIC', 'Home', 'Your library, ready when you are.', '<button class="button primary" data-action="pick-files">' + icon('plus') + ' Add music</button>') +
      (recent.length ? '<section class="section" style="margin-top:0">' + sectionHead('Recently played', null, 'history') + trackTable(recent) + '</section>' : '') +
      (library.length ? '<section class="section" style="margin-top:24px">' + sectionHead('Your music', library.length + (library.length === 1 ? ' track on this device' : ' tracks on this device'), 'uploads', 'Manage files') + trackTable(library.slice(0, 12), { showTag: true }) + '</section>' : '<div class="home-empty"><div class="home-empty-icon">' + icon('library') + '</div><h2>Your library is empty</h2><p>Add audio files from your device to start listening. They stay in this browser.</p><div class="home-empty-actions"><button class="button primary" data-action="pick-files">' + icon('plus') + ' Choose music</button><button class="button" data-action="new-playlist">Create playlist</button></div></div>') +
      (jamendoTracks.length ? '<section class="section jamendo-home-section">' + sectionHead('Independent music', 'From Jamendo · ' + jamendoTracks.length + ' tracks', 'explore', 'Browse all') + trackTable(jamendoTracks.slice(0, 8), { showTag: true }) + '</section>' : '<section class="section jamendo-home-section"><div class="info-banner"><strong>Discover independent music.</strong> Browse and play songs from Jamendo in Explore.</div><button class="button small" data-page="explore">Explore Jamendo music ' + icon('arrow') + '</button></section>') +
      (state.playlists.length ? '<section class="section">' + sectionHead('Your playlists', null, 'playlists') + '<div class="album-grid">' + state.playlists.slice(0, 5).map(playlistCard).join('') + '</div></section>' : '');
  }
  function moodCards() {
    var moods = [{ name: 'A softer morning', key: 'calm', color: 'linear-gradient(130deg,#58664f,#30372d)' }, { name: 'Clear the desk', key: 'focus', color: 'linear-gradient(130deg,#52666c,#303b3b)' }, { name: 'Take the long way', key: 'easy', color: 'linear-gradient(130deg,#876f53,#48463a)' }, { name: 'After the lights', key: 'late', color: 'linear-gradient(130deg,#655c74,#37343f)' }];
    return '<div class="mood-grid">' + moods.map(function (m) { return '<button class="mood-card" style="--mood:' + m.color + '" data-action="mood" data-id="' + m.key + '"><b>' + esc(m.name) + '</b><small>Studio picks · ' + allTracks().filter(function (t) { return t.mood === m.key; }).length + ' tracks</small></button>'; }).join('') + '</div>';
  }
  function playlistArtwork(list, size) {
    var images = []; (list || []).forEach(function (track) { var image = safeHttpsUrl(track && track.image); if (image && images.indexOf(image) < 0 && images.length < 4) images.push(image); });
    if (images.length === 1) return '<div class="playlist-artwork' + (size ? ' ' + esc(size) : '') + '" aria-hidden="true"><span class="playlist-art-single"><img src="' + esc(images[0]) + '" alt="" loading="lazy"></span></div>';
    var cells = '';
    for (var i = 0; i < 4; i++) cells += images[i] ? '<span><img src="' + esc(images[i]) + '" alt="" loading="lazy"></span>' : '<span class="playlist-art-blank">' + (list && list.length ? '♪' : '') + '</span>';
    return '<div class="playlist-artwork' + (size ? ' ' + esc(size) : '') + '" aria-hidden="true">' + cells + '</div>';
  }
  function playlistCard(p) {
    var list = playlistTracks(p); var ids = list.map(function (t) { return t.id; });
    return '<article class="playlist-tile"><a class="playlist-tile-link" href="#playlist/' + encodeURIComponent(p.id) + '" data-page="playlist/' + esc(p.id) + '">' + playlistArtwork(list) + '<span class="playlist-tile-copy"><b>' + esc(p.name) + '</b><small>' + (p.smart ? 'Smart list · ' : '') + list.length + (list.length === 1 ? ' song' : ' songs') + ' · ' + esc(p.privacy || 'Private') + '</small></span></a><button class="playlist-tile-play" data-action="play-list" data-ids="' + esc(ids.join(',')) + '" aria-label="Play ' + esc(p.name) + '" title="Play playlist">' + icon('play') + '</button></article>';
  }
  function pageExplore() {
    var library = tracks.concat(localTracks); var clientId = state.jamendoClientId || '';
    var artistRows = jamendoArtists.slice(0, 8);
    return pageHead('DISCOVER MUSIC', 'Explore', 'Independent artists and music you can play right here.', '<button class="button small" data-action="refresh-jamendo">Refresh catalog</button><button class="button primary" data-action="pick-files">' + icon('plus') + ' Add local music</button>') +
      '<section class="jamendo-catalog"><div class="jamendo-catalog-head"><div><span class="eyebrow">CONNECTED CATALOG</span><h2>Jamendo</h2><p>Discover independent artists, listen to full tracks, and open each track’s license.</p></div><a class="jamendo-wordmark" href="https://www.jamendo.com/" target="_blank" rel="noopener noreferrer">jamendo ↗</a></div>' +
      '<form class="jamendo-search-form" data-form="jamendo-search"><label class="search-box">' + icon('search') + '<input id="jamendoExploreSearch" name="query" type="search" autocomplete="off" placeholder="Search songs or artists" value="' + esc(state.jamendoQuery || '') + '"></label><button class="button primary" type="submit">Search</button></form>' +
      jamendoStatusMarkup() +
      '<details class="jamendo-api-settings"><summary>Catalog connection</summary><div class="jamendo-api-settings-body"><div class="info-banner">Rill uses Jamendo’s public read API. The current ID is for preview testing; register your own application before publishing the site.</div><div class="jamendo-client-row"><label class="field"><span>Jamendo client ID</span><input id="jamendoClientIdInput" type="text" inputmode="text" autocomplete="off" spellcheck="false" value="' + esc(clientId) + '" placeholder="Paste your client ID"></label><button class="button small" data-action="save-jamendo-id">Save ID</button></div><a href="https://developer.jamendo.com/v3.0/authentication" target="_blank" rel="noopener noreferrer">Get a client ID on Jamendo Developer Portal ↗</a></div></details>' +
      (artistRows.length ? '<section class="section jamendo-artists-section"><div class="section-head"><div><h2>Artists</h2><p>Profiles from Jamendo</p></div><button class="link-button" data-page="artists">See all ' + icon('arrow') + '</button></div><div class="artist-list jamendo-artist-list">' + artistRows.map(artistCard).join('') + '</div></section>' : '') +
      '<section class="section jamendo-tracks-section"><div class="section-head"><div><h2>Featured tracks</h2><p>Streamed from Jamendo · track availability follows its license</p></div></div>' + (jamendoTracks.length ? trackTable(jamendoTracks.slice(0, 36), { showTag: true }) : jamendoLoading ? '<div class="empty-state"><h3>Loading Jamendo catalog</h3><p>Fetching independent tracks and artist details.</p></div>' : emptyState('Catalog not loaded', jamendoError || 'Refresh to try the Jamendo catalog again.', null, null, 'disc')) + '</section></section>' +
      (library.length ? '<section class="section local-explore-section">' + sectionHead('On this device', library.length + ' local tracks', 'uploads', 'Manage files') + trackTable(library, { showTag: true }) + '</section>' : '<div class="info-banner local-explore-section">You can also add music files from this device. They stay in this browser.</div>');
  }
  function filteredTracks() {
    var q = state.search.trim().toLowerCase(); var filter = state.searchFilter || 'All';
    if (!q && filter === 'All') return [];
    return allTracks().filter(function (t) {
      var a = artistById(t.artistId); var al = albumById(t.albumId); var match = !q || (t.title + ' ' + a.name + ' ' + (al ? al.title : '') + ' ' + (t.genre || '')).toLowerCase().indexOf(q) >= 0;
      if (!match) return false;
      if (filter === 'Tracks') return true;
      return filter === 'All' || filter === 'Songs';
    });
  }
  function renderSearchPage() {
    var q = state.search.trim().toLowerCase();
    var matches = q ? filteredTracks().slice(0, Math.max(1, Number(state.settings.searchResultLimit) || 50)) : [];
    var matchedArtists = q ? artists.concat(jamendoArtists).filter(function (a) { return (a.name + ' ' + (a.genre || '')).toLowerCase().indexOf(q) >= 0; }) : [];
    var matchedAlbums = q ? albums.filter(function (a) { return (a.title + ' ' + artistName(a.artistId)).toLowerCase().indexOf(q) >= 0; }) : [];
    var matchedPlaylists = q ? state.playlists.filter(function (p) { return (p.name + ' ' + (p.description || '')).toLowerCase().indexOf(q) >= 0; }) : [];
    var filters = ['All', 'Tracks', 'Artists', 'Albums', 'Playlists'];
    var mainResults = '<div class="search-results"><div>' + sectionHead('Tracks', q ? matches.length + ' results' : 'Search the music you have added.') + (q && matches.length ? trackTable(matches, { showTag: true }) : q ? emptyState('No tracks found', 'Try another title or artist name.', 'uploads', 'Add music', 'search') : emptyState('Your library is empty', 'Add music to search your tracks.', 'uploads', 'Add music', 'search')) + (q && matchedAlbums.length ? '<section class="section">' + sectionHead('Albums', null) + '<div class="album-grid">' + matchedAlbums.map(albumCard).join('') + '</div></section>' : '') + '</div><div>' + sectionHead('Artists', q ? matchedArtists.length + ' results' : 'Artists') + (q && matchedArtists.length ? '<div class="artist-list">' + matchedArtists.map(artistCard).join('') + '</div>' : q ? emptyState('No artists found', 'Try another artist name.', null, null, 'users') : '<div class="info-banner">Online catalog search is not connected. Local audio files are searchable by file name.</div>') + '</div></div>';
    var filteredView = state.searchFilter === 'Artists' ? (matchedArtists.length ? '<div class="artist-list">' + matchedArtists.map(artistCard).join('') + '</div>' : emptyState('No artists found', 'Try a different name or genre.', null, null, 'users')) : state.searchFilter === 'Albums' ? (matchedAlbums.length ? '<div class="album-grid">' + matchedAlbums.map(albumCard).join('') + '</div>' : emptyState('No albums found', 'Try searching for an artist or title.', null, null, 'disc')) : state.searchFilter === 'Playlists' ? (matchedPlaylists.length ? '<div class="album-grid">' + matchedPlaylists.map(playlistCard).join('') + '</div>' : emptyState('No playlists found', 'Try a different name or create a playlist.', null, null, 'library')) : state.searchFilter === 'Tracks' ? (matches.length ? trackTable(matches, { showTag: true }) : emptyState('No tracks found', 'Try a different title or artist name.', null, null, 'search')) : mainResults;
    return pageHead('THE LISTENING ROOM', 'Search', 'Look up a track, artist, album, playlist, or something by mood.') + '<label class="search-box">' + icon('search') + '<input id="searchInput" type="search" autocomplete="off" placeholder="What would you like to hear?" value="' + esc(state.search) + '"><button class="quiet-button" data-action="clear-search" aria-label="Clear search"' + (state.search ? '' : ' hidden') + '>' + icon('x') + '</button></label><div class="search-filter-row">' + filters.map(function (f) { return '<button class="filter-chip ' + (state.searchFilter === f ? 'active' : '') + '" data-action="search-filter" data-id="' + esc(f) + '">' + esc(f) + '</button>'; }).join('') + '</div>' + (q ? '<p class="jamendo-status' + (jamendoError ? ' is-error' : '') + '" id="jamendoSearchStatus" aria-live="polite">' + esc(jamendoStatusMessage || (jamendoLoading ? 'Searching Jamendo…' : jamendoError || (state.jamendoClientId ? 'Search includes independent music from Jamendo.' : ''))) + '</p>' : '') + '<div id="searchResults">' + (q ? filteredView : mainResults) + '</div>';
  }
  function pageCharts() { return pageHead('JAMENDO CHARTS', 'Charts', 'Featured independent tracks from Jamendo.') + (jamendoTracks.length ? trackTable(jamendoTracks.slice(0, 36), { showTag: true }) : jamendoLoading ? emptyState('Loading Jamendo charts', 'Finding featured tracks…', null) : emptyState('No chart tracks loaded', jamendoError || 'Open Explore and refresh the Jamendo catalog.', 'explore', 'Explore music', 'chart')); }
  function pageNewReleases() { var recent = jamendoTracks.slice().sort(function (a, b) { return String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')); }).slice(0, 24); return pageHead('NEW MUSIC', 'New releases', 'Recent independent releases available on Jamendo.') + (recent.length ? trackTable(recent, { showTag: true }) : emptyState('No releases loaded', 'Browse the Jamendo catalog to load music.', 'explore', 'Explore music', 'spark')); }
  function pageRadio() { var library = allTracks(); return pageHead('RADIO', 'Radio', 'Start a station from your own music.') + (library.length ? '<section class="section" style="margin-top:0"><div class="info-banner">Radio stations need a connected music catalog. You can still shuffle the music on this device.</div><button class="button primary" data-action="play-list" data-ids="' + esc(library.map(function (t) { return t.id; }).join(',')) + '">' + icon('shuffle') + ' Shuffle your library</button></section>' : emptyState('Add music to get started', 'Your own tracks can be shuffled here. Personalized radio needs a connected catalog.', 'uploads', 'Add music', 'radio')); }
  function pageLibrary() { var recent = safeTracks(state.history.slice(0, 7)); var liked = sortTracks(safeTracks(state.liked), state.settings.likedSort).slice(0, 5); return pageHead('YOUR MUSIC, IN ONE PLACE', 'Music library', 'A private collection stored in this browser.', '<button class="button small" data-page="uploads">' + icon('upload') + ' Add local music</button>') + '<div class="page-tabs"><button class="active" data-action="noop">Overview</button><button data-page="albums">Albums</button><button data-page="artists">Artists</button><button data-page="playlists">Playlists</button></div><section class="section" style="margin-top:8px">' + sectionHead('Your playlists', null, 'playlists') + (state.playlists.length ? '<div class="album-grid">' + state.playlists.slice(0, 5).map(playlistCard).join('') + '</div>' : emptyState('Start a collection', 'Create a playlist for a mood, a moment, or a long drive.', null)) + '</section>' + (state.settings.showHistoryOnLibrary ? '<section class="section">' + sectionHead('Recently played', null, 'history') + (recent.length ? trackTable(recent) : emptyState('Nothing played yet', 'Browse a record and play a song. Your history stays in this browser.', 'explore', 'Explore', 'clock')) + '</section>' : '') + '<section class="section">' + sectionHead('Recently liked', null, 'liked') + (liked.length ? trackTable(liked) : emptyState('Save the songs that stay with you', 'Use the heart beside any track to add it here.', 'explore', 'Browse music', 'heart')) + '</section>'; }
  function pageLiked() { var liked = sortTracks(safeTracks(state.liked), state.settings.likedSort); return pageHead('YOUR COLLECTION', 'Liked songs', state.liked.length + ' saved tracks', '<button class="button small primary" data-action="play-list" data-ids="' + esc(liked.map(function (t) { return t.id; }).join(',')) + '">' + icon('play') + ' Play all</button>') + trackTable(liked, { showTag: true, emptyText: 'Songs you like will be kept together here.', emptyAction: 'explore' }); }
  function pageAlbums() { return pageHead('YOUR COLLECTION', 'Albums', 'Albums from your music library.') + emptyState('No albums yet', 'Album details appear when they are included with your music files.', 'uploads', 'Add music', 'disc'); }
  function pageArtists() { return pageHead('ARTIST PAGES', 'Artists', 'Browse independent artists from the Jamendo catalog.') + (jamendoArtists.length ? '<section class="section"><div class="section-head"><div><h2>Artists</h2><p>' + jamendoArtists.length + ' artists in the current catalog</p></div></div><div class="artist-list connected-artist-list">' + jamendoArtists.map(artistCard).join('') + '</div></section>' : emptyState('Artists appear with the music', 'Browse Jamendo or add a track from your device to discover artists.', 'explore', 'Browse music', 'users')) + '<div class="info-banner">Artist photos and names come from Jamendo. Rill does not create manual artist profiles.</div>'; }
  function spotifyPlaylistCard(playlist) {
    var provider = externalProvider(playlist.url); if (!provider || provider.key !== 'spotify' || provider.kind !== 'playlist') return '';
    var embedUrl = provider.embed + '?utm_source=generator&theme=0';
    var data = spotifyPlaylistCache[playlist.spotifyId] || null;
    var title = data && data.name || playlist.name || 'Spotify playlist';
    var art = data && data.image ? '<img src="' + esc(safeHttpsUrl(data.image)) + '" alt="" loading="lazy">' : '<span class="spotify-playlist-mark">' + icon('spotify') + '</span>';
    var tracks = data && data.tracks || [];
    var summary = data ? (data.owner ? esc(data.owner) + ' · ' : '') + (data.truncated ? tracks.length + ' of ' + data.total : tracks.length) + (tracks.length === 1 ? ' song' : ' songs') : 'Official Spotify playlist';
    var errorNote = data && data.error ? '<div class="info-banner spotify-api-note">' + esc(data.error) + '</div>' : '';
    if (data && data.truncated) errorNote += '<div class="spotify-limit-note">Showing the first ' + tracks.length + ' tracks for a faster playlist view.</div>';
    var trackContent = tracks.length ? spotifyTrackTable(tracks) : '<div class="spotify-fallback"><p>' + (data ? 'This playlist has no tracks to show.' : 'Connect Spotify to show track artwork, artist names, and lyrics shortcuts in this list.') + '</p></div>';
    var player = '<details class="spotify-player-details"><summary>Open Spotify player</summary><iframe class="spotify-playlist-embed" src="' + esc(embedUrl) + '" title="' + esc(title) + ' on Spotify" height="352" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></details>';
    var syncButton = spotifySessionExists() ? '<button class="icon-button spotify-remove" data-action="sync-spotify-playlist" data-id="' + esc(playlist.id) + '" title="Refresh playlist" aria-label="Refresh playlist">' + icon('refresh') + '</button>' : '<button class="button small ghost" data-action="sync-spotify-playlist" data-id="' + esc(playlist.id) + '">Connect</button>';
    return '<article class="spotify-playlist-card"><div class="spotify-card-head"><div class="spotify-card-art">' + art + '</div><div class="spotify-card-copy"><span class="spotify-source-label">' + icon('spotify') + ' SPOTIFY</span><h3>' + esc(title) + '</h3><p>' + summary + '</p>' + (data && data.description ? '<small>' + esc(data.description) + '</small>' : '') + '</div><div class="spotify-card-actions"><a class="button small ghost" href="' + esc(provider.url) + '" target="_blank" rel="noopener noreferrer">Open in Spotify ↗</a>' + syncButton + '<button class="icon-button spotify-remove" data-action="delete-spotify-playlist" data-id="' + esc(playlist.id) + '" title="Remove playlist" aria-label="Remove playlist">' + icon('x') + '</button></div></div>' + errorNote + '<div class="spotify-track-list">' + trackContent + '</div>' + player + '</article>';
  }
  function spotifyTrackTable(items) {
    if (!items.length) return '';
    return '<div class="spotify-track-scroll"><table class="spotify-track-table"><thead><tr><th>#</th><th>Title</th><th>Album</th><th>Lyrics</th><th>' + icon('clock') + '</th></tr></thead><tbody>' + items.map(function (track, index) {
      var lyrics = state.lyrics[track.id] || '';
      var artists = (track.artistNames || []).map(function (name, artistIndex) { var artist = track.artists && track.artists[artistIndex]; return artist && artist.url ? '<a href="' + esc(artist.url) + '" target="_blank" rel="noopener noreferrer">' + esc(name) + '</a>' : esc(name); }).join(', ');
      var art = safeHttpsUrl(track.image) ? '<img src="' + esc(safeHttpsUrl(track.image)) + '" alt="" loading="lazy">' : '<span class="spotify-track-art-fallback">♪</span>';
      return '<tr><td class="spotify-track-index">' + (index + 1) + '</td><td><div class="spotify-track-title">' + art + '<span><a class="spotify-song-link" href="' + esc(track.url) + '" target="_blank" rel="noopener noreferrer">' + esc(track.title) + '</a><small>' + artists + '</small></span></div></td><td class="spotify-track-album">' + esc(track.album || '—') + '</td><td><button class="spotify-lyrics-button ' + (lyrics ? 'has-lyrics' : '') + '" data-action="open-track-lyrics" data-id="' + esc(track.id) + '" aria-label="' + (lyrics ? 'View lyrics' : 'Add lyrics') + '" title="' + (lyrics ? 'View lyrics' : 'Add lyrics') + '">' + icon('mic') + '</button></td><td class="spotify-track-duration">' + fmt(track.duration) + '</td></tr>';
    }).join('') + '</tbody></table></div><div class="spotify-attribution"><span class="spotify-wordmark">' + icon('spotify') + ' Spotify</span><span>Track names and artwork from Spotify</span></div>';
  }
  function pagePlaylists() {
    var spotifyPlaylists = state.externalPlaylists || [];
    if (spotifySessionExists()) spotifyPlaylists.forEach(function (playlist) {
      if (spotifyPlaylistCache[playlist.spotifyId]) return;
      loadSpotifyPlaylist(playlist.spotifyId, false).then(function () { if (currentRoute().page === 'playlists') renderPage(); }).catch(function () {});
    });
    var actions = '<button class="button small" data-action="new-smart-playlist">Smart playlist</button><button class="button small" data-action="import-spotify-playlist">' + icon('spotify') + ' Import Spotify</button><button class="button small primary" data-action="new-playlist">' + icon('plus') + ' Create playlist</button>';
    var list = getVisiblePlaylists();
    var local = state.playlists.length ? '<section class="playlist-library"><div class="playlist-tools"><label class="playlist-search">' + icon('search') + '<input id="playlistSearch" type="search" value="' + esc(playlistSearch) + '" placeholder="Find a playlist" aria-label="Search playlists"></label><label class="playlist-sort-label">Sort<select id="playlistSort"><option value="recent"' + (playlistSort === 'recent' ? ' selected' : '') + '>Recently added</option><option value="name"' + (playlistSort === 'name' ? ' selected' : '') + '>Name</option><option value="tracks"' + (playlistSort === 'tracks' ? ' selected' : '') + '>Number of songs</option></select></label><span class="playlist-count">' + list.length + (list.length === 1 ? ' playlist' : ' playlists') + '</span></div><div id="playlistCollection" class="playlist-collection-grid">' + (list.length ? list.map(playlistCard).join('') : emptyState('No matching playlists', 'Try another name or clear the search.', null, null, 'search')) + '</div></section>' : '<div class="playlist-empty-create">' + emptyState('Your playlists start here', 'Create a playlist, then add tracks from Explore or your local library.', null, null, 'library') + '<button class="button primary" data-action="new-playlist">' + icon('plus') + ' Create playlist</button></div>';
    var embeds = spotifyPlaylists.length ? '<section class="section spotify-playlists-section"><div class="section-head"><div><h2>From Spotify</h2><p>Imported links stay connected to Spotify. Connect your account to show a compact track list.</p></div></div><div class="spotify-playlist-list">' + spotifyPlaylists.map(spotifyPlaylistCard).join('') + '</div></section>' : '';
    return pageHead('YOUR COLLECTION', 'Playlists', 'A tidy home for the music you keep close.', actions) + local + embeds;
  }
  function pageHistory() { var list = safeTracks(state.history); return pageHead('YOUR RECENT LISTENING', 'Listening history', 'Stored privately in this browser.', '<button class="button small ghost" data-action="clear-history">Clear history</button>') + (list.length ? trackTable(list, { showTag: true }) : emptyState('Your story starts with a song', 'Played tracks will show up here, in order.', 'explore', 'Find something to play', 'clock')); }
  function pageDownloads() { var uploads = sortTracks(localTracks, state.settings.librarySort); return pageHead('AVAILABLE ON THIS DEVICE', 'Downloads', 'Manage files you have added to this browser.') + (uploads.length ? trackTable(uploads, { showTag: true }) : emptyState('No local music yet', 'Add audio files you own or are authorized to use. Streaming downloads need a connected music provider.', 'uploads', 'Open uploads', 'download')) + '<div class="info-banner"><strong>Offline catalog downloads are not enabled.</strong> Browser caching does not grant offline rights for streamed music. Local audio files remain in this browser profile.</div>'; }
  function pageUploads() { var uploads = sortTracks(localTracks, state.settings.librarySort); var duplicateCount = duplicateGroups().reduce(function (sum, group) { return sum + group.ids.length - 1; }, 0); return pageHead('YOUR MUSIC, YOUR DEVICE', 'Your uploads', 'Add audio you own or have permission to use.', '<button class="button small" data-action="pick-folder">' + icon('folder') + ' Choose folder</button><button class="button primary" data-action="pick-files">' + icon('upload') + ' Choose audio files</button>') + '<div class="info-banner"><strong>Local playback is available.</strong> Files stay in this browser using IndexedDB and are not uploaded to a server. MP3, WAV, FLAC, AAC, and other formats depend on your browser’s audio support.</div>' + (uploads.length ? '<section class="section" style="margin-top:20px">' + sectionHead('In this browser', uploads.length + ' local files', null) + '<div class="upload-tools"><span>' + duplicateCount + (duplicateCount === 1 ? ' possible duplicate' : ' possible duplicates') + '</span><button class="button small ghost" data-action="scan-duplicates">Review duplicates</button></div>' + trackTable(uploads, { showTag: true }) + '</section>' : emptyState('Your library is empty', 'Choose audio files or a folder from this device to start your library. Rill stores them locally in this browser.', null, null, 'upload')); }
  function pageVideos() { return pageHead('WATCH WITH THE MUSIC', 'Music videos', 'Videos and live sessions from authorized sources.') + '<div class="artist-hero" style="height:220px;background-image:linear-gradient(110deg,#1b201b,#313a31 65%,#5a6551)"><div class="artist-info"><span class="eyebrow">VIDEO PROVIDER</span><h1>Connect a licensed source</h1><p>Video playback will appear here when an authorized provider is configured.</p></div></div><div class="info-banner"><strong>No video integration is connected.</strong> Rill does not scrape or proxy protected video platforms. Audio/video switching, captions, and quality selection become available through a permitted provider.</div>'; }
  function pagePodcasts() { return pageHead('LONG-FORM LISTENING', 'Podcasts', 'Shows and conversations for the other half of the day.') + emptyState('Podcast catalog unavailable', 'A podcast provider or your own audio uploads can be connected here. No third-party catalog is currently connected.', 'uploads', 'Add local audio', 'mic'); }
  function pageNotifications() { return pageHead('A LITTLE NEWS', 'Notifications', 'Updates from the artists you follow.') + emptyState('All caught up', 'Release and social notifications need an account and notification service.', 'artists', 'Find artists', 'spark'); }
  function pageProfile() { var displayName = authUser ? authDisplayName || authUser.email : state.profileName || 'Guest listener'; var accountActions = authUser ? '<button class="button small ghost" data-action="auth-signout">Sign out</button>' : '<button class="button small ghost" data-page="login">Sign in</button><button class="button small" data-page="register">Create account</button>'; return pageHead('YOUR SPACE', 'Profile', authUser ? 'Signed in with ' + (authUser.email || 'your account') + '. Music and playlists remain stored on this device.' : 'Your listening profile is private and stored on this device.', accountActions + '<button class="button small" data-action="edit-profile">Edit profile</button>') + '<div class="profile-hero"><span class="avatar">' + esc(displayName.slice(0, 1).toUpperCase()) + '</span><div><h2>' + esc(displayName) + '</h2><p>' + (authUser ? 'Account connected · Local music remains on this device' : 'Local profile · Private listening history') + '</p></div></div><section class="section">' + sectionHead('Listening activity', null) + '<div class="info-banner">' + (authUser ? 'Authentication is connected. This preview does not sync uploaded audio, playlists, or history to a server yet.' : 'Your profile is local to this browser. Sign-in enables an account identity; cross-device music and playlist sync needs a separate database integration.') + '</div></section><section class="section">' + sectionHead('Your listening lately', null, 'history') + (state.history.length ? trackTable(safeTracks(state.history.slice(0, 5))) : emptyState('No recent listening', 'Start with one track and your listening history will appear here.', 'explore', 'Explore music', 'clock')) + '</section>'; }
  function pageQueue() { openQueue(); return pageHead('NOW AND NEXT', 'Queue', 'Your listening order for this session.') + '<section class="section" style="margin-top:0">' + sectionHead('Up next', state.queue.length + ' tracks', null) + trackTable(safeTracks(state.queue), { showTag: true }) + '</section>'; }

  function renderPlaylistDetail(id) {
    var p = playlistById(id); if (!p) return notFound();
    var list = playlistTracks(p); var first = list[0];
    var seconds = list.reduce(function (total, track) { return total + (Number(track.duration) || 0); }, 0);
    var totalTime = seconds >= 3600 ? Math.floor(seconds / 3600) + ' hr ' + Math.floor((seconds % 3600) / 60) + ' min' : Math.floor(seconds / 60) + ' min';
    var ids = list.map(function (track) { return track.id; });
    return '<section class="rill-playlist-detail"><div class="rill-playlist-cover">' + playlistArtwork(list, 'large') + '</div><div class="rill-playlist-info"><span class="eyebrow">' + (p.smart ? 'SMART · ' : '') + esc(p.privacy || 'PRIVATE') + ' PLAYLIST</span><h1>' + esc(p.name) + '</h1>' + (p.description ? '<p class="rill-playlist-description">' + esc(p.description) + '</p>' : '') + '<div class="rill-playlist-byline"><span class="avatar">' + esc((state.profileName || 'G').slice(0, 1).toUpperCase()) + '</span><b>' + esc(state.profileName || 'Guest listener') + '</b><span>·</span><span>' + list.length + (list.length === 1 ? ' song' : ' songs') + '</span>' + (seconds ? '<span>·</span><span>' + esc(totalTime) + '</span>' : '') + '</div><div class="rill-playlist-actions"><button class="button primary" data-action="play-list" data-ids="' + esc(ids.join(',')) + '"' + (!ids.length ? ' disabled' : '') + '>' + icon('play') + ' Play</button><button class="button small" data-action="shuffle-playlist" data-ids="' + esc(ids.join(',')) + '"' + (!ids.length ? ' disabled' : '') + '>' + icon('shuffle') + ' Shuffle</button><button class="button small ghost" data-action="edit-playlist" data-id="' + esc(p.id) + '">Edit</button><button class="icon-button" data-action="playlist-menu" data-id="' + esc(p.id) + '" aria-label="Playlist options">' + icon('more') + '</button></div></div></section><div class="rill-playlist-toolbar"><div class="rill-playlist-toolbar-title"><h2>Songs</h2><span>' + list.length + '</span></div><label class="playlist-search compact"><span class="sr-only">Filter songs</span>' + icon('search') + '<input id="playlistTrackSearch" type="search" placeholder="Find in playlist" aria-label="Find a song in this playlist"></label><div class="rill-playlist-toolbar-actions">' + (p.smart ? '' : '<button class="button small ghost" data-action="sort-playlist" data-id="' + esc(p.id) + '">' + icon('sliders') + ' Sort A–Z</button>') + '<button class="button small ghost" data-action="export-playlist" data-id="' + esc(p.id) + '">' + icon('download') + ' Export</button><button class="button small ghost" data-page="explore">' + icon('plus') + ' Add songs</button></div></div>' + (list.length ? '<div class="rill-playlist-track-wrap">' + trackTable(list, { showTag: true, showLyrics: true, playlistId: p.smart ? null : p.id }) + '</div>' : '<div class="playlist-detail-empty">' + emptyState('This playlist is ready for its first song', p.smart ? 'Add music or play tracks that match this smart playlist.' : 'Browse music, then use a song’s menu to add it here.', 'explore', 'Browse music', 'plus') + '</div>') + '</section>';
  }
  function renderArtistDetail(id) {
    var jamendoArtist = jamendoArtistById(id);
    if (jamendoArtist) {
      var jamendoSongs = allTracks().filter(function (track) { return track.artistId === jamendoArtist.id; });
      var artistAvatar = safeHttpsUrl(jamendoArtist.image) ? '<img src="' + esc(safeHttpsUrl(jamendoArtist.image)) + '" alt="' + esc(jamendoArtist.name) + '" loading="lazy">' : '<span>' + esc(String(jamendoArtist.name || '♪').slice(0, 1).toUpperCase()) + '</span>';
      return '<section class="connected-artist-hero jamendo-artist-hero"><div class="connected-artist-avatar">' + artistAvatar + '</div><div class="connected-artist-copy"><span class="eyebrow">JAMENDO ARTIST</span><h1>' + esc(jamendoArtist.name) + '</h1><p>' + esc(jamendoArtist.bio || 'Independent artist from Jamendo.') + '</p><div class="artist-profile-actions"><button class="follow-button ' + (state.following.indexOf(id) >= 0 ? 'following' : '') + '" data-action="follow" data-id="' + esc(id) + '">' + (state.following.indexOf(id) >= 0 ? 'Following' : 'Follow') + '</button><a class="button small ghost" href="' + esc(jamendoArtist.jamendoUrl) + '" target="_blank" rel="noopener noreferrer">Open Jamendo ↗</a></div></div></section><section class="section"><div class="section-head"><div><h2>Tracks</h2><p>' + jamendoSongs.length + ' songs available in this catalog view</p></div>' + (jamendoSongs.length ? '<button class="button small primary" data-action="play-list" data-ids="' + esc(jamendoSongs.map(function (track) { return track.id; }).join(',')) + '">' + icon('play') + ' Play all</button>' : '') + '</div>' + (jamendoSongs.length ? trackTable(jamendoSongs, { showTag: true }) : emptyState('Loading artist tracks', 'Jamendo is fetching this artist’s catalog.', null, null, 'disc')) + '</section><div class="info-banner">Music is streamed from Jamendo. Open each track’s details for its license and source link.</div>';
    }
    var a = externalArtistById(id); if (!a) return notFound();
    var services = Object.keys(a.links || {}).filter(function (key) { return !!a.links[key]; }).map(function (key) { return '<a class="service-pill service-' + esc(key) + '" href="' + esc(a.links[key]) + '" target="_blank" rel="noopener noreferrer">' + esc(serviceName(key)) + ' <span>↗</span></a>'; }).join('');
    var songCards = (a.tracks || []).map(function (track) { return externalTrackCard(track); }).join('');
    var profilePlayer = externalArtistPlayer(a);
    var avatar = safeHttpsUrl(a.image) ? '<img src="' + esc(safeHttpsUrl(a.image)) + '" alt="' + esc(a.name) + '" loading="lazy">' : '<span>' + esc(a.initials || String(a.name || '♪').slice(0, 1).toUpperCase()) + '</span>';
    return '<section class="connected-artist-hero"><div class="connected-artist-avatar">' + avatar + '</div><div class="connected-artist-copy"><span class="eyebrow">ARTIST PROFILE</span><h1>' + esc(a.name) + '</h1><p>' + esc(a.bio || 'Music and official links from this artist.') + '</p><div class="artist-profile-actions"><button class="follow-button ' + (state.following.indexOf(a.id) >= 0 ? 'following' : '') + '" data-action="follow" data-id="' + esc(a.id) + '">' + (state.following.indexOf(a.id) >= 0 ? 'Following' : 'Follow') + '</button></div></div></section>' + (services ? '<section class="section"><div class="section-head"><div><h2>Find ' + esc(a.name) + '</h2><p>Official profiles on streaming services</p></div></div><div class="service-pills">' + services + '</div></section>' : '') + (profilePlayer ? '<section class="section">' + profilePlayer + '</section>' : '') + (songCards ? '<section class="section"><div class="section-head"><div><h2>Music</h2><p>' + (a.tracks || []).length + ' linked ' + ((a.tracks || []).length === 1 ? 'song' : 'songs') + '</p></div></div><div class="external-track-list">' + songCards + '</div></section>' : '') + '<div class="info-banner">This older linked profile is read-only. Artist profiles are now shown from the connected Jamendo catalog.</div>';
  }

  function safeHttpsUrl(value) { try { var url = new URL(String(value || '').trim()); return url.protocol === 'https:' ? url.href : ''; } catch (e) { return ''; } }
  function serviceName(key) { return { spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube Music', soundcloud: 'SoundCloud', deezer: 'Deezer', tidal: 'TIDAL', bandcamp: 'Bandcamp' }[key] || 'Music service'; }
  function externalProvider(value) {
    try {
      var url = new URL(String(value || '').trim()); if (url.protocol !== 'https:') return null;
      var host = url.hostname.toLowerCase(); var path = url.pathname.split('/').filter(Boolean);
      if (host === 'open.spotify.com' || host === 'spotify.com') { if (path[0] && path[0].indexOf('intl-') === 0) path.shift(); if (path.length >= 2 && ['track','album','artist','playlist'].indexOf(path[0]) >= 0) return { key: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/' + path[0] + '/' + path[1], embed: 'https://open.spotify.com/embed/' + path[0] + '/' + path[1], kind: path[0] }; }
      if ((host === 'music.apple.com' || host === 'embed.music.apple.com') && path.length >= 3) return { key: 'apple', name: 'Apple Music', url: url.href, embed: 'https://embed.music.apple.com/' + path.join('/') + (url.search || ''), kind: path.indexOf('artist') >= 0 ? 'artist' : 'apple' };
      if (host === 'youtu.be' || host === 'youtube.com' || host === 'www.youtube.com' || host === 'music.youtube.com' || host === 'm.youtube.com') { var yt = host === 'youtu.be' ? path[0] : url.searchParams.get('v') || (path[0] === 'embed' || path[0] === 'shorts' ? path[1] : ''); if (yt && /^[\w-]{6,}$/.test(yt)) return { key: 'youtube', name: 'YouTube', url: url.href, embed: 'https://www.youtube-nocookie.com/embed/' + yt, kind: 'video' }; }
      if (host === 'soundcloud.com' || host === 'www.soundcloud.com') return { key: 'soundcloud', name: 'SoundCloud', url: url.href, embed: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url.href) + '&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true', kind: path.length <= 1 ? 'artist' : 'sound' };
    } catch (e) {}
    return null;
  }
  function externalArtistPlayer(artist) {
    var keys = ['spotify','apple','soundcloud'];
    for (var i = 0; i < keys.length; i++) {
      var provider = externalProvider(artist.links && artist.links[keys[i]]);
      if (!provider || provider.kind !== 'artist') continue;
      var height = provider.key === 'spotify' ? 352 : provider.key === 'apple' ? 450 : 450;
      return '<div class="external-artist-player-head"><div><h2>Artist on ' + esc(provider.name) + '</h2><p>Official artist page and tracks, played by ' + esc(provider.name) + '</p></div><a class="link-button" href="' + esc(provider.url) + '" target="_blank" rel="noopener noreferrer">Open service ↗</a></div><iframe class="external-music-player external-artist-player" src="' + esc(provider.embed) + '" title="' + esc(artist.name + ' on ' + provider.name) + '" height="' + height + '" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    }
    return '';
  }
  function externalTrackCard(track) {
    var provider = externalProvider(track.url); if (!provider) return '';
    var embedHeight = provider.key === 'spotify' ? (provider.kind === 'track' ? 152 : 352) : provider.key === 'apple' ? 175 : provider.key === 'youtube' ? 225 : 260;
    var art = safeHttpsUrl(track.artwork) ? '<img src="' + esc(safeHttpsUrl(track.artwork)) + '" alt="" loading="lazy">' : '<span class="external-track-art-fallback">' + icon(provider.key === 'youtube' ? 'video' : 'disc') + '</span>';
    return '<article class="external-track-card"><div class="external-track-heading">' + art + '<div><b>' + esc(track.title || provider.name + ' song') + '</b><small>' + esc(provider.name) + ' · ' + esc(track.album || 'Linked track') + '</small></div><a href="' + esc(provider.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Open in ' + esc(provider.name) + '">↗</a></div><iframe class="external-music-player" src="' + esc(provider.embed) + '" title="' + esc((track.title || 'Song') + ' on ' + provider.name) + '" height="' + embedHeight + '" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>' + (track.lyrics ? '<details class="external-lyrics"><summary>Lyrics</summary><div class="external-lyrics-text">' + esc(track.lyrics) + '</div></details>' : '') + '</article>';
  }
  function renderAlbumDetail(id) {
    var a = albumById(id); if (!a) return notFound(); var ar = artistById(a.artistId); var list = albumTracks(id);
    return '<div class="album-detail"><div>' + cover(a) + '</div><div class="album-meta"><span class="eyebrow">' + esc(a.type) + ' · ' + esc(a.year) + '</span><h1>' + esc(a.title) + '</h1><p><a class="artist-link" href="#artist/' + esc(ar.id) + '" data-artist="' + esc(ar.id) + '">' + esc(ar.name) + '</a></p><div class="meta-line"><span>' + list.length + ' tracks</span><span>·</span><span>' + fmt(list.reduce(function (n, t) { return n + t.duration; }, 0)) + '</span><span>·</span><span>Studio demo</span></div><div class="album-actions"><button class="button primary" data-action="play-album" data-id="' + esc(id) + '">' + icon('play') + ' Play</button><button class="button" data-action="add-album" data-id="' + esc(id) + '">' + icon('plus') + ' Add to playlist</button><button class="button ghost" data-action="share" data-id="album/' + esc(id) + '">Share</button></div></div></div><div class="page-tabs"><button class="active" data-action="noop">Tracks</button><button data-action="open-credits">Credits</button></div>' + trackTable(list, { showTag: true }) + '<section class="section">' + sectionHead('More by ' + ar.name, null, 'artist/' + ar.id, 'Artist page') + '<div class="album-grid">' + albums.filter(function (x) { return x.artistId === ar.id && x.id !== id; }).map(albumCard).join('') + '</div></section>' + demoNotice();
  }
  function renderTrackDetail(id) {
    var t = trackById(id); if (!t) return notFound(); var a = artistById(t.artistId); var album = albumById(t.albumId);
    var sourceLabel = t.kind === 'upload' ? 'Local file' : t.kind === 'jamendo' ? 'Jamendo stream' : 'Browser generated demo';
    var sourceInfo = t.kind === 'upload' ? 'This audio file is stored in your browser profile.' : t.kind === 'jamendo' ? 'Streamed from Jamendo. Check the license before reusing or downloading this track.' : 'This original sound sketch is synthesized in your browser. It is a functional demo source, not a licensed commercial recording.';
    if (t.kind === 'jamendo') sourceInfo += ' <a href="' + esc(t.jamendoUrl) + '" target="_blank" rel="noopener noreferrer">Open on Jamendo ↗</a>' + (t.licenseUrl ? ' · <a href="' + esc(t.licenseUrl) + '" target="_blank" rel="noopener noreferrer">Creative Commons license ↗</a>' : '');
    return '<div class="album-detail"><div>' + cover(t) + '</div><div class="album-meta"><span class="eyebrow">TRACK DETAILS</span><h1>' + esc(t.title) + '</h1><p><a class="artist-link" href="#artist/' + esc(a.id) + '" data-artist="' + esc(a.id) + '">' + esc(a.name) + '</a></p><div class="meta-line"><span>' + esc(t.albumName || (album ? album.title : 'Single')) + '</span><span>·</span><span>' + displayDuration(t) + '</span><span>·</span><span>' + sourceLabel + '</span></div><div class="album-actions"><button class="button primary" data-action="play-track" data-id="' + esc(t.id) + '">' + icon('play') + ' Play</button><button class="button" data-action="like-track" data-id="' + esc(t.id) + '">' + icon('heart') + ' ' + (state.liked.indexOf(t.id) >= 0 ? 'Liked' : 'Like') + '</button><button class="button ghost" data-action="add-track" data-id="' + esc(t.id) + '">' + icon('plus') + ' Add to playlist</button></div></div></div><div class="info-banner">' + sourceInfo + '</div><section class="section">' + sectionHead('More by ' + a.name, null, 'artist/' + a.id, 'Artist page') + trackTable(allTracks().filter(function (x) { return x.artistId === a.id && x.id !== t.id; }).slice(0, 5), { showTag: true }) + '</section>';
  }
  function parseLyrics(text) {
    var offset = 0; var lines = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim(); var offsetMatch = line.match(/^\[offset:\s*(-?\d+)\s*\]$/i);
      if (offsetMatch) { offset = Number(offsetMatch[1]) || 0; return; }
      var times = []; var matcher = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g; var match;
      while ((match = matcher.exec(line))) times.push(Number(match[1]) * 60 + Number(match[2]) + Number('0.' + (match[3] || '0')));
      var lyric = line.replace(matcher, '').trim();
      if (times.length) times.forEach(function (time) { if (lyric) lines.push({ time: time, text: lyric }); });
      else if (lyric && lyric.charAt(0) !== '[') lines.push({ time: null, text: lyric });
    });
    lines.sort(function (a, b) { if (a.time == null) return 1; if (b.time == null) return -1; return a.time - b.time; });
    lines.offset = offset / 1000;
    return lines;
  }
  function activeLyricIndex(lines, elapsed) {
    var active = -1;
    lines.forEach(function (line, index) { if (line.time != null && line.time <= elapsed) active = index; });
    return active;
  }
  function renderLyrics() {
    var route = currentRoute(); var lyricTrackId = route.page === 'lyrics' && route.id ? route.id : state.currentId; var t = trackById(lyricTrackId);
    if (!t) return pageHead('LYRICS', 'Lyrics', 'Add your own lyrics or an LRC file to a track.') + emptyState('No track selected', 'Add music, start a track, then paste or import its lyrics.', 'uploads', 'Add music', 'mic');
    var raw = state.lyrics[t.id] || t.lyrics || ''; var lines = parseLyrics(raw); var offset = (Number(lines.offset) || 0) + (Number(state.lyricOffsets[t.id]) || 0) / 1000; var active = activeLyricIndex(lines, state.currentId === t.id ? getElapsed() + offset : offset); var manualOffset = Number(state.lyricOffsets[t.id]) || 0; var synchronized = state.currentId === t.id && t.kind !== 'spotify';
    var lyricMarkup = lines.length ? lines.map(function (line, index) {
      if (line.time == null) return '<p class="lyric-static-line">' + esc(line.text) + '</p>';
      return synchronized ? '<button class="lyric-line ' + (index === active ? 'current' : '') + '" data-action="seek-lyric" data-seconds="' + Math.max(0, line.time + offset) + '">' + esc(line.text) + '</button>' : '<p class="lyric-line lyric-static-line">' + esc(line.text) + '</p>';
    }).join('') : '<div class="lyrics-empty"><h3>No lyrics added</h3><p>Paste lyrics or import an LRC file. Timestamped lines follow the music.</p><button class="button primary" data-action="edit-lyrics" data-id="' + esc(t.id) + '">' + icon('plus') + ' Add lyrics</button></div>';
    var syncControls = synchronized ? '<span class="lyrics-sync-control"><button class="button small ghost" data-action="lyrics-offset" data-id="-100">−0.1s</button><span>Sync ' + (manualOffset >= 0 ? '+' : '') + (manualOffset / 1000).toFixed(1) + 's</span><button class="button small ghost" data-action="lyrics-offset" data-id="100">+0.1s</button></span>' : '';
    var playerControl = t.kind === 'spotify' ? '<a class="button small ghost" href="' + esc(safeHttpsUrl(t.url)) + '" target="_blank" rel="noopener noreferrer">Open in Spotify ↗</a>' : '<button class="button small ghost" data-action="expand-player">Player</button>';
    var syncNote = t.kind === 'spotify' ? '<div class="info-banner lyrics-provider-note">Spotify does not provide lyrics through this playlist import. Add text or an LRC file here; it stays in this browser. Spotify playback stays in Spotify.</div>' : '';
    return pageHead('LYRICS', 'Lyrics', 'Read along, edit the text, or import a synced LRC file.', syncControls + '<button class="button small" data-action="edit-lyrics" data-id="' + esc(t.id) + '">' + icon('edit') + ' Edit lyrics</button>') +
      '<div class="lyrics-layout"><div class="lyrics-track-card">' + cover(t) + '<div><b>' + esc(t.title) + '</b><small>' + esc(trackArtistLabel(t)) + '</small></div>' + playerControl + '</div>' + syncNote + '<div class="lyric-lines" id="lyricLines">' + lyricMarkup + '</div></div>';
  }
  function openLyricsEditor(id) {
    var t = trackById(id); if (!t) { toast('Choose a track first.'); return; }
    editingLyricsId = id;
    var body = '<div class="field"><label for="lyricsEditor">Lyrics · one line per lyric</label><textarea id="lyricsEditor" rows="13" placeholder="Paste lyrics here. For sync, use LRC timestamps:\n[00:12.00] First line\n[00:16.50] Next line">' + esc(state.lyrics[id] || t.lyrics || '') + '</textarea><small class="lyric-note">LRC timestamp format: [minutes:seconds.hundredths]. Lyrics stay in this browser.</small></div><div class="lyrics-editor-tools"><button class="button small ghost" type="button" data-action="import-lyrics">Import .lrc file</button><button class="button small ghost" type="button" data-action="clear-lyrics-editor">Clear text</button></div>';
    showModal(modalFrame('Lyrics for ' + t.title, trackArtistLabel(t), body, '<button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" data-action="save-lyrics" data-id="' + esc(id) + '">Save lyrics</button>'));
  }
  function saveLyrics(id) {
    var t = trackById(id); var editor = document.getElementById('lyricsEditor'); if (!t || !editor) return;
    var text = editor.value.trim(); if (text) state.lyrics[id] = text; else delete state.lyrics[id];
    persist(); closeModal(); if (state.page === 'lyrics') renderPage(); toast(text ? 'Lyrics saved on this device.' : 'Lyrics removed.');
  }
  function hexToHsl(hex) {
    var value = String(hex || '#fa233b').replace('#', '');
    if (value.length === 3) value = value.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(value.slice(0, 2), 16) / 255; var g = parseInt(value.slice(2, 4), 16) / 255; var b = parseInt(value.slice(4, 6), 16) / 255;
    var max = Math.max(r, g, b); var min = Math.min(r, g, b); var h = 0; var s = 0; var l = (max + min) / 2;
    if (max !== min) { var d = max - min; s = l > .5 ? d / (2 - max - min) : d / (max + min); if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  function hslToHex(h, s, l) {
    h = ((Number(h) % 360) + 360) % 360; s = Math.max(0, Math.min(100, Number(s))) / 100; l = Math.max(0, Math.min(100, Number(l))) / 100;
    var c = (1 - Math.abs(2 * l - 1)) * s; var x = c * (1 - Math.abs((h / 60) % 2 - 1)); var m = l - c / 2; var rgb = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
    return '#' + rgb.map(function (v) { return Math.round((v + m) * 255).toString(16).padStart(2, '0'); }).join('');
  }
  function accentControlValues() {
    var base = hexToHsl(state.settings.accent || '#fa233b');
    return { h: state.settings.accentHue == null ? base.h : Number(state.settings.accentHue), s: state.settings.accentIntensity == null ? base.s : Number(state.settings.accentIntensity), l: state.settings.accentBrightness == null ? base.l : Number(state.settings.accentBrightness) };
  }
  function updateAccentFromControls(changedKey, value) {
    var controls = accentControlValues();
    if (changedKey === 'accentHue') controls.h = Number(value);
    if (changedKey === 'accentIntensity') controls.s = Number(value);
    if (changedKey === 'accentBrightness') controls.l = Number(value);
    state.settings.accentHue = controls.h; state.settings.accentIntensity = controls.s; state.settings.accentBrightness = controls.l;
    state.settings.accent = hslToHex(controls.h, controls.s, controls.l);
    var picker = document.querySelector('[data-setting="accent"]'); if (picker) picker.value = state.settings.accent;
    setTheme(); persist();
  }
  function syncAccentRangeControls() {
    var controls = accentControlValues();
    [['accentHue', controls.h, '°'], ['accentIntensity', controls.s, '%'], ['accentBrightness', controls.l, '%']].forEach(function (entry) { var input = document.querySelector('[data-setting="' + entry[0] + '"]'); var output = document.querySelector('[data-setting-value="' + entry[0] + '"]'); if (input) input.value = String(entry[1]); if (output) output.value = entry[1] + entry[2]; });
  }
  var settingsSections = [['general','General','interface'],['appearance','Appearance','palette'],['playback','Playback','music'],['audio','Audio','wave'],['library','Library','library'],['privacy','Privacy','shield'],['accessibility','Accessibility','accessibility'],['fine','Fine tuning','sliders'],['advanced','Advanced','settings']];
  function settingsTabs() { return '<nav class="settings-nav" aria-label="Settings sections">' + settingsSections.map(function (tab) { return '<button class="' + (selectedSettings === tab[0] ? 'active' : '') + '" data-action="settings-tab" data-id="' + tab[0] + '" aria-current="' + (selectedSettings === tab[0] ? 'page' : 'false') + '">' + icon(tab[2]) + '<span>' + tab[1] + '</span></button>'; }).join('') + '</nav>'; }
  function switchControl(key, label, desc) { var on = !!state.settings[key]; return '<div class="setting-row"><span class="setting-copy"><b>' + esc(label) + '</b><small>' + esc(desc) + '</small></span><button class="switch ' + (on ? 'on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-action="setting-toggle" data-id="' + esc(key) + '"></button></div>'; }
  function settingSelect(key, label, desc, choices) { return '<div class="setting-row"><span class="setting-copy"><b>' + esc(label) + '</b><small>' + esc(desc) + '</small></span><select data-setting="' + esc(key) + '" aria-label="' + esc(label) + '">' + choices.map(function (c) { return '<option value="' + esc(c[0]) + '" ' + (String(state.settings[key]) === String(c[0]) ? 'selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select></div>'; }
  function settingRange(key, label, desc, min, max, step, suffix) { var controls = accentControlValues(); var value = key === 'accentHue' ? controls.h : key === 'accentIntensity' ? controls.s : key === 'accentBrightness' ? controls.l : Number(state.settings[key]) || 0; return '<div class="setting-row setting-range-row"><span class="setting-copy"><b>' + esc(label) + '</b><small>' + esc(desc) + '</small></span><div class="range-setting"><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" data-setting="' + esc(key) + '" aria-label="' + esc(label) + '"><output data-setting-value="' + esc(key) + '">' + value + esc(suffix || '') + '</output></div></div>'; }
  function accentSwatches() { return '<div class="accent-swatches" role="group" aria-label="Accent color presets">' + [['#fa233b','Red'],['#ff375f','Pink'],['#bf5af2','Purple'],['#007aff','Blue'],['#30b0c7','Cyan'],['#34c759','Green']].map(function (x) { return '<button class="accent-swatch ' + (state.settings.accent.toLowerCase() === x[0] ? 'active' : '') + '" style="--swatch:' + x[0] + '" data-action="accent-preset" data-color="' + x[0] + '" aria-label="' + x[1] + ' accent" title="' + x[1] + '"></button>'; }).join('') + '</div>'; }
  function accentSetting() { return accentSwatches() + '<div class="setting-row accent-choice-row"><span class="setting-copy"><b>Custom color</b><small>Pick any shade from the color selector.</small></span><input type="color" data-setting="accent" value="' + esc(state.settings.accent || '#fa233b') + '" aria-label="Custom accent color"></div>'; }
  function fineTuningRanges() {
    return [
      ['loadingDuration','Startup screen duration','How long the startup screen stays visible.',600,2600,100,' ms'],
      ['contentWidth','Page content width','Maximum width of the main listening area.',900,1800,20,' px'],
      ['sidebarWidth','Sidebar width','Width of the desktop navigation rail.',190,360,5,' px'],
      ['queueWidth','Queue width','Width of the desktop listening queue.',240,440,5,' px'],
      ['playerHeight','Player height','Height of the fixed player bar.',64,120,2,' px'],
      ['pagePadding','Page side padding','Space on either side of page content.',12,64,2,' px'],
      ['coverRadius','Cover corner radius','Roundness of album and track artwork.',0,32,1,' px'],
      ['cardRadius','Card corner radius','Roundness of cards and empty states.',0,32,1,' px'],
      ['buttonRadius','Button corner radius','Roundness of buttons and controls.',0,24,1,' px'],
      ['rowHeight','Track row height','Minimum height for rows in track lists.',36,84,2,' px'],
      ['sectionSpacing','Section spacing','Space between sections on a page.',12,60,2,' px'],
      ['textScale','Overall text scale','Scale text through the whole interface.',80,140,1,'%'],
      ['lineHeight','Text line spacing','Set the default line height.',1,2.2,.1,'×'],
      ['iconSize','Navigation icon size','Size of icons used in navigation and controls.',14,28,1,' px'],
      ['albumColumns','Album grid columns','Number of cards across wide screens.',2,8,1,''],
      ['waveformHeight','Visualizer height','Height of the player waveform display.',10,60,2,' px'],
      ['waveformLine','Waveform stroke width','Thickness of the live waveform line.',.5,4,.1,' px'],
      ['waveformSensitivity','Waveform sensitivity','How far the waveform moves with the audio.',20,150,5,'%'],
      ['analyserSmoothing','Visualizer smoothing','Smooth rapid changes in frequency peaks.',10,95,1,'%'],
      ['seekStep','Keyboard seek step','Seconds moved with the left and right arrows.',1,30,1,' sec'],
      ['volumeStep','Keyboard volume step','Volume change with Ctrl or Command + arrows.',1,20,1,'%'],
      ['searchDelay','Search response delay','Wait before refreshing search results.',0,500,25,' ms'],
      ['historyLimit','History size','Maximum number of tracks saved in history.',10,500,10,' tracks'],
      ['searchResultLimit','Search result limit','Maximum number of matching tracks shown.',10,200,10,' tracks'],
      ['fontWeight','Track title weight','Weight used for track titles.',400,800,50,''],
      ['letterSpacing','Text letter spacing','Adjust the spacing between letters.',-20,50,1,' ‰'],
      ['pageTitleSize','Page title size','Size of the main page heading.',22,48,1,' px'],
      ['sectionTitleSize','Section title size','Size of section headings.',12,28,1,' px'],
      ['trackTitleSize','Track title size','Size of song titles in track lists.',10,20,1,' px'],
      ['trackMetaSize','Track detail size','Size of artist and album details.',8,16,1,' px'],
      ['coverSize','Compact cover size','Artwork size beside player and list titles.',36,80,2,' px'],
      ['modalWidth','Dialog width','Maximum width of dialogs and the expanded player.',360,960,20,' px'],
      ['modalBackdrop','Dialog backdrop opacity','Darkness behind open dialogs.',0,90,5,'%'],
      ['hoverLift','Card hover lift','How far cards rise when pointed at.',0,10,1,' px'],
      ['navFontSize','Navigation text size','Text size used by navigation items.',10,16,1,' px'],
      ['playerControlSize','Player control size','Diameter of player transport controls.',28,48,1,' px'],
      ['buttonHeight','Button height','Height of standard buttons.',28,52,1,' px'],
      ['searchFieldHeight','Search field height','Height of the main search field.',32,60,1,' px'],
      ['playlistGridGap','Card grid spacing','Space between playlist and album cards.',8,40,2,' px'],
      ['topbarHeight','Top bar height','Height of the desktop toolbar.',44,76,2,' px'],
      ['settingRowHeight','Settings row height','Minimum height of preference rows.',44,100,2,' px'],
      ['queueRowHeight','Queue row height','Height of tracks in the listening queue.',42,90,2,' px'],
      ['sidebarItemHeight','Navigation row height','Height of each sidebar item.',30,56,1,' px'],
      ['lyricLineSize','Lyrics text size','Size of lines in the lyrics view.',14,42,1,' px'],
      ['lyricLineGap','Lyrics line spacing','Space between lines in the lyrics view.',0,32,1,' px']
    ];
  }
  function fineTuningSwitches() {
    return [
      ['showTrackNumbers','Show track numbers','Show the number column in track lists.','track numbers list row index'],
      ['showAlbumColumn','Show album column','Show album names in track lists.','album column metadata'],
      ['showDurationColumn','Show duration column','Show track lengths in lists.','duration time length'],
      ['showLikeButtons','Show like buttons','Show the heart button beside each track.','like heart favorites'],
      ['showQueueCount','Show queue count','Show the number of tracks in the queue header.','queue count total'],
      ['showVolumeControl','Show volume control','Keep the volume slider in the player.','volume player slider'],
      ['showLyricsControl','Show lyrics button','Show the lyrics shortcut in the player.','lyrics player button'],
      ['showPageDescriptions','Show page descriptions','Show explanatory text below page titles.','page description subtitle'],
      ['showQueueArtwork','Show queue artwork','Show cover art beside queued tracks.','queue cover thumbnail artwork'],
      ['showShortcutHints','Show keyboard hints','Show shortcut key labels where available.','keyboard shortcut hints keys']
    ];
  }
  function settingCatalog() {
    var themes = [['dark','Dark'],['light','Light'],['oled','Pure black OLED'],['graphite','Graphite']];
    var density = [['comfortable','Comfortable'],['compact','Compact'],['spacious','Spacious']];
    var speeds = [['0.75','0.75×'],['1','Normal'],['1.25','1.25×'],['1.5','1.5×'],['2','2×']];
    var catalog = [
      { tab:'general', section:'General', label:'Startup page', terms:'launch open first home search library start', control:settingSelect('startPage','Startup page','Choose which page opens when you visit Rill.',[['home','Home'],['search','Search'],['library','Library']]) },
      { tab:'general', section:'General', label:'Open the queue on startup', terms:'queue panel startup open player', control:switchControl('openQueueOnStart','Open the queue on startup','Show the listening queue when the site opens on desktop.') },
      { tab:'general', section:'General', label:'Remember playback position', terms:'resume progress remember position continue', control:switchControl('rememberPosition','Remember playback position','Keep the last position of a local track when you return.') },
      { tab:'general', section:'General', label:'Pause when this tab is hidden', terms:'background tab pause playback battery', control:switchControl('pauseWhenHidden','Pause when this tab is hidden','Pause while you are away and resume when you come back.') },
      { tab:'general', section:'General', label:'Ask before removing local music', terms:'confirm delete remove files safety', control:switchControl('confirmDelete','Ask before removing local music','Show a confirmation before deleting a file from this browser.') },
      { tab:'appearance', section:'Appearance', label:'Color theme', terms:'theme dark light oled graphite background', control:settingSelect('theme','Color theme','Choose a light or dark surface.',themes) },
      { tab:'appearance', section:'Appearance', label:'Accent color', terms:'accent color red pink purple blue cyan green', control:accentSetting() },
      { tab:'appearance', section:'Appearance', label:'Interface density', terms:'density spacing compact comfortable spacious', control:settingSelect('density','Interface density','Choose the spacing used across the interface.',density) },
      { tab:'appearance', section:'Appearance', label:'Cover shape', terms:'artwork album cover corners square round', control:settingSelect('coverShape','Cover shape','Set the shape of album and track artwork.',[['square','Square'],['soft','Soft corners'],['round','Round']]) },
      { tab:'appearance', section:'Appearance', label:'Show artwork', terms:'artwork cover album image hide', control:switchControl('showArtwork','Show artwork','Show cover art beside tracks and in the player.') },
      { tab:'appearance', section:'Appearance', label:'Compact track rows', terms:'compact rows table density list', control:switchControl('compactRows','Compact track rows','Fit more tracks in a list with shorter rows.') },
      { tab:'appearance', section:'Appearance', label:'Collapse the sidebar', terms:'sidebar navigation narrow compact', control:'<div class="setting-row"><span class="setting-copy"><b>Sidebar</b><small>Keep navigation compact while you listen.</small></span><button class="button small" data-action="toggle-sidebar">' + (state.collapsed ? 'Expand sidebar' : 'Collapse sidebar') + '</button></div>' },
      { tab:'playback', section:'Playback', label:'Continue playing when the queue ends', terms:'autoplay next track continue queue', control:switchControl('autoplay','Continue playing','Continue with your current music when a listening session ends.') },
      { tab:'playback', section:'Playback', label:'Playback speed', terms:'speed rate slow fast local file', control:settingSelect('playbackRate','Playback speed','Adjust the speed of local audio files.',speeds) },
      { tab:'playback', section:'Playback', label:'Crossfade between tracks', terms:'crossfade fade transitions smooth songs overlap audio', control:settingSelect('crossfadeSeconds','Crossfade','Overlap local tracks as one fades out and the next fades in.',[['0','Off'],['2','2 seconds'],['4','4 seconds'],['6','6 seconds'],['8','8 seconds'],['12','12 seconds']]) },
      { tab:'playback', section:'Playback', label:'Sleep timer', terms:'sleep timer stop music after minutes bedtime', control:settingSelect('sleepTimerMinutes','Sleep timer','Stop playback after a set time.',[['0','Off'],['5','5 minutes'],['15','15 minutes'],['30','30 minutes'],['45','45 minutes'],['60','60 minutes']]) },
      { tab:'playback', section:'Playback', label:'Playback volume', terms:'volume loudness level sound', control:settingRange('defaultVolume','Playback volume','Set the playback level for this browser.',0,100,1,'%') },
      { tab:'audio', section:'Audio', label:'Player visualization', terms:'waveform spectrum audio frequency peaks signal', control:settingSelect('waveformStyle','Player visualization','Show a waveform, frequency peaks, or no visualizer.',[['waveform','Waveform'],['spectrum','Frequency peaks'],['off','Off']]) },
      { tab:'audio', section:'Audio', label:'Equalizer preset', terms:'equalizer eq bass vocal treble flat', control:settingSelect('eqPreset','Equalizer preset','Apply a starting point, then adjust each band.',[['flat','Flat'],['bass','Bass boost'],['vocal','Vocal clarity'],['treble','Treble boost'],['custom','Custom']]) },
      { tab:'audio', section:'Audio', label:'Bass level', terms:'equalizer bass low frequencies', control:settingRange('eqBass','Bass','Adjust low frequencies.',-12,12,1,' dB') },
      { tab:'audio', section:'Audio', label:'Mid level', terms:'equalizer mid voice frequencies', control:settingRange('eqMid','Mid','Adjust the middle frequencies.',-12,12,1,' dB') },
      { tab:'audio', section:'Audio', label:'Treble level', terms:'equalizer treble high frequencies', control:settingRange('eqTreble','Treble','Adjust high frequencies.',-12,12,1,' dB') },
      { tab:'library', section:'Library', label:'Local music sort order', terms:'sort files title newest recently added library', control:settingSelect('librarySort','Local music sort order','Choose how files appear in your uploads and downloads.',[['recent','Recently added'],['title','Title A–Z'],['artist','Artist A–Z']]) },
      { tab:'library', section:'Library', label:'Liked songs sort order', terms:'sort liked saved favorites title recently', control:settingSelect('likedSort','Liked songs sort order','Choose the order for your saved tracks.',[['recent','Recently liked'],['title','Title A–Z']]) },
      { tab:'library', section:'Library', label:'Show listening history in library', terms:'history recently played section library display', control:switchControl('showHistoryOnLibrary','Show listening history in library','Show the recently played section on your library page.') },
      { tab:'library', section:'Library', label:'Save listening history', terms:'history privacy remember played tracks', control:switchControl('saveHistory','Save listening history','Keep a private list of tracks played in this browser.') },
      { tab:'privacy', section:'Privacy', label:'Clear history when leaving', terms:'history clear exit privacy erase', control:switchControl('clearHistoryOnExit','Clear history when leaving','Clear the local listening history when you close this page.') },
      { tab:'privacy', section:'Privacy', label:'Clear listening history', terms:'history delete remove clear played', control:'<div class="setting-row"><span class="setting-copy"><b>Clear listening history</b><small>Remove the listening history saved in this browser.</small></span><button class="button small ghost" data-action="clear-history">Clear history</button></div>' },
      { tab:'privacy', section:'Privacy', label:'Export local data', terms:'backup export json playlists lyrics settings', control:'<div class="setting-row"><span class="setting-copy"><b>Export local data</b><small>Save playlists, lyrics, and preferences as a JSON file.</small></span><button class="button small" data-action="export-data">Export backup</button></div>' },
      { tab:'accessibility', section:'Accessibility', label:'Reduced motion', terms:'animation movement accessibility', control:switchControl('reducedMotion','Reduced motion','Reduce interface animation and smooth scrolling.') },
      { tab:'accessibility', section:'Accessibility', label:'Text size', terms:'font size small standard large accessibility', control:settingSelect('textSize','Text size','Adjust text across the listening interface.',[['Small','Small'],['Standard','Standard'],['Large','Large']]) },
      { tab:'accessibility', section:'Accessibility', label:'Higher contrast', terms:'contrast visibility readability accessible', control:switchControl('highContrast','Higher contrast','Increase contrast for borders, text, and keyboard focus.') },
      { tab:'accessibility', section:'Accessibility', label:'Keyboard shortcuts', terms:'keyboard keys space seek search next previous like mute queue escape volume', control:'<div class="settings-shortcuts">' + [['Space','Play or pause'],['← / →','Seek ' + (Number(state.settings.seekStep) || 5) + ' seconds'],['Ctrl / ⌘ + ↑ / ↓','Change volume'],['⌘ / Ctrl + K','Open search'],['⌘ / Ctrl + L','Like current track'],['⌘ / Ctrl + N','Next track'],['⌘ / Ctrl + P','Previous track'],['⌘ / Ctrl + Q','Open queue'],['M','Mute or unmute'],['Escape','Close a dialog']].map(function (x) { return '<div class="setting-row"><span class="setting-copy"><b>' + esc(x[1]) + '</b></span><kbd class="tag">' + esc(x[0]) + '</kbd></div>'; }).join('') + '</div>' },
      { tab:'advanced', section:'Advanced', label:'Clear recent search', terms:'search history recent terms clear remove', control:'<div class="setting-row"><span class="setting-copy"><b>Clear recent search</b><small>Remove the last search term stored in this browser.</small></span><button class="button small ghost" data-action="clear-search-history">Clear search</button></div>' },
      { tab:'advanced', section:'Advanced', label:'Restore default settings', terms:'reset preferences defaults restore original', control:'<div class="setting-row"><span class="setting-copy"><b>Restore default settings</b><small>Reset preferences without deleting your local music or playlists.</small></span><button class="button small" data-action="reset-settings">Restore defaults</button></div>' },
      { tab:'advanced', section:'Advanced', label:'Browser connection', terms:'network online offline diagnostics status', control:'<div class="setting-row"><span class="setting-copy"><b>Browser connection</b><small>Current network status for this browser.</small></span><span class="unavailable">' + (navigator.onLine ? 'Online' : 'Offline') + '</span></div>' }
    ];
    var fineRanges = fineTuningRanges().map(function (item) {
      return { tab:'fine', section:'Fine tuning', label:item[1], terms:(item[0] + ' ' + item[1] + ' ' + item[2]).toLowerCase(), control:settingRange(item[0], item[1], item[2], item[3], item[4], item[5], item[6]) };
    });
    var fineSwitches = fineTuningSwitches().map(function (item) {
      return { tab:'fine', section:'Fine tuning', label:item[1], terms:(item[1] + ' ' + item[2] + ' ' + item[3]).toLowerCase(), control:switchControl(item[0], item[1], item[2]) };
    });
    var analyzerOption = { tab:'fine', section:'Fine tuning', label:'Analyzer resolution', terms:'fft spectrum analyzer resolution signal detail', control:settingSelect('analyserFftSize','Analyzer resolution','Choose how much frequency detail the live visualizer reads.',[['256','256 points'],['512','512 points'],['1024','1,024 points'],['2048','2,048 points'],['4096','4,096 points']]) };
    return catalog.concat(fineRanges, fineSwitches, [analyzerOption]);
  }
  function settingsSearchResults(query) {
    var normalized = String(query || '').trim().toLowerCase();
    var matches = settingCatalog().filter(function (item) { return (item.label + ' ' + item.terms).toLowerCase().indexOf(normalized) >= 0; });
    if (!matches.length) return '<div class="settings-no-results"><b>No matching settings</b><span>Try a shorter search, such as “sound”, “color”, or “history”.</span></div>';
    return '<p class="settings-search-count">' + matches.length + (matches.length === 1 ? ' matching preference' : ' matching preferences') + '</p><div class="settings-search-list">' + matches.map(function (item) { return '<article class="settings-search-result"><div class="settings-result-head"><span>' + esc(item.section) + '</span><button class="link-button" data-action="settings-tab" data-id="' + item.tab + '">Open section</button></div>' + item.control + '</article>'; }).join('') + '</div>';
  }
  function settingView() {
    var content = '';
    if (selectedSettings === 'general') content = '<h2>General</h2><p>Choose how Rill opens and behaves on this device.</p>' + settingSelect('startPage','Startup page','Choose which page opens when you visit Rill.',[['home','Home'],['search','Search'],['library','Library']]) + switchControl('openQueueOnStart','Open the queue on startup','Show the listening queue when the site opens on desktop.') + switchControl('rememberPosition','Remember playback position','Keep the last position of a local track when you return.') + switchControl('pauseWhenHidden','Pause when this tab is hidden','Pause while you are away and resume when you come back.') + switchControl('confirmDelete','Ask before removing local music','Show a confirmation before deleting a file from this browser.');
    else if (selectedSettings === 'appearance') content = '<h2>Appearance</h2><p>Choose a theme, then tune Rill’s accent and spacing.</p>' + settingSelect('theme','Color theme','Choose a light or dark surface.',[['dark','Dark'],['light','Light'],['oled','Pure black OLED'],['graphite','Graphite']]) + '<section class="settings-theme-card"><div class="settings-theme-card-head"><div><b>Accent color</b><small>Pick a preset, or fine tune hue, intensity, and brightness.</small></div><span class="theme-current-pill">Custom</span></div>' + accentSetting() + settingRange('accentHue','Hue','Choose a point across the full color spectrum.',0,360,1,'°') + settingRange('accentIntensity','Intensity','Move from a soft tint to a vivid accent.',0,100,1,'%') + settingRange('accentBrightness','Brightness','Set how light or deep the accent appears.',12,82,1,'%') + settingRange('meshBrightness','Ambient glow','Set the accent glow behind this settings panel.',0,100,1,'%') + '</section>' + settingSelect('density','Interface density','Choose the spacing used across the interface.',[['comfortable','Comfortable'],['compact','Compact'],['spacious','Spacious']]) + settingSelect('coverShape','Cover shape','Set the shape of album and track artwork.',[['square','Square'],['soft','Soft corners'],['round','Round']]) + switchControl('showArtwork','Show artwork','Show cover art beside tracks and in the player.') + switchControl('compactRows','Compact track rows','Fit more tracks in a list with shorter rows.') + '<div class="setting-row"><span class="setting-copy"><b>Sidebar</b><small>Keep navigation compact while you listen.</small></span><button class="button small" data-action="toggle-sidebar">' + (state.collapsed ? 'Expand sidebar' : 'Collapse sidebar') + '</button></div>';
    else if (selectedSettings === 'playback') content = '<h2>Playback</h2><p>Set playback behavior for local audio.</p>' + switchControl('autoplay','Continue playing','Continue with your current music when a listening session ends.') + settingSelect('playbackRate','Playback speed','Adjust the speed of local audio files.',[['0.75','0.75×'],['1','Normal'],['1.25','1.25×'],['1.5','1.5×'],['2','2×']]) + settingSelect('crossfadeSeconds','Crossfade','Overlap local tracks as one fades out and the next fades in.',[['0','Off'],['2','2 seconds'],['4','4 seconds'],['6','6 seconds'],['8','8 seconds'],['12','12 seconds']]) + settingSelect('sleepTimerMinutes','Sleep timer','Stop playback after a set time.',[['0','Off'],['5','5 minutes'],['15','15 minutes'],['30','30 minutes'],['45','45 minutes'],['60','60 minutes']]) + settingRange('defaultVolume','Playback volume','Set the playback level for this browser.',0,100,1,'%') + '<div class="info-banner">Crossfade is available when both current and next tracks are local files on this device.</div>';
    else if (selectedSettings === 'audio') content = '<h2>Audio</h2><p>Fine tune playback and the live signal display.</p>' + settingSelect('waveformStyle','Player visualization','Show a waveform, frequency peaks, or no visualizer.',[['waveform','Waveform'],['spectrum','Frequency peaks'],['off','Off']]) + settingSelect('eqPreset','Equalizer preset','Apply a starting point, then adjust each band.',[['flat','Flat'],['bass','Bass boost'],['vocal','Vocal clarity'],['treble','Treble boost'],['custom','Custom']]) + settingRange('eqBass','Bass','Adjust low frequencies.',-12,12,1,' dB') + settingRange('eqMid','Mid','Adjust the middle frequencies.',-12,12,1,' dB') + settingRange('eqTreble','Treble','Adjust high frequencies.',-12,12,1,' dB') + '<div class="info-banner">The equalizer and visualizer work locally in your browser.</div>';
    else if (selectedSettings === 'library') content = '<h2>Library</h2><p>Organize the music you add from this device.</p>' + settingSelect('librarySort','Local music sort order','Choose how files appear in uploads and downloads.',[['recent','Recently added'],['title','Title A–Z'],['artist','Artist A–Z']]) + settingSelect('likedSort','Liked songs sort order','Choose the order for your saved tracks.',[['recent','Recently liked'],['title','Title A–Z']]) + switchControl('showHistoryOnLibrary','Show listening history in library','Show the recently played section on your library page.') + switchControl('saveHistory','Save listening history','Keep a private list of tracks played in this browser.') + '<div class="setting-row"><span class="setting-copy"><b>Manage local music</b><small>Your audio stays in this browser profile.</small></span><button class="button small" data-page="uploads">Open uploads</button></div>';
    else if (selectedSettings === 'privacy') content = '<h2>Privacy</h2><p>Your preferences and local library stay in this browser profile.</p>' + switchControl('clearHistoryOnExit','Clear history when leaving','Clear the local listening history when you close this page.') + '<div class="setting-row"><span class="setting-copy"><b>Listening history</b><small>Remove the listening history saved in this browser.</small></span><button class="button small ghost" data-action="clear-history">Clear history</button></div><div class="setting-row"><span class="setting-copy"><b>Local data backup</b><small>Export playlists, lyrics, and preferences as a JSON file.</small></span><button class="button small" data-action="export-data">Export backup</button></div><div class="setting-row"><span class="setting-copy"><b>Account sign-in</b><small>Use Google or a one-time email link.</small></span><button class="button small" data-page="' + (authUser ? 'profile' : 'login') + '">' + (authUser ? 'Connected' : authClient ? 'Open sign-in' : 'Setup required') + '</button></div>';
    else if (selectedSettings === 'accessibility') content = '<h2>Accessibility</h2><p>Make controls easier to read and use.</p>' + switchControl('reducedMotion','Reduced motion','Reduce interface animation and smooth scrolling.') + settingSelect('textSize','Text size','Adjust text across the listening interface.',[['Small','Small'],['Standard','Standard'],['Large','Large']]) + switchControl('highContrast','Higher contrast','Increase contrast for borders, text, and keyboard focus.') + '<h3 class="settings-subhead">Keyboard shortcuts</h3>' + settingCatalog().filter(function (item) { return item.label === 'Keyboard shortcuts'; })[0].control;
    else if (selectedSettings === 'fine') content = '<h2>Fine tuning</h2><p>Adjust the layout, player, visualizer, lists, and interface details. Changes apply immediately and are saved on this device.</p><div class="fine-settings-group"><h3 class="settings-subhead">Layout and spacing</h3>' + fineTuningRanges().slice(0, 12).map(function (item) { return settingRange(item[0], item[1], item[2], item[3], item[4], item[5], item[6]); }).join('') + '</div><div class="fine-settings-group"><h3 class="settings-subhead">Text and controls</h3>' + fineTuningRanges().slice(12, 27).map(function (item) { return settingRange(item[0], item[1], item[2], item[3], item[4], item[5], item[6]); }).join('') + '</div><div class="fine-settings-group"><h3 class="settings-subhead">Player and lists</h3>' + fineTuningRanges().slice(27).map(function (item) { return settingRange(item[0], item[1], item[2], item[3], item[4], item[5], item[6]); }).join('') + settingSelect('analyserFftSize','Analyzer resolution','Choose how much frequency detail the live visualizer reads.',[['256','256 points'],['512','512 points'],['1024','1,024 points'],['2048','2,048 points'],['4096','4,096 points']]) + '</div><div class="fine-settings-group"><h3 class="settings-subhead">Interface elements</h3>' + fineTuningSwitches().map(function (item) { return switchControl(item[0], item[1], item[2]); }).join('') + '</div>';
    else if (selectedSettings === 'advanced') content = '<h2>Advanced</h2><p>Local storage, backup, and application preferences.</p>' + '<div class="setting-row"><span class="setting-copy"><b>Install Rill</b><small>Add the music player to your home screen or desktop.</small></span><button class="button small" data-action="install-app">Install app</button></div><div class="setting-row"><span class="setting-copy"><b>Clear recent search</b><small>Remove the last search term stored in this browser.</small></span><button class="button small ghost" data-action="clear-search-history">Clear search</button></div><div class="setting-row"><span class="setting-copy"><b>Browser connection</b><small>Current network status for this browser.</small></span><span class="unavailable">' + (navigator.onLine ? 'Online' : 'Offline') + '</span></div><div class="setting-row"><span class="setting-copy"><b>Restore default settings</b><small>Reset preferences without deleting local music or playlists.</small></span><button class="button small" data-action="reset-settings">Restore defaults</button></div><div class="setting-row"><span class="setting-copy"><b>Export a backup</b><small>Download playlists, lyrics, and preferences.</small></span><button class="button small" data-action="export-data">Export backup</button></div>';
    return '<div class="setting-layout">' + settingsTabs() + '<div class="settings-panel">' + content + '</div></div>';
  }
  function pageSettings() {
    var searching = !!settingsQuery.trim();
    return pageHead('MAKE IT YOURS', 'Settings', 'Personalize how Rill looks, sounds, and remembers your library.') +
      '<div class="settings-tools"><div class="settings-search">' + icon('search') + '<input id="settingsSearch" type="search" value="' + esc(settingsQuery) + '" autocomplete="off" placeholder="Search settings" aria-label="Search all settings"><button class="quiet-button" data-action="clear-settings-search" aria-label="Clear settings search"' + (searching ? '' : ' hidden') + '>' + icon('x') + '</button></div><span class="settings-tools-note">Search across 90+ preferences</span></div>' +
      '<div id="settingsSearchResults" class="settings-search-results"' + (searching ? '' : ' hidden') + '>' + (searching ? settingsSearchResults(settingsQuery) : '') + '</div>' +
      '<div id="settingsWorkspace"' + (searching ? ' hidden' : '') + '>' + settingView() + '</div>';
  }
  function pagePlans() { return pageHead('SUPPORT THE MUSIC', 'Rill Plus', 'A simple plan for more room to listen.') + '<div class="plan-card"><span class="eyebrow">COMING WITH BILLING INTEGRATION</span><h3>Rill Plus</h3><p>Higher quality streaming, offline catalog listening, and deeper creator tools belong in a provider-backed plan.</p><div class="plan-price">$— <small style="font-size:11px;color:#92968b;font-weight:400">/ month</small></div><ul><li>Licensed catalog streaming</li><li>Offline listening where rights allow</li><li>Expanded creator analytics</li><li>Family and artist plans</li></ul><button class="button" data-action="plan-interest">Notify me when available</button><p class="plan-note">No payment will be taken. Billing is not connected, so a subscription cannot be activated here.</p></div>'; }
  function pageHelp() { return pageHead('HERE TO HELP', 'Help & support', 'Find a way through or send us a note.') + '<div class="info-banner"><strong>Local product preview.</strong> Support ticket submission is not connected to a service. For issues with playback, confirm the browser can play your chosen audio format and that the file is available.</div><button class="button" data-action="copy-diagnostics">Copy browser diagnostics</button>'; }
  function setupAuth() {
    var config = window.RILL_AUTH_CONFIG || {};
    if (!config.url || !config.anonKey) return;
    function initialize() {
      if (!window.supabase || !window.supabase.createClient) return;
      try {
        authClient = window.supabase.createClient(config.url, config.anonKey);
        authClient.auth.onAuthStateChange(function (event, session) {
          authUser = session && session.user ? session.user : null;
          var meta = authUser && authUser.user_metadata || {}; authDisplayName = meta.full_name || meta.name || '';
          setTimeout(function () {
            var route = currentRoute();
            if (authUser && ['login','register','recover'].indexOf(route.page) >= 0) nav('profile');
            else if (document.getElementById('pageContent')) renderPage();
            var profileLabel = document.querySelector('.profile-copy b'); if (profileLabel) profileLabel.textContent = authUser ? (authDisplayName || authUser.email) : (state.profileName || 'Guest listener');
          }, 0);
          if (event === 'SIGNED_IN') toast('You are signed in to Rill.');
          if (event === 'SIGNED_OUT') toast('You have signed out.');
        });
        if (document.getElementById('pageContent')) renderPage();
      } catch (error) { authClient = null; console.warn('Could not initialize account sign-in', error); }
    }
    if (window.supabase && window.supabase.createClient) { initialize(); return; }
    var sdk = document.createElement('script'); sdk.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; sdk.async = true; sdk.onload = initialize; sdk.onerror = function () { console.warn('Account sign-in library could not be loaded.'); };
    document.head.appendChild(sdk);
  }
  function sendAuthLink(form) {
    if (!authClient) { toast('Connect the Supabase project first; setup steps are in AUTH-SETUP.md.'); return; }
    var data = new FormData(form); var email = String(data.get('email') || '').trim(); var mode = String(data.get('mode') || 'login'); var name = String(data.get('name') || '').trim();
    if (!email) { toast('Enter an email address first.'); return; }
    authClient.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname + location.search, shouldCreateUser: mode === 'register', data: name ? { full_name: name } : undefined } }).then(function (result) {
      if (result.error) throw result.error;
      toast('Check your email for a secure sign-in link.');
    }).catch(function (error) { toast(error.message || 'Could not send the sign-in email.'); });
  }
  function signInWithGoogle() {
    if (!authClient) { toast('Connect the Supabase project first; setup steps are in AUTH-SETUP.md.'); return; }
    authClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname + location.search } }).then(function (result) { if (result.error) toast(result.error.message || 'Google sign-in could not start.'); }).catch(function (error) { toast(error.message || 'Google sign-in could not start.'); });
  }
  function signOut() { if (!authClient) return; authClient.auth.signOut().then(function (result) { if (result.error) toast(result.error.message || 'Could not sign out.'); }).catch(function (error) { toast(error.message || 'Could not sign out.'); }); }
  function installApp() {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) { toast('Rill is already installed on this device.'); return; }
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt(); deferredInstallPrompt.userChoice.then(function (choice) { toast(choice && choice.outcome === 'accepted' ? 'Rill is being installed.' : 'Install dismissed. You can try again any time.'); deferredInstallPrompt = null; });
      return;
    }
    toast(/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Use Share, then Add to Home Screen.' : 'Use Install app from your browser menu or address bar.');
  }
  function pageAuth(mode) { var heading = mode === 'register' ? 'Create your Rill account' : mode === 'recover' ? 'Email sign-in' : 'Welcome back'; var links = mode === 'register' ? '<button class="link-button" data-page="login">Already have an account? Sign in</button>' : mode === 'recover' ? '<button class="link-button" data-page="login">Back to sign in</button>' : '<button class="link-button" data-page="recover">Use an email link</button><button class="link-button" data-page="register">Create an account</button>'; var config = window.RILL_AUTH_CONFIG || {}; var setupNote = authClient ? '' : config.url && config.anonKey ? '<div class="info-banner auth-setup-note">Loading your account connection…</div>' : '<div class="info-banner auth-setup-note">Sign-in is ready to connect. Add your Supabase project URL and public anon key in <code>auth-config.js</code>, then enable Google in the Supabase dashboard.</div>'; return pageHead('YOUR LISTENING, KEPT CLOSE', heading, 'Use Google or a secure one-time link sent to your email.') + '<div class="plan-card auth-card"><button class="button google-button full-button" type="button" data-action="auth-google"><span class="google-mark">G</span>Continue with Google</button><div class="auth-divider"><span>or continue with email</span></div><form data-form="auth"><input type="hidden" name="mode" value="' + esc(mode) + '"><div class="field"><label for="authEmail">Email address</label><input id="authEmail" name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div>' + (mode === 'register' ? '<div class="field"><label for="authName">Name (optional)</label><input id="authName" name="name" maxlength="60" autocomplete="name" placeholder="How should we call you?"></div>' : '') + '<button class="button primary full-button" type="submit">' + (mode === 'register' ? 'Create account with email' : 'Email me a sign-in link') + '</button></form><div class="auth-links">' + links + '</div>' + setupNote + '<div class="plan-note">No password is stored in this browser. Email sign-in uses a one-time link; Google handles its own secure sign-in.</div></div>'; }
  function notFound() { return pageHead('RILL', 'Nothing playing here', 'This page may have moved, or this local preview does not include it.') + emptyState('Page not found', 'Return to Home and keep exploring.', 'home', 'Back to Home', 'home'); }

  function renderPage() {
    var r = currentRoute();
    var missingDetail = (r.page === 'artist' && !artists.some(function (artist) { return artist.id === r.id; }) && !externalArtistById(r.id) && !jamendoArtistById(r.id)) || (r.page === 'album' && !albumById(r.id)) || (r.page === 'track' && !trackById(r.id)) || (r.page === 'playlist' && !playlistById(r.id));
    if (missingDetail) { r = { page: 'home', id: null, sub: null }; history.replaceState(null, '', location.pathname + location.search + '#home'); }
    state.page = r.page; setShell(); setTheme();
    var body = '';
    if (r.page === 'home') body = pageHome();
    else if (r.page === 'explore') body = pageExplore();
    else if (r.page === 'search') body = renderSearchPage();
    else if (r.page === 'charts') body = pageCharts();
    else if (r.page === 'new-releases') body = pageNewReleases();
    else if (r.page === 'radio') body = pageRadio();
    else if (r.page === 'library') body = pageLibrary();
    else if (r.page === 'liked') body = pageLiked();
    else if (r.page === 'albums') body = pageAlbums();
    else if (r.page === 'artists') body = pageArtists();
    else if (r.page === 'playlists') body = pagePlaylists();
    else if (r.page === 'playlist') body = renderPlaylistDetail(r.id);
    else if (r.page === 'artist') body = renderArtistDetail(r.id);
    else if (r.page === 'album') body = renderAlbumDetail(r.id);
    else if (r.page === 'track') body = renderTrackDetail(r.id);
    else if (r.page === 'history') body = pageHistory();
    else if (r.page === 'downloads') body = pageDownloads();
    else if (r.page === 'uploads') body = pageUploads();
    else if (r.page === 'videos') body = pageVideos();
    else if (r.page === 'podcasts') body = pagePodcasts();
    else if (r.page === 'notifications') body = pageNotifications();
    else if (r.page === 'profile') body = pageProfile();
    else if (r.page === 'queue') body = pageQueue();
    else if (r.page === 'lyrics') body = renderLyrics();
    else if (r.page === 'settings') { if (r.id && settingsSections.some(function (tab) { return tab[0] === r.id; })) selectedSettings = r.id; body = pageSettings(); }
    else if (r.page === 'plans') body = pagePlans();
    else if (r.page === 'help') body = pageHelp();
    else if (r.page === 'login' || r.page === 'register' || r.page === 'recover') body = pageAuth(r.page);
    else body = notFound();
    document.getElementById('pageContent').innerHTML = body;
    document.body.classList.add('app-ready');
    document.querySelectorAll('.nav-item[data-page]').forEach(function (item) { item.classList.toggle('active', item.getAttribute('data-page') === r.page); });
    document.getElementById('pageScroll').scrollTop = 0;
    updatePlayerView(); updateQueueView(); updateCounts(); persist();
    if (r.page === 'artist' && jamendoArtistById(r.id) && !jamendoArtistLoaded[r.id]) ensureJamendoArtistTracks(r.id);
  }

  function updateCounts() { var e = document.getElementById('likedCount'); if (e) e.textContent = String(state.liked.length || 0); }
  function updatePlayerView() {
    var holder = document.getElementById('playerTrack'); var t = trackById(state.currentId);
    if (!t) { holder.removeAttribute('data-action'); holder.innerHTML = '<div class="cover cover-empty"></div><div class="track-copy"><b>No track selected</b><span>Add music from your device</span></div>'; }
    else { holder.setAttribute('data-action', 'expand-player'); holder.innerHTML = cover(t, 'small-cover') + '<div class="track-copy"><b>' + esc(t.title) + '</b><span>' + esc(artistName(t.artistId)) + '</span></div><button class="like-current ' + (state.liked.indexOf(t.id) >= 0 ? 'liked' : '') + '" data-action="like-track" data-id="' + esc(t.id) + '" aria-label="Like current track">' + icon('heart') + '</button>'; }
    var play = document.querySelector('.play-button'); play.disabled = !t; play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play'); play.innerHTML = icon(state.playing ? 'pause' : 'play');
    document.querySelector('[data-action="shuffle"]').classList.toggle('active', !!state.shuffle);
    var repeat = document.querySelector('[data-action="repeat"]'); repeat.classList.toggle('active', state.repeat > 0); repeat.title = state.repeat === 2 ? 'Repeat one' : state.repeat === 1 ? 'Repeat all' : 'Repeat off'; repeat.setAttribute('aria-label', repeat.title);
    ['previous','next'].forEach(function (action) { var button = document.querySelector('[data-action="' + action + '"]'); if (button) button.disabled = !t; });
    document.getElementById('volume').value = String(state.volume);
    document.getElementById('duration').textContent = t ? fmt(t.duration) : '0:00';
    if (state.page === 'lyrics') { var page = document.getElementById('pageContent'); if (page) page.innerHTML = renderLyrics(); lastActiveLyricIndex = -2; }
    updateTimeline();
    updateMediaSession();
  }
  function getElapsed() { if (!state.playing || !state.currentId) return Number(state.elapsed) || 0; if (audioSrcTrack(trackById(state.currentId))) return Number(audioElement.currentTime) || 0; return Math.max(0, synthOffset + (audioContext ? audioContext.currentTime - synthStartedAt : 0)); }
  function updateTimeline() {
    var t = trackById(state.currentId); var elapsed = getElapsed(); if (state.playing) state.elapsed = elapsed;
    var duration = t ? Number(t.duration) : 0; var percent = duration ? Math.min(100, elapsed / duration * 100) : 0;
    var seek = document.getElementById('seek'); if (seek && !seek.matches(':active')) seek.value = String(percent);
    var expanded = document.getElementById('expandedSeek'); if (expanded && !expanded.matches(':active')) expanded.value = String(percent);
    var e = document.getElementById('elapsed'); if (e) e.textContent = fmt(elapsed);
    var expandedElapsed = document.getElementById('expandedElapsed'); if (expandedElapsed) expandedElapsed.textContent = fmt(elapsed);
    var d = document.getElementById('duration'); if (d) d.textContent = t ? fmt(duration) : '0:00';
    drawVisualizer(); updateLyricHighlight();
  }
  function updateLyricHighlight() {
    var host = document.getElementById('lyricLines'); if (!host) return;
    var lines = Array.prototype.slice.call(host.querySelectorAll('.lyric-line[data-seconds]')); var active = -1;
    lines.forEach(function (line, index) { if (Number(line.getAttribute('data-seconds')) <= getElapsed()) active = index; });
    lines.forEach(function (line, index) { line.classList.toggle('current', index === active); });
    if (active !== lastActiveLyricIndex) { lastActiveLyricIndex = active; if (active >= 0 && lines[active].scrollIntoView) lines[active].scrollIntoView({ block: 'nearest', behavior: state.settings.reducedMotion ? 'auto' : 'smooth' }); }
  }
  function drawVisualizer() {
    var canvases = document.querySelectorAll('.audio-visualizer'); if (!canvases.length) return;
    var mode = state.settings.waveformStyle || 'waveform';
    canvases.forEach(function (canvas) {
      canvas.hidden = mode === 'off'; if (canvas.hidden) return;
      var ctx = canvas.getContext('2d'); if (!ctx) return;
      var width = canvas.width; var height = canvas.height; ctx.clearRect(0, 0, width, height);
      if (analyserNode && state.playing) {
        if (mode === 'spectrum' && frequencyData) analyserNode.getByteFrequencyData(frequencyData);
        else if (timeData) analyserNode.getByteTimeDomainData(timeData);
        signalSeen = true;
      }
      var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1ed760';
      if (mode === 'spectrum' && frequencyData && signalSeen) {
        var count = 48; var gap = 2; var barWidth = (width - gap * (count - 1)) / count; var bins = Math.min(frequencyData.length, 192); var sensitivity = Math.max(.2, Math.min(1.5, Number(state.settings.waveformSensitivity || 85) / 100));
        for (var i = 0; i < count; i++) { var bin = Math.floor(i / count * bins); var level = frequencyData[bin] / 255; var barHeight = Math.max(2, Math.min(height, level * (height - 3) * sensitivity)); ctx.fillStyle = accent; ctx.fillRect(i * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight); }
      } else if (timeData && signalSeen) {
        ctx.beginPath();
        var waveGain = Math.max(.2, Math.min(1.5, Number(state.settings.waveformSensitivity || 85) / 100));
        for (var j = 0; j < timeData.length; j++) { var x = j / (timeData.length - 1) * width; var y = height / 2 + ((timeData[j] - 128) / 128) * (height * .43) * waveGain; if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.strokeStyle = accent; ctx.lineWidth = Number(state.settings.waveformLine) || 1.6; ctx.stroke();
      } else { ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.stroke(); }
    });
  }
  function updateQueueView() {
    var current = trackById(state.currentId); var now = document.getElementById('queueNow');
    now.innerHTML = current ? '<div class="now-label">NOW PLAYING</div><div class="queue-track">' + cover(current, 'small-cover') + '<span style="min-width:0"><b>' + esc(current.title) + '</b><small>' + esc(artistName(current.artistId)) + '</small></span></div>' : '<div class="now-label">NOW PLAYING</div><small style="color:#92968b;font-size:10px">Nothing yet — pick a record.</small>';
    var list = document.getElementById('queueList'); var items = safeTracks(state.queue); document.getElementById('queueCount').textContent = String(items.length);
    list.innerHTML = items.length ? items.map(function (t, i) { return '<div class="queue-row" draggable="true" data-queue-index="' + i + '">' + cover(t, 'small-cover') + '<span class="q-copy"><b>' + esc(t.title) + '</b><small>' + esc(artistName(t.artistId)) + '</small></span><button class="q-remove" data-action="remove-queue" data-id="' + i + '" aria-label="Remove from queue">' + icon('x') + '</button></div>'; }).join('') : '<div style="padding:14px 12px;color:#777c71;font-size:10px;line-height:1.6">Add tracks with <b style="color:#a7ad99">Play next</b> or <b style="color:#a7ad99">Add to queue</b>.</div>';
    setShell();
  }
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return; var t = trackById(state.currentId);
    try {
      navigator.mediaSession.metadata = t ? new MediaMetadata({ title: t.title, artist: artistName(t.artistId), album: t.albumName || albumTitle(t.albumId), artwork: t.image ? [{ src: t.image, sizes: '512x512', type: 'image/jpeg' }] : [] }) : null;
      navigator.mediaSession.playbackState = state.playing ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', function () { resumePlayback(); }); navigator.mediaSession.setActionHandler('pause', function () { pausePlayback(); }); navigator.mediaSession.setActionHandler('nexttrack', nextTrack); navigator.mediaSession.setActionHandler('previoustrack', previousTrack);
      if (t && navigator.mediaSession.setPositionState) navigator.mediaSession.setPositionState({ duration: Number(t.duration), playbackRate: audioSrcTrack(t) ? audioElement.playbackRate : 1, position: Math.min(getElapsed(), Number(t.duration)) });
    } catch (e) { /* Browser support varies. */ }
  }
  function applyEqualizer() {
    if (!eqFilters.length) return;
    ['eqBass','eqMid','eqTreble'].forEach(function (key, index) { eqFilters[index].gain.value = Math.max(-12, Math.min(12, Number(state.settings[key]) || 0)); });
  }
  function makeAudioContext() {
    if (audioContext) return audioContext;
    var Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) throw new Error('Web Audio is unavailable in this browser.');
    audioContext = new Ctx(); masterGain = audioContext.createGain(); masterGain.gain.value = Number(state.volume == null ? 72 : state.volume) / 100 * 0.55;
    var bass = audioContext.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 180;
    var mid = audioContext.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = .8;
    var treble = audioContext.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 4200;
    analyserNode = audioContext.createAnalyser(); analyserNode.fftSize = Number(state.settings.analyserFftSize) || 1024; analyserNode.smoothingTimeConstant = Math.max(.1, Math.min(.95, (Number(state.settings.analyserSmoothing) || 78) / 100));
    frequencyData = new Uint8Array(analyserNode.frequencyBinCount); timeData = new Uint8Array(analyserNode.fftSize); timeData.fill(128);
    eqFilters = [bass, mid, treble]; masterGain.connect(bass); bass.connect(mid); mid.connect(treble); treble.connect(analyserNode); analyserNode.connect(audioContext.destination); applyEqualizer();
    return audioContext;
  }
  function connectLocalAudio() {
    var ctx = makeAudioContext();
    if (!mediaElementSource) { mediaElementSource = ctx.createMediaElementSource(audioElement); mediaElementSource.connect(eqFilters[0]); }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function connectSecondaryAudio() {
    var ctx = makeAudioContext();
    if (!secondaryMediaElementSource) { secondaryMediaElementSource = ctx.createMediaElementSource(secondaryAudioElement); secondaryMediaElementSource.connect(eqFilters[0]); }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function transitionTarget() {
    if (!state.currentId || state.repeat === 2) return null;
    if (state.queue.length) return { id: state.queue[0], type: 'queue' };
    var session = state.sessionIds || []; var index = session.indexOf(state.currentId);
    if (index >= 0 && index < session.length - 1) return { id: session[index + 1], type: 'session', sessionIds: session };
    if (state.repeat === 1 && session.length) return { id: session[0], type: 'repeat', sessionIds: session };
    var library = allTracks();
    if (state.settings.autoplay && library.length) { var currentIndex = library.findIndex(function (t) { return t.id === state.currentId; }); return { id: library[(currentIndex + 1 + library.length) % library.length].id, type: 'autoplay' }; }
    return null;
  }
  function cancelCrossfade() {
    crossfadeRequest += 1; crossfadePendingId = '';
    if (crossfadeTimer) window.clearInterval(crossfadeTimer); crossfadeTimer = 0;
    if (crossfadeState) {
      crossfadeState.incoming.pause(); crossfadeState.incoming.volume = 0; crossfadeState.incoming.removeAttribute('src'); crossfadeState.incoming.load();
      if (crossfadeState.outgoing === audioElement) crossfadeState.outgoing.volume = Number(state.volume || 0) / 100;
    }
    crossfadeState = null;
    if (secondaryObjectUrl) { URL.revokeObjectURL(secondaryObjectUrl); secondaryObjectUrl = null; }
  }
  function beginCrossfade(target, remaining) {
    if (!target || crossfadeState || crossfadePendingId === target.id) return;
    var nextTrackItem = trackById(target.id); var currentTrackItem = trackById(state.currentId);
    if (!nextTrackItem || !currentTrackItem || nextTrackItem.id === currentTrackItem.id || nextTrackItem.kind !== 'upload' || currentTrackItem.kind !== 'upload') return;
    var request = ++crossfadeRequest; crossfadePendingId = target.id;
    dbGet(target.id).then(function (row) {
      if (request !== crossfadeRequest) return;
      if (!row || !row.blob || !state.playing || state.currentId !== currentTrackItem.id) { crossfadePendingId = ''; return; }
      if (secondaryAudioElement.src) { secondaryAudioElement.pause(); secondaryAudioElement.removeAttribute('src'); secondaryAudioElement.load(); }
      connectSecondaryAudio(); secondaryObjectUrl = URL.createObjectURL(row.blob);
      secondaryAudioElement.src = secondaryObjectUrl; secondaryAudioElement.currentTime = 0; secondaryAudioElement.playbackRate = Number(state.settings.playbackRate || 1); secondaryAudioElement.volume = 0;
      return secondaryAudioElement.play().then(function () {
        if (request !== crossfadeRequest || !state.playing || state.currentId !== currentTrackItem.id) { secondaryAudioElement.pause(); return; }
        var duration = Math.max(250, Math.min((Number(state.settings.crossfadeSeconds) || 0) * 1000, Math.max(0.25, remaining) * 1000));
        crossfadeState = { target: target, outgoing: audioElement, incoming: secondaryAudioElement, startedAt: Date.now(), duration: duration };
        crossfadePendingId = '';
        crossfadeTimer = window.setInterval(function () {
          if (!crossfadeState || !state.playing) { cancelCrossfade(); return; }
          var progress = Math.min(1, (Date.now() - crossfadeState.startedAt) / crossfadeState.duration); var volume = Number(state.volume || 0) / 100;
          crossfadeState.outgoing.volume = volume * (1 - progress); crossfadeState.incoming.volume = volume * progress;
          if (progress >= 1) finishCrossfade();
        }, 25);
      }).catch(function () { if (request === crossfadeRequest) cancelCrossfade(); });
    }).catch(function () { if (request === crossfadeRequest) { crossfadePendingId = ''; if (secondaryObjectUrl) { URL.revokeObjectURL(secondaryObjectUrl); secondaryObjectUrl = null; } } });
  }
  function finishCrossfade() {
    if (!crossfadeState) return;
    var fade = crossfadeState; if (crossfadeTimer) window.clearInterval(crossfadeTimer); crossfadeTimer = 0;
    fade.outgoing.volume = 0; fade.outgoing.pause(); fade.outgoing.removeAttribute('src'); fade.outgoing.load();
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = secondaryObjectUrl; secondaryObjectUrl = null;
    audioElement = fade.incoming; secondaryAudioElement = fade.outgoing;
    var oldSource = mediaElementSource; mediaElementSource = secondaryMediaElementSource; secondaryMediaElementSource = oldSource;
    secondaryAudioElement.volume = 0;
    if (fade.target.type === 'queue' && state.queue[0] === fade.target.id) state.queue.shift();
    if (fade.target.sessionIds) state.sessionIds = fade.target.sessionIds;
    else if (fade.target.type === 'autoplay') state.sessionIds = [fade.target.id];
    state.currentId = fade.target.id; state.elapsed = Number(audioElement.currentTime) || 0; state.playing = true; addToHistory(state.currentId);
    crossfadeState = null; crossfadePendingId = ''; persist(); updateQueueView(); updatePlayerView();
  }
  function stopSynth() { activeOscillators.forEach(function (o) { try { o.stop(); } catch (e) {} }); activeOscillators = []; }
  function noteFrequency(semitone, octave) { return 440 * Math.pow(2, ((octave * 12 + semitone) - 69) / 12); }
  function synthPattern(t) {
    var scale = t.scale === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    var seed = (Number(t.key) || 0) + (t.title.length % 5);
    var pattern = []; for (var i = 0; i < 16; i++) pattern.push(scale[(i * 3 + seed + (i % 4 === 2 ? 1 : 0)) % scale.length] + (i > 7 && i % 5 === 0 ? 12 : 0)); return pattern;
  }
  function startSynth(t, offset) {
    try {
      var ctx = makeAudioContext(); if (ctx.state === 'suspended') ctx.resume(); stopSynth();
      synthOffset = offset || 0; synthStartedAt = ctx.currentTime + 0.045; state.elapsed = synthOffset; state.playing = true;
      var beat = 60 / Math.max(60, Number(t.bpm) || 84) / 2; var seq = synthPattern(t); var startIndex = Math.max(0, Math.floor(synthOffset / beat)); var endIndex = Math.ceil((Number(t.duration) - synthOffset) / beat) + startIndex + 1;
      for (var i = startIndex; i < endIndex; i++) {
        var when = synthStartedAt + i * beat - synthOffset; if (when < ctx.currentTime) continue; var offsetNote = seq[i % seq.length]; var note = 48 + Number(t.key || 0) + offsetNote; var freq = noteFrequency(note % 12, Math.floor(note / 12));
        var osc = ctx.createOscillator(); var gain = ctx.createGain(); osc.type = t.wave || 'sine'; osc.frequency.value = freq; var length = Math.min(beat * 1.75, Math.max(.08, Number(t.duration) - (i * beat - synthOffset)));
        gain.gain.setValueAtTime(0.0001, when); gain.gain.exponentialRampToValueAtTime(0.035, when + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
        osc.connect(gain); gain.connect(masterGain); osc.start(when); osc.stop(when + length + 0.02); activeOscillators.push(osc);
        if (i % 4 === 0) { var bass = ctx.createOscillator(); var bassGain = ctx.createGain(); bass.type = 'sine'; bass.frequency.value = freq / 2; bassGain.gain.setValueAtTime(0.0001, when); bassGain.gain.exponentialRampToValueAtTime(0.018, when + .06); bassGain.gain.exponentialRampToValueAtTime(.0001, when + beat * 2.5); bass.connect(bassGain); bassGain.connect(masterGain); bass.start(when); bass.stop(when + beat * 2.55); activeOscillators.push(bass); }
      }
      updatePlayerView(); startClock();
    } catch (e) { state.playing = false; toast(e.message || 'Could not start demo audio.'); updatePlayerView(); }
  }
  function loadTrackAudio(t) {
    if (t && t.kind === 'jamendo') {
      return new Promise(function (resolve, reject) {
        var streamUrl = safeHttpsUrl(t.audio); if (!streamUrl) { reject(new Error('Jamendo did not provide a playable stream for this track.')); return; }
        if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }
        audioElement.crossOrigin = 'anonymous'; audioElement.src = streamUrl; audioElement.playbackRate = Number(state.settings.playbackRate || 1); audioElement.currentTime = Math.min(state.elapsed || 0, Math.max(0, t.duration - 0.1)); audioElement.volume = Number(state.volume || 0) / 100;
        connectLocalAudio(); audioElement.play().then(resolve).catch(reject);
      });
    }
    return dbGet(t.id).then(function (row) { if (!row || !row.blob) throw new Error('This audio file is no longer available in this browser.'); if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = URL.createObjectURL(row.blob); audioElement.crossOrigin = ''; audioElement.src = activeObjectUrl; audioElement.playbackRate = Number(state.settings.playbackRate || 1); audioElement.currentTime = Math.min(state.elapsed || 0, Math.max(0, t.duration - 0.1)); audioElement.volume = Number(state.volume || 0) / 100; connectLocalAudio(); return audioElement.play(); });
  }
  function playTrack(id, opts) {
    opts = opts || {}; var t = trackById(id); if (!t) { toast('That track is not available.'); return; }
    if (crossfadeState || crossfadePendingId) cancelCrossfade();
    if (state.currentId !== id) { stopSynth(); audioElement.pause(); state.elapsed = 0; signalSeen = false; if (timeData) timeData.fill(128); if (frequencyData) frequencyData.fill(0); }
    state.currentId = id; if (!opts.keepQueue) { state.queue = (opts.sessionIds || []).filter(function (x) { return x !== id && !!trackById(x); }); state.sessionIds = opts.sessionIds || [id]; }
    if (opts.elapsed != null) state.elapsed = opts.elapsed; addToHistory(id); persist(); updateQueueView(); updatePlayerView();
    if (audioSrcTrack(t)) {
      loadTrackAudio(t).then(function () { state.playing = true; state.elapsed = audioElement.currentTime; startClock(); updatePlayerView(); persist(); }).catch(function (e) { state.playing = false; updatePlayerView(); toast(e.message || (t.kind === 'jamendo' ? 'Could not play this Jamendo track.' : 'Could not play this local file.')); });
    } else startSynth(t, Number(state.elapsed) || 0);
  }
  function playList(ids, clickedId) { ids = (ids || []).filter(function (id) { return !!trackById(id); }); if (!ids.length) { toast('There are no playable tracks in this list yet.'); return; } var id = clickedId || ids[0]; if (state.shuffle) ids = shuffleArray(ids); playTrack(id, { sessionIds: ids }); }
  function shuffleArray(items) { var a = items.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function resumePlayback() { var t = trackById(state.currentId); if (!t) { var first = allTracks()[0]; if (first) { playTrack(first.id, { sessionIds: [first.id] }); return; } toast('Add music to your library first.'); return; } if (state.playing) return; if (audioSrcTrack(t)) { if (!audioElement.src) loadTrackAudio(t).then(function () { state.playing = true; state.elapsed = audioElement.currentTime; startClock(); updatePlayerView(); }).catch(function (e) { toast(e.message); }); else audioElement.play().then(function () { state.playing = true; startClock(); updatePlayerView(); }).catch(function () { toast('Playback was interrupted. Press play to try again.'); }); } else startSynth(t, Number(state.elapsed) || 0); }
  function pausePlayback() { if (!state.playing) return; state.elapsed = getElapsed(); if (crossfadeState || crossfadePendingId) cancelCrossfade(); state.playing = false; audioElement.pause(); stopSynth(); persist(); updatePlayerView(); }
  function togglePlayback() { pausedByVisibility = false; state.playing ? pausePlayback() : resumePlayback(); }
  function nextTrack() {
    if (crossfadeState || crossfadePendingId) cancelCrossfade();
    if (state.repeat === 2 && state.currentId) { seekTo(0); if (!state.playing) resumePlayback(); return; }
    if (state.queue.length) { var next = state.queue.shift(); state.elapsed = 0; persist(); playTrack(next, { keepQueue: true }); return; }
    var session = state.sessionIds || []; var index = session.indexOf(state.currentId);
    if (index >= 0 && index < session.length - 1) { playTrack(session[index + 1], { sessionIds: session, keepQueue: true }); return; }
    if (state.repeat === 1 && session.length) { playTrack(session[0], { sessionIds: session, keepQueue: true }); return; }
    var library = allTracks(); if (state.settings.autoplay && library.length) { var currentIndex = library.findIndex(function (t) { return t.id === state.currentId; }); var next = library[(currentIndex + 1 + library.length) % library.length]; playTrack(next.id, { sessionIds: [next.id] }); return; }
    pausePlayback(); state.elapsed = 0; updatePlayerView();
  }
  function previousTrack() { if (getElapsed() > 3) { seekTo(0); return; } var h = state.history || []; var idx = h.indexOf(state.currentId); var previous = h[idx + 1]; if (previous && trackById(previous)) playTrack(previous, { keepQueue: true }); else { var session = state.sessionIds || []; var pos = session.indexOf(state.currentId); if (pos > 0) playTrack(session[pos - 1], { sessionIds: session, keepQueue: true }); else seekTo(0); } }
  function seekTo(seconds) { var t = trackById(state.currentId); if (!t) return; if (crossfadeState || crossfadePendingId) cancelCrossfade(); state.elapsed = Math.max(0, Math.min(Number(seconds) || 0, t.duration - .1)); if (!state.playing) { if (audioSrcTrack(t) && audioElement.src) audioElement.currentTime = state.elapsed; updateTimeline(); persist(); return; } if (audioSrcTrack(t)) audioElement.currentTime = state.elapsed; else startSynth(t, state.elapsed); persist(); }
  function startClock() { if (animationFrame) cancelAnimationFrame(animationFrame); var then = 0; function tick(now) { if (!state.playing) { animationFrame = 0; return; } drawVisualizer(); if (!then || now - then > 180) { then = now; var t = trackById(state.currentId); var elapsed = getElapsed(); state.elapsed = elapsed; updateTimeline(); if (t && elapsed >= t.duration) { state.elapsed = 0; nextTrack(); return; } var remaining = t ? t.duration - elapsed : 0; if (t && audioSrcTrack(t) && Number(state.settings.crossfadeSeconds) > 0 && remaining > 0 && remaining <= Number(state.settings.crossfadeSeconds)) beginCrossfade(transitionTarget(), remaining); if (Math.floor(elapsed) % 5 === 0) persist(); } animationFrame = requestAnimationFrame(tick); } animationFrame = requestAnimationFrame(tick); }
  function bindAudioEvents(element) {
    element.addEventListener('ended', function () { if (element !== audioElement || crossfadeState) return; state.playing = false; nextTrack(); });
    element.addEventListener('error', function () { var current = trackById(state.currentId); if (element === audioElement && current && audioSrcTrack(current)) { state.playing = false; updatePlayerView(); toast(current.kind === 'jamendo' ? 'Jamendo stream could not be loaded. Try another track or check your connection.' : 'This file format could not be played by the browser.'); } });
    element.addEventListener('timeupdate', function () { if (element === audioElement && state.playing) updateTimeline(); });
  }
  bindAudioEvents(audioElement); bindAudioEvents(secondaryAudioElement);

  function dbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('Local file storage is not available in this browser.')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () { var db = req.result; if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); }; req.onerror = function () { reject(req.error || new Error('Could not open local storage.')); };
    });
  }
  function dbGet(id) { return dbOpen().then(function (db) { return new Promise(function (resolve, reject) { var tx = db.transaction(DB_STORE, 'readonly'); var req = tx.objectStore(DB_STORE).get(id); req.onsuccess = function () { resolve(req.result || null); }; req.onerror = function () { reject(req.error); }; }); }); }
  function dbList() { return dbOpen().then(function (db) { return new Promise(function (resolve, reject) { var tx = db.transaction(DB_STORE, 'readonly'); var req = tx.objectStore(DB_STORE).getAll(); req.onsuccess = function () { resolve(req.result || []); }; req.onerror = function () { reject(req.error); }; }); }); }
  function dbPut(row) { return dbOpen().then(function (db) { return new Promise(function (resolve, reject) { var tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(row); tx.oncomplete = function () { resolve(); }; tx.onerror = function () { reject(tx.error); }; }); }); }
  function dbDelete(id) { return dbOpen().then(function (db) { return new Promise(function (resolve, reject) { var tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).delete(id); tx.oncomplete = function () { resolve(); }; tx.onerror = function () { reject(tx.error); }; }); }); }
  function initUploads() {
    return dbList().then(function (rows) { localTracks = rows.sort(function (a, b) { return b.created - a.created; }).map(function (r, i) { return { id: r.id, title: r.title, fileName: r.fileName || r.title, fileSize: r.fileSize || (r.blob && r.blob.size) || 0, artistId: 'local', albumId: null, duration: r.duration || 0, cover: palettes[i % palettes.length], symbol: '♪', label: 'LOCAL FILE / RILL', kind: 'upload', mood: 'focus', created: r.created }; }); }).catch(function (e) { console.warn('Local audio storage unavailable', e); localTracks = []; });
  }
  function updateSidebarPlaylists() {
    var node = document.getElementById('sidebarPlaylists');
    node.innerHTML = state.playlists.slice(0, 8).map(function (p, i) { return '<a class="nav-item playlist-nav" href="#playlist/' + encodeURIComponent(p.id) + '" data-page="playlist/' + esc(p.id) + '"><span class="playlist-dot" style="--tint:' + ['#a4ae85','#bca27e','#849b9a','#a78986'][i % 4] + '"></span><span>' + esc(p.name) + '</span></a>'; }).join('');
  }
  function readFileDuration(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file); var audio = new Audio(); audio.preload = 'metadata';
      audio.onloadedmetadata = function () { var duration = isFinite(audio.duration) ? Math.ceil(audio.duration) : 0; URL.revokeObjectURL(url); resolve(duration); };
      audio.onerror = function () { URL.revokeObjectURL(url); resolve(0); }; audio.src = url;
    });
  }
  function duplicateGroups() {
    var groups = {};
    localTracks.forEach(function (track) {
      var name = String(track.title || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim(); var size = Number(track.fileSize) || 0;
      if (!name || !size) return;
      var key = name + '|' + size;
      if (!groups[key]) groups[key] = { name: track.title, size: size, ids: [], created: [] };
      groups[key].ids.push(track.id); groups[key].created.push(Number(track.created) || 0);
    });
    return Object.keys(groups).map(function (key) { return groups[key]; }).filter(function (group) { return group.ids.length > 1; });
  }
  function showDuplicateReview() {
    var groups = duplicateGroups();
    if (!groups.length) { toast('No duplicate candidates found.'); return; }
    var body = '<div class="duplicate-review-list">' + groups.map(function (group) { return '<article class="duplicate-group"><div><b>' + esc(group.name) + '</b><small>' + group.ids.length + ' files · ' + (group.size / 1048576).toFixed(1) + ' MB each</small><small>Names and sizes match; listen or check the files before removing any.</small></div><button class="button small ghost" data-action="remove-duplicate-copies" data-ids="' + esc(group.ids.join(',')) + '">Keep newest</button></article>'; }).join('') + '</div>';
    showModal(modalFrame('Possible duplicates', 'Candidates have the same title and file size. The newest copy is kept when you choose an action.', body, '<button class="button ghost" data-action="close-modal">Done</button>'));
  }
  function removeDuplicateCopies(ids) {
    ids = (ids || []).filter(function (id) { return !!trackById(id); });
    if (ids.length < 2) { closeModal(); return; }
    if (state.settings.confirmDelete && !window.confirm('Remove all but the newest file in this possible-duplicate group?')) return;
    var remove = ids.slice(1); Promise.all(remove.map(dbDelete)).then(function () {
      var removeSet = remove.reduce(function (set, id) { set[id] = true; return set; }, {});
      state.playlists.forEach(function (playlist) { playlist.trackIds = (playlist.trackIds || []).filter(function (id) { return !removeSet[id]; }); });
      ['liked','history','queue','sessionIds'].forEach(function (key) { if (Array.isArray(state[key])) state[key] = state[key].filter(function (id) { return !removeSet[id]; }); });
      remove.forEach(function (id) { delete state.lyrics[id]; delete state.lyricOffsets[id]; });
      if (removeSet[state.currentId]) { if (crossfadeState || crossfadePendingId) cancelCrossfade(); audioElement.pause(); audioElement.removeAttribute('src'); audioElement.load(); stopSynth(); if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; state.currentId = null; state.elapsed = 0; state.playing = false; }
      persist(); return initUploads();
    }).then(function () { closeModal(); updateSidebarPlaylists(); renderPage(); toast('Older duplicate copies removed.'); }).catch(function () { toast('Could not remove duplicate files.'); });
  }
  function ingestFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return f.type.indexOf('audio/') === 0 || /\.(mp3|wav|flac|aac|m4a|ogg|opus)$/i.test(f.name); });
    if (!list.length) { toast('Choose a supported audio file.'); return; }
    Promise.all(list.map(function (file) {
      return readFileDuration(file).then(function (duration) {
        var row = { id: 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7), title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, fileSize: file.size, lastModified: file.lastModified || 0, blob: file, duration: duration, created: Date.now(), type: file.type };
        return dbPut(row).then(function () { return row; });
      });
    })).then(function (rows) {
      return initUploads().then(function () { renderPage(); toast(rows.length + (rows.length === 1 ? ' track added to this browser.' : ' tracks added to this browser.')); });
    }).catch(function (e) { toast('Could not save this file: ' + (e.message || 'storage error')); });
  }
  function showModal(markup) { var overlay = document.getElementById('overlay'); overlay.innerHTML = markup; overlay.hidden = false; var first = overlay.querySelector('input,textarea,select,button'); if (first) setTimeout(function () { first.focus(); }, 20); }
  function closeModal() { var overlay = document.getElementById('overlay'); overlay.hidden = true; overlay.innerHTML = ''; }
  function modalFrame(title, subtitle, body, actions) { return '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><div><h2 id="modalTitle">' + esc(title) + '</h2>' + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div><button class="icon-button" data-action="close-modal" aria-label="Close">' + icon('x') + '</button></div>' + body + (actions ? '<div class="modal-actions">' + actions + '</div>' : '') + '</div>'; }
  function getVisiblePlaylists() {
    var query = playlistSearch.trim().toLowerCase();
    var list = state.playlists.filter(function (playlist) { return !query || (playlist.name + ' ' + (playlist.description || '')).toLowerCase().indexOf(query) >= 0; });
    if (playlistSort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else if (playlistSort === 'tracks') list.sort(function (a, b) { return playlistTracks(b).length - playlistTracks(a).length || a.name.localeCompare(b.name); });
    return list;
  }
  function updatePlaylistCollection() {
    var node = document.getElementById('playlistCollection'); if (!node) return;
    var list = getVisiblePlaylists();
    node.innerHTML = list.length ? list.map(playlistCard).join('') : emptyState('No matching playlists', 'Try another name or clear the search.', null, null, 'search');
    var count = document.querySelector('.playlist-count'); if (count) count.textContent = list.length + (list.length === 1 ? ' playlist' : ' playlists');
  }
  function spotifyStorageGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
  function spotifyStorageSet(key, value) { try { if (value == null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch (e) {} }
  function restoreSpotifyPlaylistCache() {
    try {
      var record = JSON.parse(spotifyStorageGet('rill-spotify-playlists-temp') || '{}');
      Object.keys(record).forEach(function (id) { if (record[id] && record[id].expiresAt > Date.now()) spotifyPlaylistCache[id] = record[id].data; });
    } catch (e) { spotifyPlaylistCache = Object.create(null); }
  }
  function saveSpotifyPlaylistCache(id, data) {
    spotifyPlaylistCache[id] = data;
    try {
      var record = JSON.parse(spotifyStorageGet('rill-spotify-playlists-temp') || '{}');
      record[id] = { expiresAt: Date.now() + 15 * 60 * 1000, data: data };
      spotifyStorageSet('rill-spotify-playlists-temp', JSON.stringify(record));
    } catch (e) {}
  }
  function spotifySession() { try { return JSON.parse(spotifyStorageGet('rill-spotify-session') || 'null'); } catch (e) { return null; } }
  function spotifySessionExists() { var session = spotifySession(); return !!(session && (session.accessToken || session.refreshToken)); }
  function spotifyRedirectUri() {
    if (location.protocol === 'https:') return location.origin + location.pathname;
    if (location.protocol === 'http:' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return 'http://127.0.0.1' + (location.port ? ':' + location.port : '') + location.pathname;
    throw new Error('Open Rill on HTTPS or through a local web server before connecting Spotify.');
  }
  function spotifyRedirectUriHint() { try { return spotifyRedirectUri(); } catch (e) { return 'Use HTTPS or http://127.0.0.1:port/'; } }
  function randomSpotifyString(length) {
    var bytes = new Uint8Array(length); crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (value) { return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[value % 62]; }).join('');
  }
  function spotifyBase64Url(buffer) {
    var bytes = new Uint8Array(buffer); var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function spotifyTokenRequest(values) {
    return fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) }).then(function (response) { return response.json().then(function (body) { if (!response.ok) throw new Error(body.error_description || body.error || 'Spotify sign-in failed.'); return body; }); });
  }
  function spotifyAccessToken() {
    var session = spotifySession();
    if (!session || !session.accessToken) return Promise.reject(new Error('Connect your Spotify account first.'));
    if (Number(session.expiresAt) > Date.now() + 60000) return Promise.resolve(session.accessToken);
    if (!session.refreshToken) return Promise.reject(new Error('Spotify sign-in expired. Reconnect your account.'));
    return spotifyTokenRequest({ grant_type: 'refresh_token', refresh_token: session.refreshToken, client_id: state.spotifyClientId }).then(function (body) {
      session.accessToken = body.access_token; session.expiresAt = Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000; session.refreshToken = body.refresh_token || session.refreshToken;
      spotifyStorageSet('rill-spotify-session', JSON.stringify(session)); return session.accessToken;
    });
  }
  function spotifyApiGet(path, retried) {
    return spotifyAccessToken().then(function (token) { return fetch('https://api.spotify.com/v1' + path, { headers: { Authorization: 'Bearer ' + token } }).then(function (response) {
      if (response.status === 429 && !retried) { var delay = Math.min(5000, Math.max(500, Number(response.headers.get('Retry-After')) * 1000 || 1000)); return new Promise(function (resolve) { setTimeout(resolve, delay); }).then(function () { return spotifyApiGet(path, true); }); }
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (response.status === 401) { spotifyStorageSet('rill-spotify-session', null); throw new Error('Spotify sign-in expired. Reconnect your account.'); }
        if (!response.ok) { var message = response.status === 403 ? 'Spotify only shares a track list here for playlists you own or collaborate on. The official Spotify player still works below.' : (body.error && body.error.message) || 'Spotify could not load this playlist.'; throw new Error(message); }
        return body;
      });
    }); });
  }
  function loadSpotifyPlaylist(playlistId, force) {
    if (!playlistId) return Promise.resolve(null);
    if (!force && spotifyPlaylistCache[playlistId] && !spotifyPlaylistCache[playlistId].error) return Promise.resolve(spotifyPlaylistCache[playlistId]);
    if (spotifyPlaylistLoads[playlistId]) return spotifyPlaylistLoads[playlistId];
    var metaPath = '/playlists/' + encodeURIComponent(playlistId);
    spotifyPlaylistLoads[playlistId] = spotifyApiGet(metaPath).then(function (meta) {
      var tracks = []; var limit = 50; var maxTracks = 500;
      function loadPage(offset) {
        return spotifyApiGet('/playlists/' + encodeURIComponent(playlistId) + '/items?limit=' + limit + '&offset=' + offset).then(function (page) {
          var items = Array.isArray(page.items) ? page.items : [];
          items.forEach(function (row) {
            var source = row && (row.item || row.track); if (!source || source.type && source.type !== 'track' || !source.id) return;
            var artists = (source.artists || []).map(function (artist) { return { name: String(artist.name || 'Artist'), url: safeHttpsUrl(artist.external_urls && artist.external_urls.spotify) }; });
            var image = source.album && source.album.images && source.album.images[0] && source.album.images[0].url;
            tracks.push({ id: 'sp-' + source.id, spotifyId: source.id, kind: 'spotify', title: String(source.name || 'Untitled track'), artistNames: artists.map(function (artist) { return artist.name; }), artists: artists, album: String(source.album && source.album.name || ''), albumName: String(source.album && source.album.name || ''), duration: Math.max(0, Math.floor(Number(source.duration_ms) / 1000)), image: safeHttpsUrl(image), url: safeHttpsUrl(source.external_urls && source.external_urls.spotify) || 'https://open.spotify.com/track/' + encodeURIComponent(source.id), source: 'Spotify' });
          });
          var total = Number(page.total) || items.length; var next = offset + items.length;
          if (items.length && next < total && tracks.length < maxTracks) return loadPage(next);
          var data = { name: String(meta.name || 'Spotify playlist'), description: String(meta.description || ''), owner: String(meta.owner && meta.owner.display_name || ''), image: safeHttpsUrl(meta.images && meta.images[0] && meta.images[0].url), url: 'https://open.spotify.com/playlist/' + encodeURIComponent(playlistId), tracks: tracks.slice(0, maxTracks), total: total, truncated: total > maxTracks };
          saveSpotifyPlaylistCache(playlistId, data); delete spotifyPlaylistLoads[playlistId]; return data;
        });
      }
      return loadPage(0);
    }).catch(function (error) {
      var data = { name: '', owner: '', image: '', tracks: [], error: error.message || 'Spotify could not load this playlist.' };
      saveSpotifyPlaylistCache(playlistId, data); delete spotifyPlaylistLoads[playlistId]; return data;
    });
    return spotifyPlaylistLoads[playlistId];
  }
  function spotifyPlaylistById(id) { return state.externalPlaylists.find(function (playlist) { return playlist.id === id; }) || null; }
  function upsertSpotifyPlaylist(value, name) {
    var provider = externalProvider(value);
    if (!provider || provider.key !== 'spotify' || provider.kind !== 'playlist') { toast('Paste a valid Spotify playlist link.'); return null; }
    var spotifyId = provider.url.split('/').pop(); if (!/^[A-Za-z0-9]+$/.test(spotifyId)) { toast('That Spotify playlist link does not look valid.'); return null; }
    var existing = state.externalPlaylists.find(function (item) { return item.spotifyId === spotifyId; });
    if (existing) { if (name) existing.name = name; existing.url = provider.url; return existing; }
    var added = { id: 'spotify-' + spotifyId, spotifyId: spotifyId, name: name || 'Spotify playlist', url: provider.url, addedAt: Date.now() };
    state.externalPlaylists.unshift(added); return added;
  }
  function beginSpotifyConnection(playlistId) {
    var clientInput = document.getElementById('spotifyClientIdInput'); var clientId = clientInput && clientInput.value.trim() || state.spotifyClientId;
    if (!/^[A-Za-z0-9]{20,80}$/.test(clientId)) { toast('Paste the Spotify Client ID from your developer app first.'); if (clientInput) clientInput.focus(); return; }
    state.spotifyClientId = clientId; persist();
    var form = document.getElementById('spotifyPlaylistForm'); var pending = null;
    if (form && form.elements.url.value.trim()) pending = { url: form.elements.url.value.trim(), name: form.elements.name.value.trim() };
    else if (playlistId) { var stored = spotifyPlaylistById(playlistId); if (stored) pending = { url: stored.url, name: stored.name }; }
    if (pending) spotifyStorageSet('rill-spotify-pending-import', JSON.stringify(pending));
    try {
      var redirectUri = spotifyRedirectUri();
      var verifier = randomSpotifyString(64); var authState = randomSpotifyString(32);
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (digest) {
        spotifyStorageSet('rill-spotify-verifier', verifier); spotifyStorageSet('rill-spotify-state', authState); spotifyStorageSet('rill-spotify-redirect', redirectUri);
        var auth = new URL('https://accounts.spotify.com/authorize');
        auth.search = new URLSearchParams({ response_type: 'code', client_id: clientId, scope: 'playlist-read-private playlist-read-collaborative', redirect_uri: redirectUri, state: authState, code_challenge_method: 'S256', code_challenge: spotifyBase64Url(digest) }).toString();
        location.href = auth.toString();
      }).catch(function () { toast('Your browser could not start Spotify sign-in.'); });
    } catch (error) { toast(error.message); }
  }
  function completeSpotifyCallback() {
    var params = new URLSearchParams(location.search); var code = params.get('code'); var authError = params.get('error'); if (!code && !authError) return;
    var returnedState = params.get('state'); var expectedState = spotifyStorageGet('rill-spotify-state'); var verifier = spotifyStorageGet('rill-spotify-verifier'); var redirectUri = spotifyStorageGet('rill-spotify-redirect');
    history.replaceState(null, '', location.pathname + '#playlists');
    spotifyStorageSet('rill-spotify-state', null); spotifyStorageSet('rill-spotify-verifier', null); spotifyStorageSet('rill-spotify-redirect', null);
    if (authError) { toast('Spotify connection was cancelled.'); return; }
    if (!code || !returnedState || returnedState !== expectedState || !verifier || !redirectUri) { toast('Spotify sign-in could not be verified. Try connecting again.'); return; }
    return spotifyTokenRequest({ grant_type: 'authorization_code', code: code, redirect_uri: redirectUri, client_id: state.spotifyClientId, code_verifier: verifier }).then(function (body) {
      spotifyStorageSet('rill-spotify-session', JSON.stringify({ accessToken: body.access_token, refreshToken: body.refresh_token || '', expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000 }));
      toast('Spotify connected. Loading your playlist…');
      var pending = null; try { pending = JSON.parse(spotifyStorageGet('rill-spotify-pending-import') || 'null'); } catch (e) {}
      spotifyStorageSet('rill-spotify-pending-import', null);
      if (!pending) { renderPage(); return; }
      var playlist = upsertSpotifyPlaylist(pending.url, pending.name); if (!playlist) { renderPage(); return; }
      persist(); return loadSpotifyPlaylist(playlist.spotifyId, true).then(function () { renderPage(); });
    }).catch(function (error) { toast('Spotify could not connect: ' + (error.message || 'try again.')); renderPage(); });
  }
  function disconnectSpotify() {
    spotifyStorageSet('rill-spotify-session', null); spotifyStorageSet('rill-spotify-playlists-temp', null); spotifyPlaylistCache = Object.create(null); spotifyPlaylistLoads = Object.create(null); renderPage(); toast('Spotify disconnected from Rill.');
  }
  function openSpotifyPlaylistModal(playlistId) {
    var existing = playlistId ? spotifyPlaylistById(playlistId) : null;
    var body = '<form id="spotifyPlaylistForm" data-form="spotify-playlist"><div class="field"><label for="spotifyPlaylistUrl">Spotify playlist link</label><input id="spotifyPlaylistUrl" name="url" type="url" inputmode="url" autocomplete="url" required placeholder="https://open.spotify.com/playlist/…" value="' + esc(existing && existing.url || '') + '"><small>Paste a playlist link copied from Spotify.</small></div><div class="field"><label for="spotifyPlaylistName">Name in Rill (optional)</label><input id="spotifyPlaylistName" name="name" maxlength="100" autocomplete="off" placeholder="Spotify playlist" value="' + esc(existing && existing.name || '') + '"></div></form><section class="spotify-connection-box"><div class="spotify-connection-copy"><b>' + (spotifySessionExists() ? 'Spotify is connected' : 'Show the songs in Rill') + '</b><p>' + (spotifySessionExists() ? 'Refresh an imported playlist to show its songs and artwork.' : 'Connect your account to show track rows for playlists you own or collaborate on.') + '</p></div><div class="field"><label for="spotifyClientIdInput">Spotify Client ID</label><input id="spotifyClientIdInput" autocomplete="off" spellcheck="false" value="' + esc(state.spotifyClientId) + '" placeholder="From your Spotify developer app"><small>Client ID only. Never paste a client secret here.</small></div><div class="spotify-redirect-help"><span>Redirect URI to register in your Spotify app</span><code>' + esc(spotifyRedirectUriHint()) + '</code></div><div class="spotify-connect-actions"><a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard ↗</a><button class="button small" data-action="connect-spotify"' + (existing ? ' data-id="' + esc(existing.id) + '"' : '') + '>' + (spotifySessionExists() ? 'Reconnect Spotify' : 'Connect Spotify') + '</button>' + (spotifySessionExists() ? '<button class="link-button" data-action="disconnect-spotify">Disconnect</button>' : '') + '</div><small>Spotify track lists are available only for playlists you own or collaborate on. Others use the official Spotify player below. HTTPS is required online; local preview uses 127.0.0.1.</small></section>';
    showModal(modalFrame('Import a playlist', 'Keep Spotify as the player; Rill adds a compact song list and lyric notes.', body, '<button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" type="submit" form="spotifyPlaylistForm">Import playlist</button>'));
  }
  function saveSpotifyPlaylistForm(form) {
    var added = upsertSpotifyPlaylist(form.elements.url.value.trim(), form.elements.name.value.trim()); if (!added) return;
    persist(); closeModal(); renderPage();
    if (spotifySessionExists()) loadSpotifyPlaylist(added.spotifyId, true).then(function () { if (currentRoute().page === 'playlists') renderPage(); });
    toast('Spotify playlist linked to Rill.');
  }
  function openPlaylistModal(trackIds, existing) {
    var title = existing ? 'Edit playlist' : 'Create a playlist'; var p = existing || { name: '', description: '', privacy: 'Private' };
    var body = '<form data-form="playlist"><input type="hidden" name="id" value="' + esc(p.id || '') + '"><input type="hidden" name="trackIds" value="' + esc((trackIds || []).join(',')) + '"><div class="field"><label for="playlistName">Name</label><input id="playlistName" name="name" maxlength="70" placeholder="Give it a good name" required value="' + esc(p.name) + '"></div><div class="field"><label for="playlistDescription">Description</label><textarea id="playlistDescription" name="description" maxlength="240" placeholder="What belongs here?">' + esc(p.description || '') + '</textarea></div><div class="field"><label for="playlistPrivacy">Privacy</label><select id="playlistPrivacy" name="privacy"><option>Private</option></select><small style="color:#858a7f">Public sharing requires accounts and access controls.</small></div><div class="modal-actions"><button type="button" class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" type="submit">' + (existing ? 'Save changes' : 'Create playlist') + '</button></div></form>';
    showModal(modalFrame(title, existing ? 'Update the details for this collection.' : 'A collection is a good way to hold a moment.', body, ''));
    var privacy = document.getElementById('playlistPrivacy'); if (privacy) privacy.value = p.privacy || 'Private';
  }
  function openSmartPlaylistModal() {
    var body = '<form data-form="smart-playlist"><div class="field"><label for="smartPlaylistName">Name</label><input id="smartPlaylistName" name="name" maxlength="70" placeholder="Recent favorites" required></div><div class="field"><label for="smartCriteria">Automatically include</label><select id="smartCriteria" name="criteria"><option value="liked">Liked songs</option><option value="recent-played">Recently played</option><option value="added-week">Added in the last 7 days</option><option value="unplayed">Never played</option><option value="short">Tracks under 3 minutes</option><option value="long">Tracks 5 minutes or longer</option><option value="all">All tracks</option></select></div><div class="field"><label for="smartSort">Order</label><select id="smartSort" name="sort"><option value="recent">Recently added</option><option value="title">Title A–Z</option><option value="oldest">Oldest first</option></select></div><div class="field"><label for="smartLimit">Maximum tracks</label><input id="smartLimit" name="limit" type="number" min="1" max="500" value="100"></div><div class="modal-actions"><button type="button" class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" type="submit">Create smart playlist</button></div></form>';
    showModal(modalFrame('Create a smart playlist', 'The list is recalculated from your local library whenever you open it.', body, ''));
  }
  function openAddToPlaylistModal(trackIds) {
    var manualPlaylists = state.playlists.filter(function (p) { return !p.smart; });
    if (!manualPlaylists.length) { openPlaylistModal(trackIds); return; }
    var body = '<div style="display:flex;flex-direction:column;gap:5px">' + manualPlaylists.map(function (p) { return '<button class="nav-item" style="height:44px" data-action="add-to-playlist" data-id="' + esc(p.id) + '" data-tracks="' + esc(trackIds.join(',')) + '"><span class="playlist-dot" style="--tint:#a4ae85"></span><span>' + esc(p.name) + '</span><span class="nav-count">' + playlistTracks(p).length + '</span></button>'; }).join('') + '</div><button class="button small full-button" data-action="new-playlist-with-tracks" data-tracks="' + esc(trackIds.join(',')) + '">' + icon('plus') + ' New playlist</button>';
    showModal(modalFrame('Add to playlist', 'Choose where these tracks belong.', body, '<button class="button ghost" data-action="close-modal">Done</button>'));
  }
  function openTrackMenu(id, playlistId) {
    var t = trackById(id); if (!t) return;
    var body = '<div style="display:flex;flex-direction:column;gap:4px"><button class="nav-item" data-action="play-next" data-id="' + esc(id) + '">' + icon('next') + '<span>Play next</span></button><button class="nav-item" data-action="add-queue" data-id="' + esc(id) + '">' + icon('queue') + '<span>Add to queue</span></button><button class="nav-item" data-action="add-track" data-id="' + esc(id) + '">' + icon('plus') + '<span>Add to playlist</span></button><button class="nav-item" data-action="edit-lyrics" data-id="' + esc(id) + '">' + icon('edit') + '<span>Add or edit lyrics</span></button><button class="nav-item" data-action="share-track" data-id="' + esc(id) + '">' + icon('arrow') + '<span>Copy track link</span></button><button class="nav-item" data-page="track/' + esc(id) + '">' + icon('disc') + '<span>Open track details</span></button>' + (t.kind === 'jamendo' ? '<a class="nav-item" href="' + esc(t.jamendoUrl) + '" target="_blank" rel="noopener noreferrer">' + icon('arrow') + '<span>Open on Jamendo</span></a>' : '') + (playlistId ? '<button class="nav-item" data-action="remove-from-playlist" data-id="' + esc(id) + '" data-playlist-id="' + esc(playlistId) + '">' + icon('x') + '<span>Remove from this playlist</span></button>' : '') + (t.kind === 'upload' ? '<button class="nav-item" data-action="delete-upload" data-id="' + esc(id) + '">' + icon('x') + '<span>Remove local file</span></button>' : '') + '</div>';
    showModal(modalFrame(t.title, artistName(t.artistId), body, '<button class="button ghost" data-action="close-modal">Done</button>'));
  }
  function openPlaylistMenu(id) {
    var p = playlistById(id); if (!p) return;
    var body = '<div style="display:flex;flex-direction:column;gap:4px"><button class="nav-item" data-action="edit-playlist" data-id="' + esc(id) + '">' + icon('settings') + '<span>Edit details</span></button><button class="nav-item" data-action="export-playlist" data-id="' + esc(id) + '">' + icon('download') + '<span>Export playlist metadata</span></button><button class="nav-item" data-action="duplicate-playlist" data-id="' + esc(id) + '">' + icon('plus') + '<span>Make a copy</span></button><button class="nav-item" data-action="delete-playlist" data-id="' + esc(id) + '">' + icon('x') + '<span>Delete playlist</span></button></div>';
    showModal(modalFrame(p.name, playlistTracks(p).length + ' tracks · ' + p.privacy, body, '<button class="button ghost" data-action="close-modal">Done</button>'));
  }
  function exportFile(filename, type, text) { var blob = new Blob([text], { type: type }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function exportPlaylist(id) { var p = playlistById(id); if (!p) return; var file = { name: p.name, description: p.description, privacy: p.privacy, smart: p.smart || null, tracks: playlistTracks(p).map(function (t) { return { title: t.title, artist: artistName(t.artistId), album: albumTitle(t.albumId), duration: t.duration }; }) }; exportFile(p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', 'application/json', JSON.stringify(file, null, 2)); toast('Playlist metadata exported.'); }
  function exportData() { var data = { playlists: state.playlists, spotifyPlaylists: state.externalPlaylists, liked: state.liked, following: state.following, history: state.history, lyrics: state.lyrics, lyricOffsets: state.lyricOffsets, settings: state.settings, exportedAt: new Date().toISOString() }; exportFile('rill-local-data.json', 'application/json', JSON.stringify(data, null, 2)); toast('Your local Rill data is ready.'); }
  function copyText(text, message) { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(message); }).catch(function () { toast('Could not access clipboard.'); }); else { var area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); try { document.execCommand('copy'); toast(message); } catch (e) { toast('Could not access clipboard.'); } area.remove(); } }
  function toggleLike(id) { var idx = state.liked.indexOf(id); if (idx >= 0) { state.liked.splice(idx, 1); toast('Removed from liked songs.'); } else { state.liked.unshift(id); toast('Added to liked songs.'); } persist(); renderPage(); }
  function savePlaylistForm(form) {
    var data = new FormData(form); var id = String(data.get('id') || ''); var name = String(data.get('name') || '').trim(); if (!name) return;
    var existing = playlistById(id); var newTracks = String(data.get('trackIds') || '').split(',').filter(Boolean);
    if (existing) { existing.name = name; existing.description = String(data.get('description') || '').trim(); existing.privacy = String(data.get('privacy') || 'Private'); }
    else state.playlists.unshift({ id: 'pl-' + Date.now().toString(36), name: name, description: String(data.get('description') || '').trim(), privacy: String(data.get('privacy') || 'Private'), trackIds: newTracks, pinned: false });
    persist(); closeModal(); updateSidebarPlaylists(); renderPage(); toast(existing ? 'Playlist updated.' : 'Playlist created.');
  }
  function saveSmartPlaylistForm(form) {
    var data = new FormData(form); var name = String(data.get('name') || '').trim(); if (!name) return;
    state.playlists.unshift({ id: 'smart-' + Date.now().toString(36), name: name, description: '', privacy: 'Private', trackIds: [], smart: { criteria: String(data.get('criteria') || 'liked'), sort: String(data.get('sort') || 'recent'), limit: Math.max(1, Math.min(500, Number(data.get('limit')) || 100)) }, pinned: false });
    persist(); closeModal(); updateSidebarPlaylists(); renderPage(); toast('Smart playlist created.');
  }
  function scheduleSleepTimer() {
    window.clearTimeout(sleepTimerHandle);
    var remaining = Number(state.sleepTimerEndsAt) - Date.now();
    if (!state.sleepTimerEndsAt) return;
    if (remaining <= 0) {
      state.sleepTimerEndsAt = 0; state.settings.sleepTimerMinutes = 0;
      if (state.playing) pausePlayback();
      persist();
      if (state.page === 'settings') renderPage();
      toast('Sleep timer finished.');
      return;
    }
    sleepTimerHandle = window.setTimeout(scheduleSleepTimer, Math.min(remaining, 2147483647));
  }
  function setSetting(key, value) {
    var fineRange = fineTuningRanges().find(function (item) { return item[0] === key; });
    state.settings[key] = /^eq(Bass|Mid|Treble)$/.test(key) || !!fineRange || key === 'analyserFftSize' || key === 'meshBrightness' || /^accent(Hue|Intensity|Brightness)$/.test(key) ? Number(value) : value;
    if (key === 'accent') { state.settings.accentHue = null; state.settings.accentIntensity = null; state.settings.accentBrightness = null; }
    if (key === 'playbackRate') { audioElement.playbackRate = Number(value) || 1; secondaryAudioElement.playbackRate = Number(value) || 1; state.settings.playbackRate = Number(value) || 1; }
    if (key === 'defaultVolume') { state.volume = Math.max(0, Math.min(100, Number(value) || 0)); audioElement.volume = state.volume / 100; if (masterGain) masterGain.gain.value = state.volume / 100 * .55; var volumeControl = document.getElementById('volume'); if (volumeControl) volumeControl.value = String(state.volume); updatePlayerView(); }
    if (key === 'sleepTimerMinutes') { var sleepMinutes = Number(value) || 0; state.settings.sleepTimerMinutes = sleepMinutes; state.sleepTimerEndsAt = sleepMinutes > 0 ? Date.now() + sleepMinutes * 60000 : 0; scheduleSleepTimer(); }
    if (key === 'eqPreset') {
      var presets = { flat: [0, 0, 0], bass: [6, 0, 1], vocal: [-1, 4, 1], treble: [0, 1, 5] };
      if (presets[value]) { state.settings.eqBass = presets[value][0]; state.settings.eqMid = presets[value][1]; state.settings.eqTreble = presets[value][2]; applyEqualizer(); ['eqBass','eqMid','eqTreble'].forEach(function (eqKey) { var control = document.querySelector('[data-setting="' + eqKey + '"]'); var output = document.querySelector('[data-setting-value="' + eqKey + '"]'); if (control) control.value = String(state.settings[eqKey]); if (output) output.value = state.settings[eqKey] + ' dB'; }); }
    }
    if (key === 'saveHistory' && !state.settings.saveHistory) state.history = [];
    persist(); setTheme();
    if (key === 'density') document.body.dataset.density = value;
    if (key === 'textSize') document.body.classList.toggle('text-large', value === 'Large');
    if (key === 'textSize') document.body.classList.toggle('text-small', value === 'Small');
    if (key === 'waveformStyle' || key === 'waveformSensitivity' || key === 'waveformLine' || key === 'analyserFftSize') drawVisualizer();
    if (key === 'defaultVolume' || key === 'volumeStep') updatePlayerView();
    if (/^eq(Bass|Mid|Treble)$/.test(key)) { state.settings.eqPreset = 'custom'; applyEqualizer(); }
    toast('Setting updated.');
  }

  function handleAction(action, el) {
    var id = el.getAttribute('data-id'); var tracksArg = (el.getAttribute('data-tracks') || '').split(',').filter(Boolean);
    if (action === 'toggle-play') togglePlayback();
    else if (action === 'play-track') playTrack(id, { sessionIds: [id] });
    else if (action === 'play-album') playList(albumTracks(id).map(function (t) { return t.id; }));
    else if (action === 'play-list') playList((el.getAttribute('data-ids') || '').split(',').filter(Boolean));
    else if (action === 'shuffle-playlist') playList(shuffleArray((el.getAttribute('data-ids') || '').split(',').filter(Boolean)));
    else if (action === 'next') nextTrack();
    else if (action === 'previous') previousTrack();
    else if (action === 'shuffle') { state.shuffle = !state.shuffle; persist(); updatePlayerView(); toast(state.shuffle ? 'Shuffle is on.' : 'Shuffle is off.'); }
    else if (action === 'repeat') { state.repeat = (state.repeat + 1) % 3; persist(); updatePlayerView(); toast(state.repeat === 2 ? 'Repeat one.' : state.repeat === 1 ? 'Repeat all.' : 'Repeat off.'); }
    else if (action === 'mute') { if (state.volume > 0) { state.lastVolume = state.volume; state.volume = 0; } else state.volume = state.lastVolume || 72; state.settings.defaultVolume = state.volume; audioElement.volume = state.volume / 100; if (masterGain) masterGain.gain.value = state.volume / 100 * .55; persist(); updatePlayerView(); }
    else if (action === 'queue') { state.queueOpen = !state.queueOpen; persist(); setShell(); }
    else if (action === 'mobile-nav') { state.mobileNavOpen = !state.mobileNavOpen; if (state.mobileNavOpen) state.queueOpen = false; persist(); setShell(); }
    else if (action === 'close-queue') { state.queueOpen = false; persist(); setShell(); }
    else if (action === 'clear-queue') { state.queue = []; persist(); updateQueueView(); toast('Queue cleared.'); }
    else if (action === 'remove-queue') { state.queue.splice(Number(id), 1); persist(); updateQueueView(); }
    else if (action === 'add-queue') { state.queue.push(id); persist(); updateQueueView(); toast('Added to the queue.'); }
    else if (action === 'play-next') { state.queue.unshift(id); persist(); updateQueueView(); closeModal(); toast('Added to play next.'); }
    else if (action === 'save-queue') { if (!state.queue.length) toast('Your queue is empty.'); else openPlaylistModal(state.queue.slice()); }
    else if (action === 'queue-settings') { showModal(modalFrame('Queue options', 'Your queue is kept in this browser.', '<button class="nav-item" data-action="save-queue">' + icon('plus') + '<span>Save as playlist</span></button><button class="nav-item" data-action="clear-queue">' + icon('x') + '<span>Clear queue</span></button>', '<button class="button ghost" data-action="close-modal">Done</button>')); }
    else if (action === 'like-track') toggleLike(id);
    else if (action === 'edit-lyrics') openLyricsEditor(id || state.currentId);
    else if (action === 'open-track-lyrics') nav('lyrics/' + encodeURIComponent(id));
    else if (action === 'save-lyrics') saveLyrics(id || editingLyricsId);
    else if (action === 'import-lyrics') document.getElementById('lyricsPicker').click();
    else if (action === 'clear-lyrics-editor') { var lyricsEditor = document.getElementById('lyricsEditor'); if (lyricsEditor) lyricsEditor.value = ''; }
    else if (action === 'seek-lyric') seekTo(Number(el.getAttribute('data-seconds')));
    else if (action === 'lyrics-offset') { var lyricTrack = state.currentId; if (lyricTrack) { state.lyricOffsets[lyricTrack] = Math.max(-10000, Math.min(10000, (Number(state.lyricOffsets[lyricTrack]) || 0) + (Number(id) || 0))); persist(); lastActiveLyricIndex = -2; renderPage(); } }
    else if (action === 'accent-preset') { state.settings.accent = el.getAttribute('data-color') || '#1ed760'; state.settings.accentHue = null; state.settings.accentIntensity = null; state.settings.accentBrightness = null; persist(); setTheme(); renderPage(); toast('Accent color updated.'); }
    else if (action === 'track-menu') openTrackMenu(id, el.closest('[data-playlist-id]') && el.closest('[data-playlist-id]').getAttribute('data-playlist-id'));
    else if (action === 'remove-from-playlist') { var playlist = playlistById(el.getAttribute('data-playlist-id')); if (playlist) { playlist.trackIds = playlist.trackIds.filter(function (trackId) { return trackId !== id; }); persist(); closeModal(); renderPage(); toast('Removed from playlist.'); } }
    else if (action === 'add-track') openAddToPlaylistModal([id]);
    else if (action === 'add-album') openAddToPlaylistModal(albumTracks(id).map(function (t) { return t.id; }));
    else if (action === 'add-to-playlist') { var p = playlistById(id); if (p && !p.smart) { p.trackIds = p.trackIds || []; tracksArg.forEach(function (t) { if (p.trackIds.indexOf(t) < 0) p.trackIds.push(t); }); persist(); closeModal(); renderPage(); toast('Added to ' + p.name + '.'); } }
    else if (action === 'new-playlist') openPlaylistModal([]);
    else if (action === 'new-smart-playlist') openSmartPlaylistModal();
    else if (action === 'import-spotify-playlist') openSpotifyPlaylistModal();
    else if (action === 'connect-spotify') beginSpotifyConnection(id);
    else if (action === 'disconnect-spotify') disconnectSpotify();
    else if (action === 'sync-spotify-playlist') { var spotifyPlaylist = spotifyPlaylistById(id); if (!spotifyPlaylist) return; if (!spotifySessionExists()) { openSpotifyPlaylistModal(id); return; } loadSpotifyPlaylist(spotifyPlaylist.spotifyId, true).then(function (data) { renderPage(); toast(data && data.error ? 'Spotify kept the list in its official player.' : 'Spotify playlist refreshed.'); }); }
    else if (action === 'delete-spotify-playlist') { var removedSpotify = spotifyPlaylistById(id); state.externalPlaylists = state.externalPlaylists.filter(function (playlist) { return playlist.id !== id; }); if (removedSpotify) { delete spotifyPlaylistCache[removedSpotify.spotifyId]; try { var tempCache = JSON.parse(spotifyStorageGet('rill-spotify-playlists-temp') || '{}'); delete tempCache[removedSpotify.spotifyId]; spotifyStorageSet('rill-spotify-playlists-temp', JSON.stringify(tempCache)); } catch (e) {} } persist(); renderPage(); toast('Spotify playlist removed from Rill.'); }
    else if (action === 'new-playlist-with-tracks') openPlaylistModal(tracksArg);
    else if (action === 'edit-playlist') { var pEdit = playlistById(id); if (pEdit) openPlaylistModal([], pEdit); }
    else if (action === 'playlist-menu') openPlaylistMenu(id);
    else if (action === 'duplicate-playlist') { var source = playlistById(id); if (source) { var copy = Object.assign({}, source, { id: (source.smart ? 'smart-' : 'pl-') + Date.now().toString(36), name: source.name + ' (copy)', trackIds: (source.trackIds || []).slice(), smart: source.smart ? Object.assign({}, source.smart) : null, pinned: false }); state.playlists.unshift(copy); persist(); updateSidebarPlaylists(); closeModal(); renderPage(); toast('Playlist duplicated.'); } }
    else if (action === 'delete-playlist') { var pDel = playlistById(id); if (pDel) { state.playlists = state.playlists.filter(function (p) { return p.id !== id; }); persist(); updateSidebarPlaylists(); closeModal(); nav('playlists'); toast('Playlist deleted.'); } }
    else if (action === 'export-playlist') { exportPlaylist(id); }
    else if (action === 'sort-playlist') { var pSort = playlistById(id); if (pSort && !pSort.smart) { pSort.trackIds = pSort.trackIds || []; pSort.trackIds.sort(function (a, b) { return (trackById(a) || { title: '' }).title.localeCompare((trackById(b) || { title: '' }).title); }); persist(); renderPage(); toast('Sorted by title.'); } }
    else if (action === 'follow') { var at = state.following.indexOf(id); if (at >= 0) state.following.splice(at, 1); else state.following.push(id); persist(); renderPage(); toast(at >= 0 ? 'Artist unfollowed.' : 'Following ' + artistName(id) + '.'); }
    else if (action === 'refresh-jamendo') loadJamendoFeatured(true).then(function (rows) { if (rows.length) toast('Jamendo catalog refreshed.'); });
    else if (action === 'save-jamendo-id') {
      var clientIdInput = document.getElementById('jamendoClientIdInput'); var nextClientId = clientIdInput ? clientIdInput.value.trim() : '';
      if (!/^[A-Za-z0-9_-]{4,120}$/.test(nextClientId)) { toast('Enter a valid Jamendo client ID.'); return; }
      state.jamendoClientId = nextClientId; persist(); jamendoError = ''; jamendoFeaturedPromise = null; jamendoLoading = false; jamendoSearchSequence += 1; renderPage(); toast('Jamendo client ID saved on this device.'); loadJamendoFeatured(true);
    }
    else if (action === 'mood') { var ids = allTracks().filter(function (t) { return t.mood === id; }).map(function (t) { return t.id; }); playList(ids); }
    else if (action === 'settings-tab') { selectedSettings = id; settingsQuery = ''; renderPage(); }
    else if (action === 'clear-settings-search') { settingsQuery = ''; renderPage(); var settingsInput = document.getElementById('settingsSearch'); if (settingsInput) settingsInput.focus(); }
    else if (action === 'setting-toggle') { state.settings[id] = !state.settings[id]; if (id === 'saveHistory' && !state.settings.saveHistory) state.history = []; persist(); setTheme(); renderPage(); toast('Setting updated.'); }
    else if (action === 'toggle-sidebar') { state.collapsed = !state.collapsed; persist(); setShell(); renderPage(); }
    else if (action === 'clear-history') { state.history = []; persist(); renderPage(); toast('Listening history cleared.'); }
    else if (action === 'clear-search-history') { state.search = ''; persist(); renderPage(); toast('Search history cleared.'); }
    else if (action === 'reset-settings') { if (!window.confirm('Restore all preferences to their defaults? Your music and playlists will stay.')) return; state.settings = Object.assign({}, defaultSettings); state.sleepTimerEndsAt = 0; scheduleSleepTimer(); state.volume = defaultSettings.defaultVolume; state.queueOpen = defaultSettings.openQueueOnStart; settingsQuery = ''; audioElement.volume = state.volume / 100; persist(); setTheme(); setShell(); renderPage(); toast('Default preferences restored.'); }
    else if (action === 'export-data') exportData();
    else if (action === 'pick-files') document.getElementById('filePicker').click();
    else if (action === 'pick-folder') document.getElementById('folderPicker').click();
    else if (action === 'scan-duplicates') showDuplicateReview();
    else if (action === 'remove-duplicate-copies') removeDuplicateCopies((el.getAttribute('data-ids') || '').split(',').filter(Boolean));
    else if (action === 'install-app') installApp();
    else if (action === 'delete-upload') { if (state.settings.confirmDelete && !window.confirm('Remove this audio file from this browser?')) return; dbDelete(id).then(function () { localTracks = localTracks.filter(function (t) { return t.id !== id; }); if (state.currentId === id) { pausePlayback(); state.currentId = null; state.elapsed = 0; } closeModal(); renderPage(); toast('Local file removed.'); }).catch(function () { toast('Could not remove this file.'); }); }
    else if (action === 'share-track') { copyText(location.origin + location.pathname + '#track/' + encodeURIComponent(id), 'Track link copied.'); }
    else if (action === 'share') { copyText(location.origin + location.pathname + '#' + id, 'Link copied.'); }
    else if (action === 'open-credits') showModal(modalFrame('Credits', 'Album information', '<div class="info-banner">Studio demo credits: Rill interface sample. Full performer, writing, and label credits are provided when available from the catalog source.</div>', '<button class="button ghost" data-action="close-modal">Close</button>'));
    else if (action === 'lyrics') nav('lyrics');
    else if (action === 'expand-player') openExpandedPlayer();
    else if (action === 'clear-search') { state.search = ''; persist(); renderPage(); }
    else if (action === 'search-filter') { state.searchFilter = id; persist(); renderPage(); }
    else if (action === 'plans') nav('plans');
    else if (action === 'help') nav('help');
    else if (action === 'plan-interest') { toast('Thanks — billing is not connected yet.'); closeModal(); }
    else if (action === 'auth-google') signInWithGoogle();
    else if (action === 'auth-signout') signOut();
    else if (action === 'edit-profile') showModal(modalFrame('Edit profile', 'This profile exists only in your browser.', '<div class="field"><label>Display name</label><input id="profileName" value="Guest listener" maxlength="40"></div><div class="info-banner">Avatar uploads and cross-device profiles need an account backend.</div>', '<button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" data-action="save-profile">Save</button>'));
    else if (action === 'save-profile') { var value = document.getElementById('profileName').value.trim(); if (value) { state.profileName = value; persist(); document.querySelectorAll('.profile-copy b').forEach(function (el) { el.textContent = value; }); document.querySelectorAll('.avatar').forEach(function (el) { if (!el.classList.contains('artist-portrait')) el.textContent = value.slice(0, 1).toUpperCase(); }); closeModal(); toast('Profile name updated.'); } }
    else if (action === 'sort-albums') { state.albumSort = id; persist(); renderPage(); }
    else if (action === 'sort-releases') { state.releaseSort = state.releaseSort === 'oldest' ? 'recent' : 'oldest'; persist(); renderPage(); }
    else if (action === 'back') history.back();
    else if (action === 'forward') history.forward();
    else if (action === 'save-profile') {}
    else if (action === 'new-release') nav('new-releases');
    else if (action === 'plan-interest') toast('Rill Plus is not available until billing is connected.');
    else if (action === 'copy-diagnostics') copyText('Rill local preview\nBrowser: ' + navigator.userAgent + '\nOnline: ' + navigator.onLine, 'Browser diagnostics copied.');
    else if (action === 'view-tab') { var group = el.closest('.page-tabs'); group.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); }); el.classList.add('active'); }
    else if (action === 'noop') { var tabs = el.closest('.page-tabs'); if (tabs) { tabs.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); }); el.classList.add('active'); } }
    else if (action === 'close-modal') closeModal();
  }

  function openExpandedPlayer() {
    var t = trackById(state.currentId);
    if (!t) { toast('Choose a track first.'); return; }
    showModal('<div class="modal expanded-player" style="width:min(620px,100%);text-align:center;padding:28px"><div class="modal-head"><span class="eyebrow">NOW PLAYING</span><button class="icon-button" data-action="close-modal" aria-label="Close">' + icon('x') + '</button></div>' + cover(t) + '<h2 style="font:650 21px Manrope;margin:20px 0 5px">' + esc(t.title) + '</h2><p style="color:#979b90;font-size:12px;margin:0">' + esc(artistName(t.artistId)) + '</p><canvas class="audio-visualizer expanded-visualizer" width="520" height="50" aria-label="Live audio waveform"></canvas><div class="timeline expanded-timeline" style="margin:16px 0"><span id="expandedElapsed">' + fmt(getElapsed()) + '</span><div class="seek-wrap"><canvas class="audio-visualizer" width="520" height="30" aria-hidden="true"></canvas><input id="expandedSeek" type="range" min="0" max="100" value="0" aria-label="Playback position"></div><span>' + fmt(t.duration) + '</span></div><div style="display:flex;justify-content:center;align-items:center;gap:22px"><button class="player-control" data-action="previous">' + icon('prev') + '</button><button class="play-button" data-action="toggle-play">' + icon(state.playing ? 'pause' : 'play') + '</button><button class="player-control" data-action="next">' + icon('next') + '</button></div><button class="link-button expanded-lyrics-link" data-page="lyrics">Open lyrics</button></div>');
    drawVisualizer(); updateTimeline();
  }

  document.body.addEventListener('click', function (event) {
    if (state.mobileNavOpen && event.target && event.target.id === 'appShell') { state.mobileNavOpen = false; persist(); setShell(); return; }
    var actionElement = event.target.closest('[data-action]');
    if (actionElement) { event.preventDefault(); handleAction(actionElement.getAttribute('data-action'), actionElement); return; }
    var pageElement = event.target.closest('[data-page]');
    if (pageElement) { event.preventDefault(); if (!document.getElementById('overlay').hidden) closeModal(); nav(pageElement.getAttribute('data-page')); return; }
    var albumElement = event.target.closest('[data-album]'); if (albumElement) { nav('album/' + encodeURIComponent(albumElement.getAttribute('data-album'))); return; }
    var artistElement = event.target.closest('[data-artist]'); if (artistElement) { nav('artist/' + encodeURIComponent(artistElement.getAttribute('data-artist'))); return; }
    var playlistElement = event.target.closest('[data-playlist]'); if (playlistElement) { nav('playlist/' + encodeURIComponent(playlistElement.getAttribute('data-playlist'))); return; }
    var row = event.target.closest('[data-row-track]'); if (row) { var id = row.getAttribute('data-row-track'); var list = (row.getAttribute('data-session-ids') || '').split(',').filter(Boolean); if (!list.length) list = Array.from(row.parentElement.querySelectorAll('[data-row-track]')).map(function (x) { return x.getAttribute('data-row-track'); }); playTrack(id, { sessionIds: list }); }
  });
  document.getElementById('overlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  document.body.addEventListener('submit', function (e) { var form = e.target.closest('[data-form]'); if (!form) return; if (form.getAttribute('data-form') === 'jamendo-search') { e.preventDefault(); var data = new FormData(form); state.jamendoQuery = String(data.get('query') || '').trim(); persist(); if (state.jamendoQuery.length >= 2) searchJamendo(state.jamendoQuery); else loadJamendoFeatured(true); } else if (form.getAttribute('data-form') === 'playlist') { e.preventDefault(); savePlaylistForm(form); } else if (form.getAttribute('data-form') === 'smart-playlist') { e.preventDefault(); saveSmartPlaylistForm(form); } else if (form.getAttribute('data-form') === 'spotify-playlist') { e.preventDefault(); saveSpotifyPlaylistForm(form); } else if (form.getAttribute('data-form') === 'auth') { e.preventDefault(); sendAuthLink(form); } });
  document.body.addEventListener('change', function (e) {
    var input = e.target;
    if (input.id === 'playlistSort') { playlistSort = input.value || 'recent'; updatePlaylistCollection(); return; }
    if (input.id === 'filePicker') { ingestFiles(input.files); input.value = ''; return; }
    if (input.id === 'folderPicker') { ingestFiles(input.files); input.value = ''; return; }
    if (input.id === 'lyricsPicker') { var file = input.files && input.files[0]; input.value = ''; if (file && editingLyricsId) file.text().then(function (text) { state.lyrics[editingLyricsId] = text; persist(); closeModal(); if (state.page === 'lyrics') renderPage(); toast('Lyrics imported on this device.'); }).catch(function () { toast('Could not read this lyrics file.'); }); return; }
    if (input.id === 'volume') { state.volume = Number(input.value); state.settings.defaultVolume = state.volume; audioElement.volume = state.volume / 100; if (masterGain) masterGain.gain.value = state.volume / 100 * .55; persist(); return; }
    if (input.id === 'seek') { var t = trackById(state.currentId); if (t) seekTo(t.duration * Number(input.value) / 100); return; }
    if (input.id === 'expandedSeek') { var t2 = trackById(state.currentId); if (t2) seekTo(t2.duration * Number(input.value) / 100); return; }
    var setting = input.getAttribute('data-setting'); if (/^accent(Hue|Intensity|Brightness)$/.test(setting || '') || setting === 'meshBrightness') return; if (setting) setSetting(setting, input.value);
  });
  document.body.addEventListener('input', function (e) {
    var input = e.target;
    if (input.id === 'playlistSearch') { playlistSearch = input.value; updatePlaylistCollection(); return; }
    if (input.id === 'playlistTrackSearch') { var filter = input.value.trim().toLowerCase(); document.querySelectorAll('.rill-playlist-track-wrap tbody tr').forEach(function (row) { row.hidden = !!filter && row.textContent.toLowerCase().indexOf(filter) < 0; }); return; }
    if (input.id === 'settingsSearch') { settingsQuery = input.value; var settingsResults = document.getElementById('settingsSearchResults'); var settingsWorkspace = document.getElementById('settingsWorkspace'); var clearSettings = document.querySelector('[data-action="clear-settings-search"]'); var searchingSettings = !!settingsQuery.trim(); if (settingsResults) { settingsResults.hidden = !searchingSettings; settingsResults.innerHTML = searchingSettings ? settingsSearchResults(settingsQuery) : ''; } if (settingsWorkspace) settingsWorkspace.hidden = searchingSettings; if (clearSettings) clearSettings.hidden = !searchingSettings; return; }
    if (input.id === 'searchInput') { state.search = input.value; persist(); clearTimeout(searchTimer); searchTimer = setTimeout(function () { refreshSearchContent(); searchJamendo(state.search); }, Math.max(0, Number(state.settings.searchDelay) || 0)); }
    var setting = input.getAttribute('data-setting');
    if (setting && /^accent(Hue|Intensity|Brightness)$/.test(setting)) { updateAccentFromControls(setting, input.value); var accentOutput = document.querySelector('[data-setting-value="' + setting + '"]'); if (accentOutput) accentOutput.value = input.value + (setting === 'accentHue' ? '°' : '%'); return; }
    if (setting === 'meshBrightness') { state.settings.meshBrightness = Number(input.value); var meshOutput = document.querySelector('[data-setting-value="meshBrightness"]'); if (meshOutput) meshOutput.value = input.value + '%'; applyFineTuning(); persist(); return; }
    if (setting && /^eq(Bass|Mid|Treble)$/.test(setting)) { state.settings[setting] = Number(input.value); applyEqualizer(); var output = document.querySelector('[data-setting-value="' + setting + '"]'); if (output) output.value = input.value + ' dB'; }
    var rangePreference = setting && fineTuningRanges().find(function (item) { return item[0] === setting; });
    if (rangePreference) { state.settings[setting] = Number(input.value); applyFineTuning(); var rangeOutput = document.querySelector('[data-setting-value="' + setting + '"]'); if (rangeOutput) rangeOutput.value = input.value + (rangePreference[6] || ''); if (setting === 'waveformSensitivity' || setting === 'waveformLine') drawVisualizer(); }
    if (setting === 'accent') { state.settings.accent = input.value; state.settings.accentHue = null; state.settings.accentIntensity = null; state.settings.accentBrightness = null; setTheme(); syncAccentRangeControls(); }
  });
  document.body.addEventListener('dragstart', function (e) { var queueRow = e.target.closest('[data-queue-index]'); if (queueRow) { draggedQueueIndex = Number(queueRow.getAttribute('data-queue-index')); queueRow.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; return; } var playlistRow = e.target.closest('[data-playlist-index]'); if (playlistRow) { draggedPlaylistRow = { id: playlistRow.getAttribute('data-playlist-id'), index: Number(playlistRow.getAttribute('data-playlist-index')) }; playlistRow.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  document.body.addEventListener('dragend', function (e) { var row = e.target.closest('[data-queue-index], [data-playlist-index]'); if (row) row.classList.remove('dragging'); });
  document.body.addEventListener('dragover', function (e) { if (e.target.closest('[data-queue-index], [data-playlist-index]')) e.preventDefault(); });
  document.body.addEventListener('drop', function (e) {
    var queueTarget = e.target.closest('[data-queue-index]');
    if (queueTarget && draggedQueueIndex >= 0) { e.preventDefault(); var queueTo = Number(queueTarget.getAttribute('data-queue-index')); var queueMoved = state.queue.splice(draggedQueueIndex, 1)[0]; state.queue.splice(queueTo, 0, queueMoved); draggedQueueIndex = -1; persist(); updateQueueView(); return; }
    var playlistTarget = e.target.closest('[data-playlist-index]');
    if (playlistTarget && draggedPlaylistRow && draggedPlaylistRow.id === playlistTarget.getAttribute('data-playlist-id')) { e.preventDefault(); var playlist = playlistById(draggedPlaylistRow.id); var to = Number(playlistTarget.getAttribute('data-playlist-index')); if (playlist && to !== draggedPlaylistRow.index) { var movedTrack = playlist.trackIds.splice(draggedPlaylistRow.index, 1)[0]; playlist.trackIds.splice(to, 0, movedTrack); persist(); renderPage(); toast('Playlist order updated.'); } draggedPlaylistRow = null; }
  });
  document.body.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!document.getElementById('overlay').hidden) closeModal(); return; }
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if (typing) return;
    var command = e.ctrlKey || e.metaKey;
    if (command && e.key.toLowerCase() === 'k') { e.preventDefault(); nav('search'); setTimeout(function () { var input = document.getElementById('searchInput'); if (input) input.focus(); }, 30); }
    else if (command && e.key.toLowerCase() === 'l') { e.preventDefault(); if (state.currentId) toggleLike(state.currentId); }
    else if (command && e.key.toLowerCase() === 'n') { e.preventDefault(); nextTrack(); }
    else if (command && e.key.toLowerCase() === 'p') { e.preventDefault(); previousTrack(); }
    else if (command && e.key.toLowerCase() === 'q') { e.preventDefault(); state.queueOpen = true; setShell(); }
    else if (command && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); state.volume = Math.max(0, Math.min(100, Number(state.volume) + (e.key === 'ArrowUp' ? 1 : -1) * (Number(state.settings.volumeStep) || 5))); state.settings.defaultVolume = state.volume; audioElement.volume = state.volume / 100; if (masterGain) masterGain.gain.value = state.volume / 100 * .55; persist(); updatePlayerView(); }
    else if (e.code === 'Space') { e.preventDefault(); togglePlayback(); }
    else if (e.key === 'ArrowLeft' && state.currentId) { e.preventDefault(); seekTo(getElapsed() - (Number(state.settings.seekStep) || 5)); }
    else if (e.key === 'ArrowRight' && state.currentId) { e.preventDefault(); seekTo(getElapsed() + (Number(state.settings.seekStep) || 5)); }
    else if (e.key.toLowerCase() === 'm') handleAction('mute', document.querySelector('[data-action="mute"]'));
  });
  window.addEventListener('hashchange', function () { renderPage(); });
  window.addEventListener('beforeinstallprompt', function (event) { event.preventDefault(); deferredInstallPrompt = event; });
  window.addEventListener('appinstalled', function () { deferredInstallPrompt = null; toast('Rill has been installed.'); });
  window.addEventListener('resize', function () { if (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches && state.queueOpen) { state.queueOpen = false; persist(); setShell(); } });
  window.addEventListener('online', function () { toast('You are back online.'); });
  window.addEventListener('offline', function () { toast('Offline. Local uploads remain available.'); });
  document.addEventListener('visibilitychange', function () {
    if (state.settings.pauseWhenHidden && document.hidden && state.playing) { pausedByVisibility = true; pausePlayback(); }
    else if (!document.hidden && pausedByVisibility) { pausedByVisibility = false; resumePlayback(); }
  });
  function saveExitState() {
    if (state.playing) { state.elapsed = state.settings.rememberPosition ? getElapsed() : 0; state.playing = false; audioElement.pause(); stopSynth(); }
    if (state.settings.clearHistoryOnExit) state.history = [];
    persist();
    if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }
  }
  window.addEventListener('pagehide', saveExitState);
  window.addEventListener('beforeunload', saveExitState);

  var startupStartedAt = Date.now();
  var startupProgressTimer = 0;
  function updateStartupProgress(value, caption) {
    var bar = document.getElementById('loadingProgress');
    var track = document.getElementById('loadingProgressTrack');
    var label = document.getElementById('loadingCaption');
    if (bar) bar.style.width = Math.max(0, Math.min(100, value)) + '%';
    if (track) track.setAttribute('aria-valuenow', String(Math.round(value)));
    if (label && caption) label.textContent = caption;
  }
  function startStartupProgress() {
    function tick() {
      var elapsed = Date.now() - startupStartedAt;
      var targetDuration = Math.max(600, Number(state.settings.loadingDuration) || 1500);
      var progress = Math.min(92, 8 + elapsed / targetDuration * 84);
      var caption = elapsed < 360 ? 'Starting Rill' : elapsed < 820 ? 'Preparing your library' : 'Finishing setup';
      updateStartupProgress(progress, caption);
    }
    tick();
    startupProgressTimer = window.setInterval(tick, 70);
  }
  function hideStartupLoader() {
    var loader = document.getElementById('loadingScreen');
    if (!loader) return;
    window.clearInterval(startupProgressTimer);
    var minimumVisibleMs = Math.max(state.settings.reducedMotion ? 500 : 600, Number(state.settings.loadingDuration) || 1500);
    var wait = Math.max(0, minimumVisibleMs - (Date.now() - startupStartedAt));
    window.setTimeout(function () {
      updateStartupProgress(100, 'Ready');
      window.setTimeout(function () {
        loader.classList.remove('is-visible');
        loader.setAttribute('aria-hidden', 'true');
        window.setTimeout(function () { loader.hidden = true; }, 240);
      }, 160);
    }, wait);
  }

  function bootstrap() {
    restoreSpotifyPlaylistCache(); completeSpotifyCallback();
    setupAuth();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(function (error) { console.warn('Offline app shell could not be enabled', error); });
    state.playing = false;
    state.mobileNavOpen = false;
    if (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches) state.queueOpen = false;
    else state.queueOpen = state.settings.openQueueOnStart !== false;
    if (needsEmptyCatalogMigration || needsAppleStyleMigration || needsLoadingDurationMigration) persist();
    if (state.profileName) { document.querySelectorAll('.profile-copy b').forEach(function (el) { el.textContent = state.profileName; }); document.querySelectorAll('.avatar').forEach(function (el) { if (!el.classList.contains('artist-portrait')) el.textContent = state.profileName.slice(0, 1).toUpperCase(); }); }
    if (state.sessionIds && !Array.isArray(state.sessionIds)) state.sessionIds = [];
    if (!state.sessionIds) state.sessionIds = [];
    if (state.queue.length) state.queue = state.queue.filter(function (id) { return !!trackById(id); });
    state.volume = Number(state.volume == null ? state.settings.defaultVolume : state.volume);
    if (!state.settings.rememberPosition) state.elapsed = 0;
    var initialPage = location.hash.replace(/^#/, '');
    if ((!initialPage || initialPage === 'home') && ['home','search','library'].indexOf(state.settings.startPage) >= 0 && state.settings.startPage !== 'home') history.replaceState(null, '', location.pathname + location.search + '#' + state.settings.startPage);
    startStartupProgress();
    scheduleSleepTimer();
    setTheme(); setShell(); updateSidebarPlaylists();
    initUploads().then(function () { if (state.currentId && !trackById(state.currentId)) { state.currentId = null; state.elapsed = 0; } renderPage(); }).catch(function (e) { console.warn('Could not initialize the local library', e); renderPage(); }).then(function () { hideStartupLoader(); if (currentRoute().page === 'search' && state.search.trim().length >= 2) searchJamendo(state.search); else if (!jamendoTracks.length) loadJamendoFeatured(); });
  }
  bootstrap();
}());

