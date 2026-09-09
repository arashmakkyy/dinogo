import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Bell, Camera, Check, CheckCircle2, ChevronDown, CircleDollarSign,
  Copy, Download, Gift, Heart, Home, Image as ImageIcon, Link2, Loader2, MapPin, Minus,
  MoreHorizontal, PalmTree, Plus, ReceiptText, ScanLine, Send, Settings2, Share2, ShieldCheck,
  Sparkles, Store, Trash2, Upload, Users, Utensils, WalletCards, X
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toPng } from 'html-to-image'

const CURRENCIES = {
  IRR: { code: 'IRR', label: 'ریال', symbol: 'ریال', decimals: 0 },
  USD: { code: 'USD', label: 'دلار', symbol: '$', decimals: 2 },
  EUR: { code: 'EUR', label: 'یورو', symbol: '€', decimals: 2 },
}

const AVATARS = ['😎','🧑🏻‍💻','👩🏻‍🎨','🧔🏻','👩🏻','🧑🏻','👨🏻‍🦱','🧕🏻']
const DEFAULT_MEMBERS = [
  { id: 'me', name: 'علی', avatar: '😎' },
  { id: 'sara', name: 'سارا', avatar: '👩🏻‍🎨' },
  { id: 'maryam', name: 'مریم', avatar: '🧕🏻' },
  { id: 'amir', name: 'امیر', avatar: '🧔🏻' },
]
const DEFAULT_ITEMS = [
  { id: 'i1', name: 'چلو کباب مخصوص', qty: 2, price: 450000, ownerId: 'me' },
  { id: 'i2', name: 'سالاد سزار', qty: 1, price: 230000, ownerId: 'sara' },
  { id: 'i3', name: 'نوشیدنی', qty: 5, price: 90000, ownerId: 'maryam' },
  { id: 'i4', name: 'دسر', qty: 2, price: 120000, ownerId: 'amir' },
]

const uid = () => Math.random().toString(36).slice(2, 9)
const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
const safeNumber = (v) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0
const formatMoney = (n, currency = 'IRR') => {
  const c = CURRENCIES[currency]
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: c.decimals }).format(Number(n || 0))
}
const formatDate = () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day:'numeric', month:'long', year:'numeric' }).format(new Date())
const encodeState = (value) => btoa(unescape(encodeURIComponent(JSON.stringify(value))))
const decodeState = (value) => JSON.parse(decodeURIComponent(escape(atob(value))))

function makeInitialGroup() {
  return {
    id: uid(),
    title: 'سفر شمال',
    note: 'یه سفر خوش‌حال و بی‌دردسر با رفقا ✨',
    template: 'travel',
    currency: 'IRR',
    exchangeRate: 950000,
    members: DEFAULT_MEMBERS,
    items: DEFAULT_ITEMS,
    taxPercent: 10,
    tip: 80000,
    serviceFee: 0,
    round: true,
    splitMode: 'item',
    customShares: {},
    payerId: 'me',
    receiptImage: '',
    cover: 'travel',
    reactions: { '❤️': 4, '😂': 1, '😍': 2, '🙌': 0, '🔥': 1 },
    reminders: true,
    paidTransferIds: [],
    createdAt: Date.now(),
  }
}

