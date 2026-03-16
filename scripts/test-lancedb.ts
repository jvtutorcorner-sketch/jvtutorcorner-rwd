import dotenv from 'dotenv';
import path from 'path';

// MUST be called before importing other local modules
dotenv.config({ path: '.env.local' });

async function runTest() {
    console.log('🚀 Starting LanceDB Integration Test...');

    try {
        // Use dynamic imports to ensure dotenv.config() has run
        const { getEmbedding } = await import('../lib/embeddings.js');
        const { addMemory, searchMemory } = await import('../lib/lancedb.js');

        const testTableName = 'test_memories_v1';
        const testText = 'JV Tutor Corner provides excellent 1-on-1 English lessons.';

        console.log('\n--- Phase 1: Embedding Generation ---');
        const embedding = await getEmbedding(testText);
        console.log(`✅ Embedding generated. Dimension: ${embedding.length}`);

        console.log('\n--- Phase 2: Memory Storage ---');
        await addMemory(testTableName, [
            { text: testText, metadata: { category: 'test', source: 'test-script' } },
            { text: 'The interactive whiteboards make learning visual.', metadata: { category: 'test', source: 'test-script' } }
        ]);
        console.log('✅ Memory stored in LanceDB.');

        console.log('\n--- Phase 3: Vector Search ---');
        const query = 'How are the English lessons?';
        console.log(`🔍 Searching for: "${query}"`);
        const searchResults = await searchMemory(testTableName, query, 3);
        console.log(`✅ Search completed. Found ${searchResults.length} results.`);

        searchResults.forEach((res, i) => {
            console.log(`   [${i + 1}] Score: ${res._distance?.toFixed(4) || 'N/A'} | Text: "${res.text}"`);
        });

        if (searchResults.length > 0 && searchResults[0].text.includes('English lessons')) {
            console.log('\n✨ SUCCESS: Highly relevant result found at position 1!');
        } else if (searchResults.some(r => r.text.includes('English lessons'))) {
            console.log('\n💪 STATUS: Relevant result found, but not at the top.');
        } else {
            console.warn('\n⚠️ WARNING: Relevant result not found in top 3.');
        }

        console.log('\n--- Phase 4: Database Connection Check ---');
        const { getDb } = await import('../lib/lancedb.js');
        const db = await getDb();
        const tables = await db.tableNames();
        console.log(`✅ Available tables: ${tables.join(', ')}`);

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        process.exit(1);
    }
}

runTest();
