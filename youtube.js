import fs from 'fs/promises'
import path from 'path'
import tmp from 'tmp-promise'
import ytDlpPkg from 'yt-dlp-wrap'

const YTDlpWrap = ytDlpPkg.default

export default async function setupYouTubeDownload(telegramBot) {
  const ytDlpBinaryPath = './yt-dlp'

  async function ensureYtDlpDownloaded() {
    try {
      await fs.access(ytDlpBinaryPath)
    } catch (err) {
      await YTDlpWrap.downloadFromGithub()
    }
  }

  await ensureYtDlpDownloaded()
  const ytDlpWrap = new YTDlpWrap(ytDlpBinaryPath)

  const targetChatId = process.env.TELEGRAM_CHAT_ID

  // Получение JSON-информации по видео
  async function getVideoInfo(url) {
    const result = await ytDlpWrap.execPromise([
      url,
      '--dump-single-json',
      ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : [])
    ])
    return JSON.parse(result)
  }

  telegramBot.on('message', async (msg) => {
    if (String(msg.chat.id) !== targetChatId) return
    if (!msg.text) return

    const chatId = msg.chat.id
    const text = msg.text

    // Поиск ссылок на youtube.com и youtu.be
    const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/g
    const links = text.match(youtubeRegex)
    if (!links) return

    for (const link of links) {
      try {
        // Получаем информацию о видео
        const info = await getVideoInfo(link)
        const duration = info.duration || 0
        if (duration > 1800) {
          await telegramBot.sendMessage(
            chatId,
            'Видео длиннее 30 минут, скачивание не допускается.',
            { reply_to_message_id: msg.message_id }
          )
          continue
        }

        // Выбираем максимальную высоту в зависимости от длительности
        const maxHeight = duration <= 180 ? 720 : (duration <= 600 ? 480 : 240)

        // Проверяем, доступен ли вариант с AV1 (без учета контейнера)
        const hasAv1 = info.formats && info.formats.some(fmt => {
          return fmt.vcodec && fmt.vcodec.includes('av01') &&
                 fmt.height && fmt.height <= maxHeight
        })

        let format = ''
        let extraOptions = []
        if (hasAv1) {
          // Если AV1 есть, выбираем видео с AV1 (аудио — с расширением m4a, если доступно)
          // Затем с помощью --remux-video mp4 гарантируем итоговый контейнер mp4.
          format = `bestvideo[vcodec=av01][height<=${maxHeight}]+bestaudio[ext=m4a]/best[vcodec=av01][height<=${maxHeight}]`
          extraOptions.push('--remux-video', 'mp4')
        } else {
          // Если вариантов с AV1 нет, выбираем лучший доступный вариант в рамках высоты,
          // а затем выполняем перекодировку в AV1/mp4.
          format = `bestvideo[height<=${maxHeight}]+bestaudio[ext=m4a]/best[height<=${maxHeight}][ext=mp4]`
          extraOptions.push('--recode-video', 'mp4', '--postprocessor-args', '-c:v libaom-av1')
        }

        // Создаём временную директорию
        const tempDir = await tmp.dir({ prefix: 'youtube-' })

        // Формируем путь для итогового файла:
        // Имя файла = ID видео, а расширение подставится автоматически (%(ext)s)
        const outPath = path.join(tempDir.path, `${info.id}.%(ext)s`)

        // Собираем параметры для yt-dlp
        const ytDlpOptions = [
          link,
          '-f', format,
          '--no-playlist',
          '-o', outPath,
          ...(process.env.X_PROXY ? ['--proxy', process.env.X_PROXY] : []),
          ...extraOptions
        ]

        const ytDlpEmitter = ytDlpWrap.exec(ytDlpOptions)

        ytDlpEmitter
          .on('progress', (progress) => {
            console.log(
              `Progress: ${progress.percent}%`,
              `Total Size: ${progress.totalSize}`,
              `Speed: ${progress.currentSpeed}`,
              `ETA: ${progress.eta}`
            )
          })
          .on('ytDlpEvent', (eventType, eventData) => {
            console.log('yt-dlp event:', eventType, eventData)
          })
          .on('error', async (error) => {
            console.error('yt-dlp error:', error)
            await telegramBot.sendMessage(
              chatId,
              'Ошибка при скачивании видео.',
              { reply_to_message_id: msg.message_id }
            )
          })
          .on('close', async () => {
            try {
              // После завершения скачивания найдём файл (с нужным расширением)
              const files = await fs.readdir(tempDir.path)
              const downloadedFile = files.find((file) => file.startsWith(info.id + '.'))
              if (!downloadedFile) {
                throw new Error('Файл не найден после скачивания.')
              }

              const finalPath = path.join(tempDir.path, downloadedFile)
              await telegramBot.sendVideo(chatId, finalPath, {
                reply_to_message_id: msg.message_id
              })

              // Удаляем временные файлы
              await fs.rm(tempDir.path, { recursive: true, force: true })
            } catch (err) {
              console.error('Error sending video:', err)
              await telegramBot.sendMessage(
                chatId,
                'Ошибка при отправке видео.',
                { reply_to_message_id: msg.message_id }
              )
            }
          })
      } catch (err) {
        console.error('Error initializing video download:', err)
        await telegramBot.sendMessage(
          chatId,
          'Не удалось инициализировать скачивание.',
          { reply_to_message_id: msg.message_id }
        )
      }
    }
  })
}
