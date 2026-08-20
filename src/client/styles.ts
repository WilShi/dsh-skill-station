/**
 * One-time stylesheet injection for the station UI. All colors come from the
 * shell's `--dsw-*` semantic tokens so the panel follows the active theme.
 */

const css = `
.ss_drawer{position:fixed;top:0;bottom:0;left:0;width:440px;max-width:92vw;z-index:9990;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-right:1px solid var(--dsw-alias-border-l2);box-shadow:8px 0 24px rgba(0,0,0,.14)}
.ss_drawerHead{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.ss_title{font-weight:600;font-size:14px;color:var(--dsw-alias-label-primary);flex:1}
.ss_version{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ss_iconBtn{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:4px;display:inline-flex;align-items:center;justify-content:center}
.ss_iconBtn:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}
.ss_tabs{display:flex;gap:2px;padding:8px 10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}
.ss_tab{cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;padding:6px 10px;border-bottom:2px solid transparent}
.ss_tab[data-on="true"]{color:var(--dsw-alias-state-business-primary);border-bottom-color:var(--dsw-alias-state-business-primary);font-weight:600}
.ss_wsBar{display:flex;align-items:center;gap:8px;padding:8px 14px}
.ss_select{flex:1;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 8px}
.ss_body{flex:1;overflow:auto;padding:10px 14px;display:flex;flex-direction:column;gap:10px}
.ss_footBtn{box-sizing:border-box;display:flex;align-items:center;gap:8px;width:calc(100% + 8px);height:34px;margin:4px -4px;padding:6px 2px 6px 10px;cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-label-primary);border-radius:12px;font-family:inherit;font-size:14px;line-height:22px;overflow:hidden}
.ss_footBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ss_footBtnRail{width:36px;height:36px;gap:0;justify-content:center;border-radius:50%;padding:0;margin:4px 0}
.ss_groupTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary);margin-top:6px}
.ss_card{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:10px 12px}
.ss_cardHead{display:flex;align-items:center;gap:8px}
.ss_name{font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ss_desc{font-size:12px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ss_meta{font-size:11px;color:var(--dsw-alias-label-tertiary);word-break:break-all}
.ss_badge{min-height:18px;font-size:11px;line-height:14px;border-radius:5px;padding:1px 7px;display:inline-flex;align-items:center;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.ss_badge.on{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);color:var(--dsw-alias-state-success-primary)}
.ss_badge.off{color:var(--dsw-alias-label-tertiary)}
.ss_badge.warn{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.ss_badge.info{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.ss_actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ss_btn{cursor:pointer;font-size:12px;line-height:18px;padding:3px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
.ss_btn:hover{background:var(--dsw-alias-bg-layer-1)}
.ss_btn.primary{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:#fff}
.ss_btn.danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,transparent)}
.ss_btn:disabled{opacity:.5;cursor:default}
.ss_switch{cursor:pointer;width:30px;height:18px;border-radius:999px;border:none;background:var(--dsw-alias-border-l2);position:relative;flex:none;padding:0}
.ss_switch[data-on="true"]{background:var(--dsw-alias-state-success-primary)}
.ss_switchThumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:999px;background:#fff;transition:transform .15s}
.ss_switch[data-on="true"] .ss_switchThumb{transform:translateX(12px)}
.ss_search{font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;width:100%}
.ss_empty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:16px 4px;text-align:center}
.ss_err{color:var(--dsw-alias-state-error-primary);font-size:12px;word-break:break-all}
.ss_ok{color:var(--dsw-alias-state-success-primary);font-size:12px}
.ss_drop{border:1.5px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:28px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;display:flex;flex-direction:column;gap:8px;align-items:center}
.ss_drop[data-over="true"]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,transparent);color:var(--dsw-alias-state-business-primary)}
.ss_pre{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto}
.ss_detail{display:flex;flex-direction:column;gap:8px}
.ss_row{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ss_conflictRow{display:flex;align-items:center;gap:8px}
.ss_dialog{position:fixed;inset:0;z-index:9995;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.ss_dialogBox{width:420px;max-width:90vw;max-height:80vh;overflow:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px}
.ss_dialogTitle{font-weight:600;font-size:14px;color:var(--dsw-alias-label-primary)}
`

/** Inject the station stylesheet once per page. */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="dsh-skill-station/main"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-skill-station'
  tag.dataset.pluginCss = 'dsh-skill-station/main'
  tag.textContent = css
  document.head.appendChild(tag)
}
