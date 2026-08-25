require('dotenv').config(); // На ПК бере дані з .env, а на Render — з налаштувань сайту

const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);
const fs = require('fs');
const hardware = require('./data'); 
const txtsay = require('./txt'); 
const { canInstallComponent, calculatePerformance, calculateSystem } = require('./logic.js');

const bot = new Telegraf('8677059621:AAEtzqSZqlb2XZU9MrO9dt3h36ooKz3yaKA');
const DATA_FILE = './players.json';
const MARKET_FILE = './market.json';

let market = [];
let players = {};

// Глобальний обробник помилок Telegraf
bot.catch((err, ctx) => {
    console.error(`ошибка ${ctx.updateType}:`, err);
    try {
        ctx.reply(`ошибка ${err.message || err}`, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('натіко сильна ошибка шо аж загнати незміг', e);
    }
});

// Захист процесу Node.js від аварійного завершення
process.on('uncaughtException', (err) => {
    console.error('uncaughtException нахуй', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('хуєта якась з Promise (тіпа ош unhandledRejection)', reason);
});

// Завантаження даних з файлів
function loadData() {
    try {
        if (fs.existsSync(MARKET_FILE)) {
            try {
                const rawMarket = fs.readFileSync(MARKET_FILE, 'utf8');
                market = JSON.parse(rawMarket);
                console.log(`✅ Маркет завантажено, товарів: ${market.length}`);
            } catch (err) {
                console.error("❌ Помилка читання market.json:", err);
                market = [];
            }
        }

        if (fs.existsSync(DATA_FILE)) {
            try {
                const rawData = fs.readFileSync(DATA_FILE, 'utf8');
                players = JSON.parse(rawData); 
                console.log("✅ Базу гравців завантажено! Кількість:", Object.keys(players).length);
            } catch (err) {
                console.error("❌ Помилка читання players.json:", err);
                players = {};
            }
        }
    } catch (err) {
        console.error("loadData неробить", err);
    }
}
loadData();

function saveToFile() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(players, null, 2));
        fs.writeFileSync(MARKET_FILE, JSON.stringify(market, null, 2));
    } catch (err) { 
        console.error("негодин у файл зберегти уто:", err); 
    }
}

// Універсальний обробник помилок для відправки в чат та консоль
async function handleError(ctx, error, locationName) {
    console.error(`❌ Помилка в [${locationName}]:`, error);
    const errorMessage = error.message || error;
    
    if (ctx.callbackQuery) {
        await ctx.answerCbQuery(`ошибка ${errorMessage}, скинь скрін создателю бота`, { show_alert: true }).catch(() => {});
    }
    
    await ctx.reply(`ошибка ${locationName} ${errorMessage}`, { parse_mode: 'Markdown' }).catch(() => {});
}

// --- ДОПОМІЖНІ ФУНКЦІЇ ---
async function smartEdit(ctx, text, keyboard) {
    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message.photo) {
            await ctx.editMessageCaption(text, { parse_mode: 'Markdown', ...keyboard });
        } else {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
        }
    } catch (e) {
        await handleError(ctx, e, "smartEdit");
    }
}

function isOwner(ctx, targetId) {
    try {
        if (ctx.from.id !== parseInt(targetId)) {
            ctx.answerCbQuery("❌ Се не твоє!", { show_alert: true });
            return false;
        }
        return true;
    } catch (err) {
        console.error("ошибка isOwner:", err);
        return false;
    }
}

// --- МЕНЮ ЗБІРКИ ---
async function showBuildMenu(ctx, userId, buildIdx) {
    try {
        const player = players[userId];
        if (!player || !player.builds) return;
        const build = player.builds[buildIdx];
        if (!build) return;

        if (!build.components) {
            build.components = { cpu: null, motherboard: null, gpu: null, ram: null, storage: null, psu: null, case: null };
        }

        const comp = build.components;
        let text = `🖥 *Комп: ${build.name}*\n\n`;
        text += `♟ Проц: ${comp.cpu?.model || '❌'}\n`;
        text += `📟 Мамка: ${comp.motherboard?.model || '❌'}\n`;
        text += `🖼 Відюха: ${comp.gpu?.model || '❌'}\n`;
        text += `📟 ОЗУ: ${comp.ram?.model || '❌'}\n`;
        text += `🗃 Диск: ${comp.storage?.model || '❌'}\n`;
        text += `🔌 БЖ: ${comp.psu?.model || '❌'}\n`;
        text += `📦 Корпус: ${comp.case?.model || '❌'}\n`;

        const buildImg = comp.case?.image || 'https://habrastorage.org/getpro/habr/upload_files/78b/154/cc1/78b154cc12ad639fa423b1c1c8dcf1d5.jpg';

        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🛠 Змінити деталь', `mod_${userId}_${buildIdx}_list`)],
            [Markup.button.callback('🚀 ТЕСТІРУВАТИ', `test_build_${userId}_${buildIdx}`)],
            [Markup.button.callback('⬅ Назад', `backlist_${userId}`)]
        ]);

        if (ctx.callbackQuery) {
            await ctx.deleteMessage().catch(() => {});
        }
        await ctx.replyWithPhoto(buildImg, { caption: text, parse_mode: 'Markdown', ...kb });
    } catch (err) {
        await handleError(ctx, err, "showBuildMenu");
    }
}

// --- КОМАНДИ ---
bot.start(async (ctx) => {
    try {
        await ctx.reply('Здоров! Се зборка компа🖥. пиши /card');
    } catch (err) {
        await handleError(ctx, err, "start");
    }
});