function calculateGroup(group) {
  const subtotal = group.items.reduce((sum, i) => sum + safeNumber(i.price) * safeNumber(i.qty || 1), 0)
  const tax = subtotal * safeNumber(group.taxPercent) / 100
  const tip = safeNumber(group.tip)
  const serviceFee = safeNumber(group.serviceFee)
  let total = subtotal + tax + tip + serviceFee
  if (group.round && group.currency === 'IRR') total = Math.round(total / 1000) * 1000

  const shares = Object.fromEntries(group.members.map(m => [m.id, 0]))
  if (!group.members.length) return { subtotal, tax, tip, serviceFee, total, shares, transfers: [] }

  if (group.splitMode === 'custom') {
    group.members.forEach(m => { shares[m.id] = safeNumber(group.customShares?.[m.id]) })
  } else if (group.splitMode === 'item') {
    group.items.forEach(i => {
      const owner = group.members.some(m => m.id === i.ownerId) ? i.ownerId : group.members[0].id
      shares[owner] = (shares[owner] || 0) + safeNumber(i.price) * safeNumber(i.qty || 1)
    })
    if (subtotal > 0) {
      group.members.forEach(m => {
        const base = shares[m.id] || 0
        shares[m.id] = base + (base / subtotal) * (tax + tip + serviceFee)
      })
    } else {
      const each = total / group.members.length
      group.members.forEach(m => { shares[m.id] = each })
    }
  } else {
    const each = total / group.members.length
    group.members.forEach(m => { shares[m.id] = each })
  }

  if (group.round && group.currency === 'IRR' && group.splitMode !== 'custom') {
    const ids = group.members.map(m => m.id)
    let assigned = 0
    ids.slice(0, -1).forEach(id => {
      shares[id] = Math.round(shares[id] / 1000) * 1000
      assigned += shares[id]
    })
    shares[ids[ids.length - 1]] = total - assigned
  }

  const paid = Object.fromEntries(group.members.map(m => [m.id, m.id === group.payerId ? total : 0]))
  const balances = group.members.map(m => ({ id: m.id, balance: (paid[m.id] || 0) - (shares[m.id] || 0) }))
  const debtors = balances.filter(x => x.balance < -0.01).map(x => ({...x, amount: -x.balance})).sort((a,b)=>b.amount-a.amount)
  const creditors = balances.filter(x => x.balance > 0.01).map(x => ({...x, amount: x.balance})).sort((a,b)=>b.amount-a.amount)
  const transfers = []
  let di = 0, ci = 0
  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].amount, creditors[ci].amount)
    if (amount > 0.01) transfers.push({ id: `${debtors[di].id}-${creditors[ci].id}`, from: debtors[di].id, to: creditors[ci].id, amount })
    debtors[di].amount -= amount
    creditors[ci].amount -= amount
    if (debtors[di].amount < 0.01) di++
    if (creditors[ci].amount < 0.01) ci++
  }

  return { subtotal, tax, tip, serviceFee, total, shares, transfers }
}

