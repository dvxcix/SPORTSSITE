import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatOdds(price: number): string {
  return price > 0 ? `+${price}` : `${price}`
}

export function getGameStatusColor(state: string): string {
  if (state === 'Live') return 'text-green-400'
  if (state === 'Final') return 'text-gray-400'
  return 'text-blue-400'
}
