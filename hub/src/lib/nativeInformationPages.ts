import 'server-only'
import { Children, isValidElement, type ReactNode } from 'react'
import Link from 'next/link'
import AboutPage from '@/app/about/page'
import FaqPage from '@/app/faq/page'
import PrivacyPage from '@/app/privacy/page'
import ResponsibleGamblingPage from '@/app/responsible-gambling/page'
import SupportPage from '@/app/support/page'
import TermsPage from '@/app/terms/page'
import { InfoCallout, InfoInlineLink, Section } from '@/components/marketing/InfoPageShell'

const pages = new Map([
  ['about', AboutPage], ['faq', FaqPage], ['privacy', PrivacyPage], ['responsible-gambling', ResponsibleGamblingPage],
  ['support', SupportPage], ['terms', TermsPage],
])

type Span = { text: string; bold?: boolean; italic?: boolean; href?: string }
type Block = { style: 'paragraph' | 'bullet' | 'callout'; spans: Span[] }
type DocumentSection = { id: string; title?: string; blocks: Block[] }
type Props = { id?: string; title?: string; subtitle?: string; description?: string; href?: string; children?: ReactNode }

function destination(href?: string) {
  if (!href) return undefined
  try {
    const url = new URL(href, 'https://www.slipsurge.com')
    return ['https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

function inlines(node: ReactNode, style: Omit<Span, 'text'> = {}): Span[] {
  return Children.toArray(node).flatMap(item => {
    if (typeof item === 'string' || typeof item === 'number') return [{ text: String(item), ...style }]
    if (!isValidElement<Props>(item)) return []
    const { type, props } = item
    if (type === 'br') return [{ text: '\n', ...style }]
    if (type === 'strong') return inlines(props.children, { ...style, bold: true })
    if (type === 'em') return inlines(props.children, { ...style, italic: true })
    if (type === 'a' || type === InfoInlineLink || type === Link) return inlines(props.children, { ...style, href: destination(props.href) })
    return inlines(props.children, style)
  })
}

function blocks(node: ReactNode): Block[] {
  const output: Block[] = []
  let paragraph: Span[] = []
  const flush = () => {
    if (paragraph.some(span => span.text.trim())) output.push({ style: 'paragraph', spans: paragraph })
    paragraph = []
  }
  for (const child of Children.toArray(node)) {
    if (isValidElement<Props>(child) && (child.type === 'ul' || child.type === 'ol')) {
      flush()
      for (const item of Children.toArray(child.props.children)) {
        if (isValidElement<Props>(item) && item.type === 'li') output.push({ style: 'bullet', spans: inlines(item.props.children) })
      }
    } else if (isValidElement<Props>(child) && child.type === 'p') {
      flush()
      output.push({ style: 'paragraph', spans: inlines(child.props.children) })
    } else {
      paragraph.push(...inlines(child))
    }
  }
  flush()
  return output
}

export function nativeInformationPage(name: string) {
  const page = pages.get(name)
  if (!page) return null
  const root = page().props as Props
  const sections = Children.toArray(root.children).flatMap<DocumentSection>((item, index) => {
    if (!isValidElement<Props>(item)) return []
    const { type, props } = item
    const id = props.id ?? `section-${index}`
    if (type === Section) return [{ id, title: props.title, blocks: blocks(props.children) }]
    if (type === 'div') return [{ id, title: undefined, blocks: [{ style: 'callout', spans: inlines(props.children) }] }]
    if (type === InfoCallout) return [{ id, title: undefined, blocks: [{ style: 'callout', spans: [
      { text: props.title ?? '', href: destination(props.href), bold: true }, { text: `\n${props.description ?? ''}` },
    ] }] }]
    return []
  })
  return { title: root.title, subtitle: root.subtitle, sections }
}
