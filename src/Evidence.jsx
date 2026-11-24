import React, { useEffect, useRef, useState } from 'react'
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileSearch,
  FileVideo,
  Play,
  ScanLine,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react'
import {
  api,
  Button,
  date,
  Empty,
  EvidenceMode,
  getLocal,
  go,
  Notice,
  SectionTitle,
  setLocal,
  stages,
  time,
  useWorkspace,
  videoURL,
} from './workspace'

const colors = {
  'Evidence Found': 'green',
  'Needs Expert Review': 'amber',
  'Insufficient Evidence': 'red',
  'Not Demonstrated': 'red',
}
const timeLabel = (value) =>
  value == null
    ? 'No timestamp'
    : time(value) + '.' + Math.floor((value % 1) * 10)

function EvidenceBoard({ item, decisions, decide }) {
  const player = useRef(null)
  const pendingSeek = useRef(null)
  const [position, setPosition] = useState(0)
  const [active, setActive] = useState('')
  const [playError, setPlayError] = useState(false)
  function seek(t, competency = '') {
    setActive(competency)
    setPosition(t)
    if (player.current?.readyState > 0) player.current.currentTime = t
    else pendingSeek.current = t
  }
  const gaps = item.findings.filter((f) => f.status !== 'Evidence Found')
  return (
    <>
      <EvidenceMode mode={item.mode} />
      <div className="evidence-grid">
        <div className="evidence-media">
          <section className="panel video-panel">
            <div className="panel-heading">
              <Video size={20} />
              <h2>Video evidence</h2>
            </div>
            <video
              ref={player}
              controls
              playsInline
              preload="metadata"
              src={videoURL(item.id)}
              onError={() => setPlayError(true)}
              onLoadedMetadata={() => {
                if (pendingSeek.current !== null) {
                  player.current.currentTime = pendingSeek.current
                  pendingSeek.current = null
                }
              }}
              onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
            />
            {playError && (
              <Notice tone="red">
                This video could not be played. Check the local media file and
                browser codec support.
              </Notice>
            )}
            <div className="video-info">
              <FileVideo size={17} />
              <strong>{item.filename}</strong>
              <small>{time(item.duration)}</small>
            </div>
            <div className="timeline">
              <div className="small flex items-center justify-between">
                <strong>Evidence timeline</strong>
                <span>{timeLabel(position)}</span>
              </div>
              <div className="track">
                <input
                  aria-label="Seek evidence timeline"
                  type="range"
                  min="0"
                  max={item.duration}
                  step=".01"
                  value={position}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <div className="markers">
                  {item.findings
                    .filter((f) => f.timestamp != null)
                    .map((f) => (
                      <button
                        key={f.competency}
                        className={'marker ' + colors[f.status]}
                        style={{
                          left: (f.timestamp / item.duration) * 100 + '%',
                        }}
                        title={f.competency + ' · ' + timeLabel(f.timestamp)}
                        aria-label={'Seek to ' + f.competency}
                        onClick={() => seek(f.timestamp, f.competency)}
                      />
                    ))}
                </div>
              </div>
              <div className="timeline-ends">
                <span>00:00</span>
                <span>{time(item.duration)}</span>
              </div>
            </div>
          </section>
          <section className="panel padded">
            <div className="heading-icon">
              <FileSearch size={21} />
              <h2>Evidence gaps</h2>
            </div>
            {gaps.length ? (
              <ul className="gap-list">
                {gaps.map((f) => (
                  <li key={f.competency}>
                    <span className={'gap-dot ' + colors[f.status]} />
                    <div>
                      <strong>{f.competency}</strong>
                      <small>{f.status}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                Evidence was found for all five skills. The assessor will
                confirm each finding.
              </p>
            )}
          </section>
        </div>
        <section className="findings">
          <div className="findings-title">
            <h2>Competency findings</h2>
            <span className="count">{item.findings.length}</span>
          </div>
          {item.findings.map((f) => (
            <article
              className={
                'finding panel ' + (active === f.competency ? 'selected' : '')
              }
              key={f.competency}
            >
              <span className={'badge ' + colors[f.status]}>
                {f.status === 'Evidence Found' ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <CircleAlert size={13} />
                )}{' '}
                {f.status}
              </span>
              <h3>{f.competency}</h3>
              <p>{f.description}</p>
              <div className="finding-links">
                {f.timestamp != null ? (
                  <button
                    className="timestamp"
                    aria-label={
                      'Play evidence for ' +
                      f.competency +
                      ' at ' +
                      timeLabel(f.timestamp)
                    }
                    onClick={() => seek(f.timestamp, f.competency)}
                  >
                    <Play size={13} />
                    {timeLabel(f.timestamp)}
                  </button>
                ) : (
                  <span className="missing-time">
                    <Clock3 size={13} />
                    No timestamp
                  </span>
                )}
                <details>
                  <summary>Limitations &amp; improvements</summary>
                  <div>
                    <strong>Limitation</strong>
                    <p>{f.limitations}</p>
                    <strong>Recommended improvement</strong>
                    <p>{f.improvement}</p>
                  </div>
                </details>
              </div>
              {decide && (
                <div
                  className="decision-row"
                  role="group"
                  aria-label={'Decision for ' + f.competency}
                >
                  {['approved', 'rejected'].map((d) => (
                    <button
                      key={d}
                      aria-pressed={decisions[f.competency] === d}
                      onClick={() => decide(f.competency, d)}
                      className={decisions[f.competency] === d ? d : ''}
                    >
                      {d === 'approved' ? <Check size={15} /> : <X size={15} />}{' '}
                      {d === 'approved' ? 'Approve' : 'Reject'}
                    </button>
                  ))}
                </div>
              )}
              {!decide && item.decisions[f.competency] && (
                <div
                  className={'review-result ' + item.decisions[f.competency]}
                >
                  <ShieldCheck size={15} />
                  Assessor decision · {item.decisions[f.competency]}
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </>
  )
}
export function Analysis({ id }) {
  const { assessments, refresh, notify } = useWorkspace()
  const item = id
    ? assessments.find((a) => a.id === id)
    : assessments.find((a) => a.findings.length)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit() {
    setBusy(true)
    setError('')
    try {
      await api('/assessments/' + item.id + '/submit', { method: 'POST' })
      await refresh()
      notify('Submitted for expert review')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <SectionTitle title="SkillTrace AI" kicker="Evidence analysis">
        Explore the video evidence behind each competency.
      </SectionTitle>
      {!item?.findings.length ? (
        <Empty
          icon={ScanLine}
          title="Your evidence map starts with a video"
          action="Open practical assessment"
          to={item ? 'assessment/' + item.id : 'assessment'}
        >
          Upload a practical demonstration to see timestamped findings, evidence
          gaps, and suggested improvements.
        </Empty>
      ) : (
        <>
          <div className="record-head">
            <div>
              <span className="muted small">Electrician practical</span>
              <h2>{item.filename}</h2>
            </div>
            <span className="badge blue">{stages[item.status]}</span>
          </div>
          <EvidenceBoard item={item} />
          {item.feedback && (
            <Notice icon={ClipboardCheck}>
              <strong>Assessor feedback.</strong> {item.feedback}
            </Notice>
          )}
          {error && <Notice tone="red">{error}</Notice>}
          <div className="action-footer">
            <div>
              <ShieldCheck />
              <span>Only the assessor can approve competencies.</span>
            </div>
            {item.status === 'analysed' ? (
              <Button onClick={submit} disabled={busy} icon={ClipboardCheck}>
                {busy ? 'Submitting…' : 'Submit for expert review'}
              </Button>
            ) : item.status === 'pending' ? (
              <Button to={'assessor/' + item.id} icon={ClipboardCheck}>
                Open assessor review
              </Button>
            ) : item.status === 'issued' ? (
              <Button to={'passport/' + item.credentialId} icon={BadgeCheck}>
                View passport
              </Button>
            ) : (
              <Button
                to={
                  item.status === 'resubmission'
                    ? 'assessment/replace/' + item.id
                    : 'worker'
                }
              >
                {item.status === 'resubmission'
                  ? 'Upload replacement'
                  : 'Worker dashboard'}
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}
function ReviewForm({ item }) {
  const { refresh, notify, worker, assessor } = useWorkspace()
  const draftKey = 'skillproof.review.' + item.id
  const [draft, setDraft] = useState(() => {
    try {
      const d = JSON.parse(getLocal(draftKey, '{}'))
      return { decisions: d.decisions || {}, feedback: d.feedback || '' }
    } catch {
      return { decisions: {}, feedback: '' }
    }
  })
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setLocal(draftKey, JSON.stringify(draft))
  }, [draftKey, draft])
  function decide(name, value) {
    setDraft((d) => ({ ...d, decisions: { ...d.decisions, [name]: value } }))
    setConfirmed(false)
  }
  async function finish(action) {
    setBusy(true)
    setError('')
    try {
      const updated = await api('/assessments/' + item.id + '/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, action, confirmed }),
      })
      setLocal(draftKey, '')
      await refresh()
      if (updated.credentialId) {
        notify('Digital skill passport issued')
        go('passport/' + updated.credentialId)
      } else {
        notify('Resubmission requested')
        go('assessor')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const count = Object.keys(draft.decisions).length
  const approved = Object.values(draft.decisions).filter(
    (d) => d === 'approved',
  ).length
  return (
    <>
      <div className="record-head">
        <div>
          <span className="muted small">Worker · {worker.profession}</span>
          <h2>{worker.name}</h2>
        </div>
        <span className="badge amber">Awaiting review</span>
      </div>
      <EvidenceBoard item={item} decisions={draft.decisions} decide={decide} />
      <section className="panel padded">
        <div className="heading-icon">
          <ClipboardCheck size={22} />
          <h2>Assessor decision</h2>
        </div>
        <p>
          {assessor.name} · {assessor.role} · Sample profile
        </p>
        <label className="field-label" htmlFor="feedback">
          Assessor feedback
        </label>
        <textarea
          id="feedback"
          maxLength={2000}
          value={draft.feedback}
          onChange={(e) =>
            setDraft((d) => ({ ...d, feedback: e.target.value }))
          }
          placeholder="Explain your decision or what the worker should record again."
        />
        <div className="review-summary">
          <span>{count} of 5 reviewed</span>
          <span>{approved} approved</span>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I have reviewed the video and confirm these competency decisions as
          the assessor.
        </label>
        {error && <Notice tone="red">{error}</Notice>}
        <div className="actions">
          <Button
            icon={BadgeCheck}
            disabled={busy || !confirmed || count !== 5 || !approved}
            onClick={() => finish('issue')}
          >
            Issue digital skill passport
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !draft.feedback.trim()}
            onClick={() => finish('resubmit')}
          >
            Request resubmission
          </Button>
        </div>
      </section>
    </>
  )
}
export function Assessor({ id }) {
  const { assessments } = useWorkspace()
  const pending = assessments.filter((a) => a.status === 'pending')
  const selected = id ? pending.find((a) => a.id === id) : pending[0]
  return (
    <>
      <SectionTitle title="Assessor dashboard" kicker="Expert review">
        Inspect the original recording and decide each competency individually.
      </SectionTitle>
      {pending.length > 0 && (
        <label className="queue panel">
          <span>
            <ClipboardCheck size={19} />
            Pending assessments <b>{pending.length}</b>
          </span>
          <select
            aria-label="Pending assessment"
            value={selected?.id || ''}
            onChange={(e) => go('assessor/' + e.target.value)}
          >
            {!selected && <option value="">Choose a recording</option>}
            {pending.map((a) => (
              <option value={a.id} key={a.id}>
                {a.filename} · {date(a.created)}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected ? (
        <ReviewForm key={selected.id} item={selected} />
      ) : (
        <Empty
          icon={ClipboardCheck}
          title={
            pending.length
              ? 'Choose a pending assessment'
              : 'Your review queue is clear'
          }
          action="Worker dashboard"
          to="worker"
        >
          Submitted demonstrations appear here when a worker requests expert
          review.
        </Empty>
      )}
    </>
  )
}