bot.command('card', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (!players[userId]) players[userId] = { inventory: [], balance: 0, builds: [], lastOpen: 0 };
        const p = players[userId];
        
       const now = Date.now();
if (now - p.lastOpen < 3600000) {
    const timeLeft = 3600000 - (now - p.lastOpen);
    const minutesLeft = Math.floor(timeLeft / 60000);
    
    // Вибираємо рандомну фразу з масиву txtsay
    const randomPhrase = txtsay[Math.floor(Math.random() * txtsay.length)];
    
    return ctx.reply(`Почекай щи ${minutesLeft} минут! ${randomPhrase}`);
}

        const cats = Object.keys(hardware);
        const randomCat = cats[Math.floor(Math.random() * cats.length)];
        const item = hardware[randomCat][Math.floor(Math.random() * hardware[randomCat].length)];

        p.lastOpen = now;
        p.inventory.push({ ...item, type: randomCat });
        saveToFile();

        let description = `📦 Упало: **${item.model}**\n`;
        description += `💰 Ціна: **${item.price}** грн\n\n`;
        description += `⚙ **Характеристики:**\n`;

        if (randomCat === 'cpu') {
            description += `🧵 Ядра тай потоки: **${item.cores} ядра ${item.threads} потоки**\n⚡ Частота: **${item.frequency}**\n🔌 Сокет: **${item.socket}**`;
        } else if (randomCat === 'gpu') {
            description += `📟 Пам'ять: **${item.vram}**\n⚡ Жре: **${item.consumption}W**\n🚀 мощність: **${item.power} pts**`;
        } else if (randomCat === 'motherboard') {
            description += `🔌 Сокет: **${item.socket}**\n📟 Чіпсет: **${item.chipset}**\n📈 Тип ОЗУ: **${item.ramType}**`;
        } else if (randomCat === 'psu') {
            description += `🔌 мощність: **${item.wattage}W**\n📜 Сертифікат: **${item.cert}**\n🔥 Ризик: **${(item.risk * 100).toFixed(0)}%**`;
        } else if (randomCat === 'case') {
            description += `📦 Максимальний розмір під відюху: **${item.max_gpu_size}/4 слоти**\n🌪 Обдув: **${item.airflow}x**\n🛠 Матеріал: **${item.material}**`;
        } else if (randomCat === 'ram') {
            description += `📟 Память: **${item.capacity}**\n⚡ Скорість: **${item.speed}**мб/сек\n📈 Тип: **${item.ramType}**`;
        } else if (randomCat === 'storage') {
            description += `💿 Тип: **${item.type}**\n📦 Об'єм: **${item.capacity}**\n🚀 Скорість: **${item.speed}**мб/сек`;
        }

        const kb = Markup.inlineKeyboard([
            Markup.button.callback('⚙ Дії', `actions_${userId}_${p.inventory.length - 1}`)
        ]);

        try {
            await ctx.replyWithPhoto(item.image || 'https://via.placeholder.com/300', { 
                caption: description, 
                parse_mode: 'Markdown', 
                ...kb 
            });
        } catch (e) {
            await ctx.reply(description, { parse_mode: 'Markdown', ...kb });
        }
    } catch (err) {
        await handleError(ctx, err, "card");
    }
});

bot.command('inventory', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (!players[userId]) players[userId] = { inventory: [], balance: 0, builds: [] };
        const text = `🛠 *Твій склад*\nБаланс: ${players[userId].balance} грн`;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('♟ Процесори', `invcat_${userId}_cpu`), Markup.button.callback('🖼 Відюхи', `invcat_${userId}_gpu`)],
            [Markup.button.callback('📟 ОЗУ', `invcat_${userId}_ram`), Markup.button.callback('🗃 Диски', `invcat_${userId}_storage`)],
            [Markup.button.callback('🔌 Блоки', `invcat_${userId}_psu`), Markup.button.callback('📟 Мамки', `invcat_${userId}_motherboard`), Markup.button.callback('📦 Корпуси', `invcat_${userId}_case`)],
            [Markup.button.callback('📜 Усьо', `invcat_${userId}_all`)]
        ]);
        
        await ctx.replyWithPhoto('https://infotex.com.ua/images/professii/infotex-kurs-remont-komputera.jpg', { 
            caption: text, 
            parse_mode: 'Markdown', 
            ...keyboard 
        });
    } catch (err) {
        await handleError(ctx, err, "inventory");
    }
});

async function showShopCategories(ctx, targetMsg = false) {
    try {
        let msg = `🛒 *Магазин комплектуючих*\n\nТуй усьо новоє. Убери категорію, яку хоч поубзирати:`;
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🔳 Процесори', `shop_cat_cpu`)],
            [Markup.button.callback('🖼 Відеокарти', `shop_cat_gpu`)],
            [Markup.button.callback('📟 Оперативна пам\'ять (ОЗУ)', `shop_cat_ram`)],
            [Markup.button.callback('💾 Диски', `shop_cat_storage`)],
            [Markup.button.callback('🔌 Блоки живлення', `shop_cat_psu`)],
            [Markup.button.callback('📦 Корпуси', `shop_cat_case`)],
            [Markup.button.callback('🎛 Мамки', `shop_cat_motherboard`)],
            [Markup.button.callback('❌ Закрити магазин', 'shop_close')]
        ]);

        const photoUrl = 'https://images.unian.net/photos/2023_08/thumb_files/400_0_1692959536-3393.png';

        if (targetMsg && ctx.callbackQuery) {
            try {
                await ctx.editMessageCaption(msg, { parse_mode: 'Markdown', ...kb });
            } catch (e) {
                await ctx.replyWithPhoto(photoUrl, { caption: msg, parse_mode: 'Markdown', ...kb });
            }
        } else {
            await ctx.replyWithPhoto(photoUrl, {
                caption: msg,
                parse_mode: 'Markdown',
                ...kb
            });
        }
    } catch (err) {
        await handleError(ctx, err, "showShopCategories");
    }
}

bot.command('shop', async (ctx) => {
    try {
        await showShopCategories(ctx, false);
    } catch (err) {
        await handleError(ctx, err, "shop");
    }
});

