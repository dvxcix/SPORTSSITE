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
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowUpDown,
  Flame,
  Info,
  MousePointerClick,
  TrendingUp,
  Users,
} from "lucide-react";
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

function inferBook(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("fanduel")) return "fanduel";
  if (lower.includes("draftkings")) return "draftkings";
  if (lower.includes("betmgm")) return "betmgm";
  if (lower.includes("caesars") || lower.includes("william hill")) return "caesars";
  if (lower.includes("betrivers")) return "betrivers";
  if (lower.includes("fanatics")) return "fanatics";
  if (lower.includes("pinnacle")) return "pinnacle";
  return null;
}

function inferStringContent(text: string): TooltipCardData {
  const lower = text.toLowerCase();
  const book = inferBook(text);
  const movement = /opened|opening|movement|current|now [+-]?\d/.test(lower);
  const action = /click|tap|open |add |remove|save|return|move |expand|collapse/.test(lower);
  const community = /community|pick count|followers|members/.test(lower);
  const sorting = /sort|rank|order/.test(lower);
  const power = /home run|\bfhr\b|\bhr\b|laser|moonshot|barrel|exit velocity|launch angle/.test(lower);
  const stat = /rate|speed|stat|delta|season|recent|pitch|swing|bases|rbi|hits|runs/.test(lower);

  let kind: TooltipCardData["kind"] = "info";
  let eyebrow = "Guide";
  let icon: React.ReactNode = <Info size={16} />;
  if (book) {
    kind = "sportsbook";
    eyebrow = BOOK_LABELS[book] ?? "Sportsbook";
    icon = <BookLogo vendor={book} size={18} />;
  } else if (movement) {
    kind = "market";
    eyebrow = "Market movement";
    icon = <TrendingUp size={16} />;
  } else if (community) {
    eyebrow = "Community activity";
    icon = <Users size={16} />;
  } else if (sorting) {
    eyebrow = "Table control";
    icon = <ArrowUpDown size={16} />;
  } else if (action) {
    kind = "action";
    eyebrow = "Quick action";
    icon = <MousePointerClick size={16} />;
  } else if (power) {
    kind = "stat";
    eyebrow = "Power market";
    icon = <Flame size={16} />;
  } else if (stat) {
    kind = "stat";
    eyebrow = "Stat guide";
    icon = <Activity size={16} />;
  }

  const parts = text.split(/\s[·•]\s/).filter(Boolean);
  return {
    kind,
    eyebrow,
    title: parts[0] || text,
    description: parts.length > 1 ? parts.slice(1).join(" · ") : undefined,
    book,
    icon,
    accent: book ? BOOK_ACCENTS[book] : undefined,
  };
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
  if (!isTooltipCardData(content) && typeof content !== "string") {
    return <div className="ss-tooltip-custom">{content}</div>;
  }

  const data = typeof content === "string" ? inferStringContent(content) : content;
  const book = data.book ? normalizeVendor(data.book) : null;
  const accent = data.accent ?? (book ? BOOK_ACCENTS[book] : "var(--accent)");

  return (
    <div className="ss-tooltip-content" style={{ "--tooltip-accent": accent } as React.CSSProperties}>
      <div className="ss-tooltip-main">
        <TooltipArtwork key={data.image?.src ?? book ?? String(data.kind)} data={data} />
        <div className="ss-tooltip-copy">
          <span className="ss-tooltip-eyebrow">
            <span>{data.eyebrow ?? (book ? BOOK_LABELS[book] : "SlipSurge guide")}</span>
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
          </span>
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
}: {
  content: TooltipValue;
  trigger: HTMLElement | null;
  tooltipId: string;
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
    <motion.div
      ref={surfaceRef}
      id={tooltipId}
      role="tooltip"
      data-placement={position.placement}
      className="ss-tooltip-portal"
      initial={{ opacity: 0, y: position.placement === "top" ? 5 : -5, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: position.placement === "top" ? 3 : -3, scale: 0.985 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      style={{ left: position.left, top: position.top }}
    >
      <TooltipVisual content={content} />
    </motion.div>,
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
      <AnimatePresence>
        {visible && trigger && <TooltipPortal content={content} trigger={trigger} tooltipId={tooltipId} />}
      </AnimatePresence>
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
    const migrate = (root: ParentNode) => {
      const elements: HTMLElement[] = [];
      if (root instanceof HTMLElement && root.hasAttribute("title")) elements.push(root);
      root.querySelectorAll?.<HTMLElement>("[title]").forEach((element) => elements.push(element));
      elements.forEach((element) => {
        if (element.closest("[data-ss-tooltip-root]")) return;
        const title = element.getAttribute("title")?.trim();
        if (!title) return;
        element.dataset.ssNativeTooltip = title;
        element.removeAttribute("title");
        const isControl = element.matches("button,a,input,select,textarea,[role='button']");
        const hasReadableText = (element.textContent ?? "").trim().length > 1;
        if (isControl && !hasReadableText && !element.hasAttribute("aria-label")) {
          element.setAttribute("aria-label", title);
        }
      });
    };

    migrate(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") migrate(mutation.target as HTMLElement);
        mutation.addedNodes.forEach((node) => { if (node instanceof HTMLElement) migrate(node); });
      });
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

    const findTarget = (eventTarget: EventTarget | null) => {
      if (!(eventTarget instanceof Element)) return null;
      const target = eventTarget.closest<HTMLElement>("[data-ss-native-tooltip]");
      return target?.closest("[data-ss-tooltip-root]") ? null : target;
    };
    const show = (event: Event) => {
      const target = findTarget(event.target);
      const content = target?.dataset.ssNativeTooltip;
      if (target && content) setActive({ target, content });
    };
    const leave = (event: MouseEvent) => {
      setActive((current) => {
        if (!current) return null;
        if (event.relatedTarget instanceof Node && current.target.contains(event.relatedTarget)) return current;
        return null;
      });
    };
    const hide = () => setActive(null);

    document.addEventListener("mouseover", show, true);
    document.addEventListener("mouseout", leave, true);
    document.addEventListener("focusin", show, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("pointerdown", hide, true);
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("mouseover", show, true);
      document.removeEventListener("mouseout", leave, true);
      document.removeEventListener("focusin", show, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && <TooltipPortal content={active.content} trigger={active.target} tooltipId={tooltipId} />}
    </AnimatePresence>
  );
}
