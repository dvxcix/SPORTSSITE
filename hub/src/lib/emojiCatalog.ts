// Curated set, not a full unicode/CLDR dataset — no emoji npm dependency
// existed anywhere in this codebase before, and pulling in a ~3000-entry
// package for a sports-betting social app is more than this needs. Picked
// for what actually gets used here: reactions, sports, money/betting,
// common faces/gestures. Shortcodes follow the Slack/Discord/GitHub
// convention (:fire:, :joy:, :100:) since that's what most users already
// know by muscle memory.
export const EMOJI_CATEGORIES: { label: string; emoji: { code: string; char: string }[] }[] = [
  {
    label: 'Reactions',
    emoji: [
      { code: 'fire', char: '🔥' }, { code: 'joy', char: '😂' }, { code: 'heart', char: '❤️' },
      { code: '100', char: '💯' }, { code: 'eyes', char: '👀' }, { code: 'clap', char: '👏' },
      { code: 'skull', char: '💀' }, { code: 'scream', char: '😱' }, { code: 'sob', char: '😭' },
      { code: 'thinking', char: '🤔' }, { code: 'salute', char: '🫡' }, { code: 'mindblown', char: '🤯' },
      { code: 'cry_laugh', char: '🤣' }, { code: 'smirk', char: '😏' }, { code: 'sweat', char: '😅' },
    ],
  },
  {
    label: 'Hands',
    emoji: [
      { code: 'thumbsup', char: '👍' }, { code: 'thumbsdown', char: '👎' }, { code: 'pray', char: '🙏' },
      { code: 'muscle', char: '💪' }, { code: 'point_right', char: '👉' }, { code: 'point_left', char: '👈' },
      { code: 'ok_hand', char: '👌' }, { code: 'fist', char: '✊' }, { code: 'handshake', char: '🤝' },
      { code: 'wave', char: '👋' }, { code: 'crossed_fingers', char: '🤞' }, { code: 'raised_hands', char: '🙌' },
    ],
  },
  {
    label: 'Sports',
    emoji: [
      { code: 'baseball', char: '⚾' }, { code: 'football', char: '🏈' }, { code: 'basketball', char: '🏀' },
      { code: 'hockey', char: '🏒' }, { code: 'soccer', char: '⚽' }, { code: 'boxing', char: '🥊' },
      { code: 'trophy', char: '🏆' }, { code: 'medal', char: '🥇' }, { code: 'stadium', char: '🏟️' },
      { code: 'whistle', char: '🎯' }, { code: 'stopwatch', char: '⏱️' },
    ],
  },
  {
    label: 'Money & Betting',
    emoji: [
      { code: 'moneybag', char: '💰' }, { code: 'money', char: '💵' }, { code: 'chart_up', char: '📈' },
      { code: 'chart_down', char: '📉' }, { code: 'dice', char: '🎲' }, { code: 'slot', char: '🎰' },
      { code: 'gem', char: '💎' }, { code: 'rocket', char: '🚀' }, { code: 'bank', char: '🏦' },
      { code: 'crown', char: '👑' }, { code: 'lock', char: '🔒' }, { code: 'unlock', char: '🔓' },
    ],
  },
  {
    label: 'Faces',
    emoji: [
      { code: 'smile', char: '😀' }, { code: 'grin', char: '😁' }, { code: 'wink', char: '😉' },
      { code: 'cool', char: '😎' }, { code: 'angry', char: '😡' }, { code: 'confused', char: '😕' },
      { code: 'neutral', char: '😐' }, { code: 'sleepy', char: '😴' }, { code: 'sick', char: '🤢' },
      { code: 'party', char: '🥳' }, { code: 'heart_eyes', char: '😍' }, { code: 'zany', char: '🤪' },
    ],
  },
  {
    label: 'Symbols',
    emoji: [
      { code: 'check', char: '✅' }, { code: 'x', char: '❌' }, { code: 'warning', char: '⚠️' },
      { code: 'question', char: '❓' }, { code: 'exclamation', char: '❗' }, { code: 'star', char: '⭐' },
      { code: 'sparkles', char: '✨' }, { code: 'boom', char: '💥' }, { code: 'zap', char: '⚡' },
      { code: 'up', char: '⬆️' }, { code: 'down', char: '⬇️' }, { code: 'siren', char: '🚨' },
    ],
  },
]

export const STANDARD_EMOJI_MAP: Record<string, string> = Object.fromEntries(
  EMOJI_CATEGORIES.flatMap(c => c.emoji).map(e => [e.code, e.char])
)