function App() {
  const [screen, setScreen] = useState('create')
  const [group, setGroup] = useState(() => {
    const saved = localStorage.getItem('splito.group')
    return saved ? JSON.parse(saved) : makeInitialGroup()
  })
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('splito.history') || '[]'))
  const [toast, setToast] = useState('')
  const [ocr, setOcr] = useState({ running:false, progress:0 })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sharedView, setSharedView] = useState(false)
  const shareCardRef = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const s = params.get('s')
    if (!s) return
    try {
      const incoming = decodeState(s)
      setGroup(incoming)
      setSharedView(true)
      setScreen('result')
    } catch { /* invalid share payload */ }
  }, [])

  useEffect(() => { localStorage.setItem('splito.group', JSON.stringify(group)) }, [group])
  useEffect(() => { localStorage.setItem('splito.history', JSON.stringify(history)) }, [history])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const calc = useMemo(() => calculateGroup(group), [group])
  const customTotal = group.members.reduce((s,m)=>s+safeNumber(group.customShares?.[m.id]),0)
  const customDifference = calc.total - customTotal

  const patch = (next) => setGroup(g => ({ ...g, ...(typeof next === 'function' ? next(g) : next) }))
  const updateMember = (id, p) => patch(g => ({ members:g.members.map(m=>m.id===id?{...m,...p}:m) }))
  const updateItem = (id, p) => patch(g => ({ items:g.items.map(i=>i.id===id?{...i,...p}:i) }))
  const removeItem = id => patch(g => ({ items:g.items.filter(i=>i.id!==id) }))
  const addItem = () => patch(g => ({ items:[...g.items,{id:uid(),name:'آیتم جدید',qty:1,price:0,ownerId:g.members[0]?.id||''}] }))
  const addMember = () => {
    const id = uid(); const idx = group.members.length
    patch(g=>({members:[...g.members,{id, name:`دوست ${idx+1}`,avatar:AVATARS[idx%AVATARS.length]}]}))
  }
  const removeMember = id => patch(g=>({
    members:g.members.filter(m=>m.id!==id),
    items:g.items.map(i=>i.ownerId===id?{...i,ownerId:g.members.find(m=>m.id!==id)?.id||''}:i),
    payerId:g.payerId===id?(g.members.find(m=>m.id!==id)?.id||''):g.payerId,
  }))

  const createGroup = () => {
    if (!group.title.trim()) return setToast('اسم گروه رو وارد کن')
    if (group.members.length < 2) return setToast('حداقل دو نفر لازمه')
    setScreen('split')
  }

  const finalize = () => {
    if (group.splitMode === 'custom' && Math.abs(customDifference) > (group.currency==='IRR'?999:0.01)) {
      setToast('جمع سهم‌ها باید با مبلغ نهایی برابر باشد')
      return
    }
    const snapshot = {...group, finalizedAt:Date.now()}
    setHistory(h => [snapshot, ...h.filter(x=>x.id!==snapshot.id)].slice(0,20))
    setScreen('result')
  }

  const shareUrl = useMemo(() => {
    try {
      const payload = encodeState({...group, receiptImage:''})
      return `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(payload)}`
    } catch { return window.location.href }
  }, [group])

  const copyLink = async () => {
    await navigator.clipboard?.writeText(shareUrl)
    setToast('لینک کپی شد ✨')
  }
  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({title:`اسپلیتو — ${group.title}`,text:'نتیجه تقسیم هزینه رو ببین 👇',url:shareUrl}) } catch {}
    } else copyLink()
  }
  const downloadCard = async () => {
    if (!shareCardRef.current) return
    const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor:'#f9fbff' })
    const a = document.createElement('a'); a.download=`splito-${group.title}.png`; a.href=dataUrl; a.click()
  }

  const scanReceipt = async (file) => {
    if (!file) return
    patch({ receiptImage: URL.createObjectURL(file) })
    setOcr({running:true,progress:0})
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('fas+eng', 1, {
        logger: m => { if (m.status==='recognizing text') setOcr({running:true, progress: Math.round((m.progress||0)*100)}) }
      })
      const { data:{text} } = await worker.recognize(file)
      await worker.terminate()
      const lines = text.split('\n').map(x=>x.trim()).filter(Boolean)
      const parsed = []
      for (const line of lines) {
        const numbers = line.match(/[0-9۰-۹][0-9۰-۹,.٬]*/g)
        if (!numbers?.length) continue
        const raw = numbers[numbers.length-1]
          .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[,.٬]/g,'')
        const price = Number(raw)
        if (!price || price < 1000) continue
        const name = line.replace(numbers[numbers.length-1], '').replace(/[-:]+$/,'').trim() || 'آیتم رسید'
        parsed.push({id:uid(), name:name.slice(0,36), qty:1, price, ownerId:group.members[0]?.id||''})
      }
      if (parsed.length) {
        patch(g=>({items:parsed.slice(0,12)}))
        setToast(`${Math.min(parsed.length,12)} آیتم از رسید پیدا شد`)
      } else setToast('متن رسید خوانده شد؛ آیتم قابل اتکا پیدا نشد')
    } catch (e) {
      console.error(e)
      setToast('OCR در این مرورگر اجرا نشد؛ عکس رسید ذخیره شد')
    } finally { setOcr({running:false,progress:0}) }
  }

  const memberById = id => group.members.find(m=>m.id===id) || {name:'—',avatar:'🙂'}

  return (
    <div className="app-shell">
      <div className="ambient ambient-a"/><div className="ambient ambient-b"/>
      <header className="desktop-brand">
        <div className="logo-mark"><span/><span/></div>
        <div><strong>اسپلیتو</strong><small>هزینه‌ها با هم، لحظه‌ها قشنگ‌تر</small></div>
      </header>

      <main className="phone-shell" aria-live="polite">
        {screen === 'create' && <CreateScreen group={group} patch={patch} addMember={addMember} removeMember={removeMember} updateMember={updateMember} onContinue={createGroup} scanReceipt={scanReceipt} ocr={ocr} setToast={setToast} />}
        {screen === 'split' && <SplitScreen group={group} patch={patch} calc={calc} updateItem={updateItem} removeItem={removeItem} addItem={addItem} addMember={addMember} removeMember={removeMember} updateMember={updateMember} onBack={()=>setScreen('create')} onFinalize={finalize} customDifference={customDifference} scanReceipt={scanReceipt} ocr={ocr} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} />}
        {screen === 'result' && <ResultScreen group={group} patch={patch} calc={calc} memberById={memberById} shareUrl={shareUrl} copyLink={copyLink} nativeShare={nativeShare} downloadCard={downloadCard} shareCardRef={shareCardRef} onBack={()=>setScreen('split')} sharedView={sharedView} setToast={setToast} />}
        {screen === 'history' && <HistoryScreen history={history} onOpen={g=>{setGroup(g);setScreen('result')}} onBack={()=>setScreen('create')} />}
      </main>

      {!sharedView && <nav className="bottom-nav">
        <button className={screen==='create'?'active':''} onClick={()=>setScreen('create')}><Home size={20}/><span>خانه</span></button>
        <button className={screen==='split'?'active':''} onClick={()=>setScreen('split')}><Users size={20}/><span>تقسیم</span></button>
        <label className="scan-main"><ScanLine size={22}/><input type="file" accept="image/*" capture="environment" onChange={e=>scanReceipt(e.target.files?.[0])}/></label>
        <button className={screen==='result'?'active':''} onClick={()=>setScreen('result')}><Share2 size={20}/><span>نتیجه</span></button>
        <button className={screen==='history'?'active':''} onClick={()=>setScreen('history')}><ReceiptText size={20}/><span>تاریخچه</span></button>
      </nav>}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function TopBar({title,onBack,action}) {
  return <div className="topbar">
    <button className="icon-btn" onClick={onBack} aria-label="بازگشت"><ArrowRight size={20}/></button>
    <strong>{title}</strong>
    {action || <div style={{width:40}}/>}
  </div>
}

