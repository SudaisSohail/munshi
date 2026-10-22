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
function loadKeys(prefix) {
    const keys = [];
    let n = 1;
    while (process.env[`${prefix}_${n}`]) { keys.push(process.env[`${prefix}_${n}`]); n++; }
    if (!keys.length) throw new Error(`No keys found — set ${prefix}_1 (and optionally _2, _3, _4...) in .env`);
    return keys;
}

class KeyPool {
    constructor(keys, label) { this.keys = keys; this.label = label; this.exhaustedUntil = new Map(); }
    available() {
        const now = Date.now();
        return this.keys.filter((k) => !this.exhaustedUntil.has(k) || this.exhaustedUntil.get(k) <= now);
    }
    markExhausted(key, durationMs = 60 * 1000) {
        this.exhaustedUntil.set(key, Date.now() + durationMs);
        console.warn(`⚠️ ${this.label} key ...${key.slice(-4)} resting for ${Math.round(durationMs / 1000)}s. ${this.available().length}/${this.keys.length} still available.`);
    }
}

function isRateLimitError(err) {
    const status = err?.status || err?.code;
    const msg = (err?.message || '').toLowerCase();
    return status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('resource_exhausted');
}

function getRetryDelayMs(err) {
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('perday')) return 24 * 60 * 60 * 1000;
    const secMatch = (err?.message || '').match(/retrydelay"?\s*:?\s*"?(\d+(?:\.\d+)?)s/i) || (err?.message || '').match(/retry in ([\d.]+)s/i);
    if (secMatch) return Math.ceil(parseFloat(secMatch[1]) * 1000) + 2000;
    const retryAfterHeader = err?.headers?.['retry-after'];
    if (retryAfterHeader) return parseInt(retryAfterHeader, 10) * 1000 + 2000;
    return 60 * 1000;
}

const groqPool = new KeyPool(loadKeys('GROQ_API_KEY'), 'Groq');
const geminiPool = new KeyPool(loadKeys('GEMINI_API_KEY'), 'Gemini');

// ---- NEW: per-sender lock — serializes processing for one JID at a time, without blocking other senders ----
const senderLocks = new Map();

function runExclusive(jid, task) {
    const prevPromise = senderLocks.get(jid) || Promise.resolve();
    const runPromise = prevPromise.then(() => task()).catch((err) => console.error('Task error in lock chain:', err));
    senderLocks.set(jid, runPromise);
    runPromise.finally(() => {
        if (senderLocks.get(jid) === runPromise) senderLocks.delete(jid);
    });
    return runPromise;
}

// ---- Data helpers ----
async function ensureSeller(whatsappNumber, nativeLanguage, storeName, contactNumber) {
    const { data: existing } = await supabase.from('sellers').select('id').eq('whatsapp_number', whatsappNumber).maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase.from('sellers')
        .insert({ whatsapp_number: whatsappNumber, language: nativeLanguage, store_name: storeName, contact_number: contactNumber })
        .select('id').single();
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

// UPDATED: validates size + basic magic-bytes before uploading (fix #6)
async function uploadImages(images, sellerId) {
    const urls = [];
    for (let i = 0; i < images.length; i++) {
        const buffer = Buffer.from(images[i], 'base64');
        if (buffer.length > 8 * 1024 * 1024) { console.warn('Skipping oversized image'); continue; }
        const sig = buffer.subarray(0, 4).toString('hex');
        const looksLikeImage = sig.startsWith('ffd8') || sig.startsWith('89504e47') || buffer.subarray(0, 4).toString('ascii') === 'RIFF';
        if (!looksLikeImage) { console.warn('Skipping non-image upload'); continue; }
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

function scoreKeywordMatch(product, keywords) {
    if (!keywords || !keywords.length) return 0;
    const haystack = [product.product_name, product.description, product.brand, product.category, product.color]
        .filter(Boolean).join(' ').toLowerCase();
    return keywords.filter((kw) => haystack.includes(String(kw).toLowerCase())).length;
}

function bestKeywordMatches(products, keywords) {
    if (!keywords || !keywords.length) return { results: [], isExact: false };
    const scored = products.map((p) => ({ p, score: scoreKeywordMatch(p, keywords) })).filter((s) => s.score > 0);
    if (!scored.length) return { results: [], isExact: false };
    const maxScore = Math.max(...scored.map((s) => s.score));
    const results = scored.filter((s) => s.score === maxScore).map((s) => s.p).slice(0, 5);
    return { results, isExact: maxScore === keywords.length };
}

function formatProductDetails(p, lang) {
    const rows = lang === 'ur'
        ? [
            ['Qeemat', `Rs. ${p.retail_price}`], ['Wholesale', p.wholesale_price ? `Rs. ${p.wholesale_price}` : 'set nahi'],
            ['Stock', p.quantity], ['Brand', p.brand || '-'], ['Category', p.category || '-'],
            ['Rang', p.color || 'set nahi'], ['Halat', p.condition || 'set nahi'],
            ['Tafseel', p.description || '-'], ['Status', p.status],
        ]
        : [
            ['Price', `Rs. ${p.retail_price}`], ['Wholesale price', p.wholesale_price ? `Rs. ${p.wholesale_price}` : 'not set'],
            ['Quantity', p.quantity], ['Brand', p.brand || '-'], ['Category', p.category || '-'],
            ['Color', p.color || 'not set'], ['Condition', p.condition || 'not set'],
            ['Description', p.description || '-'], ['Status', p.status],
        ];
    return rows.map(([k, v]) => `${k}: ${v}`).join('\n');
}

function resolvePhoneNumber(msg, senderJid) {
    const altJid = msg.key.remoteJidAlt;
    const source = altJid?.includes('@s.whatsapp.net') ? altJid : (senderJid.includes('@s.whatsapp.net') ? senderJid : null);
    return source ? source.split('@')[0] : null;
}

function extractQuotedImageNumber(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const caption = quoted?.imageMessage?.caption;
    if (!caption) return null;
    const match = caption.match(/Image (\d+)/i);
    return match ? parseInt(match[1], 10) : null;
}

// ---- Audio transcription ----
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
                if (err?.status === 404 || err?.code === 404) { console.warn(`⚠️ Whisper not found on key ...${key.slice(-4)} — skipping.`); break; }
                console.warn(`⚠️ Transient error (Whisper, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
                try {
                    const transcription = await call();
                    return transcription.text;
                } catch (retryErr) { console.warn('⚠️ Retry also failed:', retryErr?.message || retryErr); break; }
            }
        }
    } finally { fs.unlink(tmpPath, () => {}); }
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
            if (err?.status === 404 || err?.code === 404) { console.warn(`⚠️ Gemini audio not found on key ...${key.slice(-4)} — skipping.`); break; }
            console.warn(`⚠️ Transient error (Gemini audio, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
            try {
                const response = await call();
                return response.text;
            } catch (retryErr) { console.warn('⚠️ Retry also failed:', retryErr?.message || retryErr); break; }
        }
    }
    throw new Error('❌ All Groq Whisper and Gemini Audio keys failed.');
}

// ---- Stock image search + verification ----
async function searchPexelsCandidates(query) {
    try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`, { headers: { Authorization: process.env.PEXELS_API_KEY } });
        const data = await res.json();
        return (data.photos || []).map((p) => p.src.large);
    } catch (err) { console.error('Pexels search failed:', err); return []; }
}

async function searchUnsplashCandidates(query) {
    try {
        const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&client_id=${process.env.UNSPLASH_ACCESS_KEY}`);
        const data = await res.json();
        return (data.results || []).map((p) => p.urls.regular);
    } catch (err) { console.error('Unsplash search failed:', err); return []; }
}

