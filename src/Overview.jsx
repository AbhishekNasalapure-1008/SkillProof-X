import React from 'react'
import {
  BriefcaseBusiness,
  ChevronRight,
  CirclePlay,
  ClipboardCheck,
  Fingerprint,
  HardHat,
  IdCard,
  ScanLine,
  ScanEye,
  Upload,
} from 'lucide-react'
import { Button } from './workspace'

const roles = [
  {
    name: 'Worker',
    icon: HardHat,
    color: 'blue',
    description:
      'Show the skills you learned on the job, even without a formal certificate.',
    action: 'Worker dashboard',
    to: 'worker',
  },
  {
    name: 'Assessor',
    icon: ClipboardCheck,
    color: 'violet',
    description:
      'Review video evidence and decide which competencies to verify.',
    action: 'Assessor dashboard',
    to: 'assessor',
  },
  {
    name: 'Employer',
    icon: BriefcaseBusiness,
    color: 'green',
    description:
      'Check a worker’s credentials and see their verified competencies.',
    action: 'Verify a credential',
    to: 'verify',
  },
]
const steps = [
  [
    Upload,
    'Upload a demonstration',
    'Record practical work on a de-energized training setup.',
  ],
  [
    ScanLine,
    'Map the evidence',
    'SkillTrace links individual competencies to moments in the video.',
  ],
  [
    ClipboardCheck,
    'Get expert review',
    'An assessor checks the footage and approves each skill.',
  ],
  [
    IdCard,
    'Share your passport',
    'Employers can look up approved skills with a link or QR code.',
  ],
]
export default function Overview() {
  return (
    <div className="overview">
      <div className="page-intro">
        <div>
          <div className="eyebrow">
            <span /> Workspace
          </div>
          <h1>Platform overview</h1>
        </div>
      </div>
      <section className="hero">
        <img
          className="hero-photo"
          src="/images/electrician-workshop.webp"
          alt="An electrician working on a training panel in a workshop"
        />
        <div className="hero-shade" />
        <div className="hero-copy">
          <div className="hero-kicker">
            <Fingerprint size={15} /> Skill verification platform
          </div>
          <h2>
            Don’t just claim a skill.
            <br />
            <em>Prove it with evidence.</em>
          </h2>
          <p>
            Turn hands-on work into a shareable skill passport with video
            evidence, AI analysis, and expert review.
          </p>
          <div className="actions">
            <Button to="worker" icon={HardHat}>
              Get started
            </Button>
            <button
              className="btn glass"
              onClick={() =>
                document
                  .getElementById('how-it-works')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <CirclePlay size={17} /> How it works
            </button>
          </div>
        </div>
        <div className="hero-capture" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="hero-caption">
          <ScanLine size={15} /> <span>Sample training frame</span>
        </div>
      </section>
      <section className="landing-section">
        <div className="section-head">
          <div className="eyebrow">
            <span /> Role access
          </div>
          <h2>Choose your workspace</h2>
        </div>
        <div className="role-grid">
          {roles.map(({ name, icon: Icon, color, description, action, to }) => (
            <a className={'role-card ' + color} href={'#/' + to} key={name}>
              <div className="role-top">
                <div className={'icon-tile ' + color}>
                  <Icon size={23} />
                </div>
                <h3>{name}</h3>
              </div>
              <p>{description}</p>
              <div className="role-action">
                {action}
                <ChevronRight size={16} />
              </div>
            </a>
          ))}
        </div>
      </section>
      <section id="how-it-works" className="landing-section">
        <div className="section-head">
          <div className="eyebrow">
            <span /> Verification process
          </div>
          <h2>How it works</h2>
        </div>
        <div className="steps panel">
          {steps.map(([Icon, title, description]) => (
            <div className="step" key={title}>
              <div className="step-icon">
                <Icon size={20} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="innovation">
        <div className="icon-tile blue">
          <ScanEye />
        </div>
        <div>
          <h2>Evidence-to-competency mapping</h2>
          <p>
            Each skill gets its own finding, timestamp, and limitations. The
            assessor can jump to the relevant moment and decide whether the
            demonstration supports that skill.
          </p>
        </div>
      </section>
    </div>
  )
}
