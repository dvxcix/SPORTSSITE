import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'MLB Weather Lab | SlipSurge', description: 'Review game weather, wind, temperature, park conditions, and related run environment context.', path: '/weather-lab', index: false })

export default function WeatherLabLayout({ children }: { children: React.ReactNode }) { return children }
