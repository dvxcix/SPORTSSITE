import 'server-only'
import { unstable_cache } from 'next/cache'
import { loadNflWeather } from './nflWeather'

// Shared across members; cache failures briefly as well to avoid a request stampede.
export const getNflWeather = unstable_cache(loadNflWeather, ['nfl-stadium-weather-v1'], { revalidate: 300 })
