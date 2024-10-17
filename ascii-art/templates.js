class Template {
  /**
   * @type {string | null}
   */
  thumb = null

  /**
   * @param {number} x
   * @param {number} y
   * @returns {Array.<{x: number, y: number}>}
   */
  getNeighbors (x, y) {
    return [
      { x, y: y + 1 }, // Нижний
      { x: x - 1, y }, // Левый
      { x, y: y - 1 }, // Верхний
      { x: x + 1, y } // Правый
    ]
  }

  /**
   * @param {number} N
   * @returns {string}
   */
  get (N) {
    throw new Error('Not implemented')
  }

  /**
   * @param {string} word
   * @returns {string}
   */
  prepareWord (word) {
    return word
  }

  /**
   * @param {number} N
   * @returns {Array.<[number, number]>}
   */
  getStartPoints (N) {
    return null
  }
}

const templates = {
  swaston: new (class extends Template {
    thumb = 'https://i.imgur.com/53yJTWr.png'

    get (N) {
      N = Math.max(N, 5)
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">
    <line x1="0" y1="${N / 2}" x2="${N}" y2="${N / 2}" stroke="black" stroke-width="1"/>
    <line x1="${N / 2}" y1="0" x2="${N / 2}" y2="${N}" stroke="black" stroke-width="1"/>
    <line x1="${N / 2}" y1="0.5" x2="${N}" y2="0.5" stroke="black" stroke-width="1"/>
    <line x1="${N - 0.5}" y1="${N / 2}" x2="${N - 0.5}" y2="${N}" stroke="black" stroke-width="1"/>
    <line x1="0" y1="${N - 0.5}" x2="${N / 2}" y2="${N - 0.5}" stroke="black" stroke-width="1"/>
    <line x1="0.5" y1="0" x2="0.5" y2="${N / 2}" stroke="black" stroke-width="1"/>
  </svg>`
    }

    getStartPoints (N) {
      return [[Math.floor(N / 2), Math.floor(N / 2)]]
    }

    prepareWord (word) {
      const maxLength = 25
      const minLength = 3

      while (word.length < minLength) {
        word += word
      }
      const trimmedWord = word.slice(0, maxLength)
      const pal = (w) => w.split('').reverse().join('').slice(0, -1) + w
      const result = pal(trimmedWord)
      return result
    }
  })(),
  algiz: new (class extends Template {
    thumb = 'https://i.imgur.com/g4f6SHH.png'

    getNeighbors (x, y) {
      return [
        { x: x + 1, y: y + 1 }, // Нижний правый
        { x: x + 1, y: y - 1 }, // Верхний правый
        { x: x - 1, y: y - 1 }, // Верхний левый
        { x, y: y + 1 }, // Нижний
        { x: x - 1, y }, // Левый
        { x, y: y - 1 }, // Верхний
        { x: x + 1, y } // Правый
      ]
    }

    get (N) {
      if (N % 2 === 0) N++
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">
      <line x1="${N / 2}" y1="0" x2="${N / 2}" y2="${N}" stroke="black" stroke-width="1"/>
      <line x1="${N / 2}" y1="${N / 2}" x2="0" y2="0" stroke="black" stroke-width="2"/>
      <line x1="${N / 2}" y1="${N / 2}" x2="${N}" y2="0" stroke="black" stroke-width="2"/>
    </svg>`
    }

    prepareWord (word) {
      const maxLength = 50
      const trimmedWord = word.slice(0, maxLength)
      return trimmedWord
    }
  })()
}

export default templates