function CreateScreen({group,patch,addMember,removeMember,updateMember,onContinue,scanReceipt,ocr,setToast}) {
  const templates = [
    {id:'cafe', label:'کافه', icon:'☕'}, {id:'travel',label:'سفر',icon:'🌴'}, {id:'home',label:'خانه',icon:'🏡'}, {id:'gift',label:'هدیه',icon:'🎁'}
  ]
  return <section className="screen create-screen">
    <TopBar title="گروه جدید" onBack={()=>setToast('همین‌جا می‌تونی گروه جدیدت رو بسازی')} action={<button className="icon-btn"><MoreHorizontal size={20}/></button>} />
    <div className="cover-card">
      {group.receiptImage ? <img src={group.receiptImage} alt="رسید"/> : <div className="cover-illustration">🚐<span>🌊</span><b>☀️</b></div>}
      <label className="cover-edit"><Camera size={15}/> افزودن عکس<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) patch({receiptImage:URL.createObjectURL(f)})}} /></label>
    </div>
    <input className="title-input" value={group.title} onChange={e=>patch({title:e.target.value})} aria-label="نام گروه"/>
    <input className="note-input" value={group.note} onChange={e=>patch({note:e.target.value})} placeholder="یه توضیح کوتاه درباره این گروه..." />

    <SectionTitle>انتخاب قالب گروه</SectionTitle>
    <div className="template-grid">{templates.map(t=><button key={t.id} onClick={()=>patch({template:t.id})} className={group.template===t.id?'selected':''}><span>{t.icon}</span>{t.label}</button>)}</div>

    <SectionTitle>افزودن اعضا</SectionTitle>
    <div className="members-row">
      <button className="avatar-add" onClick={addMember}><Plus size={20}/><small>افزودن</small></button>
      {group.members.map((m,idx)=><div className="member-mini" key={m.id}>
        <button className="avatar-circle" onClick={()=>updateMember(m.id,{avatar:AVATARS[(AVATARS.indexOf(m.avatar)+1)%AVATARS.length]})}>{m.avatar}</button>
        <input value={m.name} onChange={e=>updateMember(m.id,{name:e.target.value})}/>
        {idx>0 && <button className="tiny-remove" onClick={()=>removeMember(m.id)}><X size={11}/></button>}
      </div>)}
    </div>

    <SectionTitle>واحد پول</SectionTitle>
    <div className="currency-row">{Object.values(CURRENCIES).map(c=><button key={c.code} className={group.currency===c.code?'selected':''} onClick={()=>patch({currency:c.code})}><b>{c.code}</b><span>{c.label}</span></button>)}</div>

    <div className="feature-card">
      <div className="feature-icon">🌴</div><div><strong>حالت سفر</strong><small>برای گروه‌های چندروزه و چندارزی</small></div>
      <label className="switch"><input type="checkbox" defaultChecked/><span/></label>
    </div>

    <label className="ocr-card">
      <span className="ocr-icon">{ocr.running?<Loader2 className="spin" size={22}/>:<ScanLine size={22}/>}</span>
      <div><strong>اسکن هوشمند رسید (OCR)</strong><small>{ocr.running?`در حال خواندن… ${ocr.progress}%`:'عکس بگیر؛ آیتم‌ها خودکار اضافه می‌شن'}</small></div>
      <Upload size={18}/><input type="file" accept="image/*" capture="environment" onChange={e=>scanReceipt(e.target.files?.[0])}/>
    </label>

    <button className="primary-btn" onClick={onContinue}><span>ایجاد گروه</span><ArrowLeft size={20}/></button>
  </section>
}

