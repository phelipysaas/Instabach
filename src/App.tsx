import { useEffect, useRef, useState } from 'react'

type Rect = { x: number; y: number; w: number; h: number }
type Item = { id: number; name: string; status: string; progress: number; output?: string; error?: string; size?: number }
const FORMATS: Record<string, [number, number] | null> = { '9:16': [1080, 1920], '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080], original: null }
const card = 'rounded-2xl border border-zinc-800 bg-zinc-900 p-6'
const inp = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm'
const btn = 'rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700'

export default function App() {
  const [page, setPage] = useState('Novo projeto')
  const [tpl, setTpl] = useState<File | null>(null)
  const [tplUrl, setTplUrl] = useState('')
  const [nat, setNat] = useState<[number, number]>([1080, 1920])
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.2, w: 0.8, h: 0.5 })
  const [format, setFormat] = useState('9:16')
  const [fit, setFit] = useState('fill')
  const [audio, setAudio] = useState('keep')
  const [quality, setQuality] = useState('insta')
  const [layer, setLayer] = useState('top')
  const [videos, setVideos] = useState<File[]>([])
  const [jobId, setJobId] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [preview, setPreview] = useState('')
  const [ff, setFf] = useState<{ ok: boolean; version?: string } | null>(null)
  const [cloud, setCloud] = useState<any[]>([])
  const [hist, setHist] = useState<any[]>([])
  const loadCloud = () => fetch('/api/templates').then(r => r.ok ? r.json() : []).then(setCloud).catch(() => {})
  const loadHist = () => fetch('/api/history').then(r => r.ok ? r.json() : []).then(setHist).catch(() => {})
  useEffect(() => { loadCloud() }, [])
  useEffect(() => { if (page === 'Resultados') loadHist() }, [page])
  const box = useRef<HTMLDivElement>(null)

  const checkFf = () => fetch('/api/ffmpeg').then(r => r.json()).then(setFf)
  useEffect(() => { checkFf() }, [])
  useEffect(() => {
    if (!jobId) return
    const t = setInterval(async () => { const j = await (await fetch('/api/jobs/' + jobId)).json(); setItems(j.items) }, 1000)
    return () => clearInterval(t)
  }, [jobId])

  const size = (): [number, number] => FORMATS[format] || nat
  const loadTpl = (f: File) => {
    const url = URL.createObjectURL(f); setTpl(f); setTplUrl(url)
    const im = new Image(); im.onload = () => setNat([im.naturalWidth, im.naturalHeight]); im.src = url
  }
  const drag = (mode: 'move' | 'size') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const b = box.current!.getBoundingClientRect(), s = { x: e.clientX, y: e.clientY, r: rect }
    const mv = (m: PointerEvent) => {
      const dx = (m.clientX - s.x) / b.width, dy = (m.clientY - s.y) / b.height
      setRect(mode === 'move'
        ? { ...s.r, x: Math.min(1 - s.r.w, Math.max(0, s.r.x + dx)), y: Math.min(1 - s.r.h, Math.max(0, s.r.y + dy)) }
        : { ...s.r, w: Math.min(1 - s.r.x, Math.max(0.05, s.r.w + dx)), h: Math.min(1 - s.r.y, Math.max(0.05, s.r.h + dy)) })
    }
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up) }
    addEventListener('pointermove', mv); addEventListener('pointerup', up)
  }
  const num = (k: keyof Rect) => (
    <label key={k} className="text-xs text-zinc-400">{k.toUpperCase()} (%)
      <input type="number" className={inp} value={Math.round(rect[k] * 100)} min={0} max={100}
        onChange={e => setRect({ ...rect, [k]: Math.min(1, Math.max(0, +e.target.value / 100)) })} /></label>)

  const generate = async (only?: File[]) => {
    const list = only || videos
    if (!tpl || !list.length) return alert('Escolha um template e ao menos um vídeo.')
    const [W, H] = size(); const fd = new FormData()
    fd.append('template', tpl); list.forEach(v => fd.append('videos', v))
    fd.append('config', JSON.stringify({ W, H, rect, fit, audio, quality, layer, duration: 'original' }))
    const r = await fetch('/api/jobs', { method: 'POST', body: fd }); const j = await r.json()
    if (!r.ok) return alert(j.error)
    setItems([]); setJobId(j.id); setPage('Processamentos')
  }
  const saveTpl = async () => {
    if (!tpl) return alert('Carregue um template primeiro.')
    const name = prompt('Nome do template:'); if (!name) return
    const fd = new FormData(); fd.append('image', tpl); fd.append('name', name)
    fd.append('rect', JSON.stringify(rect)); fd.append('format', format); fd.append('fit', fit); fd.append('layer', layer)
    const r = await fetch('/api/templates', { method: 'POST', body: fd })
    r.ok ? loadCloud() : alert((await r.json()).error)
  }
  const useTpl = async (t: any) => {
    setRect(t.rect); setFormat(t.format); setFit(t.fit); setLayer(t.layer)
    const blob = await (await fetch(t.url)).blob(); loadTpl(new File([blob], t.name + '.png', { type: blob.type }))
  }
  const done = items.filter(i => i.status === 'done'), fail = items.filter(i => i.status === 'error')
  const overall = items.length ? Math.round(items.reduce((a, i) => a + (i.status === 'done' ? 100 : i.progress), 0) / items.length) : 0
  const [W, H] = size()

  const Editor = (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className={card}>
        <h2 className="mb-4 text-lg font-semibold">1. Escolha seu template</h2>
        <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && loadTpl(e.dataTransfer.files[0]) }}
          className="mb-4 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 p-6 text-sm text-zinc-400 hover:border-violet-500">
          Arraste ou clique (PNG/JPG — prefira PNG com transparência)
          <input hidden type="file" accept="image/png,image/jpeg" onChange={e => e.target.files?.[0] && loadTpl(e.target.files[0])} /></label>
        {tplUrl && <>
          <div ref={box} className="relative mx-auto max-h-[520px] select-none overflow-hidden rounded-lg bg-[repeating-conic-gradient(#222_0%_25%,#333_0%_50%)] bg-[length:16px_16px]"
            style={{ aspectRatio: `${W}/${H}`, maxWidth: `${520 * W / H}px` }}>
            <div onPointerDown={drag('move')} className="absolute z-10 cursor-move border-2 border-violet-400 bg-violet-500/30"
              style={{ left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' }}>
              <span className="absolute left-1 top-1 text-xs">VÍDEO</span>
              <div onPointerDown={drag('size')} className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded bg-violet-400" /></div>
            <img src={tplUrl} className="pointer-events-none absolute inset-0 h-full w-full" style={{ objectFit: 'fill' }} /></div>
          <div className="mt-4 grid grid-cols-4 gap-2">{(['x', 'y', 'w', 'h'] as const).map(num)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={btn} onClick={() => setRect({ ...rect, x: (1 - rect.w) / 2, y: (1 - rect.h) / 2 })}>Centralizar</button>
            <button className={btn} onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}>Preencher</button>
            <button className={btn} onClick={() => setFit('fit')}>Ajustar</button>
            <button className={btn} onClick={saveTpl}>Salvar template</button>
            <button className={btn} disabled={!videos[0]} onClick={() => generate([videos[0]])}>Testar com vídeo</button></div></>}
        {cloud.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">Meus templates:{cloud.map(t =>
          <span key={t.id} className="flex overflow-hidden rounded-lg bg-zinc-800"><button className="px-3 py-2 hover:bg-zinc-700" onClick={() => useTpl(t)}>{t.name}</button>
            <button className="px-2 text-red-400 hover:bg-zinc-700" onClick={async () => { await fetch('/api/templates/' + t.id, { method: 'DELETE' }); loadCloud() }}>✕</button></span>)}</div>}
      </section>
      <div className="space-y-6">
        <section className={card}>
          <h2 className="mb-4 text-lg font-semibold">2. Adicione seus vídeos</h2>
          <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setVideos(v => [...v, ...Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video') || /\.(mkv|avi|mov)$/i.test(f.name))]) }}
            className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 p-6 text-sm text-zinc-400 hover:border-violet-500">
            MP4, MOV, WEBM, AVI, MKV — múltiplos arquivos
            <input hidden multiple type="file" accept="video/*,.mkv,.avi,.mov" onChange={e => setVideos(v => [...v, ...Array.from(e.target.files || [])])} /></label>
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">{videos.map((v, i) =>
            <li key={i} className="flex justify-between rounded bg-zinc-950 px-3 py-2"><span className="truncate">{v.name}</span>
              <span className="text-zinc-500">{(v.size / 1e6).toFixed(1)} MB <button className="ml-2 text-red-400" onClick={() => setVideos(videos.filter((_, j) => j !== i))}>✕</button></span></li>)}</ul>
        </section>
        <section className={card}>
          <h2 className="mb-4 text-lg font-semibold">3. Configurações</h2>
          <div className="grid grid-cols-2 gap-3 text-xs text-zinc-400">
            <label>Formato<select className={inp} value={format} onChange={e => setFormat(e.target.value)}>
              {Object.keys(FORMATS).map(f => <option key={f} value={f}>{f === 'original' ? 'Tamanho do template' : `${f} — ${FORMATS[f]![0]}x${FORMATS[f]![1]}`}</option>)}</select></label>
            <label>Comportamento<select className={inp} value={fit} onChange={e => setFit(e.target.value)}>
              <option value="fill">Preencher (corta sem distorcer)</option><option value="fit">Ajustar (vídeo inteiro)</option></select></label>
            <label>Áudio<select className={inp} value={audio} onChange={e => setAudio(e.target.value)}>
              <option value="keep">Manter</option><option value="remove">Remover</option></select></label>
            <label>Posição do vídeo<select className={inp} value={layer} onChange={e => setLayer(e.target.value)}>
              <option value="top">Acima do template (template sem transparência)</option><option value="behind">Atrás do template (PNG com área transparente)</option></select></label>
            <label>Qualidade<select className={inp} value={quality} onChange={e => setQuality(e.target.value)}>
              <option value="eco">Econômico</option><option value="insta">Instagram</option><option value="high">Alta qualidade</option></select></label></div>
          <button onClick={() => generate()} className="mt-5 w-full rounded-xl bg-violet-600 py-4 font-bold tracking-wide hover:bg-violet-500">GERAR VÍDEOS</button>
        </section>
      </div>
    </div>)

  const Queue = (
    <section className={card}>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Processando vídeos...</h2>
        {jobId && <button className={btn} onClick={() => fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' })}>Cancelar</button>}</div>
      <p className="mb-3 text-sm text-zinc-400">Total {items.length} · Concluídos {done.length} · Erros {fail.length} · Em processamento {items.filter(i => i.status === 'processing').length}</p>
      <div className="mb-6 h-3 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-violet-500 transition-all" style={{ width: overall + '%' }} /></div>
      {items.map(i => <div key={i.id} className="mb-3 text-sm"><div className="flex justify-between"><span>{i.name}</span>
        <span>{i.status === 'done' ? '✓ 100%' : i.status === 'error' ? '❌ erro' : i.status === 'processing' ? i.progress + '%' : i.status === 'queued' ? 'Aguardando...' : i.status}</span></div>
        <div className="mt-1 h-2 rounded bg-zinc-800"><div className={`h-full rounded ${i.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: i.progress + '%' }} /></div>
        {i.error && <p className="mt-1 text-xs text-red-400">{i.error}</p>}</div>)}
      {done.length > 0 && !items.some(i => ['queued', 'processing'].includes(i.status)) && <button className={btn + ' mt-4'} onClick={() => setPage('Resultados')}>Ver resultados →</button>}
    </section>)

  const Results = (
    <section className={card}>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Resultados</h2>
        {done.length > 0 && <a className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold" href={`/api/jobs/${jobId}/zip`}>BAIXAR TODOS (ZIP)</a>}</div>
      {preview && <video key={preview} src={preview} controls autoPlay className="mx-auto mb-6 max-h-[60vh] rounded-xl" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{done.map(i => (
        <div key={i.id} className="rounded-xl border border-zinc-800 p-3 text-sm">
          <video src={`/api/jobs/${jobId}/files/${i.output}#t=0.5`} preload="metadata" className="mb-2 aspect-video w-full rounded bg-black object-contain" />
          <p className="truncate">{i.output}</p><p className="text-xs text-zinc-500">{W}x{H} · {((i.size || 0) / 1e6).toFixed(1)} MB · Concluído</p>
          <div className="mt-2 flex gap-2"><button className={btn} onClick={() => setPreview(`/api/jobs/${jobId}/files/${i.output}`)}>Visualizar</button>
            <a className={btn} href={`/api/jobs/${jobId}/files/${i.output}?dl=1`}>Baixar</a>
            <button className={btn} onClick={async () => { await fetch(`/api/jobs/${jobId}/files/${i.output}`, { method: 'DELETE' }); setItems(items.map(x => x.id === i.id ? { ...x, status: 'deleted', output: undefined } : x)) }}>Excluir</button></div></div>))}</div>
      {!done.length && <p className="text-sm text-zinc-500">Nenhum resultado ainda.</p>}
      <h3 className="mb-3 mt-8 font-semibold">Histórico (nuvem)</h3>
      {!hist.length && <p className="text-sm text-zinc-500">Nada salvo na nuvem ainda.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{hist.map(i => (
        <div key={i.id} className="rounded-xl border border-zinc-800 p-3 text-sm">
          <video src={i.url + '#t=0.5'} preload="metadata" controls className="mb-2 aspect-video w-full rounded bg-black object-contain" />
          <p className="truncate">{i.output_name}</p><p className="text-xs text-zinc-500">{new Date(i.created_at).toLocaleString('pt-BR')} · {((i.size_bytes || 0) / 1e6).toFixed(1)} MB</p>
          <div className="mt-2 flex gap-2"><a className={btn} href={i.dl}>Baixar</a>
            <button className={btn} onClick={async () => { await fetch('/api/history/' + i.id, { method: 'DELETE' }); loadHist() }}>Excluir</button></div></div>))}</div>
    </section>)

  const Settings = (
    <section className={card}><h2 className="mb-4 text-lg font-semibold">Configurações</h2>
      <p className={ff?.ok ? 'text-emerald-400' : 'text-red-400'}>{ff?.ok ? `FFmpeg detectado ✓ (${ff.version})` : 'FFmpeg não encontrado. Instale: winget install Gyan.FFmpeg e reabra o terminal.'}</p>
      <button className={btn + ' mt-3'} onClick={checkFf}>Verificar FFmpeg</button>
      <p className="mt-6 text-xs text-zinc-500">Pasta de saída padrão: ~/InstaBatch-Output (ajustável via POST /api/settings).</p></section>)

  const menu = ['Novo projeto', 'Templates', 'Vídeos', 'Processamentos', 'Resultados', 'Configurações']
  return (
    <div className="flex min-h-screen text-zinc-100">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-6 text-lg font-bold text-violet-400">InstaBatch Studio</div>
        {menu.map(m => <button key={m} onClick={() => setPage(m)} className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm ${page === m ? 'bg-violet-600/20 text-violet-300' : 'text-zinc-400 hover:bg-zinc-800'}`}>{m}</button>)}
      </aside>
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold">Editor de Vídeos em Lote</h1>
        <p className="mb-6 text-zinc-400">Crie vários vídeos usando um único template.</p>
        {['Novo projeto', 'Templates', 'Vídeos'].includes(page) && Editor}
        {page === 'Processamentos' && Queue}
        {page === 'Resultados' && Results}
        {page === 'Configurações' && Settings}
      </main>
    </div>)
}
