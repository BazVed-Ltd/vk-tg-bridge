class Template {
  thumb = null
  get (N) {
    throw new Error('Not implemented')
  }
}

const templates = {
  swaston: new (class extends Template {
    thumb = 'https://i.imgur.com/53yJTWr.png'
    get (N) {
      N = Math.max(Math.min(50, N), 6)
      if (N % 2 === 0) N++
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">
    <line x1="0" y1="${N / 2}" x2="${N}" y2="${N / 2}" stroke="black" stroke-width="1"/>
    <line x1="${N / 2}" y1="0" x2="${N / 2}" y2="${N}" stroke="black" stroke-width="1"/>
    <line x1="${N / 2}" y1="0.5" x2="${N}" y2="0.5" stroke="black" stroke-width="1"/>
    <line x1="${N - 0.5}" y1="${N / 2}" x2="${N - 0.5}" y2="${N}" stroke="black" stroke-width="1"/>
    <line x1="0" y1="${N - 0.5}" x2="${N / 2}" y2="${N - 0.5}" stroke="black" stroke-width="1"/>
    <line x1="0.5" y1="0" x2="0.5" y2="${N / 2}" stroke="black" stroke-width="1"/>
  </svg>`
    }
  })(),
  algiz: new (class extends Template {
    thumb = 'https://i.imgur.com/g4f6SHH.png'
    get (N) {
      N = Math.max(Math.min(50, N), 6)
      if (N % 2 === 0) N++
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">
      <line x1="${N / 2}" y1="0" x2="${N / 2}" y2="${N}" stroke="black" stroke-width="1"/>
      <line x1="${N / 2}" y1="${N / 2}" x2="0" y2="0" stroke="black" stroke-width="2"/>
      <line x1="${N / 2}" y1="${N / 2}" x2="${N}" y2="0" stroke="black" stroke-width="2"/>
    </svg>`
    }
  })()
}

export default templates
