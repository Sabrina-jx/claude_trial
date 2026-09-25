#!/usr/bin/env node
/*
 * Offline renderer for 通过 Claude 的眼睛.
 *
 * Opens index.html in headless Chromium, calls the same Film.render() the
 * player uses, and writes contact sheets, single frames, or an encoded video.
 *
 *   node render.cjs --sheet=sheet.png [--frames=0-1079:24] [--cols=6] [--thumb=320]
 *   node render.cjs --png=out/ --frames=760,761
 *   node render.cjs --mp4=film.mp4 [--audio] [--res=1] [--crf=23]
 *   node render.cjs --gif=teaser.gif --frames=516-803 [--thumb=640]
 *   node render.cjs --wav=soundtrack.wav
 *
 * Needs the `playwright` package and an ffmpeg binary for --mp4/--gif
 * (set FFMPEG=/path/to/ffmpeg if it is not on PATH).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const ROOT = __dirname;
const FONT_CACHE = path.join(ROOT, '.font-cache');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const res = Number(args.res || 1);

function parseFrames(spec, total) {
  if (!spec || spec === true) return [...Array(total).keys()];
  const out = [];
  for (const part of String(spec).split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?(?::(\d+))?$/);
    if (!m) throw new Error(`bad --frames part: ${part}`);
    const a = +m[1], b = m[2] ? +m[2] : a, s = m[3] ? +m[3] : 1;
    for (let f = a; f <= Math.min(b, total - 1); f += s) out.push(f);
  }
  return out;
}

// Google Fonts are fetched from Node (which honours HTTPS_PROXY and the
// system CA settings) and cached on disk, so repeat renders are offline and
// every render uses byte-identical fonts.
async function serveFonts(route) {
  const req = route.request(), url = req.url();
  const key = path.join(FONT_CACHE, crypto.createHash('sha1').update(url).digest('hex'));
  if (!fs.existsSync(key)) {
    const r = await fetch(url, { headers: { 'user-agent': req.headers()['user-agent'] } });
    if (!r.ok) return route.abort();
    fs.mkdirSync(FONT_CACHE, { recursive: true });
    fs.writeFileSync(key, Buffer.from(await r.arrayBuffer()));
    fs.writeFileSync(key + '.type', r.headers.get('content-type') || 'application/octet-stream');
  }
  await route.fulfill({ body: fs.readFileSync(key), contentType: fs.readFileSync(key + '.type', 'utf8'), headers: { 'access-control-allow-origin': '*' } });
}

function ffmpeg(argv) {
  const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => p.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code}`)) : resolve())));
  return { stdin: p.stdin, done };
}
const write = (stream, buf) => new Promise((resolve) => (stream.write(buf) ? resolve() : stream.once('drain', resolve)));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, serveFonts);
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?render');
  await page.evaluate(async (r) => {
    await Film.init({ res: r, fontTimeout: 90000 });
    const cv = document.createElement('canvas');
    cv.width = Math.round(Film.W * r);
    cv.height = Math.round(Film.H * r);
    const ctx = cv.getContext('2d');
    window.__frame = (f, type, q) => { Film.render(ctx, f); return cv.toDataURL(type, q); };
    window.__ctx = ctx;
    window.__cv = cv;
  }, res);
  const { total, fps } = await page.evaluate(() => ({ total: Film.total, fps: Film.FPS }));
  const frames = parseFrames(args.frames, total);
  const t0 = Date.now();

  if (args.sheet) {
    const cols = Number(args.cols || 6), thumb = Number(args.thumb || 320);
    const url = await page.evaluate(({ frames, cols, thumb }) => {
      const th = Math.round((thumb * 9) / 16), lab = 22, gap = 6;
      const rows = Math.ceil(frames.length / cols);
      const sheet = document.createElement('canvas');
      sheet.width = cols * (thumb + gap) + gap;
      sheet.height = rows * (th + lab + gap) + gap;
      const s = sheet.getContext('2d');
      s.fillStyle = '#111';
      s.fillRect(0, 0, sheet.width, sheet.height);
      frames.forEach((f, i) => {
        Film.render(window.__ctx, f);
        const x = gap + (i % cols) * (thumb + gap), y = gap + Math.floor(i / cols) * (th + lab + gap);
        s.drawImage(window.__cv, x, y, thumb, th);
        s.fillStyle = '#E9A92C';
        s.font = '700 15px "Courier Prime", "Noto Sans SC", monospace';
        const loc = Film.locate(f), sec = f / Film.FPS;
        const time = `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`;
        s.fillText(`${String(f + 1).padStart(4, '0')}  ${time}  ${loc.label}`, x + 2, y + th + 16);
      });
      return sheet.toDataURL('image/png');
    }, { frames, cols, thumb });
    fs.writeFileSync(args.sheet, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`sheet: ${frames.length} frames -> ${args.sheet} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  if (args.png) {
    fs.mkdirSync(args.png, { recursive: true });
    for (const f of frames) {
      const url = await page.evaluate((f) => window.__frame(f, 'image/png'), f);
      fs.writeFileSync(path.join(args.png, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(`png: ${frames.length} frames -> ${args.png}`);
  }

  let wavPath = null;
  if (args.wav || (args.mp4 && args.audio)) {
    wavPath = typeof args.wav === 'string' ? args.wav : path.join(ROOT, '.soundtrack.wav');
    const b64 = await page.evaluate(async () => {
      const buf = await Film.soundtrack(48000);
      const n = buf.length, ch = buf.numberOfChannels, out = new DataView(new ArrayBuffer(44 + n * ch * 2));
      const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, 48000, true);
      out.setUint32(28, 48000 * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
      str(36, 'data'); out.setUint32(40, n * ch * 2, true);
      const data = [...Array(ch).keys()].map((c) => buf.getChannelData(c));
      let o = 44;
      for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v * 32767, true); o += 2; }
      const bytes = new Uint8Array(out.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    });
    fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
    console.log(`wav -> ${wavPath}`);
  }

  if (args.mp4 || args.gif) {
    const out = args.mp4 || args.gif;
    const vf = args.gif
      ? [`fps=${fps},scale=${Number(args.thumb || 640)}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`]
      : [];
    const argv = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
    if (args.mp4 && wavPath) argv.push('-i', wavPath);
    if (args.gif) argv.push('-filter_complex', vf[0], '-loop', '0', out);
    else {
      argv.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 23), '-pix_fmt', 'yuv420p', '-r', '24',
        '-tune', 'animation', '-movflags', '+faststart');
      if (wavPath) argv.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
      argv.push(out);
    }
    const ff = ffmpeg(argv);
    for (let i = 0; i < frames.length; i++) {
      const url = await page.evaluate((f) => window.__frame(f, 'image/jpeg', 0.96), frames[i]);
      await write(ff.stdin, Buffer.from(url.split(',')[1], 'base64'));
      if (i % 60 === 0) process.stdout.write(`\r  frame ${frames[i]} / ${total}`);
    }
    ff.stdin.end();
    await ff.done;
    console.log(`\n${args.mp4 ? 'mp4' : 'gif'}: ${frames.length} frames -> ${out} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
