const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const ADMIN_USERNAME = 'admin'; // Укажи свой логин администратора
const ADMIN_PASSWORD = 'password'; // Укажи свой пароль администратора

// Мидлвар для парсинга тела запроса
app.use(express.urlencoded({ extended: true })); // Для обработки данных формы
app.use(express.json()); // Для обработки JSON данных

// Мидлвар для аутентификации
function authenticate(req, res, next) {
    const { username, password } = req.body; // Теперь req.body должен содержать username и password
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).send('Неверный логин или пароль');
    }
    next();
}

// Статический контент
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница (страница входа)
app.get('/admin', (req, res) => {
    res.send(`
        <h1>Админ Панель</h1>
        <form action="/admin" method="POST">
            <label for="username">Логин:</label>
            <input type="text" name="username" id="username">
            <label for="password">Пароль:</label>
            <input type="password" name="password" id="password">
            <button type="submit">Войти</button>
        </form>
    `);
});

// Обработчик POST-запроса для аутентификации
app.post('/admin', authenticate, (req, res) => {
    // Успешная аутентификация
    res.send('<h1>Добро пожаловать, администратор!</h1><p><a href="/storage">Перейти в хранилище</a></p>');
});

// Страница хранилища
app.get('/storage', (req, res) => {
    const storagePath = path.join(__dirname, 'storage');
    const userFolders = fs.readdirSync(storagePath).filter(file => fs.statSync(path.join(storagePath, file)).isDirectory());
    
    res.send(`
        <h1>Хранилище</h1>
        <ul>
            ${userFolders.map(folder => `<li><a href="/storage/${folder}">${folder}</a></li>`).join('')}
        </ul>
    `);
});

// Страница пользователя в хранилище
app.get('/storage/:userId', (req, res) => {
    const userId = req.params.userId;
    const userFolder = path.join(__dirname, 'storage', userId);
    
    if (!fs.existsSync(userFolder)) {
        return res.status(404).send('Папка пользователя не найдена');
    }

    const files = fs.readdirSync(userFolder);
    res.send(`
        <h1>Файлы пользователя ${userId}</h1>
        <ul>
            ${files.map(file => `<li><a href="/storage/${userId}/${file}" download>${file}</a></li>`).join('')}
        </ul>
    `);
});

// Страница для скачивания файла
app.get('/storage/:userId/:fileName', (req, res) => {
    const userId = req.params.userId;
    const fileName = req.params.fileName;
    const filePath = path.join(__dirname, 'storage', userId, fileName);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Файл не найден');
    }

    res.download(filePath);
});

// Страница предосмотра файла
app.get('/preview/:userId/:fileName', (req, res) => {
    const userId = req.params.userId;
    const fileName = req.params.fileName;
    const filePath = path.join(__dirname, 'storage', userId, fileName);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Файл не найден');
    }

    // Генерируем ссылку для предосмотра
    const previewUrl = `/storage/${userId}/${fileName}`;
    res.redirect(`/public/preview.html?file=${previewUrl}`);
});


// Запуск сервера
const port = 3000;
app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
