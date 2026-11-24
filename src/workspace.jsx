import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, X } from 'lucide-react'

export const names = [
  'Tool identification',
  'Wire preparation',
  'Connection procedure',
  'Safety precautions',
  'Final testing',
]
const initial = {
  worker: { name: 'Arjun Kumar', profession: 'Electrician' },
  assessor: { name: 'Meera Shah', role: 'Electrical training assessor' },
  competencies: names,
  assessments: [],
  credentials: [],
  live: null,
}
const Context = createContext(null)
export const useWorkspace = () => useContext(Context)
export const go = (path) => {
  location.hash = '/' + path
}
export const videoURL = (id) => '/api/assessments/' + id + '/video'
export const verificationURL = (id) =>
  location.origin + location.pathname + '#/verify/' + encodeURIComponent(id)
export const date = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
export const time = (seconds) => {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0))
  return (
    Math.floor(whole / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (whole % 60).toString().padStart(2, '0')
  )
}
export const stages = {
  uploaded: 'Video uploaded',
  analysed: 'Analysis ready',
  pending: 'Awaiting review',
  resubmission: 'Resubmission requested',
  replaced: 'Replaced',
  issued: 'Passport issued',
}
export function getLocal(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
export function setLocal(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* The server still retains the assessment. */
  }
}
export async function api(path, options) {
  let response
  try {
    response = await fetch('/api' + path, options)
  } catch {
    throw new Error(
      'The local server is unreachable. Check that the app is running and retry.',
    )
  }
  const body = await response.json().catch(() => null)
  if (!response.ok || !body) {
    const error = new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : 'The local server could not complete this request. Please retry.',
    )
    error.status = response.status
    throw error
  }
  return body
}
export function Provider({ children }) {
  const [state, setState] = useState(initial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const refresh = useCallback(async () => {
    try {
      const current = await api('/workspace')
      setState(current)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refresh])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])
  const notify = useCallback((message) => setToast({ message }), [])
  return (
    <Context.Provider value={{ ...state, error, loading, refresh, notify }}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast.message}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  )
}
export function Button({
  to,
  variant = 'primary',
  icon: Icon,
  children,
  className = '',
  ...props
}) {
  const inner = (
    <>
      {Icon && <Icon size={17} />} {children}
    </>
  )
  const classes = 'btn ' + variant + ' ' + className
  return to !== undefined ? (
    <a className={classes} href={'#/' + to} {...props}>
      {inner}
    </a>
  ) : (
    <button className={classes} {...props}>
      {inner}
    </button>
  )
}
export function SectionTitle({ title, children, kicker }) {
  return (
    <div className="section-title">
      {kicker && <div className="eyebrow">{kicker}</div>}
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  )
}
export function Empty({ icon: Icon = Inbox, title, children, to, action }) {
  return (
    <div className="panel empty">
      <div className="icon-tile blue">
        <Icon />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action && <Button to={to}>{action}</Button>}
    </div>
  )
}
export function Notice({ children, tone = 'blue', icon: Icon = AlertCircle }) {
  return (
    <div className={'notice ' + tone} role={tone === 'red' ? 'alert' : 'note'}>
      <Icon size={19} />
      <div>{children}</div>
    </div>
  )
}
export function Waiting() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={21} /> Loading workspace…
    </div>
  )
}
export function EvidenceMode({ mode }) {
  return (
    <Notice tone={mode === 'demo' ? 'amber' : 'blue'}>
      {mode === 'demo' ? (
        <>
          <strong>Demo analysis.</strong> Findings and timestamps are sample
          data scaled to this clip. They do not describe the uploaded video.
        </>
      ) : (
        <>
          <strong>Frame-based AI analysis.</strong> Findings refer to sampled
          images. A human assessor reviews the complete recording.
        </>
      )}
    </Notice>
  )
}