async function fetchImageCandidates(query) {
    const pexels = await searchPexelsCandidates(query);
    const unsplash = await searchUnsplashCandidates(query);
    return [...pexels, ...unsplash];
}

let geminiUnreachableUntil = 0;

async function verifyImageMatchesProduct(imageUrl, productName) {
    if (Date.now() < geminiUnreachableUntil) return true;

    let base64, mimeType;
    try {
        const imgRes = await fetch(imageUrl);
        const arrayBuffer = await imgRes.arrayBuffer();
        base64 = Buffer.from(arrayBuffer).toString('base64');
        mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
    } catch (err) {
        console.error('Could not fetch candidate image itself, showing unverified:', err?.message || err);
        return true;
    }

    const keys = geminiPool.available();
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
            const client = new GoogleGenAI({ apiKey: key });
            const response = await client.models.generateContent({
                model: 'gemini-flash-lite-latest',
                contents: [
                    { inlineData: { mimeType, data: base64 } },
                    `Does this image plausibly show a "${productName}"? Default to YES unless something is CLEARLY and visibly wrong (e.g. seller specified blue but the image is clearly red, or it's a completely different category of item). If minor details can't be confirmed but the general product type is right and nothing is obviously contradicted, still answer yes. Respond with ONLY "yes" or "no".`,
                ],
            });
            return response.text.trim().toLowerCase().startsWith('y');
        } catch (err) {
            if (isRateLimitError(err)) { geminiPool.markExhausted(key, getRetryDelayMs(err)); continue; }
            if (err?.status === 403 || (err?.message || '').includes('PERMISSION_DENIED')) {
                console.warn(`⚠️ Key ...${key.slice(-4)} permanently denied access — benching for today.`);
                geminiPool.markExhausted(key, 24 * 60 * 60 * 1000);
                continue;
            }
            // NEW: a genuine network error means the WHOLE path is likely down right now —
            // one more try on a second key (in case it's this key specifically), then stop cycling entirely.
            console.warn(`⚠️ Network error on key ...${key.slice(-4)}:`, err?.message || err);
            if (i === 0 && keys.length > 1) continue; // give it exactly one more key, not all six
            geminiUnreachableUntil = Date.now() + 0.5 * 60 * 1000; // NEW: 30s , up from 2
            console.error('Gemini unreachable — pausing verification for 5 minutes, showing images unverified in the meantime.');
            return true;
        }
    }

    console.error('Image verification failed on ALL Gemini keys — showing candidate unverified.');
    return true;
}

async function findNextVerifiedCandidate(session) {
    const { candidates, index, productName } = session.imageApproval;
    for (let i = index; i < candidates.length; i++) {
        const ok = await verifyImageMatchesProduct(candidates[i], productName);
        if (ok) { session.imageApproval.index = i; return candidates[i]; }
    }
    session.imageApproval = null;
    return null;
}

async function describeImageForSearchFilter(buffer) {
    for (const key of geminiPool.available()) {
        try {
            const client = new GoogleGenAI({ apiKey: key });
            const response = await client.models.generateContent({
                model: 'gemini-flash-lite-latest',
                contents: [
                    { inlineData: { mimeType: 'image/jpeg', data: buffer.toString('base64') } },
                    'Identify the SPECIFIC product in this image (exact model if identifiable, e.g. "iPhone 17 Pro Max" not just "phone"). Respond with JSON: { "keywords": [most specific term first — full model name, then brand, then generic category last], "min_price": null, "max_price": null }',
                ],
                config: { responseMimeType: 'application/json' },
            });
            return parseJsonResponse(response.text);
        } catch (err) {
            if (isRateLimitError(err)) { geminiPool.markExhausted(key, getRetryDelayMs(err)); continue; }
            console.error('Image filter extraction failed:', err);
            break;
        }
    }
    return { keywords: [], min_price: null, max_price: null };
}

async function classifyImageApprovalReply(text) {
    const prompt = `Someone was just shown a candidate product photo and asked if it's okay to use. Their reply: "${text}"

Respond with JSON: { "action": "approve"|"reject"|"skip_search"|"cancel_all" }
"approve": yes/looks good/perfect/use it/etc — accept THIS image.
"reject": no/show another/different one/generate another — still wants an image, just not this one.
"skip_search": doesn't want an auto-found image anymore, but wants to CONTINUE with the listing/edit as-is (e.g. "rehne do", "image ki zarurat nahi, upload kar do", "bina image ke chalta hai", "aage barho").
"cancel_all": wants to discard the WHOLE product listing or edit entirely, not just skip the image (e.g. "sab cancel karo", "poori listing cancel kardo", "mujhe nahi karna ab").
If genuinely unclear which of these four, pick "skip_search" as the safer default over "cancel_all".`;
    const response = await generateWithFallback([{ text: prompt }]);
    return parseJsonResponse(response.text);
}

async function parseImageCaptionIntent(caption) {
    if (!caption || !caption.trim()) return { position: null, replaces: null };
    try {
        const response = await generateWithFallback([{ text: `A seller sent a product photo with this caption: "${caption}". Respond with JSON: { "position": number|null, "replaces": number|null } — "position" is a 1-based target slot if specified (e.g. "as image 2", "make this first"). "replaces" is a 1-based number if they said to replace/swap an existing numbered image (e.g. "replace 3"). If caption doesn't mention either, both null.` }]);
        return parseJsonResponse(response.text);
    } catch (err) { console.error('Caption intent parse failed:', err); return { position: null, replaces: null }; }
}

