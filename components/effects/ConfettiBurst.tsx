'use client'

// Fire a large, full-screen confetti burst. The canvas-confetti library manages
// its own canvas element, so no persistent DOM is needed — we just call it
// imperatively (e.g. when the retro timer reaches zero).
//
// Imported dynamically so the library is only pulled in on the client, at the
// moment it's actually needed.

// Brand palette to match the app (espresso brown + accent red + warm gold).
const COLORS = ['#B83C28', '#2d1200', '#E8A13C', '#F4D58D', '#ffffff']

export async function fireConfetti() {
  if (typeof window === 'undefined') return

  const confetti = (await import('canvas-confetti')).default

  const duration = 2500
  const end = Date.now() + duration

  // An initial big central burst for immediate impact.
  confetti({
    particleCount: 160,
    spread: 100,
    startVelocity: 55,
    origin: { x: 0.5, y: 0.5 },
    colors: COLORS,
    zIndex: 9999,
  })

  // Followed by continuous left + right cannons for a full-screen shower.
  ;(function frame() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 70,
      startVelocity: 60,
      origin: { x: 0, y: 0.7 },
      colors: COLORS,
      zIndex: 9999,
    })
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 70,
      startVelocity: 60,
      origin: { x: 1, y: 0.7 },
      colors: COLORS,
      zIndex: 9999,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}
