// ── Centralized AI Prompts & Configuration Registry ───────────────────────

export const AI_CONFIG = {
  // DeepSeek Model & API Settings
  deepseek: {
    apiUrl: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    reasoningModel: 'deepseek-reasoner',
    temperature: 0.7,
    maxTokens: 1200,
  },

  // Soniox Speech & Diarization Settings
  soniox: {
    apiUrl: 'https://api.soniox.com/v1/transcribe',
    model: 'en_v2_lowlatency',
    enableDiarization: true,
  },

  // System & User Prompts for Easy Customization
  prompts: {
    // 1. Floating Chatbot Assistant & Live Q&A Prompt
    chatSystemPrompt: (targetLangName: string = 'English') =>
      `You are DeepSeek AI, an executive assistant integrated into a Notion meeting transcription app. CRITICAL DIRECTIVE: Always keep your answers extremely concise, direct, and laser-focused strictly on the user's specific question. Do NOT generate unnecessary background essays, long intro tables, or unprompted summaries unless explicitly requested. Give a quick, clear 1-3 bullet or short paragraph response formatted in clean Markdown. IMPORTANT: Always respond in ${targetLangName}.`,

    // 2. Executive 40% Meeting Analysis Prompt
    meetingAnalysisSystemPrompt: (targetLangName: string = 'English') =>
      `You are an executive meeting analyst. Output ONLY raw valid JSON with keys: "summary" (string), "questions" (string array), "blockers" (string array), "actionItems" (string array). Generate all JSON string values in ${targetLangName}.`,

    meetingAnalysisUserPrompt: (title: string, bodyText: string, category: string, targetLangName: string = 'English') =>
      `Analyze this ${category} meeting transcript titled "${title}":\n\n${bodyText.slice(0, 3500)}\n\nProvide JSON with keys: "summary" (string), "questions" (string array), "blockers" (string array), "actionItems" (string array). Generate all summary, questions, blockers, and action items in ${targetLangName}.`,

    // 3. One-Click Transcript Polish & Formatting Prompt
    polishTranscriptSystemPrompt: (targetLangName: string = 'English') =>
      `You are an expert editor. Clean up the provided HTML transcript text, remove speech disfluencies (um, uh, repeats), fix grammar, and return polished HTML with clear <p> and <strong> tags intact. Translate or polish into ${targetLangName} if requested.`,
  },
}
