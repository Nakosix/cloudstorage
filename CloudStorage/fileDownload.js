const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ProgressBar = require('progress');

// Функция для загрузки с прогресс-баром
async function downloadFileWithProgress(fileUrl, filePath, chunkSize = 1024 * 1024) {
    const writer = fs.createWriteStream(filePath);

    const { data: fileStats } = await axios.head(fileUrl);
    const fileSize = parseInt(fileStats['content-length']);

    // Создание прогресс-бара
    const bar = new ProgressBar(':bar :percent', {
        total: fileSize,
        width: 40,
    });

    const promises = [];
    for (let start = 0; start < fileSize; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, fileSize - 1);

        const promise = axios.get(fileUrl, {
            headers: {
                Range: `bytes=${start}-${end}`, // Разделяем файл на части
            },
            responseType: 'stream',
        }).then((response) => {
            response.data.on('data', (chunk) => {
                bar.tick(chunk.length); // Обновляем прогресс
            });
            response.data.pipe(writer, { end: false });
        });

        promises.push(promise);
    }

    await Promise.all(promises);
    writer.end();
    bar.tick(fileSize - bar.curr); // Обновляем прогресс в конце
}

module.exports = downloadFileWithProgress;
