import 'dotenv/config'
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import multer from 'multer'
import archiver from 'archiver'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
app.use(express.json())
const settings = { outDir: path.join(os.homedir(), 'InstaBatch-Output'), tmpDir: path.join(os.tmpdir(), 'instabatch') }
fs.mkdirSync(settings.outDir, { recursive: true }); fs.mkdirSync(settings.tmpDir, { recursive: true })
const upload = multer({ storage: multer.diskStorage({ destination: (r, f, cb) => cb(null, settings.tmpDir), filename: (r, f, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(f.originalname)) }) })
const db = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null
const needDb = (q, s, next) => db ? next() : s.status(503).json({ error: 'Supabase não configurado (.env)' })
const sign = async (bucket, p, opts) => (await db.storage.from(bucket).createSignedUrl(p, 3600, opts)).data?.signedUrl
async function persist(job, item) {
  if (!db || !item.dbId) return
  try {
    let sp = null
    if (item.status === 'done') { sp = `${job.dbId}/${item.output}`; const u = await db.storage.from('videos').upload(sp, fs.readFileSync(path.join(job.outDir, item.output)), { contentType: 'video/mp4', upsert: true }); if (u.error) throw u.error }
    await db.from('job_items').update({ status: item.status, output_name: item.output, storage_path: sp, size_bytes: item.size, error: item.error }).eq('id', item.dbId)
  } catch (e) { console.error('Supabase:', e.message) }
}
const jobs = new Map()
let queue = [], running = false

const checkFfmpeg = () => { const r = spawnSync('ffmpeg', ['-version']); return r.status === 0 ? r.stdout.toString().split('\n')[0] : null }
const probeDuration = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]); return parseFloat(r.stdout?.toString()) || 0 }

app.get('/api/ffmpeg', (q, s) => { const v = checkFfmpeg(); s.json({ ok: !!v, version: v }) })
app.get('/api/settings', (q, s) => s.json(settings))
app.post('/api/settings', (q, s) => { for (const k of ['outDir', 'tmpDir']) if (q.body[k]) { fs.mkdirSync(q.body[k], { recursive: true }); settings[k] = q.body[k] } s.json(settings) })

