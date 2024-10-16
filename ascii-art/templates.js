const templates = {
  swaston: (N) => {
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
}

export default templates
