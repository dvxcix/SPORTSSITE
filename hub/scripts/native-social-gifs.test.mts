import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const fixture = { exports: {} as typeof import('../src/lib/nativeMedia') }
const result = await build({
  stdin: { contents: "export * from './src/lib/nativeMedia'", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'server-only-fixture', setup(plugin) {
    plugin.onResolve({ filter: /^server-only$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: '', loader: 'js' }))
  } }],
})
new Function('require', 'exports', 'module', result.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { isNativeSocialGif, isOwnedNativeMedia } = fixture.exports

test('GIF attachments accept canonical provider images without authorizing unrelated HTTPS media', () => {
  for (const asset of [
    'https://media.tenor.com/sample/celebration.gif',
    'https://c.tenor.com/sample/celebration.GIF',
    'https://media3.giphy.com/media/sample/giphy.gif?cid=fixture',
  ]) {
    assert.equal(isNativeSocialGif(asset), true, asset)
  }
  for (const asset of [
    'https://media.tenor.com.example.invalid/celebration.gif',
    'https://media.tenor.com@other.example.invalid/celebration.gif',
    'https://example.invalid@giphy.com/celebration.gif',
    'http://media.tenor.com/sample/celebration.gif',
    'https://media.tenor.com:8443/sample/celebration.gif',
    'https://media.tenor.com/sample/celebration.mp4',
    'https://media.tenor.com/sample/celebration.gif#fragment',
    'https://giphy.com/gifs/celebration',
    'https://example.invalid/celebration.gif',
    null,
  ]) {
    assert.equal(isNativeSocialGif(asset), false, String(asset))
  }
})

test('uploaded GIFs still require the right account and media namespace', context => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.example.invalid'
  context.after(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous
  })
  const author = '044cb383-5807-4e31-9167-8b0d7c44735c'
  const other = 'a01deb36-f78b-4975-812e-a902147dbfbb'
  const upload = `https://fixture.example.invalid/storage/v1/object/public/media/posts/${author}/eb8ad8fe-0494-4b11-af70-b687bb6d7dab.gif`
  assert.equal(isOwnedNativeMedia(upload, author, 'posts'), true)
  assert.equal(isOwnedNativeMedia(upload, other, 'posts'), false)
  assert.equal(isOwnedNativeMedia(upload, author, 'messages'), false)
  assert.equal(isNativeSocialGif(upload), false)
})
