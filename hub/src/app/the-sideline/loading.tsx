export default function Loading() {
  return <main aria-busy="true" style={{ padding: 32, minHeight: '65vh', background: '#060a0f', color: '#f5f8fb' }}>
    <h1>The Sideline</h1>
    <p role="status">Loading the NFL board and player data…</p>
  </main>
}
