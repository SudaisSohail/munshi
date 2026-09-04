// list-models.js
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1 });

const list = await ai.models.list();
for await (const model of list) {
    if (model.supportedActions?.includes('generateContent')) {
        console.log(model.name);
    }
}