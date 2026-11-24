import React, { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  BadgeCheck,
  CheckCircle2,
  Copy,
  Fingerprint,
  IdCard,
  Link2,
  Printer,
  Search,
  ShieldCheck,
} from 'lucide-react'
import {
  api,
  Button,
  date,
  Empty,
  go,
  Notice,
  SectionTitle,
  useWorkspace,
  verificationURL,
  Waiting,
} from './workspace'

function StorageNote() {
  return (
    <p className="storage-note">
      Verification uses this server’s local credential registry. A localhost
      link opens only on this computer. For another device, open the app through
      a reachable network address before copying the link or scanning the QR
      code.
    </p>
  )
}
function Credential({ record, passport = false }) {
  return (
    <article className="credential panel">
      <div className="credential-banner">
        <div className="credential-brand">
          <img src="/mark.svg" alt="" />
          SkillProof <i>X</i>
        </div>
        <span>
          <Fingerprint size={15} /> Demonstration credential
        </span>
      </div>
      <div className="credential-main">
        <div className="credential-intro">
          <div>
            <div className="eyebrow">Digital skill passport</div>
            <h2>{record.worker.name}</h2>
            <p>{record.worker.profession}</p>
          </div>
          <div className="seal">
            <ShieldCheck size={38} />
          </div>
        </div>
        <div className="credential-status">
          <span className="badge green">
            <CheckCircle2 size={14} />
            Valid in this prototype
          </span>
        </div>
        <dl className="facts">
          <div>
            <dt>Credential ID</dt>
            <dd className="mono">{record.id}</dd>
          </div>
          <div>
            <dt>Verification date</dt>
            <dd>{date(record.issued)}</dd>
          </div>
          <div>
            <dt>Assessed by</dt>
            <dd>{record.assessor.name}</dd>
            <small>{record.assessor.role} · Sample profile</small>
          </div>
          <div>
            <dt>Evidence source</dt>
            <dd>
              {record.evidenceMode === 'demo'
                ? 'Demo analysis'
                : 'Frame-based AI analysis'}
            </dd>
          </div>
        </dl>
        <h3>Verified competencies</h3>
        <div className="verified-skills">
          {record.competencies.map((n) => (
            <div key={n}>
              <BadgeCheck size={18} />
              {n}
            </div>
          ))}
        </div>
        {passport && (
          <div className="qr-block">
            <QRCodeSVG
              value={verificationURL(record.id)}
              size={92}
              level="M"
              marginSize={3}
              title="Credential verification QR code"
            />
            <div>
              <strong>Scan to verify</strong>
              <p>Open this passport’s verification record.</p>
            </div>
          </div>
        )}
      </div>
      <div className="credential-foot">
        Issued for demonstration within SkillProof X. This prototype credential
        is not a government-recognized professional certification.
      </div>
    </article>
  )
}
export function Passport({ id }) {
  const { credentials, notify } = useWorkspace()
  const record = id ? credentials.find((c) => c.id === id) : credentials[0]
  const field = useRef(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(verificationURL(record.id))
      notify('Verification link copied')
    } catch {
      field.current.focus()
      field.current.select()
      notify('Link selected. Use your device’s copy command.')
    }
  }
  return (
    <>
      <SectionTitle title="Digital skill passport" kicker="Worker credentials">
        A shareable record of the skills your assessor approved.
      </SectionTitle>
      {!record ? (
        <Empty
          icon={IdCard}
          title={
            id
              ? 'Passport unavailable'
              : 'Your passport starts with verified skills'
          }
          action="Worker dashboard"
          to="worker"
        >
          When your assessor approves a competency and issues your passport, you
          can print it or share it here.
        </Empty>
      ) : (
        <>
          {credentials.length > 1 && (
            <label className="queue panel no-print">
              Issued passports
              <select
                value={record.id}
                onChange={(e) => go('passport/' + e.target.value)}
              >
                {credentials.map((c) => (
                  <option key={c.id}>{c.id}</option>
                ))}
              </select>
            </label>
          )}
          <div className="passport-layout">
            <Credential record={record} passport />
            <aside className="panel padded share-panel no-print">
              <div className="icon-tile blue">
                <Link2 />
              </div>
              <h2>Share your passport</h2>
              <p>
                Let an employer check this credential directly in the registry.
              </p>
              <label className="field-label" htmlFor="share-link">
                Verification link
              </label>
              <input
                ref={field}
                id="share-link"
                value={verificationURL(record.id)}
                readOnly
              />
              <Button icon={Copy} onClick={copy}>
                Copy verification link
              </Button>
              <Button
                variant="secondary"
                icon={Printer}
                onClick={() => window.print()}
              >
                Print or save PDF
              </Button>
              <Button
                variant="plain"
                to={'verify/' + record.id}
                icon={ShieldCheck}
              >
                Open verification
              </Button>
              <StorageNote />
            </aside>
          </div>
        </>
      )}
    </>
  )
}
export function Verify({ id = '' }) {
  const [input, setInput] = useState(id)
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(id))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setInput(id)
    setRecord(null)
    setError('')
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    api('/verify/' + encodeURIComponent(id), { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setRecord(value)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id, attempt])
  function lookup(e) {
    e.preventDefault()
    const value = input.trim().toUpperCase()
    if (value === id) setAttempt((n) => n + 1)
    else go('verify/' + encodeURIComponent(value))
  }
  return (
    <>
      <SectionTitle title="Verify a credential" kicker="Employer workspace">
        Check a SkillProof X passport against the local registry.
      </SectionTitle>
      <section className="panel padded verify-form">
        <div className="heading-icon">
          <div className="icon-tile green">
            <ShieldCheck />
          </div>
          <h2>Credential lookup</h2>
        </div>
        <form onSubmit={lookup}>
          <label className="field-label" htmlFor="cred-id">
            Credential ID
          </label>
          <div className="lookup-row">
            <input
              id="cred-id"
              placeholder="SPX-XXXXXXXXXXXX"
              required
              maxLength={80}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <Button icon={Search} disabled={!input.trim() || loading}>
              Verify credential
            </Button>
          </div>
        </form>
        <StorageNote />
      </section>
      {loading && <Waiting />}
      {error && <Notice tone="red">{error}</Notice>}
      {record && (
        <div className="verify-result">
          <Credential record={record} />
        </div>
      )}
    </>
  )
}
