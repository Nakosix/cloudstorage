require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const https = require('https');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const storagePath = path.join(__dirname, 'storage');
if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath);

// --- АНТИСПАМ ---
const spamControl = new Map(); // userId -> { timestamps: [], blockedUntil: timestamp }

function isSpamming(userId) {
    const now = Date.now();
    const windowMs = 10000; // 10 секунд
    const maxMessages = 5;

    let user = spamControl.get(userId);
    if (!user) {
        user = { timestamps: [], blockedUntil: 0 };
        spamControl.set(userId, user);
    }

    if (now < user.blockedUntil) return true;

    user.timestamps = user.timestamps.filter(ts => now - ts < windowMs);
    user.timestamps.push(now);

    if (user.timestamps.length > maxMessages) {
        user.blockedUntil = now + 30000; // Блокировка на 30 секунд
        return true;
    }

    return false;
}

// --- ВСПОМОГАЕТЕЛЬНЫЕ ФУНКЦИИ ---
function ensureUserFolder(userId) {
    const userPath = path.join(storagePath, userId.toString());
    try {
        if (!fs.existsSync(userPath)) {
            fs.mkdirSync(userPath);
            console.log(`Создана директория для пользователя ${userId}`);
        }
    } catch (err) {
        console.error(`Не удалось создать директорию для пользователя ${userId}:`, err);
    }
    return userPath;
}

async function downloadFile(fileId, fileName, chatId) {
    const userFolder = ensureUserFolder(chatId);
    const filePath = path.join(userFolder, fileName);

    try {
        const fileLink = await bot.getFileLink(fileId);
        const fileStream = fs.createWriteStream(filePath);

        https.get(fileLink, (res) => {
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                bot.sendMessage(chatId, `✅ Файл "${fileName}" успешно сохранён.`);
            });
        }).on('error', (err) => {
            console.error('Ошибка загрузки файла:', err);
            bot.sendMessage(chatId, '❌ Ошибка при сохранении файла.');
        });
    } catch (err) {
        console.error('Ошибка при получении ссылки на файл:', err);
        bot.sendMessage(chatId, '❌ Ошибка при сохранении файла.');
    }
}

// --- КНОПКИ ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: {
            keyboard: [
                ['📄 Список файлов', '🗑️ Удалить файл'],
                ['📤 Скачать файл']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };

    bot.sendMessage(chatId, 'Добро пожаловать в облако ☁️\nПросто нажми на кнопку или отправь файл напрямую. (до 50мб)', options);
});

