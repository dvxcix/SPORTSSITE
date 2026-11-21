"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Info } from "lucide-react";
import { BookLogo, normalizeVendor } from "@/components/BookLogo";
import { cn } from "@/lib/utils";

export type TooltipMetric = {
  label: string;
  value: React.ReactNode;
  tone?: "positive" | "negative" | "neutral";
};

export type TooltipCardData = {
  kind?: "action" | "market" | "player" | "sportsbook" | "stat" | "info";
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  image?: { src: string; alt?: string } | null;
  team?: { logo: string; label: string } | null;
  icon?: React.ReactNode;
  book?: string | null;
  accent?: string;
  metrics?: TooltipMetric[];
  footer?: React.ReactNode;
};

export type TooltipValue = string | React.ReactNode | TooltipCardData;

type TooltipPosition = { left: number; top: number; placement: "top" | "bottom" };

const BOOK_LABELS: Record<string, string> = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  betmgm: "BetMGM",
  caesars: "Caesars",
  betrivers: "BetRivers",
  fanatics: "Fanatics",
  pinnacle: "Pinnacle",
};

const BOOK_ACCENTS: Record<string, string> = {
  fanduel: "var(--book-fanduel)",
  draftkings: "var(--book-draftkings)",
  betmgm: "var(--book-betmgm)",
  caesars: "var(--book-caesars)",
  betrivers: "var(--book-betrivers)",
  fanatics: "var(--book-fanatics)",
};

function isTooltipCardData(value: TooltipValue): value is TooltipCardData {
  return !!value && typeof value === "object" && !React.isValidElement(value) && "title" in value;
}

function TooltipArtwork({ data }: { data: TooltipCardData }) {
  const [imageFailed, setImageFailed] = useState(false);
  const book = data.book ? normalizeVendor(data.book) : null;
  const icon = data.icon ?? (book ? <BookLogo vendor={book} size={20} /> : <Info size={17} />);

  if (data.image?.src && !imageFailed) {
    return (
      <span className="ss-tooltip-art is-image">
        <Image
          src={data.image.src}
          alt={data.image.alt ?? ""}
          width={38}
          height={38}
          sizes="38px"
          unoptimized
          onError={() => setImageFailed(true)}
        />
        {book && <span className="ss-tooltip-book-badge"><BookLogo vendor={book} size={14} /></span>}
      </span>
    );
  }

  return <span className="ss-tooltip-art">{icon}</span>;
}

export function TooltipVisual({ content }: { content: TooltipValue }) {
  if (typeof content === "string") return <span className="ss-tooltip-plain">{content}</span>;
  if (!isTooltipCardData(content)) {
    return <div className="ss-tooltip-custom">{content}</div>;
  }

  const data = content;
  const book = data.book ? normalizeVendor(data.book) : null;
  const accent = data.accent ?? (book ? BOOK_ACCENTS[book] : "var(--accent)");

  return (
    <div className="ss-tooltip-content" style={{ "--tooltip-accent": accent } as React.CSSProperties}>
      <div className="ss-tooltip-main">
        <TooltipArtwork key={data.image?.src ?? book ?? String(data.kind)} data={data} />
        <div className="ss-tooltip-copy">
          {(data.eyebrow || book || data.team) && <span className="ss-tooltip-eyebrow">
            <span>{data.eyebrow ?? (book ? BOOK_LABELS[book] : data.team?.label)}</span>
            {data.team?.logo ? (
              <span className="ss-tooltip-team-mark" aria-label={data.team.label}>
                <Image
                  src={data.team.logo}
                  alt=""
                  width={14}
                  height={14}
                  sizes="14px"
                  unoptimized
                />
              </span>
            ) : null}
          </span>}
          <strong>{data.title}</strong>
          {data.description && <p>{data.description}</p>}
        </div>
      </div>
      {!!data.metrics?.length && (
        <div className="ss-tooltip-metrics">
          {data.metrics.map((metric, index) => (
            <span key={`${metric.label}-${index}`} className={metric.tone ? `is-${metric.tone}` : undefined}>
              <small>{metric.label}</small>
              <b>{metric.value}</b>
            </span>
          ))}
        </div>
      )}
      {data.footer && <div className="ss-tooltip-footer">{data.footer}</div>}
    </div>
  );
}