bot.action('shop_main', async (ctx) => {
    try {
        await showShopCategories(ctx, true);
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "shop_main");
    }
});

bot.action('shop_close', async (ctx) => {
    try { 
        await ctx.deleteMessage(); 
    } catch(err) { 
        await handleError(ctx, err, "shop_close");
    }
});

bot.command('market', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const text = "🏪 ОЛХ\n\nУбери категорію товарів, яку хоч позирати:";
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🖥 Готові ПК', `market_cat_${userId}_pc`)],
            [Markup.button.callback('♟ Процесори', `market_cat_${userId}_cpu`), Markup.button.callback('🖼 Відеокарти', `market_cat_${userId}_gpu`)],
            [Markup.button.callback('📟 Мамки', `market_cat_${userId}_motherboard`), Markup.button.callback('📟 ОЗУ', `market_cat_${userId}_ram`)],
            [Markup.button.callback('🗃 Диски', `market_cat_${userId}_storage`), Markup.button.callback('🔌 Блоки пітанія', `market_cat_${userId}_psu`)],
            [Markup.button.callback('📦 Корпуси', `market_cat_${userId}_case`)],
            [Markup.button.callback('📜 Указати Усьо', `market_cat_${userId}_all`)]
        ]);

        await ctx.replyWithPhoto('https://m.olx.ua/olx_logo.png', {
            caption: text,
            parse_mode: 'Markdown',
            ...keyboard
        });
    } catch (err) {
        await handleError(ctx, err, "market");
    }
});

const ADMIN_ID = 7186946368; 

bot.command('reset', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (userId !== ADMIN_ID) return ctx.reply("🚫 ниє доступу адміна");

        if (players[userId]) {
            players[userId].lastOpen = Date.now() - (2 * 60 * 60 * 1000); 
            saveToFile();
            await ctx.reply("⌛ пиши /card.");
        } else {
            await ctx.reply("❌ херня якась");
        }
    } catch (err) {
        await handleError(ctx, err, "reset");
    }
});

// --- ОБРОБНИКИ СКЛАДУ ---
bot.action(/invcat_(\d+)_(\w+)/, async (ctx) => {
    try {
        const userId = ctx.match[1], cat = ctx.match[2];
        if (!isOwner(ctx, userId)) return;

        const player = players[userId];
        const filtered = player.inventory.map((item, idx) => ({item, idx})).filter(o => cat === 'all' || o.item.type === cat);

        if (filtered.length === 0) return ctx.answerCbQuery("Порожньо!", { show_alert: true });

        const activeObj = filtered[0];
        const text = `🗄 Категорія: *${cat.toUpperCase()}*\n\n🔎 Зараз вибрано: **${activeObj.item.model}**\n💰 Базова ціна: ${activeObj.item.price} грн`;
        
        const buttons = filtered.map(o => [Markup.button.callback((o.idx === activeObj.idx ? '🔹 ' : '') + o.item.model, `actions_${userId}_${o.idx}`)]);
        buttons.push([Markup.button.callback('⬅ Назад до складу', `backinv_${userId}`)]);

        const kb = Markup.inlineKeyboard(buttons);
        const itemImg = activeObj.item.image || 'https://via.placeholder.com/300';

        try {
            await ctx.deleteMessage().catch(()=>{});
            await ctx.replyWithPhoto(itemImg, { caption: text, parse_mode: 'Markdown', ...kb });
        } catch(e) {
            await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
        }
    } catch (err) {
        await handleError(ctx, err, "invcat");
    }
});

bot.action(/market_cat_(\d+)_(\w+)(?:_p(\d+))?/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const cat = ctx.match[2];
        const page = parseInt(ctx.match[3]) || 1;
        const itemsPerPage = 10;

        if (!isOwner(ctx, userId)) return;
        
        const filtered = market.map((offer, idx) => ({ offer, idx })).filter(item => {
            if (cat === 'all') return true; 
            if (cat === 'pc') return item.offer.isPC === true; 
            if (item.offer.isPC) return false;
            
            let itemType = item.offer.item && item.offer.item.type;
            if (itemType === 'cases') itemType = 'case';
            let searchCat = cat === 'cases' ? 'case' : cat;
            return itemType === searchCat;
        });

        if (filtered.length === 0) {
            return ctx.answerCbQuery("❌ Туй нич ниє", { show_alert: true });
        }

        const totalPages = Math.ceil(filtered.length / itemsPerPage);
        const startIndex = (page - 1) * itemsPerPage;
        const pageItems = filtered.slice(startIndex, startIndex + itemsPerPage);

        const buttons = pageItems.map(item => {
            const itemOffer = item.offer;
            return [Markup.button.callback(
                `${itemOffer.isPC ? '🖥' : '📦'} ${itemOffer.item.model} — ${itemOffer.price}грн`, 
                `market_buy_${itemOffer.offerId}`
            )];
        });

        const navButtons = [];
        if (page > 1) navButtons.push(Markup.button.callback('⬅️', `market_cat_${userId}_${cat}_p${page - 1}`));
        navButtons.push(Markup.button.callback(`📄 ${page}/${totalPages}`, 'none'));
        if (page < totalPages) navButtons.push(Markup.button.callback('➡️', `market_cat_${userId}_${cat}_p${page + 1}`));
        
        buttons.push(navButtons);
        buttons.push([Markup.button.callback('⬅ Назад до ОЛХ', `market_back_${userId}`)]);

        const text = `🏪 *Товари: ${cat.toUpperCase()}*\n(Сторінка ${page} з ${totalPages})`;

        await ctx.deleteMessage().catch(() => {});
        await ctx.reply(text, { 
            parse_mode: 'Markdown', 
            ...Markup.inlineKeyboard(buttons) 
        });
        
        ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "market_cat");
    }
});

