import sharp from 'sharp'
import { PNG } from 'pngjs'

// Функция для проверки наличия эмодзи в строке
const containsEmoji = (word) => {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]/u
  return emojiRegex.test(word)
}

// Функция для генерации ASCII матрицы с заполнением слова
const generateAsciiMatrix = async (svg, word) => {
  try {
    // Преобразуем слово в массив символов, учитывая эмодзи
    const characters = Array.from(word)

    // Проверяем, содержит ли слово эмодзи
    const hasEmoji = containsEmoji(word)

    // Выбираем символ для пробелов
    const spaceChar = hasEmoji ? '⬜' : ' '

    // Рендерим SVG в PNG
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer()

    // Читаем PNG и получаем данные пикселей
    const png = PNG.sync.read(pngBuffer)

    // Создаем матрицы для черных пикселей, посещенных и результата
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

    // Находим стартовую точку (первый черный пиксель)
    let startX = -1
    let startY = -1
    outer: for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (black[y][x]) {
          startX = x
          startY = y
          break outer
        }
      }
    }

    if (startX === -1) {
      throw new Error('Не найдено черных пикселей для заполнения.')
    }

    // Реализация обхода в глубину со стеком
    const stack = []
    stack.push({ x: startX, y: startY, wordIndex: 0 })

    while (stack.length > 0) {
      const { x, y, wordIndex } = stack.pop()

      // Проверка границ
      if (x < 0 || x >= png.width || y < 0 || y >= png.height) {
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

      // Добавляем соседние пиксели в стек
      stack.push({ x: x + 1, y, wordIndex: nextWordIndex })
      stack.push({ x: x - 1, y, wordIndex: nextWordIndex })
      stack.push({ x, y: y + 1, wordIndex: nextWordIndex })
      stack.push({ x, y: y - 1, wordIndex: nextWordIndex })
    }

    // Преобразуем матрицу в строки
    const asciiArt = result.map(row => row.join('')).join('\n')
    return asciiArt
  } catch (error) {
    console.error('Ошибка:', error)
    throw error
  }
}

export default generateAsciiMatrix
