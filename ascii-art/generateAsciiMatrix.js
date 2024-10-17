import sharp from 'sharp'
import { PNG } from 'pngjs'
import stringWidth from 'string-width'

// Function to parse PNG and create matrices
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

// Function to find the next starting point
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

// Function to perform flood fill
const floodFill = (startX, startY, wordIndex, black, visited, result, characters, width, height, getNeighbors) => {
  const stack = []
  stack.push({ x: startX, y: startY, wordIndex })

  while (stack.length > 0) {
    const { x, y, wordIndex } = stack.pop()

    // Boundary check
    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue
    }

    // Skip if already visited or not a black pixel
    if (visited[y][x] || !black[y][x]) {
      continue
    }

    // Mark as visited
    visited[y][x] = true

    // Assign the corresponding character
    result[y][x] = characters[wordIndex % characters.length]

    const nextWordIndex = wordIndex + 1

    // Prioritize lower diagonal points
    const neighbors = getNeighbors(x, y)

    for (const neighbor of neighbors) {
      stack.push({ x: neighbor.x, y: neighbor.y, wordIndex: nextWordIndex })
    }
  }

  return wordIndex
}

// Main function to generate ASCII matrix
const generateAsciiMatrix = async (svg, word, getNeighbors, startPoints, spacer) => {
  try {
    // Convert the word into an array of characters, accounting for emojis
    const characters = Array.from(word)

    // Render SVG to PNG
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer()

    // Parse PNG and create matrices
    const { black, visited, result, width, height } = parsePNG(pngBuffer, ' ')

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

        // Find the next starting point
        startPoint = findNextStartingPoint(black, visited, width, height)
      }
    }

    // Determine the maximum character width
    const characterWidths = characters.map((char) => stringWidth(char))
    const maxWidth = Math.max(...characterWidths)
    const baseWidth = maxWidth % 2 === 0 ? maxWidth : maxWidth + 1

    // Process the result matrix to adjust characters and spaces
    const adjustedResult = []
    for (const row of result) {
      const adjustedRow = []
      for (const cell of row) {
        if (cell === ' ') {
          // Empty cell, output ' ' repeated baseWidth times
          adjustedRow.push(' '.repeat(baseWidth))
        } else {
          // Get the character
          const char = cell
          const charWidth = stringWidth(char)
          // Calculate padding
          const totalPadding = baseWidth - charWidth
          const paddingLeft = Math.floor(totalPadding / 2)
          const paddingRight = totalPadding - paddingLeft
          const adjustedChar = ' '.repeat(paddingLeft) + char + ' '.repeat(paddingRight)
          adjustedRow.push(adjustedChar)
        }
      }
      adjustedResult.push(adjustedRow.join(''))
    }

    // Assemble the ASCII art
    const asciiArt = adjustedResult.join('\n')
    return asciiArt
  } catch (error) {
    console.error('Error:', error)
    throw error
  }
}

export default generateAsciiMatrix