bot.action(/market_back_(\d+)/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        if (!isOwner(ctx, userId)) return;
        
        const text = "🏪 **ОЛХ**\n\nУбери категорію товарів, яку хоч позирати:";
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🖥 Готові ПК', `market_cat_${userId}_pc`)],
            [Markup.button.callback('♟ Процесори', `market_cat_${userId}_cpu`), Markup.button.callback('🖼 Відеокарти', `market_cat_${userId}_gpu`)],
            [Markup.button.callback('📟 Мамки', `market_cat_${userId}_motherboard`), Markup.button.callback('📟 ОЗУ', `market_cat_${userId}_ram`)],
            [Markup.button.callback('🗃 Диски', `market_cat_${userId}_storage`), Markup.button.callback('🔌 Блоки пітанія', `market_cat_${userId}_psu`)],
            [Markup.button.callback('📦 Корпуси', `market_cat_${userId}_case`)],
            [Markup.button.callback('📜 Указати Усьо', `market_cat_${userId}_all`)]
        ]);
        
        await ctx.deleteMessage().catch(()=>{});
        await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    } catch (err) {
        await handleError(ctx, err, "market_back");
    }
});

bot.action(/backinv_(\d+)/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        if (!isOwner(ctx, userId)) return;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('♟ Процесори', `invcat_${userId}_cpu`), Markup.button.callback('🖼 Відюхи', `invcat_${userId}_gpu`)],
            [Markup.button.callback('📟 ОЗУ', `invcat_${userId}_ram`), Markup.button.callback('🗃 Диски', `invcat_${userId}_storage`)],
            [Markup.button.callback('🔌 Блоки', `invcat_${userId}_psu`), Markup.button.callback('📟 Мамки', `invcat_${userId}_motherboard`), Markup.button.callback('📦 Корпуси', `invcat_${userId}_case`)],
            [Markup.button.callback('📜 Усьо', `invcat_${userId}_all`)]
        ]);

        await ctx.deleteMessage().catch(()=>{});
        await ctx.reply(`🛠 *Твій склад*\nБаланс: ${players[userId].balance} грн`, { parse_mode: 'Markdown', ...keyboard });
    } catch (err) {
        await handleError(ctx, err, "backinv");
    }
});

bot.action(/shop_cat_(\w+)/, async (ctx) => {
    try {
        const cat = ctx.match[1];
        let hardwareCat = cat;
        if (cat === 'case' && !hardware.case && hardware.cases) hardwareCat = 'cases';

        const items = hardware[hardwareCat];
        if (!items || items.length === 0) {
            return ctx.answerCbQuery("❌ У сій категорії докіть нич ніє!", { show_alert: true });
        }

        const firstItem = items[0];
        let msg = `🛒 *Магазин | Товари у категорії ${cat.toUpperCase()}:*\n───────────────────\n`;
        msg += `🔹 **${firstItem.model}**\n`;
        if (firstItem.power) msg += ` ├ Потужність: ${firstItem.power} pts\n`;
        if (firstItem.speed) msg += ` ├ Скорість: ${firstItem.speed} MB/s\n`;
        if (firstItem.capacity) msg += ` ├ Об'єм пам'яті: ${firstItem.capacity}\n`;
        msg += ` └ Коштує: *${firstItem.price} грн*\n\n⚙ Для перегляду та покупки тисни кнопки нижче:`;

        const keyboard = items.map((item, idx) => [
            Markup.button.callback(`🛍 Купити ${item.model} (${item.price} грн)`, `buy_${cat}_${idx}`)
        ]);
        keyboard.push([Markup.button.callback('⬅️ Назад ся вернути', 'shop_main')]);

        try {
            await ctx.deleteMessage().catch(()=>{});
            await ctx.replyWithPhoto(firstItem.image || 'https://via.placeholder.com/300', {
                caption: msg,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard(keyboard)
            });
        } catch(e) {
            await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(keyboard) });
        }
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "shop_cat");
    }
});

bot.action(/^buy_(\w+)_(\d+)$/, async (ctx) => {
    try {
        const cat = ctx.match[1];
        const idx = parseInt(ctx.match[2]);
        const userId = ctx.from.id;

        let hardwareCat = cat;
        if (cat === 'case' && !hardware.case && hardware.cases) hardwareCat = 'cases';
        
        const item = hardware[hardwareCat]?.[idx];
        if (!item) return ctx.answerCbQuery("❌ Його уже ниє!", { show_alert: true });

        const player = players[userId];
        if (!player) return ctx.answerCbQuery("❌ Акаунта нема!");

        if (player.balance !== undefined && player.balance < item.price) {
            return ctx.answerCbQuery(`❌ Нехватає бабла! Треба щи ${item.price - player.balance} грн.`, { show_alert: true });
        }

        player.balance -= item.price;
        if (!player.inventory) player.inventory = [];

        player.inventory.push({ ...item, type: cat }); 
        saveToFile();

        await ctx.answerCbQuery(`✅ Купив "${item.model}"`, { show_alert: true });
    } catch (err) {
        await handleError(ctx, err, "buy");
    }
});

bot.action(/actions_(\d+)_(\d+)/, async (ctx) => {
    try {
        const userId = ctx.match[1], idx = ctx.match[2];
        if (!isOwner(ctx, userId)) return;
        const item = players[userId].inventory[idx];
        const sellPrice = Math.round(item.price / 1.2);
        
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('💸 Продати', `sell_${userId}_${idx}`)],
            [Markup.button.callback('🛒 укласти на ОЛХ', `olx_push_${userId}_${idx}`)],
            [Markup.button.callback('⬅ Назад', `invcat_${userId}_${item.type}`)]
        ]);

        const itemText = `шо чинити із *${item.model}*\n💵 Ціна продажу: *${sellPrice} грн*`;
        const img = item.image || 'https://via.placeholder.com/300';

        try {
            await ctx.deleteMessage().catch(()=>{});
            await ctx.replyWithPhoto(img, { caption: itemText, parse_mode: 'Markdown', ...kb });
        } catch(e) {
            await ctx.reply(itemText, { parse_mode: 'Markdown', ...kb });
        }
    } catch (err) {
        await handleError(ctx, err, "actions");
    }
});

