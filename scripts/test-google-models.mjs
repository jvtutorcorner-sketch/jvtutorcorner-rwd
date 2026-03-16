import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error('Missing GEMINI_API_KEY in .env.local');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
    try {
        const models = await genAI.listModels();
        for (const model of models) {
            console.log(model.name);
        }
    } catch (error) {
        console.error('Error listing models:', error);
    }
}

run();