async function handleAutoImageRequest(session, sock, senderJid, productNameHint, context, position = null) {
    const lang = effectiveLang(session);
    if (session.imageApproval) {
        const current = session.imageApproval.candidates[session.imageApproval.index];
        await sock.sendMessage(senderJid, {
            image: { url: current },
            caption: lang === 'ur' ? 'Yeh photo abhi tak pending hai — "haan" ya "nahi" batayen.' : 'This photo is still awaiting your answer — reply "yes" or "no".',
        });
        return;
    }
    
    const candidates = await fetchImageCandidates(productNameHint);
    if (!candidates.length) {
        await sock.sendMessage(senderJid, {
            text: lang === 'ur' ? 'Koi relevant image nahi mili — aap khud bhej sakte hain.' : "Couldn't find a relevant image — feel free to send your own.",
        });
        return;
    }

    session.imageApproval = { candidates, index: 0, productName: productNameHint, context, position };
    const found = await findNextVerifiedCandidate(session);
    if (found) {
        await sock.sendMessage(senderJid, {
            image: { url: found },
            caption: lang === 'ur' ? 'Yeh image theek hai? "haan" ya "nahi" likhen.' : 'Is this image okay? Reply "yes" or "no".',
        });
    }
}

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
                if (err?.status === 404 || err?.code === 404) { console.warn(`⚠️ Model not found (${model}) — skipping.`); break; }
                console.warn(`⚠️ Transient error (${model}, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
                try {
                    const completion = await call();
                    return { text: completion.choices[0].message.content };
                } catch (retryErr) { console.warn(`⚠️ Retry also failed (${model}):`, retryErr?.message || retryErr); break; }
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
                if (err?.status === 404 || err?.code === 404) { console.warn(`⚠️ Model not found (${model}) — skipping.`); break; }
                console.warn(`⚠️ Transient error (${model}, key ...${key.slice(-4)}), retrying once:`, err?.message || err);
                try {
                    const response = await call();
                    return { text: response.text };
                } catch (retryErr) { console.warn(`⚠️ Retry also failed (${model}):`, retryErr?.message || retryErr); break; }
            }
        }
    }

    throw new Error('❌ All primary and backup AI models/keys from Groq and Gemini failed.');
}

function parseJsonResponse(text) { return JSON.parse(text.replace(/```json|```/g, '').trim()); }

async function classifyMode(text) {
    const prompt = `Classify what the sender wants to do, based on their message to Munshi, a WhatsApp assistant for a Pakistani e-commerce platform.
Message: "${text}"

Respond with JSON: { "mode": "selling" or "editing" or "buying" or "my_orders" or "other" }
- "selling": sender wants to add/list a NEW product
- "editing": sender wants to change/update/delete/check status of an EXISTING product, or see an overview/list of their inventory/orders (SELLER side)
- "buying": sender wants to find/search for/purchase a product
- "my_orders": sender wants to see products THEY have ordered/bought as a buyer
- "other": greetings, small talk, unclear intent

If ambiguous, prefer "other" over guessing wrong.`;
    const response = await generateWithFallback([{ text: prompt }]);
    return parseJsonResponse(response.text);
}

async function detectLanguageSwitch(text) {
    const prompt = `Look ONLY at whether this message is asking to change or set which language/script the assistant should reply in GOING FORWARD.

Message: "${text}"

Respond with JSON: { "requests_switch": boolean, "target_language": "en"/"ur"/"pa"/"sd"/"ps"/null, "target_script": "roman"/"native"/null, "wants_default_reset": boolean }
If NOT a switch request, requests_switch: false, everything else null/false.`;
    const response = await generateWithFallback([{ text: prompt }]);
    return parseJsonResponse(response.text);
}

// ---- Session ----
const sessions = new Map();
const SESSION_TIMEOUT_MS = 10 * 60 * 1000;

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
        stockImageUrls: [],
        imageApproval: null,
        contactNumber: null,
        needsStoreName: false,
        storeName: null,
        pendingAction: null,
        lastAskedFields: [],
        editing: null,
        editingImages: null,
        disambiguating: null,
        lastSearchResults: null,
        lastActivity: Date.now(),
    };
}

function getSession(jid) {
    const now = Date.now();
    const existing = sessions.get(jid);
    if (!existing || (!senderLocks.has(jid) && now - existing.lastActivity >= SESSION_TIMEOUT_MS)) {
        sessions.set(jid, blankSession());
    }
    const session = sessions.get(jid);
    session.lastActivity = now;
    return session;
}

// Expire inactive sessions every minute; preserve active or queued work.
setInterval(() => {
    const cutoff = Date.now() - SESSION_TIMEOUT_MS;
    for (const [jid, s] of sessions) {
        if (s.lastActivity <= cutoff && !senderLocks.has(jid)) sessions.delete(jid);
    }
}, 60 * 1000);

function computeMissingFields(product) {
    return ['product_name', 'retail_price', 'quantity', 'description'].filter((key) => !product[key]);
}

function effectiveLang(session) { return session.languageOverride || session.nativeLanguage; }

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
The seller's message may originally have been spoken or typed, in English, Urdu, Punjabi, Sindhi, or Pashto — native or Roman script. It may also be the caption of a photo they just sent.

Seller's message: "${transcriptText}"
Product info already known so far: ${JSON.stringify(session.product)}
Images already received so far: ${session.images.length + session.stockImageUrls.length}
Fields Munshi last asked for: ${JSON.stringify(session.lastAskedFields)}
${session.needsStoreName ? '\nThis seller is NEW and has no store name on file yet — you must ALSO ask for and collect their store/shop name as part of getting the first product listed. This is a one-time setup question, only needed now.' : ''}

YOU MUST REPLY IN: ${lang}${session.scriptPreference ? ` (script: ${session.scriptPreference})` : ' (default Roman script for ur/pa/sd/ps unless the message itself used native script)'}

Required fields:
- product_name (name/brand/model combined, e.g. "Redmi Note 8")
- retail_price (plain number as string, no commas/words, e.g. "30000")
- quantity
- description
${session.needsStoreName ? '- store_name (their shop/store name — ONE-TIME only for this new seller)' : ''}

Optional fields:
- wholesale_price (only if seller mentions bulk pricing)
- brand — INFER this yourself from product_name/context using your own knowledge, do NOT ask the seller
- category — MUST be exactly one of: Fashion, Electronics, Home & Living, Groceries, Beauty, Toys, Sports, Books, Other. Infer the best fit yourself.
- color — ONLY fill if seller actually mentions it, never ask for it
- condition — ONLY fill if seller actually mentions it (new/used/refurbished), never ask for it

Special rules:
1. CORRECTIONS: if seller restates a known field with a different value, overwrite it — not a new product, don't re-ask other known fields.
2. DESCRIPTION: (a) seller states real details → clean into a proper sentence, strip filler, description_was_generated:false. (b) seller asks to auto-generate, no focus → write from your own knowledge, concrete specs, description_was_generated:true. (c) seller asks to auto-generate WITH focus areas named → this is an instruction on emphasis, not literal content — write a real description emphasizing those, description_was_generated:true. (d) seller asks to add more/expand → extend with genuine new specifics, description_was_generated:true.
3. NEW PRODUCT: only if seller explicitly says done/starting another, or current one was already published.
4. DISCARD: if seller wants to cancel before publishing, wants_to_discard:true.
5. AUTO IMAGE: if the seller explicitly asks you to find/auto-select a photo (whether or not they've already sent some), set wants_auto_image:true. Only when explicitly requested now.
6. If message has no product info, leave fields as-is, respond helpfully.
7. STORED-FIELD LANGUAGE: product_name, description, brand, and category must ALWAYS be written in ENGLISH — properly translated, not transliterated — regardless of what language the seller spoke in or what language your reply_message uses. Only reply_message follows the conversation language; these stored fields never do.

Respond with JSON:
{
  "product_name": string|null, "retail_price": string|null, "wholesale_price": string|null, "quantity": string|null,
  "description": string|null, "description_was_generated": boolean,
  "brand": string|null, "category": string|null, "color": string|null, "condition": string|null,
  "store_name": string|null,
  "wants_auto_image": boolean,
  "detected_language": "en"/"ur"/"pa"/"sd"/"ps",
  "wants_to_discard": boolean, "reply_message": string
}
If required fields still missing, reply_message asks ONLY for the missing ones. If everything required is present, reply_message reads back all details (mention image count) and asks for "haan"/"yes" to confirm, or what to fix.` + languageDirective(session);
}