// --- ОБРАБОТКА СОБЫТИЙ С ПОСЛЕДУЮЩИМИ КНОПКАМИ ---
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (isSpamming(chatId)) {
        return bot.sendMessage(chatId, '⛔️ Медленнее. Ты флудишь!');
    }

    if (text === '📤 Скачать файл') {
        const userFolder = path.join(storagePath, chatId.toString());
        if (!fs.existsSync(userFolder)) return bot.sendMessage(chatId, '📂 У тебя нет загруженных файлов.');
    
        const files = fs.readdirSync(userFolder);
        if (files.length === 0) return bot.sendMessage(chatId, '📂 У тебя нет загруженных файлов.');
    
        // разбиваем на строки по 3 кнопки
        const keyboard = [];
        for (let i = 0; i < files.length; i += 3) {
            const row = [];
            for (let j = i; j < i + 3 && j < files.length; j++) {
                row.push({
                    text: `${j + 1}`,
                    callback_data: `download_file_${j}`
                });
            }
            keyboard.push(row);
        }
    
        bot.sendMessage(chatId, 'Выбери файл для скачивания:', {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } else if (text === '📄 Список файлов') {
        const userFolder = path.join(storagePath, chatId.toString());
        if (!fs.existsSync(userFolder)) return bot.sendMessage(chatId, '📂 У тебя нет загруженных файлов.');
    
        const files = fs.readdirSync(userFolder);
        if (files.length === 0) return bot.sendMessage(chatId, '📂 У тебя нет загруженных файлов.');
    
        bot.sendMessage(chatId, 'Вот твои файлы:\n' + files.join('\n'));
    } else if (text === '🗑️ Удалить файл') {
        const userFolder = path.join(storagePath, chatId.toString());
        if (!fs.existsSync(userFolder)) return bot.sendMessage(chatId, '📂 У тебя нет загруженных файлов.');

        const files = fs.readdirSync(userFolder);
        if (files.length === 0) return bot.sendMessage(chatId, '📂 У тебя нет загруженных файлов.');

        const keyboard = [];
        for (let i = 0; i < files.length; i += 3) {
            const row = [];
            for (let j = i; j < i + 3 && j < files.length; j++) {
                row.push({
                    text: `${j + 1}`,
                    callback_data: `delete_file_${j}`
                });
            }
            keyboard.push(row);
        }

        bot.sendMessage(chatId, 'Выбери файл для удаления:', {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    }
});

// --- ОБРАБОТКА НАЖАТИЯ НА КНОПКУ С НОМЕРОМ ФАЙЛА ---
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    if (data.startsWith('download_file_')) {
        const index = parseInt(data.replace('download_file_', ''));

        const userFolder = path.join(storagePath, chatId.toString());
        const files = fs.readdirSync(userFolder);

        if (index >= 0 && index < files.length) {
            const filePath = path.join(userFolder, files[index]);
            const ext = path.extname(files[index]).toLowerCase();

            if (ext === '.jpg' || ext === '.png' || ext === '.jpeg') {
                bot.sendPhoto(chatId, filePath, { caption: 'Просмотр изображения' });
            } else if (ext === '.mp4') {
                bot.sendVideo(chatId, filePath, { caption: 'Просмотр видео' });
            } else {
                bot.sendDocument(chatId, filePath);
            }
        } else {
            bot.sendMessage(chatId, '❌ Ошибка: такого файла нет.');
        }
    } else if (data.startsWith('delete_file_')) {
        const index = parseInt(data.replace('delete_file_', ''));
        const userFolder = path.join(storagePath, chatId.toString());
        const files = fs.readdirSync(userFolder);

        if (index >= 0 && index < files.length) {
            const filePath = path.join(userFolder, files[index]);
            fs.unlinkSync(filePath);  // Удаляем файл
            bot.sendMessage(chatId, `✅ Файл "${files[index]}" был удалён.`);
        } else {
            bot.sendMessage(chatId, '❌ Ошибка: такого файла нет.');
        }
    }

    bot.answerCallbackQuery(callbackQuery.id); // убираем "часики"
});

// --- ОБРАБОТКА ФАЙЛОВ (с антиспамом) ---
const mediaHandlers = {
    document: (msg, file) => downloadFile(file.file_id, file.file_name, msg.chat.id),
    audio: (msg, file) => downloadFile(file.file_id, file.file_name || `audio_${file.file_id}.mp3`, msg.chat.id),
    voice: (msg, file) => downloadFile(file.file_id, `voice_${file.file_id}.ogg`, msg.chat.id),
    video: (msg, file) => downloadFile(file.file_id, `video_${file.file_id}.mp4`, msg.chat.id),
    video_note: (msg, file) => downloadFile(file.file_id, `video_note_${file.file_id}.mp4`, msg.chat.id),
    photo: (msg, file) => {
        // Для изображений отправляем превью
        bot.sendPhoto(msg.chat.id, file.file_id, { caption: 'Вот ваше изображение' })
            .then(() => downloadFile(file.file_id, `photo_${file.file_id}.jpg`, msg.chat.id));
    },
    sticker: (msg, file) => downloadFile(file.file_id, `sticker_${file.file_id}.webp`, msg.chat.id)
};

Object.entries(mediaHandlers).forEach(([type, handler]) => {
    bot.on(type, (msg) => {
        const chatId = msg.chat.id;
        if (isSpamming(chatId)) {
            return bot.sendMessage(chatId, '⛔️ Ты слишком быстро отправляешь файлы! Подожди немного.');
        }

        const file = type === 'photo' ? msg.photo.pop() : msg[type];
        handler(msg, file);
    });
});

// --- СКАЧИВАНИЕ ПО ИМЕНИ ---
bot.onText(/\/download (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const index = parseInt(match[1]) - 1; // индекс от 0

    const userFolder = path.join(storagePath, chatId.toString());
    if (!fs.existsSync(userFolder)) {
        return bot.sendMessage(chatId, '📂 У тебя пока нет файлов.');
    }

    const files = fs.readdirSync(userFolder);
    if (files.length === 0) {
        return bot.sendMessage(chatId, '📂 У тебя пока нет файлов.');
    }

    if (index < 0 || index >= files.length) {
        return bot.sendMessage(chatId, '❌ Неверный номер файла.');
    }

    const filePath = path.join(userFolder, files[index]);
    bot.sendDocument(chatId, filePath);
});