bot.action(/olx_push_(\d+)_(\d+)/, async (ctx) => {
    try {
        const userId = parseInt(ctx.match[1]), idx = parseInt(ctx.match[2]);
        if (!isOwner(ctx, userId)) return;

        players[userId].awaitingPrice = idx;
        saveToFile();

        await ctx.reply(`💸 Напиши ціну для ${players[userId].inventory[idx].model}:`);
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "olx_push");
    }
});

bot.action(/sell_build_init_(\d+)_(\d+)/, async (ctx) => {
    try {
        const [_, userId, bIdx] = ctx.match;
        if (!isOwner(ctx, userId)) return;

        const player = players[userId];
        const build = player.builds[bIdx];

        const res = typeof calculateSystem === 'function' ? calculateSystem(build) : calculatePerformance(build);

        if (res.error) {
            return ctx.answerCbQuery("❌ Комп неробить, такоє гіно продати немош", { show_alert: true });
        }

        let recommendedPrice = res.fps * 50;
        if (res.temp < 60) recommendedPrice += 1500;
        if (res.temp > 85) recommendedPrice -= 1000;
        recommendedPrice = Math.max(2000, recommendedPrice);

        player.awaitingBuildPrice = {
            buildIdx: parseInt(bIdx),
            recommendedPrice: recommendedPrice,
            specs: res 
        };
        saveToFile();

        await ctx.reply(`🏪 Укладення ПК "${build.name}" на ОЛХ\n\n` +
                  `🎮 Потужність: ${res.fps} FPS | 🌡 Температура: ${res.temp}°C\n\n` +
                  `⌨ Напиши в чат ціну, за яку хоч продати сись комп:\n` +
                  `📢 (Май фоса ціна: ${recommendedPrice} грн)`);
                  
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "sell_build_init");
    }
});

bot.action(/^market_buy_(\d+)$/, async (ctx) => {
    try {
        const buyerId = ctx.from.id;
        const targetOfferId = parseInt(ctx.match[1]);
        
        const offerIdx = market.findIndex(o => String(o.offerId) === String(targetOfferId));
        const offer = market[offerIdx];

        if (!offer) {
            return ctx.answerCbQuery("Товар зник!", { show_alert: true });
        }
        
        if (!offer.item || !offer.price) {
            market.splice(offerIdx, 1);
            saveToFile();
            return ctx.answerCbQuery("Цей товар був пошкоджений (старий формат), я його видалив.", { show_alert: true });
        }
        if (offer.sellerId === buyerId) return ctx.answerCbQuery("❌ Ти не годин купити, бо уто твій комп/деталь!", { show_alert: true });

        if (!players[buyerId]) players[buyerId] = { inventory: [], balance: 0, builds: [] };
        const buyer = players[buyerId];

        if (buyer.balance < offer.price) {
            return ctx.answerCbQuery(`❌ Мало бабла! Треба ${offer.price} грн.`, { show_alert: true });
        }

        buyer.balance -= offer.price; 
        if (players[offer.sellerId]) {
            players[offer.sellerId].balance += offer.price; 
        }

        if (offer.isPC) {
            const components = offer.item.components || {};
            
            buyer.builds.push({
                name: offer.item.model.replace("комп: ", ""), 
                components: { 
                    cpu: components.cpu || null,
                    motherboard: components.motherboard || null,
                    gpu: components.gpu || null,
                    ram: components.ram || null,
                    storage: components.storage || null,
                    psu: components.psu || null,
                    case: components.case || null
                }
            });
            await ctx.reply(`✅ Ти купив комп *"${offer.item.model}"* за ${offer.price} грн!\n🖥 позирай у /build`, { parse_mode: 'Markdown' });
        } else {
            buyer.inventory.push(offer.item); 
            await ctx.reply(`✅ Ти купив ${offer.item.model} за ${offer.price} грн!`);
        }

        market.splice(offerIdx, 1); 
        saveToFile();
        
        await ctx.answerCbQuery("🎉 Вітаю тя з покупков!");
        await ctx.deleteMessage().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "market_buy");
    }
});

bot.action(/sell_(\d+)_(\d+)/, async (ctx) => {
    try {
        const userId = ctx.match[1], idx = ctx.match[2];
        if (!isOwner(ctx, userId)) return;
        const player = players[userId];
        const item = player.inventory[idx];
        if (item) {
            player.balance += Math.round(item.price / 1.2);
            player.inventory.splice(idx, 1);
            saveToFile();
            await ctx.answerCbQuery("Продано!");
            return ctx.deleteMessage().catch(()=>{});
        }
    } catch (err) {
        await handleError(ctx, err, "sell");
    }
});

// --- ОБРОБНИКИ ЗБІРКИ ---
bot.command('build', async (ctx) => {
    try {
        const userId = ctx.from.id;
        if (!players[userId]) players[userId] = { inventory: [], balance: 0, builds: [] };
        const buttons = players[userId].builds.map((b, i) => [Markup.button.callback(`🖥 ${b.name}`, `open_build_${userId}_${i}`)]);
        buttons.push([Markup.button.callback('➕ Новий ПК', `newbuild_${userId}`)]);
        await ctx.reply("Твої збірки:", Markup.inlineKeyboard(buttons));
    } catch (err) {
        await handleError(ctx, err, "build");
    }
});

bot.action(/newbuild_(\d+)/, async (ctx) => {
    try {
        if (!isOwner(ctx, ctx.match[1])) return;
        players[ctx.from.id].awaitingBuildName = true;
        await ctx.reply("Напиши назву для нового ПК:");
    } catch (err) {
        await handleError(ctx, err, "newbuild");
    }
});

