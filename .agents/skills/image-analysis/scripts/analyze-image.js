const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function analyze() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  const imageArgs = (process.argv[2] || 'teacher_courses_failed.png').split(',');
  const promptArg = process.argv[3] || 'prompts/test-case-generator.md';
  const contextArg = process.argv[4]; 

  const promptPath = path.isAbsolute(promptArg) ? promptArg : path.join(process.cwd(), promptArg);
  if (!fs.existsSync(promptPath)) {
    console.error(`Error: Prompt file not found at ${promptPath}`);
    process.exit(1);
  }

  let promptText = fs.readFileSync(promptPath, 'utf-8');
  if (contextArg && fs.existsSync(contextArg)) {
    const contextData = fs.readFileSync(contextArg, 'utf-8');
    promptText += `\n\n## Context (Metadata):\n${contextData}`;
  }

  // Build model inputs
  const modelParts = [promptText];
  
  for (const imgArg of imageArgs) {
    const imgPath = path.isAbsolute(imgArg) ? imgArg : path.join(process.cwd(), imgArg);
    if (!fs.existsSync(imgPath)) {
      console.warn(`Warning: Image file not found at ${imgPath}, skipping.`);
      continue;
    }
    
    const buffer = fs.readFileSync(imgPath);
    const data = buffer.toString('base64');
    const ext = path.extname(imgPath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    if (ext === '.pdf') mimeType = 'application/pdf';

    modelParts.push({
      inlineData: {
        data: data,
        mimeType: mimeType,
      },
    });
    console.log(`Added file: ${path.basename(imgPath)} (${mimeType})`);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

  try {
    const result = await model.generateContent(modelParts);
    const response = await result.response;
    let text = response.text();
    
    // Attempt to extract JSON if it's wrapped in markdown code blocks
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      text = jsonMatch[1];
    }

    console.log('\n--- Analysis Result ---\n');
    console.log(text);
    
    // Save result to a file
    const outputPath = path.join(__dirname, '../analysis_output.json');
    fs.writeFileSync(outputPath, text);
    console.log(`\nResult saved to: ${outputPath}`);

  } catch (error) {
    console.error('Error during analysis:', error.message);
  }
}

analyze();