function SectionTitle({children,action}) { return <div className="section-title"><strong>{children}</strong>{action}</div> }

function SplitScreen({group,patch,calc,updateItem,removeItem,addItem,addMember,removeMember,updateMember,onBack,onFinalize,customDifference,scanReceipt,ocr,showAdvanced,setShowAdvanced}) {
  return <section className="screen split-screen">
    <TopBar title="جزئیات صورت‌حساب" onBack={onBack} action={<button className="icon-btn" onClick={()=>setShowAdvanced(v=>!v)}><Settings2 size={20}/></button>} />
    <div className="merchant-card">
      <div className="merchant-icon"><Utensils size={20}/></div>
      <div><strong>{group.title || 'صورتحساب جدید'}</strong><small><MapPin size={12}/> {formatDate()} · تهران</small></div>
      <label className="receipt-thumb">{group.receiptImage?<img src={group.receiptImage}/>:<ReceiptText/>}<input type="file" accept="image/*" capture="environment" onChange={e=>scanReceipt(e.target.files?.[0])}/></label>
    </div>
    <button className="scan-inline" disabled={ocr.running}><Camera size={17}/>{ocr.running?`در حال OCR… ${ocr.progress}%`:'اسکن قبض (OCR)'}</button>

    <div className="total-card"><small>مجموع مبلغ</small><div><strong>{formatMoney(calc.total,group.currency)}</strong><span>{CURRENCIES[group.currency].symbol}</span></div></div>
    <div className="fee-grid">
      <label><span>مالیات %</span><input type="number" value={group.taxPercent} onChange={e=>patch({taxPercent:clamp(safeNumber(e.target.value),0,100)})}/><small>{formatMoney(calc.tax,group.currency)}</small></label>
      <label><span>انعام</span><input type="number" value={group.tip} onChange={e=>patch({tip:safeNumber(e.target.value)})}/><small>{CURRENCIES[group.currency].symbol}</small></label>
    </div>
    {showAdvanced && <div className="advanced-card">
      <label>هزینه سرویس <input type="number" value={group.serviceFee} onChange={e=>patch({serviceFee:safeNumber(e.target.value)})}/></label>
      <label>نرخ تبدیل دستی به ریال <input type="number" value={group.exchangeRate} onChange={e=>patch({exchangeRate:safeNumber(e.target.value)})}/></label>
      <label className="toggle-line">گرد کردن مبالغ <input type="checkbox" checked={group.round} onChange={e=>patch({round:e.target.checked})}/></label>
      <label>پرداخت‌کننده اصلی <select value={group.payerId} onChange={e=>patch({payerId:e.target.value})}>{group.members.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
    </div>}

    <div className="tabs"><button className="active">آیتم‌ها ({group.items.length})</button><button>اعضا ({group.members.length})</button></div>
    <div className="items-list">
      {group.items.map(i=><div className="item-row" key={i.id}>
        <button className="trash" onClick={()=>removeItem(i.id)}><Trash2 size={14}/></button>
        <div className="item-main"><input value={i.name} onChange={e=>updateItem(i.id,{name:e.target.value})}/><div className="item-sub"><label>تعداد<input type="number" min="1" value={i.qty} onChange={e=>updateItem(i.id,{qty:Math.max(1,safeNumber(e.target.value))})}/></label><label>قیمت<input type="number" value={i.price} onChange={e=>updateItem(i.id,{price:safeNumber(e.target.value)})}/></label></div></div>
        <select className="owner-select" value={i.ownerId} onChange={e=>updateItem(i.id,{ownerId:e.target.value})}>{group.members.map(m=><option value={m.id} key={m.id}>{m.avatar} {m.name}</option>)}</select>
      </div>)}
      <button className="ghost-btn" onClick={addItem}><Plus size={17}/> افزودن آیتم</button>
    </div>

    <SectionTitle action={<button className="text-btn" onClick={addMember}>+ نفر</button>}>تقسیم هزینه</SectionTitle>
    <div className="split-tabs">
      <button className={group.splitMode==='equal'?'selected':''} onClick={()=>patch({splitMode:'equal'})}>مساوی</button>
      <button className={group.splitMode==='item'?'selected':''} onClick={()=>patch({splitMode:'item'})}>بر اساس آیتم</button>
      <button className={group.splitMode==='custom'?'selected':''} onClick={()=>patch({splitMode:'custom'})}>سفارشی</button>
    </div>
    <div className="share-list">
      {group.members.map((m,idx)=><div className="share-person" key={m.id}>
        <button className="person-avatar" onClick={()=>updateMember(m.id,{avatar:AVATARS[(AVATARS.indexOf(m.avatar)+1)%AVATARS.length]})}>{m.avatar}</button>
        <input className="person-name" value={m.name} onChange={e=>updateMember(m.id,{name:e.target.value})}/>
        <div className="share-amount">
          {group.splitMode==='custom'?<input type="number" value={group.customShares?.[m.id]||''} placeholder="0" onChange={e=>patch(g=>({customShares:{...g.customShares,[m.id]:safeNumber(e.target.value)}}))}/>:<strong>{formatMoney(calc.shares[m.id],group.currency)}</strong>}
          <small>{CURRENCIES[group.currency].symbol}</small>
        </div>
        {idx>0 && <button className="trash" onClick={()=>removeMember(m.id)}><X size={14}/></button>}
      </div>)}
    </div>
    {group.splitMode==='custom' && <div className={`difference ${Math.abs(customDifference) < (group.currency==='IRR'?999:0.01)?'ok':'warn'}`}>{Math.abs(customDifference)<(group.currency==='IRR'?999:0.01)?'✓ جمع سهم‌ها درست است':`${customDifference>0?'باقی‌مانده':'اضافه'}: ${formatMoney(Math.abs(customDifference),group.currency)} ${CURRENCIES[group.currency].symbol}`}</div>}

    <button className="primary-btn sticky-cta" onClick={onFinalize}><Sparkles size={19}/><span>پیشنهاد تسویه آسان</span><ArrowLeft size={20}/></button>
  </section>
}

function ResultScreen({group,patch,calc,memberById,shareUrl,copyLink,nativeShare,downloadCard,shareCardRef,onBack,sharedView,setToast}) {
  const paidCount = calc.transfers.filter(t=>group.paidTransferIds?.includes(t.id)).length
  const progress = calc.transfers.length ? Math.round((paidCount/calc.transfers.length)*100) : 100
  const togglePaid = id => patch(g=>({paidTransferIds:g.paidTransferIds?.includes(id)?g.paidTransferIds.filter(x=>x!==id):[...(g.paidTransferIds||[]),id]}))
  const react = emoji => { patch(g=>({reactions:{...g.reactions,[emoji]:(g.reactions?.[emoji]||0)+1}})); setToast('واکنشت ثبت شد 😄') }
  return <section className="screen result-screen">
    <TopBar title="اشتراک‌گذاری" onBack={sharedView?()=>window.history.back():onBack} action={<button className="icon-btn" onClick={nativeShare}><Share2 size={19}/></button>} />
    <div className="share-card" ref={shareCardRef}>
      <div className="share-cover"><div className="brand-mini"><div className="logo-mark tiny"><span/><span/></div><strong>اسپلیتو</strong></div><div className="trip-art">🌴 <span>🚐</span> 🌊</div><em>سفر همیشه بهتره ♡</em></div>
      <div className="share-content">
        <h1>🌲 {group.title}</h1><small>{group.members.length} دوست · {group.items.length} آیتم · {formatDate()}</small>
        <div className="share-total"><strong>{formatMoney(calc.total,group.currency)}</strong><span>{CURRENCIES[group.currency].symbol}</span></div>
        <p>با هم خرج کردیم، با اسپلیتو حساب کردیم!</p>
        <div className="avatar-stack">{group.members.slice(0,5).map(m=><span key={m.id}>{m.avatar}</span>)}</div>
        <div className="status-row"><span className="paid"><CheckCircle2 size={15}/>{paidCount} تسویه شد</span><span className="waiting"><Bell size={15}/>{Math.max(0,calc.transfers.length-paidCount)} در انتظار</span></div>
      </div>
    </div>

    <div className="settle-card">
      <div className="settle-head"><div><strong>تسویه هوشمند</strong><small>کمترین تعداد تراکنش ممکن</small></div><div className="progress-ring" style={{'--progress':`${progress*3.6}deg`}}><span>{progress}%</span></div></div>
      {calc.transfers.length===0?<div className="all-good"><Check size={18}/> همه حساب‌ها صافه!</div>:calc.transfers.map(t=>{
        const from=memberById(t.from), to=memberById(t.to), paid=group.paidTransferIds?.includes(t.id)
        return <button key={t.id} className={`transfer ${paid?'done':''}`} onClick={()=>togglePaid(t.id)}>
          <span className="transfer-people"><i>{from.avatar}</i><b>{from.name}</b><ArrowLeft size={15}/><i>{to.avatar}</i><b>{to.name}</b></span>
          <span><strong>{formatMoney(t.amount,group.currency)}</strong><small>{CURRENCIES[group.currency].symbol}</small>{paid?<CheckCircle2 size={17}/>:<Bell size={17}/>}</span>
        </button>
      })}
    </div>

    <div className="qr-card"><div className="qr-wrap"><QRCodeSVG value={shareUrl} size={92} level="M" includeMargin={false}/></div><div><strong>به جمعمون بپیوند!</strong><small>QR رو اسکن کن یا لینک رو کپی کن</small><button onClick={copyLink}><span>{shareUrl.replace(/^https?:\/\//,'').slice(0,30)}…</span><Copy size={15}/></button></div></div>

    <div className="share-actions">
      <button onClick={downloadCard}><span className="action-icon insta"><Download size={19}/></span><small>تصویر</small></button>
      <button onClick={nativeShare}><span className="action-icon whatsapp"><Send size={19}/></span><small>اشتراک</small></button>
      <button onClick={copyLink}><span className="action-icon telegram"><Link2 size={19}/></span><small>کپی لینک</small></button>
      <button onClick={()=>window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('نتیجه تقسیم هزینه در اسپلیتو')}`,'_blank')}><span className="action-icon more"><Share2 size={19}/></span><small>تلگرام</small></button>
    </div>

    <SectionTitle>یک واکنش بذار ❤️</SectionTitle>
    <div className="reactions">{['❤️','😂','😍','🙌','🔥'].map(e=><button key={e} onClick={()=>react(e)}>{e}<small>{group.reactions?.[e]||0}</small></button>)}</div>

    <div className="reminder-card"><div className="feature-icon"><Bell size={20}/></div><div><strong>یادآور پرداخت</strong><small>برای افراد در انتظار، یادآوری کن</small></div><label className="switch"><input type="checkbox" checked={group.reminders} onChange={e=>patch({reminders:e.target.checked})}/><span/></label></div>
  </section>
}

function HistoryScreen({history,onOpen,onBack}) {
  return <section className="screen history-screen"><TopBar title="تاریخچه" onBack={onBack}/><div className="history-hero"><ReceiptText size={28}/><div><strong>تقسیم‌های قبلی</strong><small>همه روی همین دستگاه ذخیره می‌شن</small></div></div>{history.length===0?<div className="empty"><Sparkles/><strong>هنوز چیزی اینجا نیست</strong><p>اولین تقسیم رو بساز و نتیجه رو ذخیره کن.</p></div>:<div className="history-list">{history.map(g=>{const c=calculateGroup(g);return <button key={`${g.id}-${g.finalizedAt}`} onClick={()=>onOpen(g)}><span className="history-emoji">{g.template==='travel'?'🌴':'🧾'}</span><div><strong>{g.title}</strong><small>{g.members.length} نفر · {g.items.length} آیتم</small></div><div><strong>{formatMoney(c.total,g.currency)}</strong><small>{CURRENCIES[g.currency]?.symbol}</small></div></button>})}</div>}</section>
}

export default App