bot.action(/test_build_(\d+)_(\d+)/, async (ctx) => {
    try {
        await ctx.answerCbQuery("Запуск тесту...").catch(() => {}); 
        
        const userId = ctx.match[1];
        const bIdx = parseInt(ctx.match[2]);
        
        const player = players[userId];
        if (!player || !player.builds[bIdx]) {
            return ctx.reply("❌ Збірка не знайдена!");
        }

        const build = player.builds[bIdx];
        const res = calculatePerformance(build);
        
        if (res.error) {
            return ctx.reply(res.error);
        }

        // Перевірка на вибух БЖ
        const psu = build.components?.psu;
        let psuRisk = 0;
        if (psu && psu.risk !== undefined) {
            psuRisk = parseFloat(psu.risk);
        }

        const diceRoll = Math.random(); 
        const buildExploded = res.isExploded || (psuRisk > 0 && diceRoll < psuRisk);

        if (buildExploded) {
            const explodedName = build.name;
            players[userId].builds.splice(bIdx, 1);
            saveToFile();

            let explodeMsg = `💥 *БАБАХ! Твій БЖ ся взовав* 💥\n\n`;
            explodeMsg += `💀 Комп *"${explodedName}"* згорів гет, нич ся не лишило!\n\n`;
            explodeMsg += `🔌 Твій БЖ: *${psu?.model || 'NoName'}*\n`;
            explodeMsg += `🎯 Шанс взриву: *${(psuRisk * 100).toFixed(0)}%*\n`;
            explodeMsg += `⚡️ Система їсть: *${res.consumption || 0} W*\n\n`;
            explodeMsg += `👉 Дітваку, запам'ятай: кіть купуєш дешманський чи нонейм блок, то збирай гроші на новий комп.`;

            const kb = Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Вертатись до меню', `backlist_${userId}`)]
            ]);

            if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
                return ctx.editMessageCaption(explodeMsg, { parse_mode: 'Markdown', ...kb });
            } else {
                return ctx.editMessageText(explodeMsg, { parse_mode: 'Markdown', ...kb });
            }
        }

        // --- ОБРАХУНОК ОЦІНКИ WINDOWS 7 (1.0 - 7.9) ---
        const calcWin7Score = (val, maxVal) => Math.min(7.9, Math.max(1.0, parseFloat((1.0 + (val / maxVal) * 6.9).toFixed(1))));

        const comp = build.components;
        const cpuScore = calcWin7Score((comp.cpu?.cores || 1) * (comp.cpu?.power || 30), 400);

        // Обчислення оцінки графіки (дискретна або вбудована)
        let gpuScoreVal = 0;
        if (comp.gpu) {
            gpuScoreVal = (comp.gpu.power || 20) * (parseInt(comp.gpu.vram) || 2);
        } else if (comp.cpu && comp.cpu.igpu) {
            gpuScoreVal = 15; // Мінімальна очікувана потужність для встройки
        }
        const gpuScore = calcWin7Score(gpuScoreVal, 1000);

        const ramScore = calcWin7Score(parseInt(comp.ram?.capacity) || 2, 32);
        const storageScore = comp.storage?.type === 'HDD' ? calcWin7Score(comp.storage?.speed || 50, 200) : calcWin7Score(comp.storage?.speed || 500, 3500);

        const baseIndex = Math.min(cpuScore, gpuScore, ramScore, storageScore).toFixed(1);

        // --- АНАЛІЗ БОТЛНЕКІВ ТА ПОРАДИ ---
        let tips = [];
        if (cpuScore - gpuScore >= 2.0) {
            if (!comp.gpu && comp.cpu?.igpu) {
                tips.push("⚠️ сидиш на встройці, для ігор треба нормальну відюху");
            } else {
                tips.push("⚠️ відяха бєся в сотку а процови похуй, купи покруче відюху");
            }
        } else if (gpuScore - cpuScore >= 2.0) {
            tips.push("⚠️ процесор в сотку ся б'є, купи покруче проц");
        }

        if (comp.storage?.type === 'HDD' || (comp.storage?.speed && comp.storage.speed < 200)) {
            tips.push("🐌 сука віндовс 10/11 на хдд ставити, тупий");
        }

        if (parseInt(comp.ram?.capacity) <= 4) {
            tips.push("📉 4гб озу доста мало у нашому 2026 році, хром уже половину ізість, купи більше озу");
        }

        if (comp.psu && res.consumption && comp.psu.wattage < res.consumption + 50) {
            tips.push("⚡ акуратно, твому бж мало хуйово, поклади нормальний");
        }

        if (tips.length === 0) {
            tips.push("✅ чотко! Усьо збалансовано, ботлнеків ниє.");
        }
       
        // --- ФОРМУВАННЯ ПОВІДОМЛЕННЯ ---
        let msg = ` *Індекс продуктивності Windows "${build.name}":*\n`;
        msg += `───────────────────\n`;
        msg += `🔲 Процесор: *${cpuScore}*\n`;
        msg += `📟 Пам'ять (RAM): *${ramScore}*\n`;
        msg += `🎮 Графіка: *${gpuScore}*\n`;
        msg += `💾 основний диск: *${storageScore}*\n`;
        msg += `───────────────────\n`;
        msg += `💻 **Основна оцінка:** *${baseIndex}* (визначається найнижчою)\n\n`;

        msg += `🎮 *Тест у бавках:*\n`;
        msg += ` ├ 🔫 CS 2 (${res.presets.cs2}): *${res.fps.cs2 > 0 ? res.fps.cs2 + ' FPS' : '❌'}*\n`;
        msg += ` ├ 🚛 ETS 2 (${res.presets.ets2}): *${res.fps.ets2 > 0 ? res.fps.ets2 + ' FPS' : '❌'}*\n`;
        msg += ` ├ 🚗 GTA 5 (${res.presets.gta5}): *${res.fps.gta5 > 0 ? res.fps.gta5 + ' FPS' : '❌'}*\n`;
        msg += ` └ 🦾 Cyberpunk (${res.presets.cyberpunk}): *${res.fps.cyberpunk > 0 ? res.fps.cyberpunk + ' FPS' : '❌'}*\n\n`;

        msg += `💡 нюанс твоєї збірки: \n${tips.join('\n')}\n\n`;
        msg += `🌡 Температура: *${res.temp || '??'}°C* | ⚡ Їсть: *${res.consumption || 0} W*`;

        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Назад до зборки', `back_to_build_${userId}_${bIdx}`)]
        ]);

        const isPhoto = ctx.callbackQuery.message && (ctx.callbackQuery.message.photo || ctx.callbackQuery.message.caption !== undefined);

        if (isPhoto) {
            await ctx.editMessageCaption(msg, { parse_mode: 'Markdown', ...kb });
        } else {
            await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...kb });
        }
    } catch (err) {
        await handleError(ctx, err, "test_build");
    }
});

