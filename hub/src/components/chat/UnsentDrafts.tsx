'use client'

export function UnsentDrafts({ drafts, onInsert, disabled = false }: { drafts: string[]; onInsert: (index: number) => void; disabled?: boolean }) {
  if (!drafts.length) return null
  return <details className="ss-unsent-drafts"><summary>Unsent drafts <span>{drafts.length}</span></summary><div>{drafts.map((text, index) => <div key={index}><p>{text}</p><button type="button" disabled={disabled} onClick={() => onInsert(index)}>Insert into composer</button></div>)}</div></details>
}