function getTooltipPosition(trigger: DOMRect, surface: DOMRect): TooltipPosition {
  const gutter = 10;
  const gap = 10;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centered = trigger.left + trigger.width / 2 - surface.width / 2;
  const left = Math.min(Math.max(centered, gutter), Math.max(gutter, viewportWidth - surface.width - gutter));
  const roomAbove = trigger.top - gap;
  const roomBelow = viewportHeight - trigger.bottom - gap;
  const placeAbove = roomAbove >= surface.height || roomAbove >= roomBelow;
  const rawTop = placeAbove ? trigger.top - surface.height - gap : trigger.bottom + gap;
  const top = Math.min(Math.max(rawTop, gutter), Math.max(gutter, viewportHeight - surface.height - gutter));
  return { left, top, placement: placeAbove ? "top" : "bottom" };
}

function TooltipPortal({
  content,
  trigger,
  tooltipId,
  onPointerEnter,
  onPointerLeave,
}: {
  content: TooltipValue;
  trigger: HTMLElement | null;
  tooltipId: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TooltipPosition>({ left: 10, top: 10, placement: "top" });

  const positionSurface = useCallback(() => {
    if (!trigger || !surfaceRef.current) return;
    setPosition(getTooltipPosition(trigger.getBoundingClientRect(), surfaceRef.current.getBoundingClientRect()));
  }, [trigger]);

  useLayoutEffect(() => {
    positionSurface();
  }, [content, positionSurface]);

  useEffect(() => {
    positionSurface();
    window.addEventListener("resize", positionSurface);
    window.addEventListener("scroll", positionSurface, true);
    return () => {
      window.removeEventListener("resize", positionSurface);
      window.removeEventListener("scroll", positionSurface, true);
    };
  }, [positionSurface]);

  return createPortal(
    <div
      ref={surfaceRef}
      id={tooltipId}
      role="tooltip"
      data-placement={position.placement}
      className={`ss-tooltip-portal${typeof content === "string" ? " is-plain" : ""}`}
      style={{ left: position.left, top: position.top }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <TooltipVisual content={content} />
    </div>,
    document.body,
  );
}

export const Tooltip = ({
  content,
  children,
  containerClassName,
  disabled = false,
}: {
  content: TooltipValue;
  children: React.ReactNode;
  containerClassName?: string;
  disabled?: boolean;
}) => {
  const [visible, setVisible] = useState(false);
  const [trigger, setTrigger] = useState<HTMLSpanElement | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const hasContent = !(typeof content === "string" && !content.trim());

  useEffect(() => () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const show = useCallback((immediate = false) => {
    if (disabled || !hasContent) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setVisible(true), immediate ? 0 : 110);
  }, [disabled, hasContent]);

  const hide = useCallback((immediate = false) => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setVisible(false), immediate ? 0 : 70);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); hide(true);
    };
    window.addEventListener("keydown", dismiss, true);
    return () => window.removeEventListener("keydown", dismiss, true);
  }, [hide, visible]);

  return (
    <span
      ref={setTrigger}
      data-ss-tooltip-root="true"
      className={cn("relative inline-block", containerClassName)}
      onMouseEnter={() => show(false)}
      onMouseLeave={() => hide(false)}
      onFocusCapture={() => show(true)}
      onBlurCapture={() => hide(true)}
      onKeyDown={(event) => { if (event.key === "Escape") hide(true); }}
      aria-describedby={visible ? tooltipId : undefined}
    >
      {children}
      <>
        {visible && trigger && <TooltipPortal content={content} trigger={trigger} tooltipId={tooltipId} onPointerEnter={() => show(true)} onPointerLeave={() => hide(false)} />}
      </>
    </span>
  );
};

type NativeActive = { target: HTMLElement; content: string } | null;