bot.action(/back_to_build_(\d+)_(\d+)/, async (ctx) => {
    try {
        const userId = parseInt(ctx.match[1]);
        const buildIdx = parseInt(ctx.match[2]);
        await showBuildMenu(ctx, userId, buildIdx);
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "back_to_build");
    }
});

bot.action(/backlist_(\d+)/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        if (!isOwner(ctx, userId)) return;
        const buttons = players[userId].builds.map((b, i) => [Markup.button.callback(`🖥 ${b.name}`, `open_build_${userId}_${i}`)]);
        buttons.push([Markup.button.callback('➕ Новий ПК', `newbuild_${userId}`)]);
        await smartEdit(ctx, "Твої зборки:", Markup.inlineKeyboard(buttons));
    } catch (err) {
        await handleError(ctx, err, "backlist");
    }
});

bot.action(/open_build_(\d+)_(\d+)/, async (ctx) => {
    try {
        const userId = parseInt(ctx.match[1]);
        const buildIdx = parseInt(ctx.match[2]);
        if (!isOwner(ctx, userId)) return;
        await ctx.answerCbQuery().catch(() => {});
        await showBuildMenu(ctx, userId, buildIdx);
    } catch (err) {
        await handleError(ctx, err, "open_build");
    }
});

bot.action(/mod_(\d+)_(\d+)_list/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const bIdx = parseInt(ctx.match[2]);
        const player = players[userId];
        const build = player.builds[bIdx];

        const cpu = build.components.cpu;
        const gpu = build.components.gpu;

        // Формуємо текст для відеокарти
        let gpuText = "🚫";
        if (gpu) {
            gpuText = gpu.model;
        } else if (cpu && cpu.igpu) {
            gpuText = `Вбудована (${cpu.igpu})`;
        }

        let desc = `🖥 *ПК: "${build.name}"*\n`;
        desc += `───────────────────\n`;
        desc += `🔳 Процесор: ${cpu ? cpu.model : "🚫"}\n`;
        desc += `🖼 Відеокарта: ${gpuText}\n`;
        desc += `📟 ОЗУ: ${build.components.ram ? build.components.ram.model : "🚫"}\n`;
        desc += `🎛 мамка: ${build.components.motherboard ? build.components.motherboard.model : "🚫"}\n`;
        desc += `🔌 Блок живлення: ${build.components.psu ? build.components.psu.model : "🚫"}\n`;
        desc += `💾 SSD/HDD: ${build.components.storage ? build.components.storage.model : "🚫"}\n`;
        desc += `───────────────────\n\n`;
        desc += `🛠 *Шо хоч поміняти?*`;

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('♟ Процесор', `mod_${userId}_${bIdx}_cpu`)],
            [Markup.button.callback('🖼 Відеокарта', `mod_${userId}_${bIdx}_gpu`)],
            [Markup.button.callback('📟 ОЗУ', `mod_${userId}_${bIdx}_ram`)],
            [Markup.button.callback('💾 Диск', `mod_${userId}_${bIdx}_storage`)],
            [Markup.button.callback('🔌 Блок живлення', `mod_${userId}_${bIdx}_psu`)],
            [Markup.button.callback('📦 Корпус', `mod_${userId}_${bIdx}_case`)],
            [Markup.button.callback('🎛 мамка', `mod_${userId}_${bIdx}_motherboard`)],
            [Markup.button.callback('⬅ Назад до ПК', `back_to_build_${userId}_${bIdx}`)]
        ]);

        await ctx.editMessageCaption(desc, {
            parse_mode: 'Markdown',
            ...keyboard
        });
        
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "mod_list");
    }
});

bot.action(/mod_(\d+)_(\d+)_(cpu|gpu|ram|storage|psu|case|motherboard)/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const bIdx = parseInt(ctx.match[2]);
        const type = ctx.match[3];

        const player = players[userId];
        const build = player.builds[bIdx];
        
        const items = player.inventory.filter(item => {
            if (item.type !== type) return false;

            const testBuild = JSON.parse(JSON.stringify(build));
            if (!testBuild.components) testBuild.components = {};
            
            testBuild.components[type] = item;
            const check = canInstallComponent(testBuild, item);
            return check.can !== false;
        });

        if (items.length === 0) {
            return ctx.answerCbQuery(`❌ нема пудходящих ${type} у інвентарі!`, { show_alert: true });
        }

        const buttons = items.map((item, index) => {
            const invIdx = player.inventory.findIndex(i => i === item);
            return [Markup.button.callback(` ${item.model}`, `set_${userId}_${bIdx}_${type}_${invIdx}`)];
        });

        if (build.components[type]) {
            buttons.unshift([Markup.button.callback('❌ уняти', `remove_${userId}_${bIdx}_${type}`)]);
        }
        buttons.push([Markup.button.callback('⬅️ Назад', `mod_${userId}_${bIdx}_list`)]);

        await ctx.editMessageCaption(`🛠 *убери шо хоч покласти із ${type} у сись комп*`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(buttons)
        });
        
        await ctx.answerCbQuery().catch(() => {});
    } catch (err) {
        await handleError(ctx, err, "mod_component");
    }
});

