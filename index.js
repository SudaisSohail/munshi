import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import pino from 'pino';
import fs from 'fs';
import os from 'os';
import path from 'path';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'http://localhost:3000';
const PHONE_NUMBER = '923460392313';

// ---- Multi-key pools ----
// .env needs: GROQ_API_KEY_1, GROQ_API_KEY_2, ... (as many as you have), GEMINI_API_KEY_1, GEMINI_API_KEY_2, ...
function loadKeys(prefix) {
    const keys = [];
    let n = 1;
    while (process.env[`${prefix}_${n}`]) {
        keys.push(process.env[`${prefix}_${n}`]);
        n++;
    }
    if (!keys.length) throw new Error(`No keys found — set ${prefix}_1 (and optionally _2, _3, _4...) in .env`);
    return keys;
}

class KeyPool {
    constructor(keys, label) {
        this.keys = keys;
        this.label = label;
        this.exhaustedUntil = new Map();
    }
    available() {
        const now = Date.now();
        return this.keys.filter((k) => !this.exhaustedUntil.has(k) || this.exhaustedUntil.get(k) <= now);
    }
    markExhausted(key, durationMs = 60 * 1000) {
        this.exhaustedUntil.set(key, Date.now() + durationMs);
        const seconds = Math.round(durationMs / 1000);
        console.warn(`⚠️ ${this.label} key ...${key.slice(-4)} resting for ${seconds}s. ${this.available().length}/${this.keys.length} ${this.label} keys still available.`);
    }
}

function isRateLimitError(err) {
    const status = err?.status || err?.code;
    const msg = (err?.message || '').toLowerCase();
    return status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('resource_exhausted');
}

// NEW: figures out the REAL cooldown from the error instead of assuming a full day every time
function getRetryDelayMs(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('perday')) return 24 * 60 * 60 * 1000; // explicit daily quota — genuinely a day
    const secMatch = (err?.message || '').match(/retrydelay"?\s*:?\s*"?(\d+(?:\.\d+)?)s/i) || (err?.message || '').match(/retry in ([\d.]+)s/i);
    if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000) + 2000;
    const retryAfterHeader = err?.headers?.['retry-after'];
    if (retryAfterHeader) return parseInt(retryAfterHeader, 10) * 1000 + 2000;
    return 60 * 1000; // sensible default for an unlabeled 429 — assume per-minute, not per-day
}

const groqPool = new KeyPool(loadKeys('GROQ_API_KEY'), 'Groq');
const geminiPool = new KeyPool(loadKeys('GEMINI_API_KEY'), 'Gemini');

// ---- Data helpers ----
async function ensureSeller(whatsappNumber, nativeLanguage) {
    const { data: existing } = await supabase.from('sellers').select('id').eq('whatsapp_number', whatsappNumber).maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase.from('sellers').insert({ whatsapp_number: whatsappNumber, language: nativeLanguage }).select('id').single();
    if (error) throw error;
    return created.id;
}

async function getSellerRow(whatsappNumber) {
    const { data } = await supabase.from('sellers').select('id, store_name').eq('whatsapp_number', whatsappNumber).maybeSingle();
    return data || null;
}

async function ensureBuyer(whatsappNumber, nativeLanguage) {
    const { data: existing } = await supabase.from('buyers').select('id').eq('whatsapp_number', whatsappNumber).maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase.from('buyers').insert({ whatsapp_number: whatsappNumber, language: nativeLanguage }).select('id').single();
    if (error) throw error;
    return created.id;
}

async function getBuyerRow(whatsappNumber) {
    const { data } = await supabase.from('buyers').select('id').eq('whatsapp_number', whatsappNumber).maybeSingle();
    return data || null;
}

async function fetchActiveProducts(sellerId) {
    const { data, error } = await supabase.from('products').select('*').eq('seller_id', sellerId).eq('status', 'active');
    if (error) { console.error('Fetch products failed:', error); return []; }
    return data || [];
}

async function uploadImages(images, sellerId) {
    const urls = [];
    for (let i = 0; i < images.length; i++) {
        const buffer = Buffer.from(images[i], 'base64');
        const path_ = `${sellerId}/${Date.now()}_${i}.jpg`;
        const { error } = await supabase.storage.from('product-images').upload(path_, buffer, { contentType: 'image/jpeg' });
        if (error) { console.error('Image upload failed:', error); continue; }
        const { data } = supabase.storage.from('product-images').getPublicUrl(path_);
        urls.push(data.publicUrl);
    }
    return urls;
}

