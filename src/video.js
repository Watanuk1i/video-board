const DIRECT_FILE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|$)/i;
const HLS = /\.m3u8(\?|$)/i;

function safeUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    // страница отдаётся по https — http-embed смешивается и блокируется браузером
    u.protocol = 'https:';
    return u;
  } catch {
    return null;
  }
}

const id = (s) => encodeURIComponent(s);

/**
 * Превращает ссылку посетителя/админа в описание плеера.
 * Ничего не загружается на сервер — только embed внешней ссылки.
 */
function resolve(raw, host = '') {
  const u = safeUrl(raw);
  if (!u) return { kind: 'none', provider: 'unknown', url: '' };

  const host_ = u.hostname.replace(/^www\./, '');
  const path = u.pathname;

  if (host_.endsWith('youtube.com') || host_ === 'youtu.be') {
    let vid = u.searchParams.get('v');
    if (!vid && host_ === 'youtu.be') vid = path.slice(1).split('/')[0];
    if (!vid) vid = (path.match(/\/(shorts|embed|live|v)\/([\w-]{6,})/) || [])[2];
    if (vid) {
      const t = u.searchParams.get('t') || u.searchParams.get('start');
      const start = t ? `&start=${parseInt(String(t).replace(/\D/g, ''), 10) || 0}` : '';
      return {
        kind: 'iframe',
        provider: 'YouTube',
        src: `https://www.youtube-nocookie.com/embed/${id(vid)}?rel=0${start}`,
        poster: `https://i.ytimg.com/vi/${id(vid)}/hqdefault.jpg`,
        watchUrl: u.toString(),
      };
    }
  }

  if (host_.endsWith('twitch.tv')) {
    const video = path.match(/\/videos\/(\d+)/);
    const clip = path.match(/\/clip\/([\w-]+)/) || (host_.startsWith('clips.') ? [null, path.slice(1)] : null);
    const parent = encodeURIComponent(host);
    if (video) return { kind: 'iframe', provider: 'Twitch', src: `https://player.twitch.tv/?video=v${id(video[1])}&parent=${parent}&autoplay=false` };
    if (clip) return { kind: 'iframe', provider: 'Twitch', src: `https://clips.twitch.tv/embed?clip=${id(clip[1])}&parent=${parent}&autoplay=false` };
    const channel = path.match(/^\/([\w_]{2,25})\/?$/);
    if (channel) return { kind: 'iframe', provider: 'Twitch', src: `https://player.twitch.tv/?channel=${id(channel[1])}&parent=${parent}&autoplay=false` };
  }

  if (host_.endsWith('vimeo.com')) {
    const num = (path.match(/(\d{6,})/) || [])[1];
    if (num) return { kind: 'iframe', provider: 'Vimeo', src: `https://player.vimeo.com/video/${id(num)}` };
  }

  if (host_.endsWith('rutube.ru')) {
    const num = (path.match(/\/(?:video|play\/embed)\/([a-f0-9]{6,})/i) || [])[1];
    if (num) return { kind: 'iframe', provider: 'Rutube', src: `https://rutube.ru/play/embed/${id(num)}` };
  }

  if (host_.endsWith('ok.ru') || host_.endsWith('odnoklassniki.ru')) {
    const num = (path.match(/\/video\/(\d+\/\d+)/) || [])[1];
    if (num) return { kind: 'iframe', provider: 'OK', src: `https://ok.ru/videoembed/${num}` };
  }

  if (host_.endsWith('dailymotion.com') || host_ === 'dai.ly') {
    const code = host_ === 'dai.ly' ? path.slice(1) : (path.match(/\/video\/([a-z0-9]+)/i) || [])[1];
    if (code) return { kind: 'iframe', provider: 'Dailymotion', src: `https://www.dailymotion.com/embed/video/${id(code)}` };
  }

  if (DIRECT_FILE.test(path)) return { kind: 'file', provider: 'file', src: u.toString() };
  if (HLS.test(path)) return { kind: 'hls', provider: 'hls', src: u.toString() };

  return { kind: 'link', provider: host_, url: u.toString() };
}

module.exports = { resolve, safeUrl };
