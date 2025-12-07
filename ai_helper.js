// ai_helper.js

// ai_helper.js

/**
 * Útbaigazítások átfogalmazása AI segítségével
 * @param {Array} instructions - Az eredeti útbaigazítások tömbje
 * @param {String} language - Nyelv kódja (pl. 'hu', 'en')
 * @returns {Promise<Array>} - Az átfogalmazott útbaigazítások tömbje
 */
async function refineInstructionsWithAI(instructions, language = null) {
    // Use global currentLanguage if not provided
    if (!language && typeof currentLanguage !== 'undefined') {
        language = currentLanguage;
    }
    // Fallback to 'hu' if still null
    if (!language) language = 'hu';

    // Ha nincs instrukció, akkor visszaadjuk üresen
    if (!instructions || instructions.length === 0) {
        return [];
    }

    try {
        const response = await fetch('ai_refine.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                instructions: instructions,
                language: language
            })
        });

        if (!response.ok) {
            console.error('AI API hiba:', response.status, response.statusText);
            // Ha hiba van, visszaadjuk az eredeti instrukciókat
            return instructions;
        }

        const data = await response.json();

        if (data.error) {
            console.error('AI feldolgozási hiba:', data.error);
            // Ha hiba van, visszaadjuk az eredeti instrukciókat
            return instructions;
        }

        if (data.success && data.refined_instructions) {
            console.log('AI átfogalmazás sikeres!');
            return data.refined_instructions;
        }

        // Ha valami váratlan történt, visszaadjuk az eredetit
        return instructions;

    } catch (error) {
        console.error('AI hívás hiba:', error);
        // Hiba esetén visszaadjuk az eredeti instrukciókat
        return instructions;
    }
}

/**
 * Egy instrukció átfogalmazása AI segítségével
 * @param {String} instruction - Az eredeti útbaigazítás
 * @param {String} language - Nyelv kódja
 * @returns {Promise<String>} - Az átfogalmazott útbaigazítás
 */
async function refineSingleInstructionWithAI(instruction, language = null) {
    const result = await refineInstructionsWithAI([instruction], language);
    return result[0] || instruction;
}