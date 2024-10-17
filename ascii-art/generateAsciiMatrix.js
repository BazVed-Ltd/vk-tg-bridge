import sharp from 'sharp'
import { PNG } from 'pngjs'

// Функция для проверки наличия эмодзи в строке
const containsEmoji = (word) => {
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]/u
  return emojiRegex.test(word)
}

// Функция для парсинга PNG и создания матриц
const parsePNG = (pngBuffer, spaceChar) => {
  const png = PNG.sync.read(pngBuffer)
  const black = []
  const visited = []
  const result = []

  for (let y = 0; y < png.height; y++) {
    const blackRow = []
    const visitedRow = []
    const resultRow = []
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) * 4
      const r = png.data[idx]
      const g = png.data[idx + 1]
      const b = png.data[idx + 2]
      const a = png.data[idx + 3]

      const isBlack = r === 0 && g === 0 && b === 0 && a === 255
      blackRow.push(isBlack)
      visitedRow.push(false)
      resultRow.push(spaceChar)
    }
    black.push(blackRow)
    visited.push(visitedRow)
    result.push(resultRow)
  }

  return { black, visited, result, width: png.width, height: png.height }
}

// Функция для нахождения следующей стартовой точки
const findNextStartingPoint = (black, visited, width, height) => {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (black[y][x] && !visited[y][x]) {
        return { x, y }
      }
    }
  }
  return null
}

// Функция для выполнения flood fill
const floodFill = (startX, startY, wordIndex, black, visited, result, characters, width, height, getNeighbors) => {
  const stack = []
  stack.push({ x: startX, y: startY, wordIndex })

  while (stack.length > 0) {
    const { x, y, wordIndex } = stack.pop()

    // Проверка границ
    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue
    }

    // Пропускаем, если уже посещено или не черный пиксель
    if (visited[y][x] || !black[y][x]) {
      continue
    }

    // Отмечаем как посещенный
    visited[y][x] = true

    // Записываем соответствующий символ
    result[y][x] = characters[wordIndex % characters.length]

    const nextWordIndex = wordIndex + 1

    // Приоритет нижних диагональных точек
    const neighbors = getNeighbors(x, y)

    for (const neighbor of neighbors) {
      stack.push({ x: neighbor.x, y: neighbor.y, wordIndex: nextWordIndex })
    }
  }

  return wordIndex
}

// Основная функция для генерации ASCII матрицы
const generateAsciiMatrix = async (svg, word, getNeighbors, startPoints) => {
  try {
    // Преобразуем слово в массив символов, учитывая эмодзи
    const characters = Array.from(word)

    // Проверяем, содержит ли слово эмодзи
    const hasEmoji = containsEmoji(word)

    // Выбираем символ для пробелов
    const spaceChar = hasEmoji ? '⬜' : ' '

    // Рендерим SVG в PNG
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer()

    // Парсим PNG и создаем матрицы
    const { black, visited, result, width, height } = parsePNG(pngBuffer, spaceChar)

    let wordIndex = 0
    if (startPoints) {
      for (const p of startPoints) {
        wordIndex = floodFill(
          p[0],
          p[1],
          wordIndex,
          black,
          visited,
          result,
          characters,
          width,
          height,
          getNeighbors
        )
      }
    } else {
      let startPoint = findNextStartingPoint(black, visited, width, height)
      while (startPoint) {
        wordIndex = floodFill(
          startPoint.x,
          startPoint.y,
          wordIndex,
          black,
          visited,
          result,
          characters,
          width,
          height,
          getNeighbors
        )

        // Ищем следующую стартовую точку
        startPoint = findNextStartingPoint(black, visited, width, height)
      }
    }

    // Преобразуем матрицу в строки
    const asciiArt = result.map((row) => row.join('')).join('\n')
    return asciiArt
  } catch (error) {
    console.error('Ошибка:', error)
    throw error
  }
}

export default generateAsciiMatrix