/**
 * Converts legacy/native title attributes into the same branded tooltip layer.
 * This lets older and less-frequently visited surfaces inherit the production
 * tooltip treatment without leaving browser-grey title bubbles behind.
 */
export function NativeTooltipProvider() {
  const [active, setActive] = useState<NativeActive>(null);
  const tooltipId = useId();

  useEffect(() => {
    // Streamed React boundaries may hydrate after this provider. Touch only
    // the element the member actually interacts with, and restore it on exit.
    let suppressed: {target:HTMLElement;title:string;hadTitle:boolean;fallbackLabel:boolean}|null=null;
    let current: NativeActive = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let touch = false;
    const cancelClose = () => { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } };
    const restore=()=>{if(suppressed){
      if(suppressed.hadTitle)suppressed.target.setAttribute('title',suppressed.title);
      const ids=(suppressed.target.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==tooltipId);
      if(ids.length)suppressed.target.setAttribute('aria-describedby',ids.join(' '));else suppressed.target.removeAttribute('aria-describedby');
      if(suppressed.fallbackLabel&&suppressed.target.getAttribute('aria-label')===suppressed.title)suppressed.target.removeAttribute('aria-label');
      suppressed=null;
    }};
    const hide = () => {cancelClose();restore();current=null;setActive(null)};
    const findTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null;
      const target = suppressed?.target.contains(eventTarget)?suppressed.target:eventTarget.closest<HTMLElement>("[title],[data-ss-native-tooltip]");
      // A frame's title is its accessible name, not a hover hint.
      return target?.tagName === 'IFRAME' || target?.closest("[data-ss-tooltip-root]") ? null : target;
    };
    const show = (event: Event) => {
      if(touch)return;
      if(event.target instanceof Node&&document.getElementById(tooltipId)?.contains(event.target)){cancelClose();return;}
      const target = findTarget(event.target);
      const content = target===suppressed?.target?suppressed.title:target?.getAttribute('title')?.trim()||target?.dataset.ssNativeTooltip;
      if (target && content) {
        cancelClose();
        if(target!==suppressed?.target){
          restore();
          const fallbackLabel=!target.hasAttribute('aria-label')&&!target.hasAttribute('aria-labelledby')&&!target.textContent?.trim();
          suppressed={target,title:content,hadTitle:target.hasAttribute('title'),fallbackLabel};
          target.removeAttribute('title');
          target.setAttribute('aria-describedby',[target.getAttribute('aria-describedby'),tooltipId].filter(Boolean).join(' '));
          if(fallbackLabel)target.setAttribute('aria-label',content);
        }
        current={ target, content };setActive(current);
      }
    };
    const leave = (event: MouseEvent) => {
      if (!current) return;
      if (event.relatedTarget instanceof Node && (current.target.contains(event.relatedTarget)||document.getElementById(tooltipId)?.contains(event.relatedTarget))) {cancelClose();return;}
      cancelClose();closeTimer=setTimeout(hide,120);
    };
    const pointer = (event: PointerEvent) => {touch=event.pointerType==='touch';if(!(event.target instanceof Node&&document.getElementById(tooltipId)?.contains(event.target)))hide()};
    const mouse = (event: PointerEvent) => {if(event.pointerType==='mouse')touch=false};

    document.addEventListener("mouseover", show, true);
    document.addEventListener("mouseout", leave, true);
    document.addEventListener("focusin", show, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("pointerover", mouse, true);
    const handleKeyDown = (event: KeyboardEvent) => { if(event.key==='Tab')touch=false;if (event.key === "Escape"&&current) {event.preventDefault();event.stopImmediatePropagation();hide();} };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelClose();restore();
      document.removeEventListener("mouseover", show, true);
      document.removeEventListener("mouseout", leave, true);
      document.removeEventListener("focusin", show, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("pointerover", mouse, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [tooltipId]);

  return (
    <>
      {active && <TooltipPortal content={active.content} trigger={active.target} tooltipId={tooltipId} />}
    </>
  );
}
