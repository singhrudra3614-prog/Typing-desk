import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { profile } = await req.json();

    if (!profile) {
      return NextResponse.json({ error: 'Profile data is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Extract missed keys and sort by frequency
    const missedKeys = profile.missedKeys || {};
    const sortedMissed = Object.entries(missedKeys)
      .sort(([, a]: any, [, b]: any) => b - a)
      .slice(0, 5)
      .map(([key]) => key);

    const prompt = `
      You are an advanced AI Training Assistant for TypeQuest.
      Create a custom typing lesson using a JSON format.
      
      User Profile:
      - Average WPM: ${profile.averageWpm}
      - Average Accuracy: ${profile.averageAccuracy}%
      - Most Missed Keys: ${sortedMissed.join(', ') || 'None yet'}
      
      Requirements:
      1. If they miss specific keys, include many words specifically containing those keys (e.g., if 'x' is missed, use "exercise", "galaxy", "matrix").
      2. If accuracy is low (< 90%), focus on common bigrams and trigrams to build muscle memory.
      3. If accuracy is high but WPM is low, focus on longer, complex words or full sentences to challenge speed.
      4. The theme should be technical/cyberpunk.
      
      Output ONLY a JSON object with this structure:
      {
        "lessonTitle": "...",
        "focusArea": "...",
        "words": ["word1", "word2", "word3", ...], // Exactly 15-20 words/phrases
        "difficulty": "beginner" | "intermediate" | "advanced"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const text = response.text;
    if (!text) {
      throw new Error('No content returned from AI');
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const lessonData = JSON.parse(jsonMatch[0]);

    return NextResponse.json(lessonData);
  } catch (error) {
    console.error('API Lesson error:', error);
    return NextResponse.json({ error: 'Failed to generate custom lesson' }, { status: 500 });
  }
}
