import express from "express";

const app = express();
const PORT = process.env.PORT || 10000; // Render provides PORT in env

app.get("/", (req, res) => res.send("🤖 Bot is alive!"));

app.listen(PORT, () => console.log(Server running on port ${PORT}));
import { Bot, session, InlineKeyboard } from "grammy";
import { storage } from "./storage";
import { GoogleGenerativeAI } from "@google/generative-ai";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "7988606688:AAFj6uKHHIqY0LyfbqrQEKpkrexowotEmTc";
const OWNER_ID = "8468885661";

// Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

interface SessionData {
  step: 'idle' | 'awaiting_proof' | 'confirming_category' | 'admin_edit_setting' | 'admin_edit_button' | 'admin_add_admin' | 'admin_remove_admin' | 'admin_add_category' | 'admin_add_plan_name' | 'admin_add_plan_price' | 'admin_add_plan_link' | 'admin_edit_cat_reply_type' | 'admin_edit_cat_reply_content' | 'admin_edit_payment_link';
  selectedPlanId?: number;
  selectedCategoryId?: number;
  editKey?: string;
  tempCategoryId?: number;
  tempPlanName?: string;
  tempPlanPrice?: string;
  tempReplyType?: 'text' | 'button' | 'link';
  tempPhotoFileId?: string;
  chatCount: number;
}

export const bot = new Bot<any>(BOT_TOKEN, {
  client: { timeout: 30000 }
});

bot.use(session({ initial: (): SessionData => ({ step: 'idle', chatCount: 0 }) }));

bot.use(async (ctx, next) => {
  if (ctx.from) {
    const tid = ctx.from.id.toString();
    storage.getUserByTelegramId(tid).then(user => {
      if (!user) {
        storage.createUser({
          telegramId: tid,
          username: ctx.from!.username || null,
          firstName: ctx.from!.first_name,
          lastName: ctx.from!.last_name || null,
          isAdmin: tid === OWNER_ID,
          isOwner: tid === OWNER_ID
        }).catch(console.error);
      }
    });
  }
  await next();
});

const isAdmin = async (ctx: any) => {
  const u = await storage.getUserByTelegramId(ctx.from?.id.toString() || "");
  return u?.isAdmin || u?.isOwner;
};

const isOwner = async (ctx: any) => {
  const u = await storage.getUserByTelegramId(ctx.from?.id.toString() || "");
  return u?.isOwner || u?.telegramId === OWNER_ID;
};

bot.command("admin", async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const keyboard = new InlineKeyboard()
    .text("📝 Edit Bot Msgs", "admin_edit_settings")
    .text("📁 Manage Categories", "admin_manage_cats")
    .row()
    .text("➕ Add Category", "admin_add_cat_prompt")
    .text("💳 Payment Link", "admin_edit_pay_link_prompt")
    .row();

  if (await isOwner(ctx)) {
    keyboard.text("👤 Add Admin", "admin_add_admin_prompt")
      .text("🚫 Remove Admin", "admin_remove_admin_list")
      .row();
  }

  await ctx.reply("🛠 Admin Panel:", { reply_markup: keyboard });
});

