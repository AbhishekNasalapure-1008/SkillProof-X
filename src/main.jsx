import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BadgeCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  HardHat,
  IdCard,
  LayoutDashboard,
  PanelLeft,
  ScanLine,
  ShieldCheck,
  X,
} from 'lucide-react'
import '@fontsource-variable/inter'
import './style.css'
import Overview from './Overview'
import { Assessment, Worker } from './Worker'
import { Analysis, Assessor } from './Evidence'
import { Passport, Verify } from './Passport'
import {
  Empty,
  getLocal,
  Notice,
  Provider,
  setLocal,
  useWorkspace,
  Waiting,
} from './workspace'

const groups = [
  [
    'Workspace',
    [
      ['', 'Overview', LayoutDashboard],
      ['worker', 'Worker dashboard', HardHat],
      ['assessment', 'Practical assessment', ClipboardList],
      ['analysis', 'SkillTrace AI', ScanLine],
    ],
  ],
  [
    'Verification',
    [
      ['assessor', 'Assessor dashboard', ClipboardCheck],
      ['passport', 'Skill passport', IdCard],
      ['verify', 'Verify credential', BadgeCheck],
    ],
  ],
]
function getRoute() {
  return location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
}
function Shell() {
  const [route, setRoute] = useState(getRoute)
  const [mobile, setMobile] = useState(false)
  const [narrow, setNarrow] = useState(
    () => matchMedia('(max-width: 800px)').matches,
  )
  const [collapsed, setCollapsed] = useState(
    () => getLocal('skillproof.sidebar') === 'compact',
  )
  const { live, loading, error, refresh } = useWorkspace()
  const key = route[0] || ''
  const title =
    groups.flatMap((g) => g[1]).find(([path]) => path === key)?.[1] ||
    'Page unavailable'
  const navToggle = useRef(null)
  const closeMenu = useRef(null)
  useEffect(() => {
    const query = matchMedia('(max-width: 800px)')
    const sync = () => {
      setNarrow(query.matches)
      if (!query.matches) setMobile(false)
    }
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  useEffect(() => {
    const change = () => {
      setRoute(getRoute())
      setMobile(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => {
    document.title = title + ' · SkillProof X'
  }, [title])
  useEffect(() => {
    if (!mobile) return
    closeMenu.current?.focus()
    function close(e) {
      if (e.key === 'Escape') {
        setMobile(false)
        requestAnimationFrame(() => navToggle.current?.focus())
      }
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [mobile])
  function toggle() {
    if (matchMedia('(max-width: 800px)').matches) setMobile((v) => !v)
    else {
      setCollapsed(!collapsed)
      setLocal('skillproof.sidebar', collapsed ? 'full' : 'compact')
    }
  }
  let screen
  if (key === '') screen = <Overview />
  else if (key === 'verify') screen = <Verify id={route[1]} />
  else if (loading) screen = <Waiting />
  else if (error) screen = null
  else if (key === 'worker') screen = <Worker />
  else if (key === 'assessment')
    screen = (
      <Assessment
        key={route.join('/')}
        id={route[1] === 'replace' ? undefined : route[1]}
        replaceId={route[1] === 'replace' ? route[2] : undefined}
      />
    )
  else if (key === 'analysis')
    screen = <Analysis key={route[1]} id={route[1]} />
  else if (key === 'assessor') screen = <Assessor id={route[1]} />
  else if (key === 'passport') screen = <Passport id={route[1]} />
  else
    screen = (
      <Empty title="Page unavailable" action="Platform overview" to="">
        Choose a workspace to continue.
      </Empty>
    )
  return (
    <div
      className={
        'shell ' + (collapsed ? 'compact ' : '') + (mobile ? 'mobile-open' : '')
      }
    >
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main-content').focus()
        }}
      >
        Skip to content
      </a>
      {mobile && (
        <button
          className="backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className="sidebar" id="navigation" inert={narrow && !mobile}>
        <a
          href="#/"
          className="brand"
          aria-label="SkillProof X overview"
          onClick={() => setMobile(false)}
        >
          <img src="/mark.svg" alt="" />
          <strong>
            SkillProof <i>X</i>
          </strong>
        </a>
        <button
          ref={closeMenu}
          className="mobile-close icon-btn"
          onClick={() => setMobile(false)}
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        <nav aria-label="Workspace navigation" onClick={() => setMobile(false)}>
          {groups.map(([label, items]) => (
            <div className="nav-group" key={label}>
              <div className="nav-label">{label}</div>
              {items.map(([path, name, Icon]) => (
                <a
                  key={name}
                  href={'#/' + path}
                  title={name}
                  aria-current={key === path ? 'page' : undefined}
                  className={key === path ? 'active' : ''}
                >
                  <Icon size={19} />
                  <span>{name}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-footer">
          <div className="footer-icon">
            <ShieldCheck size={19} />
          </div>
          <div>
            <strong>Prototype workspace</strong>
            <small>UnlockED · Track 4</small>
          </div>
        </div>
      </aside>
      <div className="main-col" inert={narrow && mobile}>
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              ref={navToggle}
              onClick={toggle}
              className="icon-btn"
              aria-label="Toggle navigation"
              aria-expanded={narrow ? mobile : !collapsed}
              aria-controls="navigation"
            >
              <PanelLeft size={18} />
            </button>
            <span className="crumb-line" />
            <a href="#/">Workspace</a>
            <ChevronRight size={14} />
            <b>{title}</b>
          </div>
          <div className="top-right">
            {live !== null && (
              <span className={'mode-pill ' + (live ? 'live' : '')}>
                <i />
                {live ? 'Live AI' : 'Demo mode'}
              </span>
            )}
            <a
              className="avatar"
              aria-label="Open Arjun Kumar’s worker profile"
              title="Arjun Kumar · Worker profile"
              href="#/worker"
            >
              AK
            </a>
          </div>
        </header>
        <main className="main-inner" id="main-content" tabIndex="-1">
          {error && (
            <Notice tone="red">
              {error}{' '}
              <button onClick={refresh} className="text-btn">
                Retry connection
              </button>
            </Notice>
          )}
          {screen}
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(
  <Provider>
    <Shell />
  </Provider>,
)
