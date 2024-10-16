import templates from './ascii-art/templates.js'
import generateAsciiMatrix from './ascii-art/generateAsciiMatrix.js'
import GraphemeSplitter from 'grapheme-splitter'

export default (bot) => {
  const handler = async (query) => {
    const userQuery = query.query.trim()
    const me = '@' + (await bot.getMe()).username

    // Если запрос пустой или слишком короткий, предложить доступные шаблоны
    if (!userQuery || userQuery.length < 2) {
      const results = Object.keys(templates).map((templateId, index) => ({
        type: 'article',
        id: String(index),
        title: `🖼 ${templateId}`,
        input_message_content: {
          parse_mode: 'MarkdownV2',
          message_text: `Используй \`${me} ${templateId} СЛОВО\``
        },
        description: `Сгенерировать ASCII-арт с использованием шаблона ${templateId}`
      }))

      return bot.answerInlineQuery(query.id, results, { cache_time: 0 })
    }

    // Разделяем запрос пользователя (например, шаблон + слово + опционально N)
    const params = userQuery.split(' ')

    // Если введено меньше двух параметров (например, нет слова или шаблона), не обрабатываем
    if (params.length < 2) {
      return bot.answerInlineQuery(query.id, [], { cache_time: 0 })
    }

    const templateId = params[0]
    const N = params.length > 2 ? parseInt(params[params.length - 1]) : NaN
    const k = isNaN(N) ? params.length : params.length - 1
    const inputString = params.slice(1, k).join(' ')

    // Проверяем, существует ли такой шаблон
    if (!templates[templateId]) {
      return bot.answerInlineQuery(query.id, [], { cache_time: 0 })
    }

    // Определяем длину строки с учетом эмодзи
    const splitter = new GraphemeSplitter()
    const inputLength = splitter.countGraphemes(inputString)

    const size = Math.max(isNaN(N) ? Math.min(inputLength, 50) : Math.min(N, 50), 5)

    // Проверяем, чтобы строка для генерации не была пустой
    if (!inputString.trim()) {
      console.error('Введенное слово пустое')
      return bot.answerInlineQuery(query.id, [], { cache_time: 0 })
    }

    try {
      const svg = templates[templateId](size) // Генерируем SVG на основе шаблона
      const asciiArt = await generateAsciiMatrix(svg, inputString) // Генерируем ASCII-арт

      // Проверяем, что результат не пустой
      if (!asciiArt.trim()) {
        console.error('Сгенерированный ASCII-арт пустой')
        return bot.answerInlineQuery(query.id, [], { cache_time: 0 })
      }

      const results = [{
        type: 'article',
        id: query.id, // Используем query.id для уникальности
        title: `${templateId} с размером ${size}`,
        input_message_content: {
          message_text: `\`\`\`\n${asciiArt.replace(/[`]/g, '\\`')}\n\`\`\``, // Экранирование символов Markdown
          parse_mode: 'MarkdownV2'
        },
        description: `Сгенерирован ${templateId} с размером ${size}`
      }]

      bot.answerInlineQuery(query.id, results)
    } catch (error) {
      console.error('Ошибка при генерации inline результата:', error)
    }
  }

  return handler
}