const evenN = n => Math.max(2, Math.round(n / 2) * 2)
function buildArgs(job, item, out) {
  const c = job.config, W = evenN(c.W), H = evenN(c.H)
  const x = Math.round(c.rect.x * W), y = Math.round(c.rect.y * H), w = evenN(c.rect.w * W), h = evenN(c.rect.h * H)
  const fit = c.fit === 'fit'
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
  const top = c.layer !== 'behind'
  const fg = top
    ? `[1:v]${fit},setsar=1,fps=30[v];[2:v]scale=${W}:${H},format=rgba[t];[0:v][t]overlay=shortest=1[b];[b][v]overlay=${x}:${y}:shortest=1,format=yuv420p[out]`
    : `[1:v]${fit},setsar=1,fps=30[v];[0:v][v]overlay=${x}:${y}:shortest=1[b];[2:v]scale=${W}:${H},format=rgba[t];[b][t]overlay=shortest=1,format=yuv420p[out]`
  const q = { eco: ['28', 'veryfast'], insta: ['21', 'medium'], high: ['17', 'slow'] }[c.quality] || ['21', 'medium']
  const a = ['-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=30`, '-i', item.path, '-loop', '1', '-i', job.templatePath, '-filter_complex', fg, '-map', '[out]']
  if (c.audio === 'remove') a.push('-an'); else a.push('-map', '1:a?', '-c:a', 'aac', '-b:a', '192k')
  if (c.duration === 'manual' && c.seconds > 0) a.push('-t', String(c.seconds))
  a.push('-c:v', 'libx264', '-preset', q[1], '-crf', q[0], '-shortest', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out)
  return a
}
function runItem(job, item) {
  return new Promise(resolve => {
    item.status = 'processing'; item.progress = 0
    const dur = probeDuration(item.path)
    let base = path.parse(item.name).name + '_final', n = 0, name = base + '.mp4'
    while (fs.existsSync(path.join(job.outDir, name))) name = `${base}_${String(++n).padStart(2, '0')}.mp4`
    const out = path.join(job.outDir, name)
    const p = spawn('ffmpeg', buildArgs(job, item, out)); item.proc = p
    let err = ''
    p.stdout.on('data', d => { const m = /out_time_ms=(\d+)/g; let r, last; while ((r = m.exec(d))) last = +r[1]; if (last && dur) item.progress = Math.min(99, Math.round(last / 1e6 / dur * 100)) })
    p.stderr.on('data', d => { err = (err + d).slice(-800) })
    p.on('error', () => { item.status = 'error'; item.error = 'FFmpeg não encontrado'; resolve() })
    p.on('close', code => {
      item.proc = null
      if (item.status === 'canceled') { fs.rmSync(out, { force: true }) }
      else if (code === 0) { item.status = 'done'; item.progress = 100; item.output = name; item.size = fs.statSync(out).size }
      else { item.status = 'error'; item.error = err.split('\n').slice(-3).join(' ') }
      persist(job, item); fs.rmSync(item.path, { force: true }); resolve()
    })
  })
}
async function pump() {
  if (running) return; running = true
  while (queue.length) { const { job, item } = queue.shift(); if (item.status === 'queued') { item.start = Date.now(); await runItem(job, item) } }
  running = false
}

app.post('/api/jobs', upload.fields([{ name: 'template', maxCount: 1 }, { name: 'videos' }]), async (q, s) => {
  if (!checkFfmpeg()) return s.status(400).json({ error: 'FFmpeg não encontrado. Veja o README.' })
  const id = Date.now().toString(36), dir = path.join(settings.outDir, 'job-' + id); fs.mkdirSync(dir, { recursive: true })
  const job = { id, outDir: dir, config: JSON.parse(q.body.config), templatePath: q.files.template[0].path, createdAt: Date.now(),
    items: (q.files.videos || []).map((f, i) => ({ id: i, name: f.originalname, path: f.path, status: 'queued', progress: 0 })) }
  if (db) try {
    const { data: j } = await db.from('jobs').insert({ config: job.config }).select().single(); job.dbId = j.id
    const { data: rows } = await db.from('job_items').insert(job.items.map(i => ({ job_id: j.id, source_name: i.name }))).select()
    rows?.forEach((r, k) => { job.items[k].dbId = r.id })
  } catch (e) { console.error('Supabase:', e.message) }
  jobs.set(id, job); job.items.forEach(item => queue.push({ job, item })); pump(); s.json({ id })
})
const view = j => ({ id: j.id, items: j.items.map(({ proc, path: _p, ...i }) => i) })
app.get('/api/jobs/:id', (q, s) => { const j = jobs.get(q.params.id); j ? s.json(view(j)) : s.sendStatus(404) })
app.post('/api/jobs/:id/cancel', (q, s) => { const j = jobs.get(q.params.id); j?.items.forEach(i => { if (['queued', 'processing'].includes(i.status)) { i.status = 'canceled'; i.proc?.kill('SIGKILL') } }); s.sendStatus(200) })
app.get('/api/jobs/:id/files/:name', (q, s) => { const j = jobs.get(q.params.id); if (!j) return s.sendStatus(404); const f = path.join(j.outDir, path.basename(q.params.name)); q.query.dl ? s.download(f) : s.sendFile(f) })
app.delete('/api/jobs/:id/files/:name', (q, s) => { const j = jobs.get(q.params.id); if (!j) return s.sendStatus(404); fs.rmSync(path.join(j.outDir, path.basename(q.params.name)), { force: true }); j.items.forEach(i => { if (i.output === q.params.name) { i.status = 'deleted'; i.output = null } }); s.sendStatus(200) })
app.get('/api/jobs/:id/zip', (q, s) => {
  const j = jobs.get(q.params.id); if (!j) return s.sendStatus(404)
  s.attachment('VIDEOS_INSTAGRAM.zip'); const z = archiver('zip', { store: true }); z.pipe(s)
  j.items.filter(i => i.output).forEach(i => z.file(path.join(j.outDir, i.output), { name: i.output })); z.finalize()
})
app.post('/api/templates', needDb, upload.single('image'), async (q, s) => {
  const b = q.body, p = Date.now() + path.extname(q.file.originalname)
  const up = await db.storage.from('templates').upload(p, fs.readFileSync(q.file.path), { contentType: q.file.mimetype })
  fs.rmSync(q.file.path, { force: true })
  if (up.error) return s.status(500).json({ error: up.error.message })
  const r = await db.from('templates').insert({ name: b.name, image_path: p, rect: JSON.parse(b.rect), format: b.format, fit: b.fit, layer: b.layer }).select().single()
  r.error ? s.status(500).json({ error: r.error.message }) : s.json(r.data)
})
app.get('/api/templates', needDb, async (q, s) => {
  const { data, error } = await db.from('templates').select('*').order('created_at', { ascending: false })
  if (error) return s.status(500).json({ error: error.message })
  s.json(await Promise.all(data.map(async t => ({ ...t, url: await sign('templates', t.image_path) }))))
})
app.delete('/api/templates/:id', needDb, async (q, s) => {
  const { data } = await db.from('templates').select('image_path').eq('id', q.params.id).single()
  if (data) await db.storage.from('templates').remove([data.image_path])
  await db.from('templates').delete().eq('id', q.params.id); s.sendStatus(200)
})
app.get('/api/history', needDb, async (q, s) => {
  const { data, error } = await db.from('job_items').select('*').eq('status', 'done').not('storage_path', 'is', null).order('created_at', { ascending: false }).limit(60)
  if (error) return s.status(500).json({ error: error.message })
  s.json(await Promise.all(data.map(async i => ({ ...i, url: await sign('videos', i.storage_path), dl: await sign('videos', i.storage_path, { download: i.output_name }) }))))
})
app.delete('/api/history/:id', needDb, async (q, s) => {
  const { data } = await db.from('job_items').select('storage_path').eq('id', q.params.id).single()
  if (data?.storage_path) await db.storage.from('videos').remove([data.storage_path])
  await db.from('job_items').delete().eq('id', q.params.id); s.sendStatus(200)
})
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (fs.existsSync(dist)) app.use(express.static(dist))
app.listen(3001, () => console.log('API/App em http://localhost:3001 (dev: http://localhost:5173)'))
