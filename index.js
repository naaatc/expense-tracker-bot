require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const VALID_CATEGORIES = [
  'Subscriptions', 'Shopping', 'Transport', 'Food', 'Groceries', 'Medical',
  'Misc', 'Taxes', 'Utilities', 'Entertainment', 'Fitness', 'Travel'
];

const VALID_NAMES = ['Sam', 'Nat', 'Shared'];
const userStates = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome to Expense Tracker! Use /add to record an expense.');
});

bot.onText(/\/add/, (msg) => {
  const chatId = msg.chat.id;
  userStates[chatId] = {
    state: 'WAITING_AMOUNT',
    data: {
      transaction_date: new Date().toISOString().split('T')[0],
      transaction_mth: new Date().getMonth() + 1
    }
  };
  bot.sendMessage(chatId, 'Enter the amount (e.g., 12.50):');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text?.startsWith('/')) return;
  if (!userStates[chatId]) {
    bot.sendMessage(chatId, 'Use /add to start recording an expense.');
    return;
  }

  const state = userStates[chatId].state;
  const data = userStates[chatId].data || {};

  try {
    switch (state) {
      case 'WAITING_DATE':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
          bot.sendMessage(chatId, 'Please enter date in YYYY-MM-DD format:');
          return;
        }
        data.transaction_date = text;
        data.transaction_mth = parseInt(text.split('-')[1]);
        userStates[chatId] = { state: 'WAITING_AMOUNT', data };
        bot.sendMessage(chatId, 'Enter the amount (e.g., 12.50):');
        break;

      case 'WAITING_AMOUNT':
        const amount = parseFloat(text);
        if (isNaN(amount)) {
          bot.sendMessage(chatId, 'Please enter a valid number:');
          return;
        }
        data.transaction_amount = amount;
        userStates[chatId] = { state: 'WAITING_MERCHANT', data };
        bot.sendMessage(chatId, 'Enter the merchant name:');
        break;

      case 'WAITING_MERCHANT':
        data.merchant = text;
        userStates[chatId] = { state: 'WAITING_CATEGORY', data };
        const categories = VALID_CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n');
        bot.sendMessage(chatId, `Select category:\n${categories}`);
        break;

      case 'WAITING_CATEGORY':
        let category = VALID_CATEGORIES[parseInt(text) - 1] || text;
        if (!VALID_CATEGORIES.includes(category)) {
          bot.sendMessage(chatId, 'Please select a valid category:');
          return;
        }
        data.category = category;
        userStates[chatId] = { state: 'WAITING_NAME', data };
        bot.sendMessage(chatId, 'Who paid? (Sam/Nat/Shared):');
        break;

      case 'WAITING_NAME':
        if (!VALID_NAMES.includes(text)) {
          bot.sendMessage(chatId, 'Please enter Sam, Nat, or Shared:');
          return;
        }
        data.name = text;
        userStates[chatId] = { state: 'WAITING_DETAILS', data };
        bot.sendMessage(chatId, 'Enter details (or type "skip" for none):');
        break;

      case 'WAITING_DETAILS':
        data.details = text === 'skip' ? 'NULL' : text;
        
        const { error } = await supabase
          .from('expenses_raw')
          .insert([data]);

        if (error) throw error;

        bot.sendMessage(chatId, 
          `✅ Expense recorded!\n` +
          `Date: ${data.transaction_date}\n` +
          `Amount: $${data.transaction_amount}\n` +
          `Merchant: ${data.merchant}\n` +
          `Category: ${data.category}\n` +
          `Paid by: ${data.name}\n` +
          `Details: ${data.details}`
        );
        delete userStates[chatId];
        break;
    }
  } catch (error) {
    console.error('Error:', error);
    bot.sendMessage(chatId, 'Error occurred. Please try again with /add');
    delete userStates[chatId];
  }
});

console.log('Bot started...');