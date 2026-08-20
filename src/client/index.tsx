/**
 * dsh-skill-station client entry: registers the sidebar footer button (opens
 * the station drawer) and a settings section (embedded station panel) against
 * the shell slots. Both mount the same StationApp.
 */

import { useState } from 'react'
import { StationApp } from './App.tsx'
import { injectStyles } from './styles.ts'

/** Services this client plugin reads. */
export const inject = ['slots']

/** Minimal client context shape used by the slot registrations. */
interface SlotsContext {
  slots: {
    inject(name: string, factory: () => () => void): void
    register(spec: Record<string, unknown>, component: unknown): () => void
  }
}

/** Drawer icon (a simple grid glyph).
 * @param props - pixel size. */
function StationIcon(props: { size?: number }): JSX.Element {
  const size = props.size ?? 16
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 2.5v11" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 6h4M8 8.5h4M8 11h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Sidebar footer action: toggles the station drawer.
 * @param props - owner share from the sidebar shell. */
function StationFooterButton(props: { wide?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="ss_footBtn" type="button" onClick={() => setOpen(value => !value)} title="技能站">
        <StationIcon />
        {props.wide === false ? null : <span>技能站</span>}
      </button>
      {open ? (
        <div className="ss_drawer" role="dialog" aria-label="技能站">
          <div className="ss_drawerHead">
            <StationIcon size={18} />
            <span className="ss_title">技能站</span>
            <span className="ss_version">dsh-skill-station 0.1.0</span>
            <button className="ss_iconBtn" type="button" onClick={() => setOpen(false)} aria-label="关闭">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <StationApp />
        </div>
      ) : null}
    </>
  )
}

/** Settings section occupant: the embedded station panel. */
function StationSettingsSection(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
      <StationApp embedded />
    </div>
  )
}

/**
 * Register both UI surfaces. `slots.inject` waits for each declaration and
 * removes the contribution when this plugin's fiber disposes.
 * @param ctx - client root context carrying the slots service.
 */
export function apply(ctx: SlotsContext): void {
  injectStyles()
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-skill-station',
    order: 10,
  }, StationFooterButton))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'dsh-skill-station',
    order: 55,
    label: '技能站',
  }, StationSettingsSection))
}