function parseNumericPrice(retailPriceString) {
    if (!retailPriceString) return null;
    const digitsOnly = String(retailPriceString).replace(/[^0-9]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : null;
}

function resolveProductMatch(products, reference, priceHint, colorHint) {
    let candidates = products;

    if (reference) {
        const ref = reference.toLowerCase();
        const nameMatches = candidates.filter((p) => p.product_name.toLowerCase().includes(ref) || ref.includes(p.product_name.toLowerCase()));
        if (nameMatches.length) candidates = nameMatches;
    }

    if (candidates.length > 1 && colorHint) {
        const byColor = candidates.filter((p) => p.color && p.color.toLowerCase().includes(String(colorHint).toLowerCase()));
        if (byColor.length) candidates = byColor;
    }

    if (candidates.length > 1 && priceHint != null) {
        const byPrice = candidates.filter((p) => parseNumericPrice(p.retail_price) === priceHint);
        if (byPrice.length) candidates = byPrice;
    }

    return candidates;
}

function matchesKeywords(product, keywords) {
    if (!keywords || !keywords.length) return true;
    const haystack = [product.product_name, product.description, product.brand, product.category, product.color]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return keywords.every((kw) => haystack.includes(String(kw).toLowerCase()));
}

function formatProductDetails(p, lang) {
    const rows = lang === 'ur'
        ? [
            ['Qeemat', `Rs. ${p.retail_price}`],
            ['Wholesale', p.wholesale_price ? `Rs. ${p.wholesale_price}` : 'set nahi'],
            ['Stock', p.quantity],
            ['Brand', p.brand || '-'],
            ['Category', p.category || '-'],
            ['Rang', p.color || 'set nahi'],
            ['Halat', p.condition || 'set nahi'],
            ['Tafseel', p.description || '-'],
            ['Status', p.status],
        ]
        : [
            ['Price', `Rs. ${p.retail_price}`],
            ['Wholesale price', p.wholesale_price ? `Rs. ${p.wholesale_price}` : 'not set'],
            ['Quantity', p.quantity],
            ['Brand', p.brand || '-'],
            ['Category', p.category || '-'],
            ['Color', p.color || 'not set'],
            ['Condition', p.condition || 'not set'],
            ['Description', p.description || '-'],
            ['Status', p.status],
        ];
    return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

// ---- Audio transcription: all Groq keys tried first (with one same-key retry on transient errors), then all Gemini keys ----
async function transcribeAudio(buffer) {
    const tmpPath = path.join(os.tmpdir(), `munshi_${Date.now()}.ogg`);
    fs.writeFileSync(tmpPath, buffer);
    try {
        for (const key of groqPool.available()) {
            const client = new Groq({ apiKey: key });
            const call = () => client.audio.transcriptions.create({ file: fs.createReadStream(tmpPath), model: 'whisper-large-v3' });
            try {
                const transcription = await call();
                return transcription.text;
            } catch (err) {
                if (isRateLimitError(err)) { groqPool.markExhausted(key, getRetryDelayMs(err)); continue; }
                if (err?.status === 404 || err?.code === 404) {
                    console.warn(`⚠️ Whisper model not found on key ...${key.slice(-4)} — skipping.`);
                    break;
                }
                console.warn(`⚠️ Transient error (Whisper, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
                try {
                    const transcription = await call();
                    return transcription.text;
                } catch (retryErr) {
                    console.warn('⚠️ Retry also failed:', retryErr?.message || retryErr);
                    break;
                }
            }
        }
    } finally {
        fs.unlink(tmpPath, () => {});
    }

    console.log('Falling back to Gemini Audio...');
    for (const key of geminiPool.available()) {
        const client = new GoogleGenAI({ apiKey: key });
        const call = () => client.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                { inlineData: { mimeType: 'audio/ogg', data: buffer.toString('base64') } },
                'Transcribe this voice note accurately into text. Return ONLY the exact transcribed text and nothing else.',
            ],
        });
        try {
            const response = await call();
            return response.text;
        } catch (err) {
            if (isRateLimitError(err)) { geminiPool.markExhausted(key, getRetryDelayMs(err)); continue; }
            if (err?.status === 404 || err?.code === 404) {
                console.warn(`⚠️ Gemini audio model not found on key ...${key.slice(-4)} — skipping.`);
                break;
            }
            console.warn(`⚠️ Transient error (Gemini audio, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
            try {
                const response = await call();
                return response.text;
            } catch (retryErr) {
                console.warn('⚠️ Retry also failed:', retryErr?.message || retryErr);
                break;
            }
        }
    }
    throw new Error('❌ All Groq Whisper and Gemini Audio keys failed.');
}

// UPDATED: Qwen/Kimi tried first on Groq (given a fair test), gemini-flash-latest reinstated as
// primary Gemini backup now that pooled keys make its daily quota workable, lite kept as last resort.
const GEMINI_MODEL_CANDIDATES = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const GROQ_MODEL_CANDIDATES = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
async function generateWithFallback(contents) {
    const promptString = contents.map((c) => c.text).filter(Boolean).join('\n\n');

    for (const model of GROQ_MODEL_CANDIDATES) {
        for (const key of groqPool.available()) {
            const client = new Groq({ apiKey: key });
            const call = () => client.chat.completions.create({ model, messages: [{ role: 'user', content: promptString }], response_format: { type: 'json_object' } });
            try {
                const completion = await call();
                return { text: completion.choices[0].message.content };
            } catch (err) {
                if (isRateLimitError(err)) { groqPool.markExhausted(key, getRetryDelayMs(err)); continue; }
                console.warn(`⚠️ Transient error (${model}, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
                try {
                    const completion = await call();
                    return { text: completion.choices[0].message.content };
                } catch (retryErr) {
                    console.warn(`⚠️ Retry also failed (${model}):`, retryErr?.message || retryErr);
                    break;
                }
            }
        }
    }

    console.warn('⚠️ All Groq candidates/keys failed. Switching to Gemini...');
    for (const model of GEMINI_MODEL_CANDIDATES) {
        for (const key of geminiPool.available()) {
            const client = new GoogleGenAI({ apiKey: key });
            const call = () => client.models.generateContent({ model, contents: promptString, config: { responseMimeType: 'application/json' } });
            try {
                const response = await call();
                return { text: response.text };
            } catch (err) {
                if (isRateLimitError(err)) { geminiPool.markExhausted(key, getRetryDelayMs(err)); continue; }
                console.warn(`⚠️ Transient error (${model}, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
                try {
                    const response = await call();
                    return { text: response.text };
                } catch (retryErr) {
                    console.warn(`⚠️ Retry also failed (${model}):`, retryErr?.message || retryErr);
                    break;
                }
            }
        }
    }

    throw new Error('❌ All primary and backup AI models/keys from Groq and Gemini failed.');
}

function parseJsonResponse(text) {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function classifyMode(text) {
    const prompt = `Classify what the sender wants to do, based on their message to Munshi, a WhatsApp assistant for a Pakistani e-commerce platform.
Message: "${text}"

Respond with JSON: { "mode": "selling" or "editing" or "buying" or "my_orders" or "other" }
- "selling": sender wants to add/list a NEW product
- "editing": sender wants to change/update/delete/check status of an EXISTING product, or see an overview of their inventory/stock/orders (SELLER side)
- "buying": sender wants to find/search for/purchase a product
- "my_orders": sender wants to see products THEY have ordered/bought as a buyer (e.g. "meri orders dikhao", "what did I order", "order status")
- "other": greetings, small talk, unclear intent

If ambiguous, prefer "other" over guessing wrong.`;
    const response = await generateWithFallback([{ text: prompt }]);
    return parseJsonResponse(response.text);
}

async function detectLanguageSwitch(text) {
    const prompt = `Look ONLY at whether this message is asking to change or set which language/script the assistant should reply in GOING FORWARD.

Message: "${text}"

Respond with JSON: { "requests_switch": boolean, "target_language": "en"/"ur"/"pa"/"sd"/"ps"/null, "target_script": "roman"/"native"/null, "wants_default_reset": boolean }
Examples: "speak to me in English", "mujhe English mein reply karo", "ab Punjabi mein bolo", "apni normal zabaan mein wapis aa jao" (wants_default_reset: true).
If NOT a switch request, requests_switch: false, everything else null/false.`;
    const response = await generateWithFallback([{ text: prompt }]);
    return parseJsonResponse(response.text);
}

// ---- Session ----
const sessions = new Map();

function blankProduct() {
    return {
        product_name: null, retail_price: null, wholesale_price: null, quantity: null,
        description: null, description_was_generated: false,
        brand: null, category: null, color: null, condition: null,
    };
}

function blankSession(nativeLanguage = null, languageOverride = null, scriptPreference = null) {
    return {
        mode: null,
        nativeLanguage, languageOverride, scriptPreference,
        product: blankProduct(),
        images: [],
        pendingAction: null,
        lastAskedFields: [],
        editing: null,
        disambiguating: null,
        lastSearchResults: null,
    };
}

function getSession(jid) {
    if (!sessions.has(jid)) sessions.set(jid, blankSession());
    return sessions.get(jid);
}

function computeMissingFields(product) {
    return ['product_name', 'retail_price', 'quantity', 'description'].filter((key) => !product[key]);
}

function effectiveLang(session) {
    return session.languageOverride || session.nativeLanguage;
}

function languageDirective(session) {
    const lang = effectiveLang(session) || "the same language as the sender's message";
    const scriptNote = session.scriptPreference ? ` using ${session.scriptPreference} script` : '';
    return `\n\nCRITICAL LANGUAGE RULE: Regardless of what language the sender's message above was written or spoken in, your "reply_message" MUST be written ONLY in ${lang}${scriptNote}. Do not mix languages, and do not switch to match the sender's language. This overrides any instinct to mirror the input.`;
}

function failureMessage(session) {
    return effectiveLang(session) === 'ur' ? 'Maazrat, dobara koshish karein.' : 'Sorry, something went wrong — please try again.';
}

// ---- SELLING ----
function buildExtractionPrompt(session, transcriptText) {
    const lang = effectiveLang(session) || 'the language of this message';
    return `You are Munshi, a WhatsApp assistant helping a Pakistani seller list a product on an online store.
The seller's message may originally have been spoken or typed, in English, Urdu, Punjabi, Sindhi, or Pashto — native or Roman script.

Seller's message: "${transcriptText}"
Product info already known so far: ${JSON.stringify(session.product)}
Images already received so far: ${session.images.length}
Fields Munshi last asked for: ${JSON.stringify(session.lastAskedFields)}

YOU MUST REPLY IN: ${lang}${session.scriptPreference ? ` (script: ${session.scriptPreference})` : ' (default Roman script for ur/pa/sd/ps unless the message itself used native script)'}

Required fields:
- product_name (name/brand/model combined, e.g. "Redmi Note 8")
- retail_price (plain number as string, no commas/words, e.g. "30000")
- quantity
- description

Optional fields:
- wholesale_price (only if seller mentions bulk pricing)
- brand — INFER this yourself from product_name/context using your own knowledge, do NOT ask the seller
- category — INFER this yourself the same way (e.g. "Mobile Phone", "Plumbing", "Clothing")
- color — ONLY fill if seller actually mentions it, never ask for it
- condition — ONLY fill if seller actually mentions it (new/used/refurbished), never ask for it

Special rules:
1. CORRECTIONS: if seller restates a known field with a different value, overwrite it — not a new product, don't re-ask other known fields.
2. DESCRIPTION: (a) seller states real details → clean into a proper sentence, strip filler, description_was_generated:false. (b) seller asks to auto-generate, no focus → write from your own knowledge, concrete specs, description_was_generated:true. (c) seller asks to auto-generate WITH focus areas named → this is an instruction on emphasis, not literal content — write a real description emphasizing those, description_was_generated:true. (d) seller asks to add more/expand → extend with genuine new specifics, description_was_generated:true.
3. NEW PRODUCT: only if seller explicitly says done/starting another, or current one was already published.
4. DISCARD: if seller wants to cancel before publishing, wants_to_discard:true.
5. If message has no product info, leave fields as-is, respond helpfully.

Respond with JSON:
{
  "product_name": string|null, "retail_price": string|null, "wholesale_price": string|null, "quantity": string|null,
  "description": string|null, "description_was_generated": boolean,
  "brand": string|null, "category": string|null, "color": string|null, "condition": string|null,
  "detected_language": "en"/"ur"/"pa"/"sd"/"ps",
  "wants_to_discard": boolean, "reply_message": string
}
If required fields still missing, reply_message asks ONLY for the missing ones. If everything required is present, reply_message reads back all details (mention image count) and asks for "haan"/"yes" to confirm, or what to fix.` + languageDirective(session);
}

async function runExtraction(session, transcriptText) {
    const response = await generateWithFallback([{ text: buildExtractionPrompt(session, transcriptText) }]);
    const parsed = parseJsonResponse(response.text);

    if (parsed.detected_language) session.nativeLanguage = parsed.detected_language;

    if (parsed.wants_to_discard) {
        const { nativeLanguage, languageOverride, scriptPreference } = session;
        Object.assign(session, blankSession(nativeLanguage, languageOverride, scriptPreference));
        return parsed.reply_message;
    }

    for (const key of ['product_name', 'retail_price', 'wholesale_price', 'quantity', 'description', 'brand', 'category', 'color', 'condition']) {
        if (parsed[key]) session.product[key] = parsed[key];
    }
    if (parsed.description_was_generated) session.product.description_was_generated = true;

    const missing = computeMissingFields(session.product);
    session.lastAskedFields = missing;
    session.pendingAction = missing.length === 0 ? { type: 'publish_product' } : null;

    return parsed.reply_message;
}

// ---- EDITING / DELETE / DASHBOARD ----
function buildEditIntentPrompt(text, products) {
    const list = products.map((p) => `- ${p.product_name} (Rs. ${p.retail_price}, qty ${p.quantity}${p.color ? `, color: ${p.color}` : ''})`).join('\n');
    return `You are Munshi helping a seller manage their EXISTING inventory.
Seller's message: "${text}"
Seller's current active products:
${list || '(none)'}

Respond with JSON: { "sub_intent": "dashboard_summary"|"check_status"|"edit_field"|"delete"|"unclear", "product_reference": string|null, "price_hint": number|null, "color_hint": string|null }
- "dashboard_summary": wants an overview of stock/inventory/orders, not one specific product
- "check_status": wants details about ONE specific product they name
- "edit_field": wants to change something about ONE specific product
- "delete": wants to remove ONE specific product
- "unclear": can't tell, or no product named when one is needed
"product_reference" is the seller's own words for which product (null for dashboard_summary).
"price_hint" is a plain number if the seller mentioned a price to help identify which product they mean (e.g. "the 30000 one").
"color_hint" is a color word if the seller mentioned one to help identify which product they mean.`;
}

function buildEditFieldPrompt(product, transcriptText, session) {
    const lang = effectiveLang(session) || 'the language of this message';
    return `You are Munshi, helping a seller EDIT an existing product listing.
Current product data: ${JSON.stringify(product)}
Seller's message: "${transcriptText}"

YOU MUST REPLY IN: ${lang}

Figure out what the seller wants to change. Only include fields they actually want changed.
Respond with JSON:
{
  "updated_fields": { any of product_name, retail_price, wholesale_price, quantity, description, brand, category, color, condition — only changed keys },
  "has_concrete_change": boolean, "wants_to_cancel": boolean, "reply_message": string
}
retail_price/wholesale_price must be plain numbers as strings if changed.
If seller clearly states a change: has_concrete_change:true, reply_message reads it back and asks for "haan"/"yes" to confirm.
If no concrete new value yet: has_concrete_change:false, updated_fields:{}, reply_message asks what the new value should be.
If seller wants to cancel/stop editing: wants_to_cancel:true.` + languageDirective(session);
}

function buildDisambiguationPrompt(text, candidates, session) {
    const list = candidates.map((p, i) => `${i + 1}. ${p.product_name} — Rs. ${p.retail_price}${p.color ? `, color: ${p.color}` : ''}`).join('\n');
    return `You are Munshi. The seller has multiple products matching their request:
${list}

Seller's message: "${text}"

Respond with JSON: { "matched_index": number|null, "wants_to_cancel": boolean, "reply_message": string|null }
"matched_index" is the 1-based index of the ONE product they mean, inferred from price, color, or position ("pehla"/"first", "dusra"/"second") they mentioned. null if still can't tell.
"wants_to_cancel": true if they want to stop this action entirely.
If matched_index is null and not cancelling, reply_message should ask again more specifically (mention what info would help — e.g. price or color).` + languageDirective(session);
}

async function buildDashboardSummary(sellerId, lang) {
    const { data: products } = await supabase.from('products').select('status').eq('seller_id', sellerId);
    const active = (products || []).filter((p) => p.status === 'active').length;

    const header = lang === 'ur' ? `Aapke paas ${active} active products hain.` : `You have ${active} active product(s) listed.`;

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, created_at, products(product_name, retail_price, id)')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error || !orders || !orders.length) {
        return header + (lang === 'ur' ? '\nAbhi tak koi order nahi.' : '\nNo orders yet.');
    }

    const orderLines = orders.map((o) => {
        const p = o.products;
        return `\n\n📦 ${p?.product_name || '—'} — Rs. ${p?.retail_price || '—'}\nStatus: ${o.status}`;
    }).join('');

    return header + '\n\nRecent orders:' + orderLines;
}

async function startEditingFlow(session, senderJid, transcriptText) {
    const lang = effectiveLang(session);
    const seller = await getSellerRow(senderJid);
    if (!seller) {
        session.mode = null;
        return lang === 'ur' ? 'Aap ne abhi tak koi product list nahi kiya.' : "You haven't listed any products yet.";
    }

    const products = await fetchActiveProducts(seller.id);
    if (!products.length) {
        session.mode = null;
        return lang === 'ur' ? 'Aapke paas abhi koi active product nahi hai.' : "You don't have any active products right now.";
    }

    const response = await generateWithFallback([{ text: buildEditIntentPrompt(transcriptText, products) }]);
    const { sub_intent, product_reference, price_hint, color_hint } = parseJsonResponse(response.text);

    if (sub_intent === 'dashboard_summary') {
        session.mode = null;
        return await buildDashboardSummary(seller.id, lang);
    }

    const matches = resolveProductMatch(products, product_reference, price_hint, color_hint);

    if (matches.length === 0) {
        session.mode = null;
        const names = products.map((p) => p.product_name).join(', ');
        return lang === 'ur' ? `Samajh nahi aaya konsa product. Aapke products: ${names}` : `Not sure which product — your products: ${names}`;
    }

    if (matches.length > 1) {
        session.disambiguating = {
            subIntent: sub_intent,
            candidates: matches.map((p) => ({ id: p.id, product_name: p.product_name, retail_price: p.retail_price, color: p.color })),
        };
        const lines = matches.map((p, i) => `${i + 1}. ${p.product_name} — Rs. ${p.retail_price}${p.color ? `, ${p.color}` : ''}`).join('\n');
        return lang === 'ur'
            ? `Ek se zyada match mile:\n${lines}\nKonsa? Price ya color batayen.`
            : `Multiple matches:\n${lines}\nWhich one? Mention the price or color to narrow it down.`;
    }

    const product = matches[0];

    if (sub_intent === 'check_status') {
        session.mode = null;
        const details = formatProductDetails(product, lang);
        return `${product.product_name}\n${details}`;
    }

    if (sub_intent === 'delete') {
        session.pendingAction = { type: 'delete_product', productId: product.id, productName: product.product_name };
        return lang === 'ur'
            ? `Kya aap "${product.product_name}" delete karna chahte hain? "haan" likhen confirm karne ke liye.`
            : `Delete "${product.product_name}"? Reply "yes" to confirm.`;
    }

    if (sub_intent === 'edit_field') {
        session.editing = { productId: product.id, matchedName: product.product_name };
        const details = formatProductDetails(product, lang);
        return lang === 'ur'
            ? `"${product.product_name}" ki tafseel:\n${details}\n\nKya change karna hai?`
            : `Here are "${product.product_name}"'s current details:\n${details}\n\nWhat would you like to change?`;
    }

    session.mode = null;
    return lang === 'ur' ? 'Samajh nahi aaya, dobara batayen.' : "Didn't quite catch that — could you rephrase?";
}

async function continueDisambiguation(session, transcriptText) {
    const lang = effectiveLang(session);
    const response = await generateWithFallback([{ text: buildDisambiguationPrompt(transcriptText, session.disambiguating.candidates, session) }]);
    const parsed = parseJsonResponse(response.text);

    if (parsed.wants_to_cancel) {
        session.mode = null;
        session.disambiguating = null;
        return lang === 'ur' ? 'Theek hai, cancel kar diya.' : 'Okay, cancelled.';
    }

    if (!parsed.matched_index || !session.disambiguating.candidates[parsed.matched_index - 1]) {
        return parsed.reply_message || (lang === 'ur' ? 'Zara wazeh batayen, konsa product?' : 'Could you be more specific about which one?');
    }

    const chosen = session.disambiguating.candidates[parsed.matched_index - 1];
    const subIntent = session.disambiguating.subIntent;
    session.disambiguating = null;

    if (subIntent === 'delete') {
        session.pendingAction = { type: 'delete_product', productId: chosen.id, productName: chosen.product_name };
        return lang === 'ur'
            ? `Kya aap "${chosen.product_name}" delete karna chahte hain? "haan" likhen confirm karne ke liye.`
            : `Delete "${chosen.product_name}"? Reply "yes" to confirm.`;
    }

    if (subIntent === 'check_status') {
        session.mode = null;
        const { data: product } = await supabase.from('products').select('*').eq('id', chosen.id).single();
        return product ? `${chosen.product_name}\n${formatProductDetails(product, lang)}` : failureMessage(session);
    }

    const { data: product } = await supabase.from('products').select('*').eq('id', chosen.id).single();
    session.editing = { productId: chosen.id, matchedName: chosen.product_name };
    const details = product ? formatProductDetails(product, lang) : '';
    return lang === 'ur'
        ? `"${chosen.product_name}" ki tafseel:\n${details}\n\nKya change karna hai?`
        : `Here are "${chosen.product_name}"'s current details:\n${details}\n\nWhat would you like to change?`;
}

async function continueEditingProduct(session, transcriptText) {
    const lang = effectiveLang(session);
    const { data: product } = await supabase.from('products').select('*').eq('id', session.editing.productId).single();

    if (!product) {
        session.mode = null;
        session.editing = null;
        return failureMessage(session);
    }

    const response = await generateWithFallback([{ text: buildEditFieldPrompt(product, transcriptText, session) }]);
    const parsed = parseJsonResponse(response.text);

    if (parsed.wants_to_cancel) {
        session.mode = null;
        session.editing = null;
        return lang === 'ur' ? 'Theek hai, edit cancel kar diya.' : 'Okay, edit cancelled.';
    }

    if (parsed.has_concrete_change) {
        session.pendingAction = { type: 'save_edit', productId: session.editing.productId, updatedFields: parsed.updated_fields, productName: product.product_name };
    }

    return parsed.reply_message;
}

// ---- BUYING ----
function buildSearchExtractionPrompt(transcriptText) {
    return `You are Munshi, helping a buyer search for a product on a Pakistani online marketplace.
Buyer's message: "${transcriptText}"

Respond with JSON: { "keywords": [short search terms], "min_price": number|null, "max_price": number|null }
keywords can include product type/brand/model AND descriptive terms like color if mentioned (e.g. ["Redmi", "Note 8", "blue"]).
Convert budgets to numbers ("hazar"/"hazaar" = thousand). Empty keywords array if nothing clear.`;
}

function buildBuyingFollowupPrompt(text, results) {
    const list = results.map((p, i) => `${i + 1}. ${p.product_name} — Rs. ${p.retail_price}`).join('\n');
    return `You are Munshi. You just showed a buyer these products:
${list}

Buyer's next message: "${text}"

Respond with JSON: { "action": "order"|"new_search"|"other", "product_index": number|null }
"order": buyer wants to buy/order one of the listed products — product_index is which one (1-based, infer from name or position like "pehla wala").
"new_search": buyer wants something different/new.
"other": greeting, question, unclear.`;
}

async function runProductQuery(minPrice, maxPrice) {
    let query = supabase.from('products').select('*, sellers(store_name, whatsapp_number)').eq('status', 'active');
    if (minPrice != null) query = query.gte('price_numeric', minPrice);
    if (maxPrice != null) query = query.lte('price_numeric', maxPrice);
    const { data, error } = await query;
    if (error) { console.error('Search query failed:', error); return []; }
    return data || [];
}

async function searchProducts(filter) {
    const inBudget = await runProductQuery(filter.min_price, filter.max_price);
    let results = inBudget.filter((p) => matchesKeywords(p, filter.keywords)).slice(0, 5);
    if (results.length) return { results, relaxed: false };

    if (filter.min_price != null || filter.max_price != null) {
        const anyPrice = await runProductQuery(null, null);
        results = anyPrice.filter((p) => matchesKeywords(p, filter.keywords)).slice(0, 5);
        if (results.length) return { results, relaxed: true };
    }

    if (filter.keywords && filter.keywords.length > 1) {
        const anyPrice = await runProductQuery(null, null);
        for (const kw of filter.keywords) {
            results = anyPrice.filter((p) => matchesKeywords(p, [kw])).slice(0, 5);
            if (results.length) return { results, relaxed: true };
        }
    }

    return { results: [], relaxed: true };
}

async function handleBuying(session, transcriptText) {
    const response = await generateWithFallback([{ text: buildSearchExtractionPrompt(transcriptText) }]);
    const filter = parseJsonResponse(response.text);
    const { results, relaxed } = await searchProducts(filter);
    const lang = effectiveLang(session);

    if (!results.length) {
        session.mode = null;
        return lang === 'ur' ? 'Maazrat, koi matching product nahi mila. Kuch aur bata sakte hain?' : 'Sorry, no matching products found. Can you describe it differently?';
    }

    session.lastSearchResults = results.map((p) => ({ id: p.id, product_name: p.product_name, retail_price: p.retail_price, seller_id: p.seller_id }));

    const introLine = relaxed
        ? (lang === 'ur' ? 'Exact match nahi mila, lekin yeh sabse qareeb options hain:' : 'No exact match, but here are the closest options:')
        : (lang === 'ur' ? 'Yeh mile aapke liye:' : "Here's what I found for you:");

    const productLines = results.map((p) => {
        const shortDesc = p.description ? p.description.slice(0, 80) + (p.description.length > 80 ? '…' : '') : '';
        return `\n\n📦 ${p.product_name} — Rs. ${p.retail_price}\n${shortDesc}\n${STOREFRONT_URL}/products/${p.id}`;
    }).join('');

    const closingLine = lang === 'ur' ? '\n\nKoi lena hai? Naam bata dein.' : '\n\nWant to order one? Just tell me which.';

    return introLine + productLines + closingLine;
}

async function continueBuyingFlow(session, transcriptText) {
    const lang = effectiveLang(session);
    const response = await generateWithFallback([{ text: buildBuyingFollowupPrompt(transcriptText, session.lastSearchResults) }]);
    const { action, product_index } = parseJsonResponse(response.text);

    if (action === 'order' && product_index && session.lastSearchResults[product_index - 1]) {
        const chosen = session.lastSearchResults[product_index - 1];
        session.pendingAction = { type: 'place_order', productId: chosen.id, sellerId: chosen.seller_id, productName: chosen.product_name };
        return lang === 'ur'
            ? `"${chosen.product_name}" order karne ke liye "haan" likhen.`
            : `Reply "yes" to place an order for "${chosen.product_name}".`;
    }

    if (action === 'new_search') {
        session.lastSearchResults = null;
        return await handleBuying(session, transcriptText);
    }

    session.mode = null;
    session.lastSearchResults = null;
    return lang === 'ur' ? 'Theek hai! Kuch aur chahiye toh batayen.' : "Okay! Let me know if you need anything else.";
}

async function handleMyOrders(session, senderJid) {
    const lang = effectiveLang(session);
    const buyer = await getBuyerRow(senderJid);
    if (!buyer) {
        return lang === 'ur' ? 'Aap ne abhi tak koi order nahi kiya.' : "You haven't placed any orders yet.";
    }

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, created_at, products(product_name, retail_price, id)')
        .eq('buyer_id', buyer.id)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) { console.error('Fetch buyer orders failed:', error); return failureMessage(session); }
    if (!orders || !orders.length) {
        return lang === 'ur' ? 'Aap ne abhi tak koi order nahi kiya.' : "You haven't placed any orders yet.";
    }

    const lines = orders.map((o) => {
        const p = o.products;
        return `\n\n📦 ${p?.product_name || '—'} — Rs. ${p?.retail_price || '—'}\nStatus: ${o.status}${p ? `\n${STOREFRONT_URL}/products/${p.id}` : ''}`;
    }).join('');

    return (lang === 'ur' ? 'Aapke orders:' : 'Your orders:') + lines;
}

async function handleOtherMessage(session, transcriptText) {
    const prompt = `You are Munshi, a warm, natural-sounding WhatsApp assistant for a Pakistani e-commerce platform (sellers list products, buyers search for them).
The sender's message doesn't clearly fall into selling, editing, or buying. Message: "${transcriptText}"

Reply naturally and briefly, like a helpful human would — not robotically. If it's a simple acknowledgment/thanks/greeting, respond warmly and briefly. If it's genuinely unclear what they want, gently ask whether they'd like to add a product, check/edit an existing one, or search for something.

Respond with JSON: { "reply_message": string }` + languageDirective(session);

    try {
        const response = await generateWithFallback([{ text: prompt }]);
        return parseJsonResponse(response.text).reply_message;
    } catch (err) {
        console.error('handleOtherMessage LLM call failed, using fallback:', err);
        const lang = effectiveLang(session);
        return lang === 'ur'
            ? 'Assalam-o-Alaikum! Aap product add karna chahte hain, apna existing product edit/check karna hai, ya kuch dhoond rahe hain?'
            : 'Hello! Would you like to add a product, edit/check an existing one, or search for something?';
    }
}

// ---- Pending action execution ----
async function executePendingAction(session, senderJid) {
    const action = session.pendingAction;
    const lang = effectiveLang(session);

    if (action.type === 'publish_product') {
        const sellerId = await ensureSeller(senderJid, session.nativeLanguage);
        const imageUrls = await uploadImages(session.images, sellerId);
        const { error } = await supabase.from('products').insert({
            seller_id: sellerId,
            product_name: session.product.product_name,
            retail_price: session.product.retail_price,
            price_numeric: parseNumericPrice(session.product.retail_price),
            wholesale_price: session.product.wholesale_price,
            quantity: session.product.quantity,
            description: session.product.description,
            description_was_generated: session.product.description_was_generated,
            brand: session.product.brand,
            category: session.product.category,
            color: session.product.color,
            condition: session.product.condition,
            status: 'active',
            image_urls: imageUrls,
        });
        if (error) throw error;
        console.log('PUBLISHED:', session.product.product_name);
        return lang === 'ur' ? 'Product publish ho gaya! Shukriya.' : 'Product published! Thank you.';
    }

    if (action.type === 'delete_product') {
        const { error } = await supabase.from('products').update({ status: 'deleted', updated_at: new Date().toISOString() }).eq('id', action.productId);
        if (error) throw error;
        return lang === 'ur' ? `"${action.productName}" delete ho gaya.` : `"${action.productName}" has been deleted.`;
    }

    if (action.type === 'save_edit') {
        const updatePayload = { ...action.updatedFields, updated_at: new Date().toISOString() };
        if (updatePayload.retail_price) updatePayload.price_numeric = parseNumericPrice(updatePayload.retail_price);
        const { error } = await supabase.from('products').update(updatePayload).eq('id', action.productId);
        if (error) throw error;
        return lang === 'ur' ? `"${action.productName}" update ho gaya.` : `"${action.productName}" has been updated.`;
    }

    if (action.type === 'place_order') {
        const buyerId = await ensureBuyer(senderJid, session.nativeLanguage);
        const { error } = await supabase.from('orders').insert({ buyer_id: buyerId, product_id: action.productId, seller_id: action.sellerId, status: 'pending' });
        if (error) throw error;
        return lang === 'ur' ? `"${action.productName}" ka order place ho gaya!` : `Order placed for "${action.productName}"!`;
    }

    return failureMessage(session);
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                console.log('\n=============================================');
                console.log(`👉 YOUR PAIRING CODE: ${code}`);
                console.log('=============================================\n');
            } catch (err) {
                console.error('Failed to generate pairing code:', err);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('\n✅ Munshi is Online and Connected!\n');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const messageType = Object.keys(msg.message)[0];
        const session = getSession(senderJid);

        if (messageType === 'imageMessage') {
            if (session.mode !== 'selling') return;
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                session.images.push(buffer.toString('base64'));
                const lang = effectiveLang(session);
                const ackMsg = lang === 'ur'
                    ? `Tasveer mil gayi (${session.images.length} total). Aur bhejni hain ya bas itni hi?`
                    : `Image received (${session.images.length} total). Send more, or is that all?`;
                await sock.sendMessage(senderJid, { text: ackMsg });
            } catch (error) {
                console.error('Error processing image:', error);
                await sock.sendMessage(senderJid, { text: failureMessage(session) });
            }
            return;
        }

        let transcriptText = null;
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
            transcriptText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        } else if (messageType === 'audioMessage') {
            console.log(`Received voice note from: ${senderJid}`);
            await sock.sendMessage(senderJid, { text: 'Voice note received! Processing...' });
            try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                transcriptText = await transcribeAudio(buffer);
            } catch (error) {
                console.error('Error transcribing voice note:', error);
                await sock.sendMessage(senderJid, { text: failureMessage(session) });
                return;
            }
        } else {
            return;
        }

        const normalized = transcriptText.trim().toLowerCase();
        const isYes = ['yes', 'haan', 'han', 'ok', 'theek', 'sett', 'sett hai', 'onn', 'on scene', 'jee', 'g', 'ji', 'best', 'done'].includes(normalized);

        if (session.pendingAction) {
            if (isYes) {
                try {
                    const reply = await executePendingAction(session, senderJid);
                    await sock.sendMessage(senderJid, { text: reply });
                } catch (error) {
                    console.error('Failed to execute pending action:', error);
                    await sock.sendMessage(senderJid, { text: failureMessage(session) });
                    return;
                }
                sessions.set(senderJid, blankSession(session.nativeLanguage, session.languageOverride, session.scriptPreference));
                return;
            }
            session.pendingAction = null;
        }

        try {
            try {
                const switchResult = await detectLanguageSwitch(transcriptText);
                if (switchResult.requests_switch) {
                    if (switchResult.wants_default_reset) { session.languageOverride = null; session.scriptPreference = null; }
                    if (switchResult.target_language) session.languageOverride = switchResult.target_language;
                    if (switchResult.target_script) session.scriptPreference = switchResult.target_script;
                }
            } catch (err) {
                console.error('Language switch detection failed (continuing anyway):', err);
            }

            if (!session.mode) {
                try {
                    const { mode } = await classifyMode(transcriptText);
                    session.mode = mode === 'other' ? null : mode;
                } catch (err) {
                    console.error('Mode classification failed (treating as other):', err);
                    session.mode = null;
                }
            }

            let reply;
            if (session.mode === 'selling') {
                reply = await runExtraction(session, transcriptText);
            } else if (session.mode === 'editing') {
                if (session.editing) {
                    reply = await continueEditingProduct(session, transcriptText);
                } else if (session.disambiguating) {
                    reply = await continueDisambiguation(session, transcriptText);
                } else {
                    reply = await startEditingFlow(session, senderJid, transcriptText);
                }
            } else if (session.mode === 'buying') {
                reply = session.lastSearchResults
                    ? await continueBuyingFlow(session, transcriptText)
                    : await handleBuying(session, transcriptText);
            } else if (session.mode === 'my_orders') {
                reply = await handleMyOrders(session, senderJid);
                session.mode = null;
            } else {
                reply = await handleOtherMessage(session, transcriptText);
            }
            await sock.sendMessage(senderJid, { text: reply });
        } catch (error) {
            console.error('Error processing message:', error);
            await sock.sendMessage(senderJid, { text: failureMessage(session) });
        }
    });
}

startBot();