async function runExtraction(session, transcriptText, sock, senderJid) {
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

    if (session.needsStoreName && parsed.store_name) {
        session.storeName = parsed.store_name;
        session.needsStoreName = false;
    }

    if (parsed.wants_auto_image) {
    const descriptor = [session.product.product_name, session.product.brand, session.product.color, session.product.condition]
        .filter(Boolean).join(', ');
    await handleAutoImageRequest(session, sock, senderJid, descriptor || transcriptText, 'selling');
    }

    const missing = computeMissingFields(session.product);
    if (session.needsStoreName) missing.push('store_name');
    session.lastAskedFields = missing;
    session.pendingAction = (missing.length === 0 && !session.imageApproval) ? { type: 'publish_product' } : null;

    return parsed.reply_message;
}

// ---- EDITING / DELETE / DASHBOARD ----
function buildEditIntentPrompt(text, products) {
    const list = products.map((p) => `- ${p.product_name} (Rs. ${p.retail_price}, qty ${p.quantity}${p.color ? `, color: ${p.color}` : ''})`).join('\n');
    return `You are Munshi helping a seller manage their EXISTING inventory.
Seller's message: "${text}"
Seller's current active products:
${list || '(none)'}

Respond with JSON: { "sub_intent": "dashboard_summary"|"list_all_products"|"check_status"|"edit_field"|"delete"|"unclear", "product_reference": string|null, "price_hint": number|null, "color_hint": string|null }
- "dashboard_summary": wants STATS ONLY — e.g. "kitne products hain", "orders kitne hain" — a count/summary, NOT a full list.
- "list_all_products": wants to SEE/BROWSE their full inventory as a list — e.g. "sara inventory dikhao", "mere sab products dikhao".
- "check_status"/"edit_field"/"delete": about ONE specific product.
"product_reference" is the seller's own words for which product (null for dashboard_summary/list_all_products).`;
}

function buildEditFieldPrompt(product, transcriptText, session, quotedImageNumber) {
    const lang = effectiveLang(session) || 'the language of this message';
    const imageCount = session.editingImages?.existingUrls?.length || 0;
    return `You are Munshi, helping a seller EDIT an existing product listing.
Current product data: ${JSON.stringify(product)}
This product currently has ${imageCount} image(s), numbered 1 to ${imageCount} (already shown to the seller).
${quotedImageNumber ? `\nThe seller is directly REPLYING to Image ${quotedImageNumber} — if their message concerns an image (delete/replace) and doesn't state a number explicitly, assume they mean image ${quotedImageNumber}.` : ''}
Seller's message: "${transcriptText}"

YOU MUST REPLY IN: ${lang}

Figure out what the seller wants to change. Only include fields they actually want changed.
Respond with JSON:
{
  "updated_fields": { any of product_name, retail_price, wholesale_price, quantity, description, brand, category, color, condition, status — only changed keys, values in ENGLISH },
  "image_removals": [numbers] or null — which numbered image(s) to delete/replace, if any,
  "wants_auto_image": boolean,
  "new_image_position": number|null,
  "wants_to_finish": boolean,
  "wants_to_cancel": boolean, "reply_message": string
}
retail_price/wholesale_price must be plain numbers as strings if changed. category (if changed) MUST be exactly one of: Fashion, Electronics, Home & Living, Groceries, Beauty, Toys, Sports, Books, Other.
status (if changed) MUST be "active" or "inactive". A request to delete/remove/hide/deactivate the PRODUCT or take it off the website means updated_fields.status:"inactive" (soft deletion), not wants_to_cancel. Queue this change for the normal save step and explain that saving will make the product inactive. Removing an IMAGE only uses image_removals and must not change product status.
"REPLACE image N": image_removals includes N, wants_auto_image:true only if they want it auto-found — otherwise they'll send their own photo separately.
IMPORTANT: "wants_to_finish" is true ONLY if the seller explicitly says they're done and want to save NOW (e.g. "save kar do", "bas", "done", "confirm kar do"). A bare "yes"/"haan" alone is NOT enough. In that case, reply_message should summarize what's queued and ask "anything else to change, or should I save this now?" — not a plain yes/no question.
If seller wants to cancel/stop editing entirely: wants_to_cancel:true.` + languageDirective(session);
}

function buildDisambiguationPrompt(text, candidates, session) {
    const list = candidates.map((p, i) => `${i + 1}. ${p.product_name} — Rs. ${p.retail_price}${p.color ? `, color: ${p.color}` : ''}`).join('\n');
    return `You are Munshi. The seller has multiple products matching their request:
${list}

Seller's message: "${text}"

Respond with JSON: { "matched_index": number|null, "wants_to_cancel": boolean, "reply_message": string|null }
"matched_index" is the 1-based index, inferred from price, color, or position they mentioned. null if still can't tell.
If matched_index is null and not cancelling, reply_message should ask again more specifically.` + languageDirective(session);
}

async function buildDashboardSummary(sellerId, lang) {
    const { data: products } = await supabase.from('products').select('status').eq('seller_id', sellerId);
    const active = (products || []).filter((p) => p.status === 'active').length;
    const header = lang === 'ur' ? `Aapke paas ${active} active products hain.` : `You have ${active} active product(s) listed.`;

    const { data: orders, error } = await supabase
        .from('orders').select('id, status, created_at, products(product_name, retail_price, id)')
        .eq('seller_id', sellerId).order('created_at', { ascending: false }).limit(10);

    if (error || !orders || !orders.length) return header + (lang === 'ur' ? '\nAbhi tak koi order nahi.' : '\nNo orders yet.');

    const orderLines = orders.map((o) => {
        const p = o.products;
        return `\n\n📦 ${p?.product_name || '—'} — Rs. ${p?.retail_price || '—'}\nStatus: ${o.status}`;
    }).join('');

    return header + '\n\nRecent orders:' + orderLines;
}

function buildAllProductsList(products, lang) {
    if (!products.length) return lang === 'ur' ? 'Aapke paas abhi koi active product nahi hai.' : "You don't have any active products right now.";
    const lines = products.map((p) => `\n\n📦 ${p.product_name} — Rs. ${p.retail_price}\n${STOREFRONT_URL}/products/${p.id}`).join('');
    return (lang === 'ur' ? 'Aapke tamam active products:' : 'All your active products:') + lines;
}

async function enterEditSession(session, sock, senderJid, product) {
    session.editing = { productId: product.id, matchedName: product.product_name, accumulatedFields: {} };
    session.editingImages = { existingUrls: product.image_urls || [], pendingRemovals: new Set(), pendingAdds: [], pendingStockAdds: [] };

    for (let i = 0; i < session.editingImages.existingUrls.length; i++) {
        await sock.sendMessage(senderJid, { image: { url: session.editingImages.existingUrls[i] }, caption: `Image ${i + 1}` });
    }

    const lang = effectiveLang(session);
    const details = formatProductDetails(product, lang);
    const imageNote = session.editingImages.existingUrls.length
        ? (lang === 'ur' ? `\n\n${session.editingImages.existingUrls.length} tasveerein upar bheji gayi hain (numbered). Kisi tasveer ko reply karke ya number bata kar delete/replace kar sakte hain.` : `\n\n${session.editingImages.existingUrls.length} image(s) sent above (numbered). Reply directly to one, or mention a number, to delete/replace it.`)
        : (lang === 'ur' ? '\n\nAbhi koi tasveer nahi hai — bhej sakte hain ya auto-generate keh sakte hain.' : '\n\nNo images yet — you can send one or ask me to auto-generate.');

    return lang === 'ur'
        ? `"${product.product_name}" ki tafseel:\n${details}${imageNote}\n\nKya change karna hai?`
        : `Here are "${product.product_name}"'s current details:\n${details}${imageNote}\n\nWhat would you like to change?`;
}

