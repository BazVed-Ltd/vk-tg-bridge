import templates from './ascii-art/templates.js'
import generateAsciiMatrix from './ascii-art/generateAsciiMatrix.js'
import GraphemeSplitter from 'grapheme-splitter'

export default (bot) => {
  const handler = async (query) => {
    const userQuery = query.query.trim()

    // If the query is empty, return no results
    if (!userQuery) {
      return bot.answerInlineQuery(query.id, [], { cache_time: 0 })
    }

    // Split user input into parameters
    const params = userQuery.split(' ')

    // Check if the last parameter is a number (optional N)
    let N = NaN

    if (params.length > 1) {
      const lastParam = params[params.length - 1]
      if ([...lastParam].every(c => c >= '0' && c <= '9')) {
        N = parseInt(params.pop())
      }
    }

    const inputString = params.join(' ').trim()

    // Ensure the input string is not empty
    if (!inputString) {
      console.error('Введенный текст пустой')
      return bot.answerInlineQuery(query.id, [], { cache_time: 0 })
    }

    const results = []
    const splitter = new GraphemeSplitter()

    // For each template, generate an inline query result
    for (const [templateId, template] of Object.entries(templates)) {
      try {
        const word = template.prepareWord(inputString)
        const wordLength = splitter.countGraphemes(word)
        const size = isNaN(N) ? wordLength : N
        const svg = template.get(size)
        const asciiArt = await generateAsciiMatrix(svg, word, template.getNeighbors, template.getStartPoints(size), template.spacer) // Generate ASCII art

        // Ensure the generated ASCII art is not empty
        if (asciiArt.trim()) {
          results.push({
            type: 'article',
            id: `${templateId}_${query.id}`, // Unique ID per template and query
            title: `${templateId}`,
            input_message_content: {
              message_text: `\`\`\`\n${asciiArt.replace(/[`]/g, '\\`')}\n\`\`\``,
              parse_mode: 'MarkdownV2'
            },
            description: `Нажми, чтобы сгенерировать ASCII-арт с шаблоном ${templateId}`,
            thumb_url: template.thumb
          })
        } else {
          console.error(`Сгенерированный ASCII-арт пустой для шаблона ${templateId}`)
        }
      } catch (error) {
        console.error(`Ошибка при генерации ASCII-арта для шаблона ${templateId}:`, error)
      }
    }

    // Answer the inline query with the list of templates
    return bot.answerInlineQuery(query.id, results, { cache_time: 0 })
  }

  return handler
}
