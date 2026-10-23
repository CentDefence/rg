/* Rill add-on: import YouTube / YouTube Music / SoundCloud playlists.
   Track list + covers come from the services' APIs, playback uses their official players,
   lyrics come from LRCLIB (free, synced when available). Independent of app.js. */
(function () {
  'use strict';
  // Вставь сюда свой YouTube API key между кавычками, и поле для ключа на сайте пропадёт.
  var SITE_KEY = 'AIzaSyBj0qz7JeqrqnGtVgHjQ5OvXVPfj083-Vw';
  var KEY = 'rill-imports', LKEY = 'rill-imports-lyrics', YKEY = 'rill-youtube-key';
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function loadScript(src) { return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
  var lists = load(KEY, []), lyr = load(LKEY, {}), cur = null, view = { id: null }, ytp = null, scT = 0, lines = [], lastIdx = -1, root;

  function parse(v) {
    try {
      var u = new URL(String(v).trim()), h = u.hostname.replace(/^www\.|^m\./, '');
      if ((h === 'youtube.com' || h === 'music.youtube.com') && u.searchParams.get('list')) return { p: 'youtube', id: u.searchParams.get('list'), url: u.href };
      if (h === 'soundcloud.com' && /\/sets\//.test(u.pathname)) return { p: 'soundcloud', url: u.href };
      if (h === 'open.spotify.com' || h === 'music.apple.com') return { p: 'other' };
    } catch (e) {}
    return null;
  }

  function fetchYT(id) {
    var key = SITE_KEY || localStorage.getItem(YKEY); if (!key) return Promise.reject(new Error('Add a YouTube API key first.'));
    var out = [], name = 'YouTube playlist';
    function api(path) { return fetch('https://www.googleapis.com/youtube/v3/' + path + '&key=' + encodeURIComponent(key)).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error && j.error.message || 'YouTube request failed.'); return j; }); }); }
    function page(tok) {
      return api('playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=' + encodeURIComponent(id) + (tok ? '&pageToken=' + tok : '')).then(function (j) {
        (j.items || []).forEach(function (it) {
          var s = it.snippet; if (!s.thumbnails || /^(Private|Deleted) video$/.test(s.title)) return;
          out.push({ vid: it.contentDetails.videoId, title: s.title, artist: (s.videoOwnerChannelTitle || '').replace(/ - Topic$/, ''), image: (s.thumbnails.medium || s.thumbnails.default).url, url: 'https://www.youtube.com/watch?v=' + it.contentDetails.videoId });
        });
        return j.nextPageToken && out.length < 500 ? page(j.nextPageToken) : null;
      });
    }
    return api('playlists?part=snippet&id=' + encodeURIComponent(id)).then(function (j) { if (j.items && j.items[0]) name = j.items[0].snippet.title; return page(); }).then(function () { return { name: name, tracks: out }; });
  }

  function fetchSC(url) {
    return loadScript('https://w.soundcloud.com/player/api.js').then(function () {
      return new Promise(function (ok, no) {
        var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-9999px;width:300px;height:166px';
        f.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url); document.body.appendChild(f);
        var w = SC.Widget(f), t = setTimeout(function () { f.remove(); no(new Error('SoundCloud did not respond. Is the playlist public?')); }, 20000);
        w.bind(SC.Widget.Events.READY, function () {
          w.getSounds(function (s) {
            clearTimeout(t); f.remove();
            if (!s || !s.length) return no(new Error('No tracks found in this SoundCloud set.'));
            ok({ name: decodeURIComponent(url.split('/sets/')[1].split(/[?#]/)[0]).replace(/-/g, ' '), tracks: s.map(function (x) { return { title: x.title, artist: x.user && x.user.username || '', image: String(x.artwork_url || x.user && x.user.avatar_url || '').replace('-large', '-t300x300'), url: x.permalink_url, duration: Math.round((x.duration || 0) / 1000) }; }) });
          });
        });
      });
    });
  }

  function importLink(v, msg, into) {
    var p = parse(v);
    if (!p) { msg('Paste a YouTube, YouTube Music or SoundCloud playlist link.'); return; }
    if (p.p === 'other') { msg('Spotify and Apple Music do not share track lists for other people’s playlists. Use the Spotify import on the Playlists page, which keeps their official player.'); return; }
    msg('Loading tracks…');
    (p.p === 'youtube' ? fetchYT(p.id) : fetchSC(p.url)).then(function (d) {
      var l = lists.filter(function (x) { return x.id === into; })[0];
      if (l) { var have = {}; l.tracks.forEach(function (t) { have[t.url] = 1; }); d.tracks.forEach(function (t) { if (!have[t.url]) l.tracks.push(t); }); }
      else { l = { id: 'imp-' + Date.now(), p: p.p, url: p.url, name: (document.getElementById('imp-name') && document.getElementById('imp-name').value.trim()) || d.name, tracks: d.tracks }; lists.unshift(l); } save(KEY, lists); view.id = l.id; renderMain(); msg('');
    }).catch(function (e) { msg(e.message || 'Could not import this playlist.'); });
  }

  /* ---------- playback ---------- */
  function ytReady() { return window.YT && YT.Player ? Promise.resolve() : new Promise(function (ok) { window.onYouTubeIframeAPIReady = ok; loadScript('https://www.youtube.com/iframe_api'); }); }
  function play(l, i) {
    var t = l.tracks[i]; if (!t) return; cur = { l: l, i: i }; ytp = null; scT = 0;
    var box = root.querySelector('#imp-player');
    var next = function () { if (cur && cur.i < cur.l.tracks.length - 1) play(cur.l, cur.i + 1); };
    if (l.p === 'youtube') {
      box.innerHTML = '<div id="imp-yt"></div>';
      ytReady().then(function () { ytp = new YT.Player('imp-yt', { width: '100%', height: '200', videoId: t.vid, playerVars: { autoplay: 1, playsinline: 1 }, events: { onStateChange: function (e) { if (e.data === 0) next(); } } }); });
    } else {
      box.innerHTML = '<iframe allow="autoplay" width="100%" height="166" src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(t.url) + '&auto_play=true&visual=false"></iframe>';
      loadScript('https://w.soundcloud.com/player/api.js').then(function () {
        var w = SC.Widget(box.firstChild); w.bind(SC.Widget.Events.FINISH, next); w.bind(SC.Widget.Events.PLAY_PROGRESS, function (e) { scT = e.currentPosition / 1000; });
      });
    }
    root.classList.add('has-art'); root.style.setProperty('--art', 'url("' + String(t.image).replace(/"/g, '') + '")');
    root.querySelector('#imp-now').innerHTML = '<img src="' + esc(t.image) + '" alt=""><b>' + esc(t.title) + '</b><small>' + esc(t.artist) + '</small>';
    markActive(); showLyrics(t);
  }
  function markActive() { [].forEach.call(root.querySelectorAll('.imp-row'), function (r) { r.classList.toggle('on', !!cur && cur.l.id === view.id && +r.dataset.i === cur.i); }); }

  /* ---------- lyrics (LRCLIB) ---------- */
  function clean(t) {
    var title = t.title.replace(/[\(\[][^\)\]]*[\)\]]/g, '').replace(/official.*$/i, '').trim(), artist = t.artist, m = title.split(/\s[-–]\s/);
    if (m.length > 1) { artist = m[0]; title = m.slice(1).join(' - '); }
    return { title: title, artist: artist };
  }
  function lrclib(q) { return fetch('https://lrclib.net/api/search?' + q).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }); }
  function getLyrics(t) {
    if (lyr[t.url]) return Promise.resolve(lyr[t.url]);
    var c = clean(t), E = encodeURIComponent;
    return lrclib('track_name=' + E(c.title) + '&artist_name=' + E(c.artist)).then(function (a) { return a.length ? a : lrclib('q=' + E(c.artist + ' ' + c.title)); }).then(function (a) {
      var hit = a.filter(function (x) { return x.syncedLyrics; })[0] || a[0], res = hit ? { sync: hit.syncedLyrics || '', plain: hit.plainLyrics || '' } : { sync: '', plain: '' };
      if (res.sync || res.plain) { lyr[t.url] = res; save(LKEY, lyr); } return res;
    });
  }
  function showLyrics(t) {
    var box = root.querySelector('#imp-lyr'); lines = []; lastIdx = -1; box.innerHTML = '<p class="imp-dim">Looking for lyrics…</p>';
    getLyrics(t).then(function (r) {
      if (!cur || cur.l.tracks[cur.i] !== t) return;
      if (r.sync) {
        r.sync.split('\n').forEach(function (ln) { var m = ln.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/); if (m) lines.push({ t: +m[1] * 60 + +m[2], x: m[3] }); });
        box.innerHTML = lines.map(function (l, i) { return '<p class="imp-ly" data-i="' + i + '">' + esc(l.x || '♪') + '</p>'; }).join('');
      } else if (r.plain) box.innerHTML = r.plain.split('\n').map(function (x) { return '<p class="imp-ly plain">' + esc(x) + '</p>'; }).join('');
      else box.innerHTML = '<p class="imp-dim">No lyrics found for this track.</p>';
    });
  }
  setInterval(function () {
    if (!cur || !lines.length || !root || root.hidden) return;
    var now = ytp && ytp.getCurrentTime ? ytp.getCurrentTime() : scT, idx = -1;
    for (var i = 0; i < lines.length; i++) if (lines[i].t <= now) idx = i;
    if (idx === lastIdx) return; lastIdx = idx;
    [].forEach.call(root.querySelectorAll('.imp-ly'), function (p, i) { p.classList.toggle('on', i === idx); if (i === idx) p.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  }, 300);

  /* ---------- interface ---------- */
  function renderMain() {
    var m = root.querySelector('#imp-main'), l = lists.filter(function (x) { return x.id === view.id; })[0], h;
    if (l) {
      h = '<div class="imp-head"><button data-a="home">‹ All imports</button><h2>' + esc(l.name) + '</h2><small>' + l.tracks.length + ' songs · ' + (l.p === 'youtube' ? 'YouTube' : 'SoundCloud') + '</small><button data-a="del" data-id="' + l.id + '">Remove</button></div>' +
        l.tracks.map(function (t, i) { return '<div class="imp-row" data-a="play" data-i="' + i + '"><img src="' + esc(t.image) + '" alt="" loading="lazy"><span><b>' + esc(t.title) + '</b><small>' + esc(t.artist) + '</small></span></div>'; }).join('');
    } else {
      h = '<form id="imp-form"><h3>Import playlist</h3><div class="imp-tabs"><span class="on">Playlist link</span></div><label>Link (YouTube, YouTube Music, SoundCloud)<input name="url" required placeholder="https://music.youtube.com/playlist?list=…"></label>' +
        '<label>Import into<select name="into"><option value="">New playlist (name from the service)</option>' + lists.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select></label><label>Name (optional, for a new playlist)<input id="imp-name" placeholder="My playlist"></label>' +
        (SITE_KEY ? '' : '<label>YouTube API key (needed once for YouTube)<input name="key" value="' + esc(localStorage.getItem(YKEY) || '') + '" placeholder="Google Cloud → YouTube Data API v3 → API key"></label>') +
        '<button type="submit">Import playlist</button><p id="imp-msg" class="imp-dim"></p></form>' +
        (lists.length ? lists.map(function (x) { return '<div class="imp-row" data-a="open" data-id="' + x.id + '"><img src="' + esc(x.tracks[0] && x.tracks[0].image) + '" alt=""><span><b>' + esc(x.name) + '</b><small>' + x.tracks.length + ' songs</small></span></div>'; }).join('') : '');
    }
    m.innerHTML = h; markActive();
  }
  function build() {
    var cs = getComputedStyle(document.body), st = document.createElement('style');
    st.textContent = '#imp-root{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:' + cs.backgroundColor + ';color:' + cs.color + ';font:inherit}#imp-root[hidden]{display:none}' +
      '.imp-bar{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #8884}.imp-body{flex:1;display:flex;min-height:0}#imp-main{flex:1;overflow:auto;padding:16px}#imp-root aside{width:min(460px,50%);overflow:auto;padding:16px;border-left:1px solid #8884}' +
      '#imp-root button{font:inherit;color:inherit;background:#8883;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}#imp-root input{display:block;width:100%;margin:4px 0 12px;padding:10px;border-radius:8px;border:1px solid #8886;background:transparent;color:inherit;font:inherit}' +
      '.imp-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}.imp-head h2{flex:1;margin:0}.imp-row{display:flex;gap:12px;align-items:center;padding:8px;border-radius:8px;cursor:pointer}.imp-row:hover,.imp-row.on{background:#8883}' +
      '.imp-row img{width:48px;height:48px;border-radius:6px;object-fit:cover;background:#8884}.imp-row span{display:flex;flex-direction:column;min-width:0}.imp-row b,.imp-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#imp-root small,.imp-dim{opacity:.65}' +
      '#imp-now{display:flex;flex-direction:column;margin:12px 0}.imp-ly{margin:6px 0;opacity:.5;font-size:1.05rem}.imp-ly.on{opacity:1;font-weight:700}.imp-ly.plain{opacity:.9}#imp-root.has-art{background:#111;color:#fff}#imp-root::before{content:\'\';position:absolute;inset:0;z-index:-1;background:var(--art) center/cover;filter:blur(70px) brightness(.5);transform:scale(1.3);opacity:0;transition:opacity .6s}#imp-root.has-art::before{opacity:1}#imp-now img{width:min(180px,50%);border-radius:12px;margin-bottom:10px;box-shadow:0 8px 30px #0008}.imp-ly{font-size:1.35rem;line-height:1.35;transition:opacity .3s}.imp-ly.on{font-size:1.5rem}#imp-root.imp-full #imp-main{display:none}#imp-root.imp-full aside{width:100%;border:0;text-align:center}#imp-root.imp-full .imp-ly{font-size:2rem}#imp-root.imp-full .imp-ly.on{font-size:2.3rem}#imp-root select{display:block;width:100%;margin:4px 0 12px;padding:10px;border-radius:8px;border:1px solid #8886;background:transparent;color:inherit;font:inherit}.imp-tabs span{display:inline-block;padding:6px 12px;border-radius:8px;background:#8884;margin-bottom:12px}@media(max-width:700px){.imp-body{flex-direction:column-reverse}#imp-root aside{width:auto;border-left:0;border-bottom:1px solid #8884;max-height:55%}}';
    document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'imp-root'; root.hidden = true;
    root.innerHTML = '<div class="imp-bar"><b>Imported playlists</b><span><button data-a="full">Lyrics view</button> <button data-a="close">Close</button></span></div><div class="imp-body"><div id="imp-main"></div><aside><div id="imp-player"></div><div id="imp-now"></div><div id="imp-lyr"></div></aside></div>';
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return; var a = b.dataset.a;
      if (a === 'close') root.hidden = true;
      else if (a === 'full') root.classList.toggle('imp-full');
      else if (a === 'home') { view.id = null; renderMain(); }
      else if (a === 'open') { view.id = b.dataset.id; renderMain(); }
      else if (a === 'del') { lists = lists.filter(function (x) { return x.id !== b.dataset.id; }); save(KEY, lists); view.id = null; renderMain(); }
      else if (a === 'play') play(lists.filter(function (x) { return x.id === view.id; })[0], +b.dataset.i);
    });
    root.addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target; if (f.elements.key && f.elements.key.value.trim()) localStorage.setItem(YKEY, f.elements.key.value.trim());
      importLink(f.elements.url.value, function (t) { var m = root.querySelector('#imp-msg'); if (m) m.textContent = t; }, f.elements.into.value);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !root.hidden) root.hidden = true; });
  }
  function init() {
    build();
    var nav = document.querySelector('nav[aria-label="Your library"]'); if (!nav) return;
    var b = document.createElement('button'); b.className = 'nav-item'; b.innerHTML = '<svg><use href="#i-download"/></svg><span>Import from link</span>';
    b.onclick = function () { root.hidden = false; renderMain(); }; nav.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