bot.callbackQuery("admin_main", async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const keyboard = new InlineKeyboard()
    .text("📝 Edit Bot Msgs", "admin_edit_settings")
    .text("📁 Manage Categories", "admin_manage_cats")
    .row()
    .text("➕ Add Category", "admin_add_cat_prompt")
    .text("💳 Payment Link", "admin_edit_pay_link_prompt")
    .row();

  if (await isOwner(ctx)) {
    keyboard.text("👤 Add Admin", "admin_add_admin_prompt")
      .text("🚫 Remove Admin", "admin_remove_admin_list")
      .row();
  }

  await ctx.editMessageText("🛠 Admin Panel:", { reply_markup: keyboard }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("admin_manage_cats", async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cats = await storage.getCategories();
  const kb = new InlineKeyboard();
  cats.forEach(c => kb.text(c.name, `admin_cat_opts:${c.id}`).row());
  kb.text("🔙 Back", "admin_main");
  await ctx.editMessageText("Select a category button to edit:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_cat_opts:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cid = parseInt(ctx.match[1]);
  const kb = new InlineKeyboard()
    .text("📦 Manage Plans", `admin_cat_plans:₹{cid}`)
    .text("➕ Add Plan", `admin_add_plan_prompt:${cid}`)
    .row()
    .text("✏️ Edit Reply Type", `admin_edit_cat_reply:${cid}`)
    .text("🗑 Delete Button", `admin_del_cat:${cid}`)
    .row()
    .text("🔙 Back", "admin_manage_cats");
  await ctx.editMessageText("Button Options:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_cat_plans:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cid = parseInt(ctx.match[1]);
  const plans = await storage.getPlans(cid);
  const kb = new InlineKeyboard();
  plans.forEach(p => kb.text(`${p.name} (${p.price})`, `admin_plan_opts:${p.id}`).row());
  kb.text("🔙 Back", `admin_cat_opts:${cid}`);
  await ctx.editMessageText("Manage Plans for this Category:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_plan_opts:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const pid = parseInt(ctx.match[1]);
  const plan = await storage.getPlan(pid);
  if (!plan) return;
  const kb = new InlineKeyboard()
    .text("🗑 Delete Plan", `admin_del_plan:${pid}`)
    .row()
    .text("🔙 Back", `admin_cat_plans:${plan.categoryId}`);
  await ctx.editMessageText(`Plan: ${plan.name}\nPrice: ${plan.price}\nLink: ${plan.link}\n\nOptions:`, { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_del_plan:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const pid = parseInt(ctx.match[1]);
  const plan = await storage.getPlan(pid);
  if (!plan) return;
  await storage.deletePlan(pid);
  await ctx.answerCallbackQuery("Plan deleted!").catch(() => {});
  const kb = new InlineKeyboard().text("🔙 Back", `admin_cat_plans:${plan.categoryId}`);
  await ctx.editMessageText("✅ Plan deleted.", { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery(/^admin_add_plan_prompt:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cid = parseInt(ctx.match[1]);
  ctx.session.step = 'admin_add_plan_name';
  ctx.session.tempCategoryId = cid;
  await ctx.reply("Send the name for the new plan (e.g., Monthly Access):");
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_edit_cat_reply:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cid = parseInt(ctx.match[1]);
  const kb = new InlineKeyboard()
    .text("Text Msg", `admin_set_cat_reply_type:${cid}:text`)
    .text("Button Menu", `admin_set_cat_reply_type:${cid}:button`)
    .text("External Link", `admin_set_cat_reply_type:${cid}:link`)
    .row()
    .text("🔙 Back", `admin_cat_opts:${cid}`);
  await ctx.editMessageText("Choose reply type for this button:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_set_cat_reply_type:(\d+):(.+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cid = parseInt(ctx.match[1]);
  const type = ctx.match[2] as 'text' | 'button' | 'link';
  ctx.session.step = 'admin_edit_cat_reply_content';
  ctx.session.tempCategoryId = cid;
  ctx.session.tempReplyType = type;
  await ctx.reply(`Send the content for the ${type} reply:`);
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("admin_edit_settings", async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const kb = new InlineKeyboard()
    .text("Welcome Msg", "admin_edit:welcome_message")
    .text("Payment Msg", "admin_edit:payment_message")
    .row()
    .text("🔙 Back", "admin_main");
  await ctx.editMessageText("Edit Bot Messages:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_edit:(.+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const key = ctx.match[1];
  ctx.session.step = 'admin_edit_setting';
  ctx.session.editKey = key;
  await ctx.reply(`Send the new text for ${key}:`);
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("admin_add_cat_prompt", async (ctx) => {
  if (!await isAdmin(ctx)) return;
  ctx.session.step = 'admin_add_category';
  await ctx.reply("Send the name for the new button:");
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("admin_edit_pay_link_prompt", async (ctx) => {
  if (!await isAdmin(ctx)) return;
  ctx.session.step = 'admin_edit_payment_link';
  const current = await storage.getSetting("payment_link");
  await ctx.reply(`Current Payment Link: ${current?.value || "Not set"}\n\nSend the new payment link/address:`);
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_del_cat:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const cid = parseInt(ctx.match[1]);
  await storage.deleteCategory(cid);
  await ctx.answerCallbackQuery("Button deleted!").catch(() => {});
  const cats = await storage.getCategories();
  const kb = new InlineKeyboard();
  cats.forEach(c => kb.text(c.name, `admin_cat_opts:${c.id}`).row());
  kb.text("🔙 Back", "admin_main");
  await ctx.editMessageText("Button deleted. Select another to edit:", { reply_markup: kb }).catch(() => {});
});

bot.callbackQuery("admin_add_admin_prompt", async (ctx) => {
  if (!await isOwner(ctx)) return;
  ctx.session.step = 'admin_add_admin';
  await ctx.reply("Send the User ID (from @userinfobot) to add as Admin:");
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("admin_remove_admin_list", async (ctx) => {
  if (!await isOwner(ctx)) return;
  const users = await storage.getUsers();
  const admins = users.filter(u => u.isAdmin && u.telegramId !== OWNER_ID);
  const kb = new InlineKeyboard();
  admins.forEach(u => kb.text(`Remove ${u.firstName}`, `admin_rem_conf:${u.id}`).row());
  kb.text("🔙 Back", "admin_main");
  await ctx.editMessageText("Select admin to remove:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_rem_conf:(\d+)$/, async (ctx) => {
  if (!await isOwner(ctx)) return;
  await storage.updateUserAdminStatus(parseInt(ctx.match[1]), false);
  await ctx.reply("✅ Admin removed.");
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.command("start", async (ctx) => {
  const welcome = await storage.getSetting("welcome_message");
  const cats = await storage.getCategories();
  const kb = new InlineKeyboard();
  cats.forEach(c => kb.text(c.name, `cat_click:${c.id}`).row());
  if (await isAdmin(ctx)) kb.text("🛠 Admin Panel", "admin_main").row();
  await ctx.reply(welcome?.value || "Welcome!", { reply_markup: kb, protect_content: true });
});

async function handleCategoryClick(ctx: any, cid: number) {
  const cat = await storage.getCategory(cid);
  if (!cat) return;
  
  const config = (cat.config || {}) as any;
  if (config.replyType === 'text') {
    await ctx.reply(config.replyContent || "No content.", { protect_content: true });
  } else if (config.replyType === 'link') {
    await ctx.reply("Click the link below:", {
      reply_markup: new InlineKeyboard().url("Open Link", config.replyContent || "#"),
      protect_content: true
    });
  } else {
    const plans = await storage.getPlans(cid);
    const kb = new InlineKeyboard();
    plans.forEach(p => kb.text(`${p.name} (${p.price})`, `plan_sel:${p.id}`).row());
    kb.text("🔙 Back", "list_cats_user");
    
    const text = cat.description || "Choose a plan:";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: kb }).catch(() => ctx.reply(text, { reply_markup: kb, protect_content: true }));
    } else {
      await ctx.reply(text, { reply_markup: kb, protect_content: true });
    }
  }
}

bot.callbackQuery(/^cat_click:(\d+)$/, async (ctx) => {
  const cid = parseInt(ctx.match[1]);
  await handleCategoryClick(ctx, cid);
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("list_cats_user", async (ctx) => {
  const cats = await storage.getCategories();
  const kb = new InlineKeyboard();
  cats.forEach(c => kb.text(c.name, `cat_click:${c.id}`).row());
  await ctx.editMessageText("Select a category:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^plan_sel:(\d+)$/, async (ctx) => {
  const pid = parseInt(ctx.match[1]);
  const plan = await storage.getPlan(pid);
  if (!plan) return;
  
  ctx.session.selectedPlanId = pid;
  ctx.session.selectedCategoryId = plan.categoryId || undefined;
  ctx.session.step = 'awaiting_proof';
  
  const payMsg = await storage.getSetting("payment_message");
  const payLink = await storage.getSetting("payment_link");
  
  const text = `${payMsg?.value || "Please pay."}\n\n💳 Payment Address: ${payLink?.value || "Not set"}\n\nPlan: ${plan.name}\nPrice: ${plan.price}`;
  await ctx.reply(text, { protect_content: true });
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^confirm_cat:(\d+)$/, async (ctx) => {
  const cid = parseInt(ctx.match[1]);
  const cat = await storage.getCategory(cid);
  if (!cat || !ctx.session.tempPhotoFileId || !ctx.session.selectedPlanId) return;

  const plan = await storage.getPlan(ctx.session.selectedPlanId);
  const file = await ctx.api.getFile(ctx.session.tempPhotoFileId);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

  const proof = await storage.createPaymentProof({
    userId: ctx.from.id.toString(),
    username: ctx.from.username || "Unknown",
    userFullName: `${ctx.from.first_name} ${ctx.from.last_name || ""}`,
    screenshotUrl: url,
    planId: ctx.session.selectedPlanId,
    status: 'pending'
  });

  const kb = new InlineKeyboard()
    .text("✅ Approve", `admin_approve:${proof.id}`)
    .text("❌ Reject", `admin_reject:${proof.id}`);

  const msg = `🔔 New Payment Proof\n\nUser: ${ctx.from.first_name} (ID: ${ctx.from.id})\nCategory: ${cat.name}\nPlan: ${plan?.name}\nPrice: ${plan?.price}`;
  
  const admins = (await storage.getUsers()).filter(u => u.isAdmin);
  for (const a of admins) {
    await ctx.api.sendPhoto(a.telegramId, ctx.session.tempPhotoFileId, {
      caption: msg,
      reply_markup: kb
    }).catch(() => ctx.api.sendMessage(a.telegramId, msg, { reply_markup: kb }));
  }

  ctx.session.step = 'idle';
  ctx.session.tempPhotoFileId = undefined;
  await ctx.editMessageText("✅ Proof sent! Admins will check.", { protect_content: true }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery("ask_all_cats", async (ctx) => {
  const cats = await storage.getCategories();
  const kb = new InlineKeyboard();
  cats.forEach(c => kb.text(c.name, `confirm_cat:${c.id}`).row());
  await ctx.editMessageText("Please select the correct category for your payment:", { reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery().catch(() => {});
});

bot.callbackQuery(/^admin_approve:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const proofId = parseInt(ctx.match[1]);
  const proof = await storage.getPaymentProof(proofId);
  if (!proof) return;

  const plan = await storage.getPlan(proof.planId!);
  await storage.updatePaymentProofStatus(proofId, 'approved');
  
  await bot.api.sendMessage(proof.userId, `✅ Payment Approved!\n\nPrivate Channel Link: ${plan?.link}`, { protect_content: true });
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message?.caption || "") + "\n\n✅ STATUS: APPROVED" }).catch(() => {});
  await ctx.answerCallbackQuery("Approved!").catch(() => {});
});

bot.callbackQuery(/^admin_reject:(\d+)$/, async (ctx) => {
  if (!await isAdmin(ctx)) return;
  const proofId = parseInt(ctx.match[1]);
  const proof = await storage.getPaymentProof(proofId);
  if (!proof) return;

  await storage.updatePaymentProofStatus(proofId, 'rejected');
  await bot.api.sendMessage(proof.userId, "❌ Payment Rejected. Invalid screenshot.", { protect_content: true });
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message?.caption || "") + "\n\n❌ STATUS: REJECTED" }).catch(() => {});
  await ctx.answerCallbackQuery("Rejected!").catch(() => {});
});

bot.on("message:photo", async (ctx) => {
  if (ctx.session.step === 'awaiting_proof' && ctx.session.selectedPlanId) {
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    ctx.session.tempPhotoFileId = photo.file_id;
    
    let catName = "Unknown";
    if (ctx.session.selectedCategoryId) {
      const cat = await storage.getCategory(ctx.session.selectedCategoryId);
      catName = cat?.name || "Unknown";
    }

    const kb = new InlineKeyboard()
      .text(`Yes, ${catName}`, `confirm_cat:${ctx.session.selectedCategoryId}`)
      .row()
      .text("No, show all categories", "ask_all_cats");

    await ctx.reply(`Is this payment for the category: ${catName}?`, { reply_markup: kb, protect_content: true });
    ctx.session.step = 'confirming_category';
  }
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  
  // Keyword Matching for Button Replies
  const cats = await storage.getCategories();
  const lowerText = text.toLowerCase();
  
  // High priority matching for exact words or phrases related to buttons
  const matchedCat = cats.find(c => {
    const catName = c.name.toLowerCase();
    return lowerText === catName || lowerText.includes(catName) || catName.includes(lowerText);
  });

  if (matchedCat) {
    return handleCategoryClick(ctx, matchedCat.id);
  }

  // Admin session handling
  if (ctx.session.step === 'admin_edit_setting' && ctx.session.editKey) {
    await storage.updateSetting(ctx.session.editKey, text);
    ctx.session.step = 'idle';
    return ctx.reply("✅ Setting updated.");
  }

  if (ctx.session.step === 'admin_edit_payment_link') {
    await storage.updateSetting("payment_link", text);
    ctx.session.step = 'idle';
    return ctx.reply("✅ Global Payment Link updated.");
  }

  if (ctx.session.step === 'admin_add_admin') {
    const user = await storage.getUserByTelegramId(text.trim());
    if (!user) return ctx.reply("User not found. They must /start the bot first.");
    await storage.updateUserAdminStatus(user.id, true);
    ctx.session.step = 'idle';
    return ctx.reply(`✅ ${user.firstName} added as admin.`);
  }

  if (ctx.session.step === 'admin_edit_cat_reply_content' && ctx.session.tempCategoryId) {
    const cid = ctx.session.tempCategoryId;
    const type = ctx.session.tempReplyType || 'button';
    const cat = await storage.getCategory(cid);
    if (cat) {
      const newConfig = { ...(cat.config as object || {}), replyType: type, replyContent: text };
      await storage.updateCategory(cid, { config: newConfig });
    }
    ctx.session.step = 'idle';
    return ctx.reply("✅ Button reply updated.");
  }

  if (ctx.session.step === 'admin_add_category') {
    await storage.createCategory({ name: text, description: "" });
    ctx.session.step = 'idle';
    return ctx.reply("✅ New button created.");
  }
  
  if (ctx.session.step === 'admin_add_plan_name') {
    ctx.session.tempPlanName = text;
    ctx.session.step = 'admin_add_plan_price';
    return ctx.reply("Send price (e.g., $50):");
  }
  
  if (ctx.session.step === 'admin_add_plan_price') {
    ctx.session.tempPlanPrice = text;
    ctx.session.step = 'admin_add_plan_link';
    return ctx.reply("Send the Private Channel Link for this plan:");
  }
  
  if (ctx.session.step === 'admin_add_plan_link' && ctx.session.tempCategoryId) {
    await storage.createPlan({
      categoryId: ctx.session.tempCategoryId,
      name: ctx.session.tempPlanName || "New Plan",
      price: ctx.session.tempPlanPrice || "$0",
      description: "",
      link: text
    });
    ctx.session.step = 'idle';
    return ctx.reply("✅ Plan added to category with unique link.");
  }

  // Common keywords for plans/prices
  if (lowerText.includes("price") || lowerText.includes("plan") || lowerText.includes("buy")) {
    const kb = new InlineKeyboard();
    cats.forEach(c => kb.text(c.name, `cat_click:${c.id}`).row());
    return ctx.reply("Check our premium plans here:", { reply_markup: kb, protect_content: true });
  }

  // Chatbot logic (Gemini)
  if (ctx.session.chatCount < 5) {
    try { model.startChat({
        history: [
          { role: "user", parts: [{ text: "You are a flirty, helpful virtual assistant for a premium membership bot. Your goal is to guide users to buy premium membership. Be playful and engaging. Always mention that they can check out the plans by sending 'plans' or clicking buttons." }] },
          { role: "model", parts: [{ text: "Hey there! 😉 I'm your premium assistant. I'm here to make sure you get the best experience. Want to see something special? Just ask about my premium plans! 💖" }] }
        ]
      });
      const result = await model.generateContent(text);
      const response = result.response.text();
      ctx.session.chatCount++;
      await ctx.reply(response, { protect_content: true });
    } catch (e) {
      console.error("Gemini Error:", e);
      await ctx.reply("I'm feeling a bit shy right now... 😉 Why don't you check out our premium plans instead?", { protect_content: true });
    }
  } else {
    const kb = new InlineKeyboard();
    cats.forEach(c => kb.text(c.name, `cat_click:${c.id}`).row());
    await ctx.reply("I've enjoyed our chat, but let's get serious... 😉 You really need to see what's waiting for you in our premium channels! Check them out here: ", { reply_markup: kb, protect_content: true });
    ctx.session.chatCount = 0; // Reset for next time or keep limited
  }
});

let isBotRunning = false;
let currentBotInstance: any = null;

export async function startBot() {
  if (isBotRunning) {
    console.log("Bot already running, skipping start.");
    return;
  }
  
  if (process.env.NODE_ENV !== 'production' && !process.env.REPLIT_DEV_DOMAIN) return;
  
  console.log("Starting Telegram Bot with 24/7 reactive logic...");
  isBotRunning = true;
  
  // Clean up any existing instances
  if (currentBotInstance) {
    try {
      await currentBotInstance.stop();
    } catch (e) {}
  }

  bot.api.setMyCommands([{ command: "start", description: "Start" }, { command: "admin", description: "Admin" }]).catch(() => {});
  
  bot.start({ 
    onStart: (bi) => console.log(`Bot @${bi.username} active`), 
    drop_pending_updates: true 
  }).catch(e => {
    isBotRunning = false;
    console.error("Bot encountered an error, restarting in 5 seconds...", e);
    setTimeout(startBot, 5000);
  });
  
  currentBotInstance = bot;

  // Keep-alive: Self-ping the Replit container to prevent sleeping
  if (process.env.REPLIT_DEV_DOMAIN) {
    setInterval(() => {
      const url = `https://${process.env.REPLIT_DEV_DOMAIN}/api/health`;
      fetch(url).then(r => r.json()).then(() => {}).catch(() => {});
    }, 5 * 60 * 1000); // Every 5 minutes
  }
}
bot.start({
  drop_pending_updates: true
});

  console.log("Bot is running 24*7...");

