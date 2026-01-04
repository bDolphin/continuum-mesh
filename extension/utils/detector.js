/**
 * Context Type Detection
 * Automatically categorize captured text by source and content
 * Location: extension/utils/detector.js
 */

// Detect global scope (works in service workers and content scripts)
// Use var with check to avoid duplicate declaration when imported multiple times
if (typeof globalScope === 'undefined') {
  var globalScope = typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : {};
}

// Only declare if not already loaded
if (typeof globalScope.ContextDetector === 'undefined') {
  class ContextDetector {
    static CONTEXT_TYPES = {
      CODE: 'code',
      RESEARCH: 'research',
      CHAT: 'chat',
      DOC: 'doc',
      EMAIL: 'email',
    };

    static detectByUrl(url) {
      if (!url) return this.CONTEXT_TYPES.RESEARCH;

      const urlLower = url.toLowerCase();

      // Code detection
      if (
        urlLower.includes('github.com') ||
        urlLower.includes('stackoverflow.com') ||
        urlLower.includes('gist.github.com') ||
        urlLower.includes('gitlab.com') ||
        urlLower.includes('bitbucket.org')
      ) {
        return this.CONTEXT_TYPES.CODE;
      }

    // Chat detection
    if (
      urlLower.includes('chat.openai.com') ||
      urlLower.includes('chatgpt.com') ||
      urlLower.includes('discord.com') ||
      urlLower.includes('slack.com')
    ) {
      return this.CONTEXT_TYPES.CHAT;
    }

    // Research detection
    if (
      urlLower.includes('perplexity.ai') ||
      urlLower.includes('google.com/search') ||
      urlLower.includes('wikipedia.org') ||
      urlLower.includes('medium.com') ||
      urlLower.includes('dev.to')
    ) {
      return this.CONTEXT_TYPES.RESEARCH;
    }

    // Document detection
    if (
      urlLower.includes('docs.google.com') ||
      urlLower.includes('notion.so') ||
      urlLower.includes('confluence') ||
      urlLower.includes('dropbox.com')
    ) {
      return this.CONTEXT_TYPES.DOC;
    }

    // Email detection
    if (
      urlLower.includes('mail.google.com') ||
      urlLower.includes('outlook.com') ||
      urlLower.includes('proton.me')
    ) {
      return this.CONTEXT_TYPES.EMAIL;
    }

    return this.CONTEXT_TYPES.RESEARCH;
  }

  static detectByContent(text) {
    if (!text) return this.CONTEXT_TYPES.RESEARCH;

    const textLower = text.toLowerCase();

    // Code patterns
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=|let\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+.*from/,
      /def\s+\w+\s*\(/,
      /if\s*\(/,
      /<\/?\w+[^>]*>/,
      /\$\{.*\}/,
      /```|```.*\n/,
    ];

    if (codePatterns.some((pattern) => pattern.test(text))) {
      return this.CONTEXT_TYPES.CODE;
    }

    // Chat patterns
    if (textLower.includes('?') && text.length < 200) {
      return this.CONTEXT_TYPES.CHAT;
    }

    return this.CONTEXT_TYPES.RESEARCH;
  }

  static detect(text, url) {
    // URL has priority
    const byUrl = this.detectByUrl(url);
    if (byUrl !== this.CONTEXT_TYPES.RESEARCH) {
      return byUrl;
    }

    // Fall back to content detection
    return this.detectByContent(text);
  }

  static extractTags(text, url, contextType) {
    const tags = [];

    // Add context type
    tags.push(contextType);

    // URL-based tags
    if (url) {
      const urlLower = url.toLowerCase();
      if (urlLower.includes('github.com')) tags.push('github');
      if (urlLower.includes('stackoverflow.com')) tags.push('stackoverflow');
      if (urlLower.includes('chatgpt.com')) tags.push('chatgpt');
      if (urlLower.includes('perplexity.ai')) tags.push('perplexity');
    }

    // Content-based tags
    const textLower = text.toLowerCase();
    if (textLower.includes('javascript')) tags.push('javascript');
    if (textLower.includes('python')) tags.push('python');
    if (textLower.includes('react')) tags.push('react');
    if (textLower.includes('database')) tags.push('database');
    if (textLower.includes('api')) tags.push('api');
    if (textLower.includes('authentication')) tags.push('auth');

    return [...new Set(tags)]; // Remove duplicates
  }
}

// Assign to global scope
if (typeof globalScope.ContextDetector === 'undefined') {
  globalScope.ContextDetector = ContextDetector;
}
} // Close the if(typeof globalScope.ContextDetector === 'undefined')
globalScope.ContextDetector = ContextDetector;
