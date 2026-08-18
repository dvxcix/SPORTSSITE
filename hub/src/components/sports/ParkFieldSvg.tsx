import type { CSSProperties, ReactNode } from 'react'
import { MLB_PARK_SHAPES } from '@slipsurge/core/mlbParkShapes'

const SAND_DIAMOND = 'M163.9,166.7l-1-1c-5-16-20-27.7-37.7-27.7s-32.7,11.7-37.7,27.7l-1,1l32.7,32.7c-0.5,0.9-0.7,1.9-0.7,3c0,3.7,3,6.7,6.7,6.7s6.7-3,6.7-6.7c0-1.1-0.3-2.1-0.7-3L163.9,166.7z M122.5,154.7c0.8,0.5,1.7,0.8,2.7,0.8s1.9-0.3,2.7-0.8l16.8,16.8c-1.6,1.6-1.6,4.1,0,5.6l2.5,2.5l-17.7,17.7c-1.2-1-2.7-1.6-4.3-1.6s-3.2,0.6-4.3,1.6l-17.7-17.7l2.5-2.5c1.6-1.5,1.6-4,0-5.6L122.5,154.7z'

function InfieldDetail({ secondary }: { secondary: string }) {
  return (
    <>
      <path d={SAND_DIAMOND} fill={secondary} fillOpacity={0.8} stroke={secondary} strokeOpacity={1} strokeWidth={0.75} />
      <g fill="none" stroke="#fff" strokeWidth={0.75} opacity={0.85}>
        <path d="M122.5,174.7c-1.5,1.5-1.5,3.9,0,5.4s3.9,1.5,5.4,0c1.5-1.5,1.5-3.9,0-5.4C126.5,173.2,124,173.2,122.5,174.7z" fill="#fff" />
        <path d="M123.2,176.6h4v1.6h-4V176.6z" fill="#fff" />
        <path d="M125.2,203.2l-97.1-97.1" />
        <path d="M125.2,203.2l97.1-97.2" />
        <rect x="99.2" y="175.1" width="3" height="3" transform="matrix(0.7073 -0.7069 0.7069 0.7073 -95.3473 122.8833)" fill="#fff" />
        <rect x="148.1" y="175.2" width="3" height="3" transform="matrix(0.7073 -0.7069 0.7069 0.7073 -81.1078 157.4629)" fill="#fff" />
        <rect x="123.7" y="148.6" width="3" height="3" transform="matrix(0.707 -0.7073 0.7073 0.707 -69.4796 132.5406)" fill="#fff" />
        <polygon points="126.7,201.8 125.2,203.4 123.7,201.8 123.7,200.3 126.7,200.3" fill="#fff" />
      </g>
    </>
  )
}

type ParkFieldSvgProps = {
  primary: string
  secondary: string
  teamAbbr: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

// One renderer keeps Weather Lab and spray charts on the same traced park
// geometry. Children share the official Savant 0-250 coordinate space.
export function ParkFieldSvg({ primary, secondary, teamAbbr, children, className, style, ariaLabel }: ParkFieldSvgProps) {
  const real = MLB_PARK_SHAPES[teamAbbr.toUpperCase()]
  const accessibility = ariaLabel
    ? { role: 'img' as const, 'aria-label': ariaLabel }
    : { 'aria-hidden': true as const }

  if (real) {
    return (
      <svg viewBox={real.viewBox} className={className} style={style} {...accessibility}>
        <g transform={real.transform}>
          <path d={real.outfield} fill={primary} fillOpacity={0.32} stroke={primary} strokeOpacity={0.75} strokeWidth={1.5} />
        </g>
        <InfieldDetail secondary={secondary} />
        {children}
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 250 250" className={className} style={style} {...accessibility}>
      <path
        d="M125 220 L60 150 A 95 95 0 0 1 190 150 Z"
        fill={primary}
        fillOpacity={0.32}
        stroke={primary}
        strokeOpacity={0.75}
        strokeWidth={1.5}
      />
      <InfieldDetail secondary={secondary} />
      {children}
    </svg>
  )
}
