'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Callable function using Firebase Secret Manager for OPENAI_API_KEY.
exports.aiChat = functions.runWith({ secrets: ['OPENAI_API_KEY'] }).https.onCall(async (data, context) => {
  const message = data?.message;
  const systemInstruction = data?.systemInstruction || '';

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or empty `message` parameter.');
  }

  // Optional: require authentication
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'Authentication required for aiChat.');
  // }

  try {
    // Use global fetch (Node 18+) to call OpenAI from server-side. The secret is injected
    // into the runtime as process.env.OPENAI_API_KEY via Firebase Secrets.
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error('aiChat: OPENAI_API_KEY not available in environment.');
      throw new functions.https.HttpsError('internal', 'AI backend not configured.');
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error('OpenAI API error', openaiRes.status, errText);
      throw new functions.https.HttpsError('internal', 'OpenAI API error');
    }

    const openaiData = await openaiRes.json();
    const reply = openaiData.choices?.[0]?.message?.content || '';

    return { reply };
  } catch (err) {
    console.error('aiChat caught error', err);
    throw new functions.https.HttpsError('internal', 'AI backend failure');
  }
});
