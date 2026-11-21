export function storyBackground(value?: string | null) {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : '#111111'
}

export function storyTextColor(value?: string | null) {
  const hex = storyBackground(value).slice(1)
  const channels = [0, 2, 4].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  return luminance > .179 ? '#000000' : '#ffffff'
}

export function isStoryVideo(url: string) {
  return /\.(mp4|webm)(?:[?#]|$)/i.test(url)
}