function editHasPendingChanges(session) {
    if (!session.editing || !session.editingImages) return false;
    return Object.keys(session.editing.accumulatedFields).length > 0
        || session.editingImages.pendingRemovals.size > 0
        || session.editingImages.pendingAdds.length > 0
        || session.editingImages.pendingStockAdds.length > 0;
}

function summarizePendingImageChanges(session, lang) {
    const parts = [];
    if (session.editingImages.pendingRemovals.size) {
        const nums = [...session.editingImages.pendingRemovals].sort((a, b) => a - b).join(', ');
        parts.push(lang === 'ur' ? `Image ${nums} hataayi jayegi` : `Image ${nums} will be removed`);
    }
    const addCount = session.editingImages.pendingAdds.length + session.editingImages.pendingStockAdds.length;
    if (addCount) parts.push(lang === 'ur' ? `${addCount} nayi tasveer add hogi` : `${addCount} new image(s) will be added`);
    return parts.length ? `\n(${parts.join('; ')})` : '';
}

async function startEditingFlow(session, senderJid, transcriptText, sock) {
    const lang = effectiveLang(session);
    const seller = await getSellerRow(senderJid);
    if (!seller) { session.mode = null; return lang === 'ur' ? 'Aap ne abhi tak koi product list nahi kiya.' : "You haven't listed any products yet."; }

    const products = await fetchActiveProducts(seller.id);
    if (!products.length) { session.mode = null; return lang === 'ur' ? 'Aapke paas abhi koi active product nahi hai.' : "You don't have any active products right now."; }

    const response = await generateWithFallback([{ text: buildEditIntentPrompt(transcriptText, products) }]);
    const { sub_intent, product_reference, price_hint, color_hint } = parseJsonResponse(response.text);

    if (sub_intent === 'dashboard_summary') { session.mode = null; return await buildDashboardSummary(seller.id, lang); }
    if (sub_intent === 'list_all_products') { session.mode = null; return buildAllProductsList(products, lang); }

    if (['edit_field', 'check_status', 'delete'].includes(sub_intent) && !product_reference && price_hint == null && !color_hint) {
        session.mode = null;
        return lang === 'ur' ? 'Konsa product? Naam batayen.' : 'Which product? Please tell me the name.';
    }

    const matches = resolveProductMatch(products, product_reference, price_hint, color_hint);

    if (matches.length === 0) {
        session.mode = null;
        const names = products.map((p) => p.product_name).join(', ');
        return lang === 'ur' ? `Samajh nahi aaya konsa product. Aapke products: ${names}` : `Not sure which product — your products: ${names}`;
    }

    if (matches.length > 1) {
        session.disambiguating = { subIntent: sub_intent, candidates: matches.map((p) => ({ id: p.id, product_name: p.product_name, retail_price: p.retail_price, color: p.color })) };
        const lines = matches.map((p, i) => `${i + 1}. ${p.product_name} — Rs. ${p.retail_price}${p.color ? `, ${p.color}` : ''}`).join('\n');
        return lang === 'ur' ? `Ek se zyada match mile:\n${lines}\nKonsa? Price ya color batayen.` : `Multiple matches:\n${lines}\nWhich one? Mention the price or color to narrow it down.`;
    }

    const product = matches[0];

    if (sub_intent === 'check_status') { session.mode = null; return `${product.product_name}\n${formatProductDetails(product, lang)}`; }

    if (sub_intent === 'delete') {
        session.pendingAction = { type: 'delete_product', productId: product.id, productName: product.product_name };
        return lang === 'ur' ? `Kya aap "${product.product_name}" delete karna chahte hain? "haan" likhen confirm karne ke liye.` : `Delete "${product.product_name}"? Reply "yes" to confirm.`;
    }

    if (sub_intent === 'edit_field') return await enterEditSession(session, sock, senderJid, product);

    session.mode = null;
    return lang === 'ur' ? 'Samajh nahi aaya, dobara batayen.' : "Didn't quite catch that — could you rephrase?";
}

async function continueDisambiguation(session, transcriptText, sock, senderJid) {
    const lang = effectiveLang(session);
    const response = await generateWithFallback([{ text: buildDisambiguationPrompt(transcriptText, session.disambiguating.candidates, session) }]);
    const parsed = parseJsonResponse(response.text);

    if (parsed.wants_to_cancel) { session.mode = null; session.disambiguating = null; return lang === 'ur' ? 'Theek hai, cancel kar diya.' : 'Okay, cancelled.'; }

    if (!parsed.matched_index || !session.disambiguating.candidates[parsed.matched_index - 1]) {
        return parsed.reply_message || (lang === 'ur' ? 'Zara wazeh batayen, konsa product?' : 'Could you be more specific about which one?');
    }

    const chosen = session.disambiguating.candidates[parsed.matched_index - 1];
    const subIntent = session.disambiguating.subIntent;
    session.disambiguating = null;

    if (subIntent === 'delete') {
        session.pendingAction = { type: 'delete_product', productId: chosen.id, productName: chosen.product_name };
        return lang === 'ur' ? `Kya aap "${chosen.product_name}" delete karna chahte hain? "haan" likhen confirm karne ke liye.` : `Delete "${chosen.product_name}"? Reply "yes" to confirm.`;
    }

    if (subIntent === 'check_status') {
        session.mode = null;
        const { data: product } = await supabase.from('products').select('*').eq('id', chosen.id).single();
        return product ? `${chosen.product_name}\n${formatProductDetails(product, lang)}` : failureMessage(session);
    }

    const { data: product } = await supabase.from('products').select('*').eq('id', chosen.id).single();
    if (!product) return failureMessage(session);
    return await enterEditSession(session, sock, senderJid, product);
}

