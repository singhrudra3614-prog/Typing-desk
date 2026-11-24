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

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        You are an elite typing coach for a game called TypeQuest. 
        Analyze this user's stats and provide a short, motivational arcade-style coaching session (3-4 sentences max).
        User Stats:
        - WPM: ${profile.averageWpm}
        - Accuracy: ${profile.averageAccuracy}%
        - Level: ${profile.level}
        - XP: ${profile.xp}
        
        Focus on identifying if they need more speed or more precision. Use gaming terminology (e.g., "crushing the undead", "light speed", "matrix data").
      `,
    });

    const text = response.text;

    return NextResponse.json({ text });
  } catch (error) {
    console.error('API Coaching error:', error);
    return NextResponse.json({ error: 'Failed to generate feedback' }, { status: 500 });
  }
}