bot.action(/remove_(\d+)_(\d+)_(cpu|gpu|ram|storage|psu|case|motherboard)/, async (ctx) => {
    try {
        const userId = ctx.match[1];
        const bIdx = parseInt(ctx.match[2]);
        const type = ctx.match[3];

        const player = players[userId];
        const build = player.builds[bIdx];

        if (build.components[type]) {
            player.inventory.push(build.components[type]);
            delete build.components[type];
            saveToFile();
            
            await ctx.answerCbQuery("✅ Деталь вийнято!", { show_alert: false });
        } else {
            await ctx.answerCbQuery("❌ Тут пусто.", { show_alert: true });
        }

        await showBuildMenu(ctx, userId, bIdx);
    } catch (err) {
        await handleError(ctx, err, "remove");
    }
});

bot.action(/set_(\d+)_(\d+)_(\w+)_(\d+)/, async (ctx) => {
    try {
        const [_, userIdStr, bIdxStr, type, invIdxStr] = ctx.match;
        const userId = parseInt(userIdStr);
        const bIdx = parseInt(bIdxStr);
        const invIdx = parseInt(invIdxStr);

        if (!isOwner(ctx, userId)) return ctx.answerCbQuery("❌ уто не твій комп!", { show_alert: true });

        const player = players[userId];
        const build = player?.builds?.[bIdx];
        const newItem = player?.inventory?.[invIdx];

        if (!newItem) return ctx.answerCbQuery("❌ Деталі ниє!", { show_alert: true });

        const check = canInstallComponent(build, newItem);
        if (!check.can) {
            return ctx.answerCbQuery(check.reason || "❌ся деталь не кладеться у твій комп", { show_alert: true });
        }

        if (!build.components) build.components = {};

        if (build.components[type] && build.components[type].model) {
            player.inventory.push(build.components[type]);
        }

        build.components[type] = { ...newItem };
        player.inventory.splice(invIdx, 1);

        saveToFile();
        await ctx.answerCbQuery(`✅ т поклав ${newItem.model}`);
        
        return showBuildMenu(ctx, userId, bIdx);
    } catch (err) {
        await handleError(ctx, err, "set");
    }
});

bot.action(/unmount_(\d+)_(\d+)_(\w+)/, async (ctx) => {
    try {
        const [_, userId, bIdx, type] = ctx.match;
        if (!isOwner(ctx, userId)) return;
        
        const player = players[userId];
        const item = player.builds[bIdx].components[type];
        if (item) {
            player.inventory.push(item);
            player.builds[bIdx].components[type] = null;
            saveToFile();
        }
        await showBuildMenu(ctx, userId, bIdx);
    } catch (err) {
        await handleError(ctx, err, "unmount");
    }
});

// --- ОБРОБКА ВВЕДЕННЯ ТЕКСТУ (ЦІНИ ТА НАЗВИ) ---
bot.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const player = players[userId];
        if (!player) return;

        if (player.awaitingBuildName) {
            player.builds.push({ name: ctx.text, components: { cpu: null, motherboard: null, gpu: null, ram: null, storage: null, psu: null, case: null } });
            delete player.awaitingBuildName;
            saveToFile();
            return showBuildMenu(ctx, userId, player.builds.length - 1);
        }

        if (player.awaitingPrice !== undefined) {
            const itemIdx = player.awaitingPrice;
            const price = parseInt(ctx.text);

            if (isNaN(price) || price <= 0) return ctx.reply("❌ пиши числами");

            const item = player.inventory[itemIdx];
            if (!item) {
                delete player.awaitingPrice;
                return ctx.reply("❌ його нема у тя");
            }

            market.push({ offerId: Date.now(), sellerId: userId, isPC: false, price: price, item: item });
            player.inventory.splice(itemIdx, 1);
            delete player.awaitingPrice;
            saveToFile();

            return ctx.reply(`✅ Твій ${item.model} укладений на ОЛХ за ${price} грн!`);
        }

        if (player.awaitingBuildPrice !== undefined) {
            const price = parseInt(ctx.text);
            if (isNaN(price) || price <= 0) return ctx.reply("❌ пиши числами");

            const info = player.awaitingBuildPrice;
            const build = player.builds[info.buildIdx];

            if (!build) {
                delete player.awaitingBuildPrice;
                return ctx.reply("❌ Зборки нема");
            }

            market.push({
                offerId: Date.now(),
                sellerId: userId,
                isPC: true,
                price: price,
                item: {
                    model: `комп: ${build.name}`,
                    fps: info.specs.fps,
                    temp: info.specs.temp,
                    components: build.components
                }
            });

            player.builds.splice(info.buildIdx, 1);
            delete player.awaitingBuildPrice;
            saveToFile();

            return ctx.reply(`✅ Твій комп "${build.name}" укладений на ОЛХ за ${price} грн!`);
        }
    } catch (err) {
        await handleError(ctx, err, "text handler");
    }
});

bot.telegram.setMyCommands([
    { command: 'card', description: 'Получити карту' },
    { command: 'inventory', description: 'Склад' },
    { command: 'build', description: 'Зборка пк' },
    { command: 'shop', description: 'Магазин' },
    { command: 'market', description: 'ОЛХ' },
    { command: 'reset', description: 'Скинути таймер' },
]).then(() => console.log('📜 Меню швидких команд успішно оновлено!'));

bot.launch().then(() => console.log('🤖 Бот успішно запущений та готовий збирати залізо!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));