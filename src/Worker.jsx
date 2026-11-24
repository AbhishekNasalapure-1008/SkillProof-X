import React, { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileVideo,
  FlaskConical,
  IdCard,
  ListChecks,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
  UploadCloud,
  Video,
  X,
  Zap,
} from 'lucide-react'
import {
  api,
  Button,
  date,
  Empty,
  go,
  names,
  Notice,
  SectionTitle,
  stages,
  time,
  useWorkspace,
  videoURL,
} from './workspace'

export function resumePath(item) {
  if (item.status === 'uploaded') return 'assessment/' + item.id
  if (item.status === 'resubmission') return 'assessment/replace/' + item.id
  if (item.status === 'issued') return 'passport/' + item.credentialId
  return 'analysis/' + item.id
}
export function Worker() {
  const { worker, assessments, credentials } = useWorkspace()
  const approved = [...new Set(credentials.flatMap((c) => c.competencies))]
  return (
    <>
      <SectionTitle title="Worker dashboard" kicker="Worker workspace">
        Manage your assessments, evidence, and verified skills.
      </SectionTitle>
      <section className="profile-panel panel">
        <div className="avatar big">AK</div>
        <div className="grow">
          <div className="muted small">Sample worker profile</div>
          <h2>{worker.name}</h2>
        </div>
        <label className="select-label">
          Profession
          <div className="select-wrap">
            <select aria-label="Profession" defaultValue="Electrician">
              <option>Electrician</option>
              <option disabled>Plumber · coming later</option>
              <option disabled>Mason · coming later</option>
            </select>
            <ChevronDown size={15} />
          </div>
        </label>
      </section>
      <div className="metric-grid">
        {[
          [ClipboardList, 'Assessments', assessments.length, 'blue'],
          [
            Clock3,
            'Awaiting review',
            assessments.filter((a) => a.status === 'pending').length,
            'amber',
          ],
          [BadgeCheck, 'Verified competencies', approved.length, 'green'],
        ].map(([Icon, label, value, color]) => (
          <div className="metric panel" key={label}>
            <div className={'icon-tile ' + color}>
              <Icon size={21} />
            </div>
            <div>
              <b>{value}</b>
              <span>{label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="section-head">
        <h2>Available assessments</h2>
      </div>
      <div className="assessment-offer panel">
        <div className="offer-image">
          <img
            src="/images/electrician-workshop.webp"
            alt="Electrician training workshop"
          />
        </div>
        <div>
          <div className="eyebrow">
            <Zap size={14} /> Electrical trade
          </div>
          <h2>Electrician practical</h2>
          <p>
            Demonstrate five core competencies on a de-energized training board.
          </p>
          <Button to="assessment" icon={ClipboardList}>
            Start assessment
          </Button>
        </div>
      </div>
      <div className="section-head">
        <h2>Assessment progress</h2>
      </div>
      {assessments.length ? (
        <div className="panel row-list">
          {assessments.map((item) => (
            <a key={item.id} href={'#/' + resumePath(item)}>
              <FileVideo />
              <div className="grow">
                <strong>{item.filename}</strong>
                <small>
                  {date(item.created)} · {time(item.duration)}
                </small>
                {item.feedback && (
                  <small>Assessor feedback · {item.feedback}</small>
                )}
              </div>
              <span
                className={
                  'badge ' + (item.status === 'issued' ? 'green' : 'blue')
                }
              >
                {stages[item.status]}
              </span>
              <ChevronRight size={16} />
            </a>
          ))}
        </div>
      ) : (
        <div className="panel inline-empty">
          <FileVideo size={22} />
          <div>
            <strong>No assessments yet</strong>
            <p>
              Your uploaded demonstrations and review status will appear here.
            </p>
          </div>
        </div>
      )}
      <div className="section-head">
        <h2>Verified competencies</h2>
      </div>
      <div className="panel padded">
        {approved.length ? (
          <div className="chips">
            {approved.map((n) => (
              <span className="badge green" key={n}>
                <BadgeCheck size={14} />
                {n}
              </span>
            ))}
          </div>
        ) : (
          <p>
            Your assessor-approved skills will appear after your first passport
            is issued.
          </p>
        )}
        <Button variant="secondary" to="passport" icon={IdCard}>
          Open skill passport
        </Button>
      </div>
    </>
  )
}
function uploadVideo(file, replaces, sample, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const query = new URLSearchParams({ filename: file.name })
    if (sample) query.set('sample', 'true')
    if (replaces) query.set('replaces', replaces)
    xhr.open('POST', '/api/assessments?' + query)
    xhr.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream',
    )
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((100 * e.loaded) / e.total))
    }
    xhr.onerror = () =>
      reject(
        new Error('Upload interrupted. Check your connection and try again.'),
      )
    xhr.onload = () => {
      let result
      try {
        result = JSON.parse(xhr.responseText)
      } catch {
        /* A proxy may return a plain error page. */
      }
      if (xhr.status >= 200 && xhr.status < 300 && result?.id) resolve(result)
      else
        reject(
          new Error(
            typeof result?.detail === 'string'
              ? result.detail
              : 'Video upload failed. Please retry.',
          ),
        )
    }
    xhr.send(file)
  })
}
export function Assessment({ id, replaceId }) {
  const { assessments, live, refresh, notify } = useWorkspace()
  const existing = assessments.find((a) => a.id === id)
  const previous = assessments.find((a) => a.id === replaceId)
  const [saved, setSaved] = useState(existing)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [drag, setDrag] = useState(false)
  const [failedLive, setFailedLive] = useState(false)
  const [sample, setSample] = useState(false)
  const picker = useRef(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!file) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  if ((id && !existing) || (replaceId && !previous))
    return (
      <Empty
        title="Assessment unavailable"
        action="Worker dashboard"
        to="worker"
      >
        Choose an assessment in this workspace.
      </Empty>
    )
  if (existing && existing.status !== 'uploaded')
    return (
      <Empty
        title={stages[existing.status]}
        action="Open assessment"
        to={resumePath(existing)}
      >
        This recording has progressed beyond upload.
      </Empty>
    )
  if (previous && previous.status !== 'resubmission' && !saved)
    return (
      <Empty
        title="Replacement already submitted"
        action="Worker dashboard"
        to="worker"
      >
        Check your current assessment progress.
      </Empty>
    )
  function choose(f, sampleClip = false) {
    if (!f || busy) return
    setError('')
    setReady(false)
    setSaved(null)
    setFailedLive(false)
    setSample(sampleClip)
    if (
      !/\.(mp4|webm|mov)$/i.test(f.name) ||
      !f.size ||
      f.size > 100 * 1024 * 1024
    ) {
      setFile(null)
      setError('Choose a non-empty MP4, WebM or MOV video up to 100 MB.')
      return
    }
    setFile(f)
  }
  async function chooseSample() {
    setBusy('Loading sample clip')
    setError('')
    try {
      const response = await fetch('/media/workshop-sample.webm')
      if (!response.ok)
        throw new Error(
          'Could not load the sample clip. Try again or upload a recording.',
        )
      choose(
        new File([await response.blob()], 'Workshop sample.webm', {
          type: 'video/webm',
        }),
        true,
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }
  const usesLive = live && !sample && !saved?.sampleClip
  async function analyse(forceDemo = false) {
    if (busy || (!saved && !ready)) return
    setError('')
    setFailedLive(false)
    let item = saved
    try {
      if (!item) {
        setBusy('Uploading video')
        setProgress(0)
        item = await uploadVideo(file, replaceId, sample, setProgress)
        setSaved(item)
        await refresh()
      }
      setBusy(
        usesLive && !forceDemo
          ? 'Analysing representative frames'
          : 'Preparing sample evidence map',
      )
      await api(
        '/assessments/' +
          item.id +
          '/analyse' +
          (forceDemo || !usesLive ? '?demo=true' : ''),
        { method: 'POST' },
      )
      await refresh()
      if (mounted.current) {
        notify('Evidence map is ready')
        go('analysis/' + item.id)
      }
    } catch (e) {
      setError(e.message)
      setFailedLive(Boolean(item && usesLive))
    } finally {
      setBusy('')
    }
  }
  const src = saved ? videoURL(saved.id) : preview
  return (
    <>
      <SectionTitle title="Electrician practical" kicker="Practical assessment">
        Record your demonstration and map the evidence to five competencies.
      </SectionTitle>
      {previous?.feedback && (
        <Notice tone="amber">
          <strong>Resubmission requested.</strong> {previous.feedback}
        </Notice>
      )}
      <div className="assessment-columns">
        <section className="panel padded">
          <div className="heading-icon">
            <div className="icon-tile blue">
              <Video />
            </div>
            <h2>Demonstration video</h2>
          </div>
          <p>
            Use a de-energized training board under qualified supervision. Keep
            your tools, hands, and finished work in view.
          </p>
          <input
            type="file"
            ref={picker}
            hidden
            accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
            aria-label="Upload demonstration video"
            onChange={(e) => {
              choose(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {src ? (
            <div className="preview-wrap">
              <video
                controls
                playsInline
                preload="metadata"
                src={src}
                onLoadedMetadata={(e) => {
                  if (
                    Number.isFinite(e.currentTarget.duration) &&
                    e.currentTarget.duration > 600
                  ) {
                    setError('Choose a clip up to 10 minutes long.')
                    setReady(false)
                  } else setReady(true)
                }}
                onError={() => {
                  setReady(false)
                  setError(
                    'This browser cannot play this video. Choose another file or export an H.264 MP4.',
                  )
                }}
              />
              <div className="file-row">
                <FileVideo size={18} />
                <span>{saved?.filename || file?.name}</span>
                {!busy && !saved && (
                  <button
                    className="icon-btn"
                    aria-label="Remove video"
                    onClick={() => {
                      setFile(null)
                      setReady(false)
                      setError('')
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              className={'dropzone ' + (drag ? 'dragging' : '')}
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                choose(e.dataTransfer.files[0])
              }}
              onClick={() => picker.current.click()}
            >
              <div className="upload-icon">
                <UploadCloud size={28} />
              </div>
              <strong>Drop your demonstration here</strong>
              <span>
                or <b>browse files</b>
              </span>
              <small>MP4, WebM or MOV · Up to 100 MB · 10 min max</small>
            </button>
          )}
          {!src && (
            <button
              className="sample-link"
              disabled={Boolean(busy)}
              onClick={chooseSample}
            >
              <FileVideo size={15} />
              Try the illustrated sample clip
            </button>
          )}
          {error && <Notice tone="red">{error}</Notice>}
          {busy && (
            <div className="progress-box" role="status">
              <LoaderCircle className="spin" size={17} />
              {busy}
              {busy.startsWith('Uploading') ? ' · ' + progress + '%' : '…'}
            </div>
          )}
          <Notice
            tone={usesLive ? 'blue' : 'amber'}
            icon={usesLive ? ScanLine : FlaskConical}
          >
            {usesLive
              ? 'Live mode sends up to 12 representative frames to Gemini when you analyse this video.'
              : 'Demo mode uses sample findings. Your video stays on the local server.'}
          </Notice>
          <div className="actions">
            <Button
              icon={ScanLine}
              disabled={Boolean(busy) || (!ready && !saved)}
              onClick={() => analyse()}
            >
              Analyse video
            </Button>
            {failedLive && (
              <Button variant="secondary" onClick={() => analyse(true)}>
                Use sample findings
              </Button>
            )}
          </div>
        </section>
        <aside className="panel padded rubric">
          <div className="heading-icon">
            <ListChecks size={22} />
            <h2>Competency checklist</h2>
          </div>
          <p>Include each skill in your recording.</p>
          {names.map((n, i) => (
            <div className="rubric-row" key={n}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {n}
            </div>
          ))}
          <div className="safety">
            <ShieldCheck size={21} />
            <span>Use a de-energized training setup throughout.</span>
          </div>
        </aside>
      </div>
    </>
  )
}