async function continueEditingProduct(session, transcriptText, sock, senderJid, quotedImageNumber = null) {
    const lang = effectiveLang(session);
    const { data: product } = await supabase.from('products').select('*').eq('id', session.editing.productId).single();

    if (!product) { session.mode = null; session.editing = null; session.editingImages = null; return failureMessage(session); }

    const response = await generateWithFallback([{ text: buildEditFieldPrompt(product, transcriptText, session, quotedImageNumber) }]);
    const parsed = parseJsonResponse(response.text);

    if (parsed.wants_to_cancel) {
        session.mode = null; session.editing = null; session.editingImages = null;
        return lang === 'ur' ? 'Theek hai, edit cancel kar diya.' : 'Okay, edit cancelled.';
    }

    Object.assign(session.editing.accumulatedFields, parsed.updated_fields || {});
    (parsed.image_removals || []).forEach((n) => {
        if (n >= 1 && n <= session.editingImages.existingUrls.length) session.editingImages.pendingRemovals.add(n);
    });

    if (parsed.wants_auto_image) {
    const merged = { ...product, ...session.editing.accumulatedFields };
    const descriptor = [merged.product_name, merged.brand, merged.color, merged.condition].filter(Boolean).join(', ');
    await handleAutoImageRequest(session, sock, senderJid, descriptor, 'editing', parsed.new_image_position || null);
    }

    if (parsed.wants_to_finish) {
        if (!editHasPendingChanges(session)) {
            session.mode = null; session.editing = null; session.editingImages = null;
            return lang === 'ur' ? 'Koi change nahi tha, kuch save nahi hua.' : 'No changes were made, nothing to save.';
        }
        session.pendingAction = { type: 'save_edit', productId: session.editing.productId, productName: session.editing.matchedName };
        const result = await executePendingAction(session, senderJid);
        sessions.set(senderJid, blankSession(session.nativeLanguage, session.languageOverride, session.scriptPreference));
        return result;
    }

    let reply = parsed.reply_message;
    if (editHasPendingChanges(session)) reply += summarizePendingImageChanges(session, lang);
    return reply;
}

// ---- BUYING ----
function buildSearchExtractionPrompt(transcriptText) {
    return `You are Munshi, helping a buyer search for a product on a Pakistani online marketplace.
Buyer's message: "${transcriptText}"

Respond with JSON: { "keywords": [short search terms], "min_price": number|null, "max_price": number|null }
keywords can include product type/brand/model AND descriptive terms like color if mentioned.
Convert budgets to numbers ("hazar"/"hazaar" = thousand). Empty keywords array if nothing clear.`;
}

function buildBuyingFollowupPrompt(text, results, session) {
    const list = results.map((p, i) => `${i + 1}. ${p.product_name} — Rs. ${p.retail_price}${p.description ? ' — ' + p.description.slice(0, 100) : ''}`).join('\n');
    return `You are Munshi. You just showed a buyer these products:
${list}

Buyer's next message: "${text}"

Respond with JSON: { "action": "order"|"new_search"|"other", "product_index": number|null, "reply_message": string|null }
"order": buyer wants to buy one. "new_search": wants something different/new.
"other": ANY other message, including questions about the shown products — reply_message MUST directly answer using the product info shown above, never a generic brush-off. For "order"/"new_search", reply_message can be null.` + languageDirective(session);
}

async function runProductQuery(minPrice, maxPrice) {
    let query = supabase.from('products').select('*, sellers(store_name, whatsapp_number, contact_number)').eq('status', 'active');
    if (minPrice != null) query = query.gte('price_numeric', minPrice);
    if (maxPrice != null) query = query.lte('price_numeric', maxPrice);
    const { data, error } = await query;
    if (error) { console.error('Search query failed:', error); return []; }
    return data || [];
}

async function searchProducts(filter) {
    const withPrice = await runProductQuery(filter.min_price, filter.max_price);

    if (filter.keywords && filter.keywords.length) {
        let { results, isExact } = bestKeywordMatches(withPrice, filter.keywords);
        if (results.length) return { results, relaxed: !isExact };

        if (filter.min_price != null || filter.max_price != null) {
            const anyPrice = await runProductQuery(null, null);
            ({ results, isExact } = bestKeywordMatches(anyPrice, filter.keywords));
            if (results.length) return { results, relaxed: true };
        }
        return { results: [], relaxed: true };
    }

    if (filter.min_price != null || filter.max_price != null) return { results: withPrice.slice(0, 5), relaxed: false };
    return { results: [], relaxed: true };
}

