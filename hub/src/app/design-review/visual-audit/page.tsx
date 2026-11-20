import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ReviewChecklist, type ReviewItem } from './ReviewChecklist'

export default async function VisualAuditPage() {
  if (process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1') notFound()
  await connection()
  const items = JSON.parse(await readFile(path.join(process.cwd(),'src/app/design-review/visual-audit/inventory.json'),'utf8')) as ReviewItem[]
  return <ReviewChecklist items={items}/>
}