async function searchAndReply(session, filter) {
    const lang = effectiveLang(session);

    if ((!filter.keywords || !filter.keywords.length) && filter.min_price == null && filter.max_price == null) {
        session.mode = null;
        return lang === 'ur' ? 'Aap kya dhoond rahe hain? Naam ya category batayen.' : 'What are you looking for? Tell me a product name or category.';
    }

    const { results, relaxed } = await searchProducts(filter);

    if (!results.length) { session.mode = null; return lang === 'ur' ? 'Maazrat, koi matching product nahi mila. Kuch aur bata sakte hain?' : 'Sorry, no matching products found. Can you describe it differently?'; }

    session.lastSearchResults = results.map((p) => ({ id: p.id, product_name: p.product_name, retail_price: p.retail_price, seller_id: p.seller_id, description: p.description }));

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

async function handleBuying(session, transcriptText) {
    const response = await generateWithFallback([{ text: buildSearchExtractionPrompt(transcriptText) }]);
    const filter = parseJsonResponse(response.text);
    return await searchAndReply(session, filter);
}

async function continueBuyingFlow(session, transcriptText) {
    const lang = effectiveLang(session);
    const response = await generateWithFallback([{ text: buildBuyingFollowupPrompt(transcriptText, session.lastSearchResults, session) }]);
    const { action, product_index, reply_message } = parseJsonResponse(response.text);

    if (action === 'order' && product_index && session.lastSearchResults[product_index - 1]) {
        const chosen = session.lastSearchResults[product_index - 1];
        session.pendingAction = { type: 'place_order', productId: chosen.id, sellerId: chosen.seller_id, productName: chosen.product_name };
        return lang === 'ur' ? `"${chosen.product_name}" order karne ke liye "haan" likhen.` : `Reply "yes" to place an order for "${chosen.product_name}".`;
    }

    if (action === 'new_search') { session.lastSearchResults = null; return await handleBuying(session, transcriptText); }

    return reply_message || (lang === 'ur' ? 'Theek hai! Kuch aur chahiye toh batayen.' : "Okay! Let me know if you need anything else.");
}

async function handleMyOrders(session, senderJid) {
    const lang = effectiveLang(session);
    const buyer = await getBuyerRow(senderJid);
    if (!buyer) return lang === 'ur' ? 'Aap ne abhi tak koi order nahi kiya.' : "You haven't placed any orders yet.";

    const { data: orders, error } = await supabase
        .from('orders').select('id, status, created_at, products(product_name, retail_price, id)')
        .eq('buyer_id', buyer.id).order('created_at', { ascending: false }).limit(10);

    if (error) { console.error('Fetch buyer orders failed:', error); return failureMessage(session); }
    if (!orders || !orders.length) return lang === 'ur' ? 'Aap ne abhi tak koi order nahi kiya.' : "You haven't placed any orders yet.";

    const lines = orders.map((o) => {
        const p = o.products;
        return `\n\n📦 ${p?.product_name || '—'} — Rs. ${p?.retail_price || '—'}\nStatus: ${o.status}${p ? `\n${STOREFRONT_URL}/products/${p.id}` : ''}`;
    }).join('');

    return (lang === 'ur' ? 'Aapke orders:' : 'Your orders:') + lines;
}

async function handleOtherMessage(session, transcriptText) {
    const prompt = `You are Munshi, a warm, natural-sounding WhatsApp assistant for a Pakistani e-commerce platform (sellers list products, buyers search for them).
The sender's message doesn't clearly fall into selling, editing, or buying. Message: "${transcriptText}"

Reply naturally and briefly. If it's a simple acknowledgment/thanks/greeting, respond warmly and briefly. If genuinely unclear, gently ask whether they'd like to add a product, check/edit an existing one, or search for something.

Respond with JSON: { "reply_message": string }` + languageDirective(session);

    try {
        const response = await generateWithFallback([{ text: prompt }]);
        return parseJsonResponse(response.text).reply_message;
    } catch (err) {
        console.error('handleOtherMessage LLM call failed, using fallback:', err);
        const lang = effectiveLang(session);
        return lang === 'ur' ? 'Assalam-o-Alaikum! Aap product add karna chahte hain, apna existing product edit/check karna hai, ya kuch dhoond rahe hain?' : 'Hello! Would you like to add a product, edit/check an existing one, or search for something?';
    }
}

function applyPositionedInserts(baseImages, positionedItems) {
    let result = [...baseImages];
    for (const item of positionedItems) {
        if (item.position && item.position >= 1 && item.position <= result.length + 1) {
            result.splice(item.position - 1, 0, item.url);
        } else {
            result.push(item.url);
        }
    }
    return result;
}

// ---- Pending action execution ----
async function executePendingAction(session, senderJid) {
    const action = session.pendingAction;
    const lang = effectiveLang(session);

    if (action.type === 'publish_product') {
        const sellerId = await ensureSeller(senderJid, session.nativeLanguage, session.storeName, session.contactNumber);
        const uploadedUrls = await uploadImages(session.images, sellerId);
        const imageUrls = [...uploadedUrls, ...session.stockImageUrls];
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
        const { error } = await supabase.from('products').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('id', action.productId);
        if (error) throw error;
        return lang === 'ur' ? `"${action.productName}" delete ho gaya.` : `"${action.productName}" has been deleted.`;
    }

    if (action.type === 'save_edit') {
        const { data: productRow, error: fetchErr } = await supabase.from('products').select('seller_id, image_urls').eq('id', action.productId).single();
        if (fetchErr || !productRow) throw fetchErr || new Error('Product not found during save_edit');

        const removals = session.editingImages?.pendingRemovals || new Set();
        const baseImages = (productRow.image_urls || []).filter((_, idx) => !removals.has(idx + 1));

        const pendingAdds = session.editingImages?.pendingAdds || [];
        const uploadedUrls = pendingAdds.length ? await uploadImages(pendingAdds.map((i) => i.base64), productRow.seller_id) : [];
        const uploadedWithPos = uploadedUrls.map((url, i) => ({ url, position: pendingAdds[i]?.position || null }));

        const stockWithPos = (session.editingImages?.pendingStockAdds || []).map((i) => ({ url: i.url, position: i.position || null }));

        const finalImages = applyPositionedInserts(baseImages, [...uploadedWithPos, ...stockWithPos]);

        const updatePayload = { ...(session.editing?.accumulatedFields || {}), image_urls: finalImages, updated_at: new Date().toISOString() };
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
            } catch (err) { console.error('Failed to generate pairing code:', err); }
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

    // UPDATED: the listener now just acquires a per-sender lock and dispatches — everything else moved into processMessage
    const processedMessageIds = new Set();
    const MAX_TRACKED_IDS = 500;
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const msgId = msg.key.id;
        if (msgId) {
            if (processedMessageIds.has(msgId)) {
                console.log(`Skipping duplicate/redelivered message: ${msgId}`);
                return;
            }
            processedMessageIds.add(msgId);
            if (processedMessageIds.size > MAX_TRACKED_IDS) {
                processedMessageIds.delete(processedMessageIds.values().next().value);
            }
        }
        const senderJid = msg.key.remoteJid;
        getSession(senderJid); // Check expiry and refresh activity at message arrival, before queuing.
        console.log(`[JID CHECK] senderJid=${senderJid}`); // temporary diagnostic — remove once JID stability is confirmed
        await runExclusive(senderJid, () => processMessage(msg, senderJid, sock));
    });

    // UPDATED: this is your entire previous handler body, unchanged internally, now wrapped by the lock above
    async function processMessage(msg, senderJid, sock) {
        const messageType = Object.keys(msg.message)[0];
        const session = sessions.get(senderJid);

        const resolvedNumber = resolvePhoneNumber(msg, senderJid);
        if (resolvedNumber) session.contactNumber = resolvedNumber;

        if (messageType === 'imageMessage') {
            const caption = (msg.message.imageMessage?.caption || '').trim();

            if (!session.mode && caption) {
                try {
                    const { mode } = await classifyMode(caption);
                    session.mode = mode === 'other' ? null : mode;
                    if (session.mode === 'selling') {
                        const existingSeller = await getSellerRow(senderJid);
                        session.needsStoreName = !existingSeller?.store_name;
                    }
                } catch (err) { console.error('Mode classification failed for captioned image:', err); }
            }

            if (session.mode === 'selling') {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const base64Str = buffer.toString('base64');
                    const { position } = await parseImageCaptionIntent(caption);
                    if (position && position >= 1 && position <= session.images.length + 1) {
                        session.images.splice(position - 1, 0, base64Str);
                    } else {
                        session.images.push(base64Str);
                    }

                    if (caption) {
                        const reply = await runExtraction(session, caption, sock, senderJid);
                        await sock.sendMessage(senderJid, { text: reply });
                    } else {
                        const lang = effectiveLang(session);
                        const ackMsg = lang === 'ur'
                            ? `Tasveer mil gayi (${session.images.length + session.stockImageUrls.length} total). Aur bhejni hain ya bas itni hi?`
                            : `Image received (${session.images.length + session.stockImageUrls.length} total). Send more, or is that all?`;
                        await sock.sendMessage(senderJid, { text: ackMsg });
                    }
                } catch (error) {
                    console.error('Error processing image:', error);
                    await sock.sendMessage(senderJid, { text: failureMessage(session) });
                }
                return;
            }

            if (session.mode === 'editing' && session.editing && session.editingImages) {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const base64Str = buffer.toString('base64');
                    const { position, replaces } = await parseImageCaptionIntent(caption);
                    if (replaces && replaces >= 1 && replaces <= session.editingImages.existingUrls.length) {
                        session.editingImages.pendingRemovals.add(replaces);
                    }
                    session.editingImages.pendingAdds.push({ base64: base64Str, position: position || replaces || null });

                    if (caption) {
                        const reply = await continueEditingProduct(session, caption, sock, senderJid);
                        await sock.sendMessage(senderJid, { text: reply });
                    } else {
                        const lang = effectiveLang(session);
                        const pendingCount = session.editingImages.pendingAdds.length + session.editingImages.pendingStockAdds.length;
                        await sock.sendMessage(senderJid, {
                            text: lang === 'ur'
                                ? `Tasveer mil gayi (${pendingCount} nayi, pending). Aur changes karein ya "save karo" likhen.`
                                : `Image received (${pendingCount} new, pending). Make more changes or say "save now" when done.`,
                        });
                    }
                } catch (error) {
                    console.error('Error processing edit image:', error);
                    await sock.sendMessage(senderJid, { text: failureMessage(session) });
                }
                return;
            }

            if (!session.mode || session.mode === 'buying') {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const filter = await describeImageForSearchFilter(buffer);
                    if (caption) {
                        const captionWords = caption.split(/\s+/).filter((w) => w.length > 2);
                        filter.keywords = [...new Set([...captionWords, ...(filter.keywords || [])])];
                    }
                    session.mode = 'buying';
                    session.lastSearchResults = null;
                    const reply = await searchAndReply(session, filter);
                    await sock.sendMessage(senderJid, { text: reply });
                } catch (error) {
                    console.error('Error processing buyer image search:', error);
                    await sock.sendMessage(senderJid, { text: failureMessage(session) });
                }
            }
            return;
        }

        let transcriptText = null;
        let quotedImageNumber = null;

        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
            transcriptText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            quotedImageNumber = extractQuotedImageNumber(msg);
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

        if (session.pendingAction && !session.editing) {
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

        if (session.imageApproval) {
            const lang = effectiveLang(session);
            const approvalResult = await classifyImageApprovalReply(transcriptText).catch(() => ({ action: 'other' }));

            if (approvalResult.action === 'approve') {
                const chosen = session.imageApproval.candidates[session.imageApproval.index];
                const context = session.imageApproval.context;
                const position = session.imageApproval.position || null;
                session.imageApproval = null;

                if (context === 'editing' && session.editing) {
                    session.editingImages.pendingStockAdds.push({ url: chosen, position });
                } else {
                    session.stockImageUrls.push(chosen);
                    const missing = computeMissingFields(session.product);
                    session.pendingAction = (missing.length === 0 && !session.needsStoreName) ? { type: 'publish_product' } : null;
                }
                await sock.sendMessage(senderJid, { text: lang === 'ur' ? 'Theek hai, yeh image save ho gayi.' : 'Great, image saved.' });
                return;
            }
            if (approvalResult.action === 'reject') {
                session.imageApproval.index += 1;
                const found = await findNextVerifiedCandidate(session);
                if (found) {
                    await sock.sendMessage(senderJid, { image: { url: found }, caption: lang === 'ur' ? 'Yeh theek hai? "haan" ya "nahi".' : 'How about this one? "yes" or "no".' });
                } else {
                    session.imageApproval = null;
                    await sock.sendMessage(senderJid, { text: lang === 'ur' ? 'Koi aur relevant image nahi mili. Aap khud bhi bhej sakte hain.' : 'No more relevant images found — feel free to send your own.' });
                }
                return;
            }
            if (approvalResult.action === 'skip_search') {
                session.imageApproval = null;
                if (session.mode === 'editing' && session.editing) {
                    await sock.sendMessage(senderJid, {
                        text: lang === 'ur' ? 'Theek hai, image search chor di. Aur kuch change karna hai ya save karoon?' : 'Okay, skipping the image search. Anything else to change, or should I save now?',
                    });
                } else {
                    const missing = computeMissingFields(session.product);
                    session.pendingAction = (missing.length === 0 && !session.needsStoreName) ? { type: 'publish_product' } : null;
                    await sock.sendMessage(senderJid, {
                        text: session.pendingAction
                            ? (lang === 'ur' ? 'Theek hai, image ke baghair. Confirm karne ke liye "haan" likhen.' : 'Okay, proceeding without that image. Reply "yes" to confirm and publish.')
                            : (lang === 'ur' ? 'Theek hai, image search chor di. Baqi tafseel bata dein.' : "Okay, skipping the image search. Please share the remaining details."),
                    });
                }
                return;
            }
            if (approvalResult.action === 'cancel_all') {
                const context = session.imageApproval.context;
                if (context === 'editing' && session.editing) {
                    session.mode = null; session.editing = null; session.editingImages = null; session.imageApproval = null;
                    await sock.sendMessage(senderJid, { text: lang === 'ur' ? 'Theek hai, edit cancel kar diya.' : 'Okay, edit cancelled.' });
                } else {
                    const { nativeLanguage, languageOverride, scriptPreference } = session;
                    Object.assign(session, blankSession(nativeLanguage, languageOverride, scriptPreference));
                    await sock.sendMessage(senderJid, { text: lang === 'ur' ? 'Theek hai, product cancel kar diya.' : 'Okay, listing cancelled.' });
                }
                return;
            }
        }

        try {
            try {
                const switchResult = await detectLanguageSwitch(transcriptText);
                if (switchResult.requests_switch) {
                    if (switchResult.wants_default_reset) { session.languageOverride = null; session.scriptPreference = null; }
                    if (switchResult.target_language) session.languageOverride = switchResult.target_language;
                    if (switchResult.target_script) session.scriptPreference = switchResult.target_script;
                }
            } catch (err) { console.error('Language switch detection failed (continuing anyway):', err); }

            if (!session.mode) {
                try {
                    const { mode } = await classifyMode(transcriptText);
                    session.mode = mode === 'other' ? null : mode;
                    if (session.mode === 'selling') {
                        const existingSeller = await getSellerRow(senderJid);
                        session.needsStoreName = !existingSeller?.store_name;
                    }
                } catch (err) {
                    console.error('Mode classification failed (treating as other):', err);
                    session.mode = null;
                }
            }

            let reply;
            if (session.mode === 'selling') {
                reply = await runExtraction(session, transcriptText, sock, senderJid);
            } else if (session.mode === 'editing') {
                if (session.editing) reply = await continueEditingProduct(session, transcriptText, sock, senderJid, quotedImageNumber);
                else if (session.disambiguating) reply = await continueDisambiguation(session, transcriptText, sock, senderJid);
                else reply = await startEditingFlow(session, senderJid, transcriptText, sock);
            } else if (session.mode === 'buying') {
                reply = session.lastSearchResults ? await continueBuyingFlow(session, transcriptText) : await handleBuying(session, transcriptText);
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
    }
}

startBot();
