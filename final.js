function extractRAGContent() {
  'use strict';

  // Configuration for extraction thresholds and filters
  const config = {
    minTextLength: 12,
    maxChunkSize: 2000,
    debug: false,
    enableTextNodeFallback: true,
    viewportMultiplier: 5,
    minWordCount: 5,
    maxWordCount: 400,
    contentDensityThreshold: 0.3,
  };

  // CSS selectors for elements considered as noise or ads
  const noiseSelectors = [
    'script', 'style', 'noscript', 'link', 'meta',
    'nav', 'header[role="banner"]', 'footer', 'aside',
    'form[role="search"]', '.navbar', '.menu', '.sidebar',
    '[aria-hidden="true"]', '[style*="display: none"]', '[style*="visibility: hidden"]',
    '[class*="cookie"]', '[class*="gdpr"]', '[class*="privacy"]', '[class*="consent"]',
    '[id*="cookie"]', '[id*="gdpr"]', '[id*="privacy"]', '[id*="consent"]',
    '[class*="ad-"]', '[class*="ads"]', '[class*="advertisement"]', '[class*="sponsor"]',
    '[id*="ad-"]', '[id*="ads"]', '[id*="advertisement"]', '[id*="sponsor"]',
    '[data-ad]', '[data-ads]', '[data-advertisement]', '[data-sponsor]',
    '.ad', '.ads', '#ad', '#ads',
    '[class*="banner"]', '[class*="promo"]', '[class*="affiliate"]',
    '[class*="widget"]', '[class*="sidebar"]', '[class*="related"]',
    '[class*="social"]', '[class*="share"]', '[class*="follow"]', '[class*="subscribe"]',
    '.twitter-timeline', '.facebook-like', '.instagram-media',
    '[class*="comment"]', '[class*="reply"]', '[class*="vote"]', '[class*="rating"]',
    'iframe[src*="disqus"]', 'iframe[src*="facebook"]', 'iframe[src*="twitter"]',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]', 
    'iframe[src*="googletagmanager"]', 'iframe[src*="amazon-adsystem"]',
    'iframe[src*="outbrain"]', 'iframe[src*="taboola"]',
    '[class*="newsletter"]', '[class*="signup"]', '[class*="subscription"]',
    '[class*="breadcrumb"]', '[class*="pagination"]', '[class*="pager"]'
  ];

  // Keywords to identify ad-related text
  const adKeywords = [
    'advertisement', 'sponsored', 'promoted', 'affiliate', 'buy now', 
    'shop now', 'click here', 'learn more', 'subscribe', 'sign up',
    'newsletter', 'free trial', 'limited time', 'special offer',
    'discount', 'sale', 'promo code', 'coupon'
  ];

  // Check if an element is visible in the viewport and not hidden by styles
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const withinExtendedViewport =
      rect.bottom > -1000 &&
      rect.top < window.innerHeight * (config.viewportMultiplier || 1);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           parseFloat(style.opacity || '1') > 0.05 &&
           rect.width > 1 &&
           rect.height > 1 &&
           withinExtendedViewport;
  }

  // Determine if an element matches noise or ad patterns
  function isNoise(el) {
    try {
      if (noiseSelectors.some(sel => el.matches(sel) || el.closest(sel))) {
        return true;
      }
      const attrs = ['class', 'id', 'data-testid', 'data-component'];
      for (const attr of attrs) {
        const value = (el.getAttribute(attr) || '').toLowerCase();
        if (value.includes('ad') || value.includes('sponsor') || value.includes('promo')) {
          return true;
        }
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 50 && rect.height < 50 && rect.width * rect.height < 1000) {
        return true;
      }
      return false;
    } catch { 
      return false; 
    }
  }

  // Check if a text string is likely to be an advertisement
  function isAdvertisementText(text) {
    if (!text || text.length < 10) return false;
    const lowerText = text.toLowerCase();
    return adKeywords.some(keyword => lowerText.includes(keyword)) &&
           (text.length < 100 || lowerText.includes('click') || lowerText.includes('buy'));
  }

  // Calculate the ratio of text to HTML for an element
  function calculateTextDensity(el) {
    const textLength = (el.innerText || '').length;
    const htmlLength = el.innerHTML.length;
    return htmlLength > 0 ? textLength / htmlLength : 0;
  }

  // Decide if an element is likely to contain main content
  function isContentElement(el) {
    if (!el || isNoise(el)) return false;
    const density = calculateTextDensity(el);
    if (density < config.contentDensityThreshold && el.tagName !== 'P' && !el.tagName.match(/^H[1-6]$/)) {
      return false;
    }
    const contentTags = ['ARTICLE', 'MAIN', 'SECTION', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'];
    if (contentTags.includes(el.tagName)) return true;
    const className = (el.className || '').toLowerCase();
    const contentClasses = ['content', 'article', 'post', 'text', 'body', 'description', 'summary'];
    if (contentClasses.some(cls => className.includes(cls))) return true;
    return true;
  }

  // Generate a simple selector for an element
  function getElementSelector(el) {
    if (!el) return '';
    if (el.id) return `#${el.id}`;
    const classes = (el.className || '').toString().trim().split(/\s+/).filter(Boolean);
    if (classes.length) return `.${classes[0]}`;
    return el.tagName ? el.tagName.toLowerCase() : '';
  }

  // Find the nearest heading related to an element for context
  function findContextualHeading(el) {
    let cur = el;
    let depth = 0;
    const maxDepth = 5;
    while (cur && cur.previousElementSibling && depth < maxDepth) {
      cur = cur.previousElementSibling;
      const tag = (cur.tagName || '').toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const heading = (cur.innerText || '').trim();
        if (heading.length > 3 && heading.length < 200) return heading;
      }
      depth++;
    }
    let parent = el && el.parentElement;
    depth = 0;
    while (parent && depth < maxDepth) {
      const headings = parent.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const h of headings) {
        if (isVisible(h)) {
          const heading = (h.innerText || '').trim();
          if (heading.length > 3 && heading.length < 200) return heading;
        }
      }
      parent = parent.parentElement;
      depth++;
    }
    return '';
  }

  // Guess the type of content based on URL, title, and domain
  function detectContentType() {
    const url = (window.location.href || '').toLowerCase();
    const title = (document.title || '').toLowerCase();
    const domain = (window.location.hostname || '').toLowerCase();
    const patterns = {
      news: [/news|cnn|bbc|reuters|associated-press|nytimes|guardian|washingtonpost/, 
             /article|breaking|latest|update|press|report|journalism/],
      blog: [/blog|medium|substack|wordpress|blogspot/,
             /blog|post|story|opinion|editorial/],
      ecommerce: [/shop|store|amazon|ebay|etsy|shopify/,
                  /shop|buy|cart|product|price|store|purchase/],
      documentation: [/docs|documentation|github|readthedocs|wiki/,
                      /docs|documentation|guide|api|manual|tutorial|reference/],
      academic: [/edu|scholar|research|arxiv|pubmed/,
                 /research|paper|study|journal|academic|thesis|dissertation/],
      forum: [/reddit|stackoverflow|quora|discourse/,
              /forum|discussion|thread|community|qa|question/],
      video: [/youtube|vimeo|twitch|video/,
              /watch|video|stream|episode|show/],
      social: [/twitter|facebook|instagram|linkedin|social/,
               /social|tweet|post|profile|feed|timeline/]
    };
    for (const [type, [domainPattern, contentPattern]] of Object.entries(patterns)) {
      if (domainPattern.test(domain) || contentPattern.test(url) || contentPattern.test(title)) {
        return type;
      }
    }
    return 'general';
  }

  // Gather metadata about the page for context
  function getPageMetadata() {
    const titleSources = [
      () => document.querySelector('meta[property="og:title"]')?.content,
      () => document.querySelector('meta[name="twitter:title"]')?.content,
      () => document.querySelector('title')?.innerText,
      () => document.querySelector('h1')?.innerText,
      () => document.title
    ];
    let title = 'Untitled';
    for (const source of titleSources) {
      try {
        const t = (source() || '').trim();
        if (t && t.length > 3) { 
          title = t.slice(0, 300); 
          break; 
        }
      } catch {}
    }
    const descSources = [
      () => document.querySelector('meta[name="description"]')?.content,
      () => document.querySelector('meta[property="og:description"]')?.content,
      () => document.querySelector('meta[name="twitter:description"]')?.content,
      () => document.querySelector('article p, .content p, main p')?.innerText
    ];
    let description = '';
    for (const source of descSources) {
      try {
        const d = (source() || '').trim();
        if (d && d.length > 10) { 
          description = d.slice(0, 1000); 
          break; 
        }
      } catch {}
    }
    return {
      title,
      description,
      url: window.location.href,
      domain: window.location.hostname,
      language: document.documentElement.lang || 
                document.querySelector('meta[http-equiv="content-language"]')?.content || 'en',
      timestamp: new Date().toISOString(),
      contentType: detectContentType(),
      wordCount: (document.body.innerText || '').split(/\s+/).length
    };
  }

  // Split long text into smaller chunks for processing
  function intelligentChunking(text, maxSize) {
    if (text.length <= maxSize) return [text];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    if (paragraphs.length > 1) {
      const chunks = [];
      let current = '';
      for (const para of paragraphs) {
        if ((current + para).length > maxSize && current) {
          chunks.push(current.trim());
          current = para;
        } else {
          current += (current ? '\n\n' : '') + para;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks;
    }
    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if ((current + ' ' + trimmed).length > maxSize && current) {
        chunks.push(current.trim());
        current = trimmed;
      } else {
        current += (current ? ' ' : '') + trimmed;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length ? chunks : [text];
  }

  // Remove duplicates, ads, and normalize extracted chunks
  function enhancedCleanup(chunks) {
    const cleaned = [];
    const seen = new Set();
    for (const chunk of chunks) {
      let text = (chunk.content || '')
        .replace(/\s+/g, ' ')
        .replace(/[^\S ]/g, ' ')
        .trim();
      if (text.length < config.minTextLength) continue;
      if (isAdvertisementText(text)) continue;
      const words = text.split(/\s+/);
      if (words.length < config.minWordCount) continue;
      if (words.length > config.maxWordCount) {
        const subChunks = intelligentChunking(text, config.maxChunkSize);
        for (let i = 0; i < subChunks.length; i++) {
          const subText = subChunks[i];
          const subKey = subText.toLowerCase().slice(0, 80);
          if (!seen.has(subKey) && subText.split(/\s+/).length >= config.minWordCount) {
            seen.add(subKey);
            cleaned.push({
              ...chunk,
              content: subText,
              wordCount: subText.split(/\s+/).length,
              chunkIndex: i
            });
          }
        }
        continue;
      }
      const key = text.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      let isDuplicate = false;
      for (const existingChunk of cleaned) {
        const existing = existingChunk.content.toLowerCase();
        if (existing.includes(text.toLowerCase()) || text.toLowerCase().includes(existing)) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) continue;
      seen.add(key);
      cleaned.push({
        ...chunk,
        content: text,
        wordCount: words.length
      });
    }
    return cleaned;
  }

  // Extract content from semantic HTML elements like <article> and <main>
  function extractFromSemanticElements() {
    const contentContainers = [
      document.querySelector('main'),
      document.querySelector('article'),
      document.querySelector('[role="main"]'),
      document.querySelector('.post-content, .article-content, .content, .entry-content'),
      document.querySelector('.post-body, .article-body, .story-body'),
      document.body
    ].filter(Boolean)[0];
    const prioritySelectors = [
      'article p, main p, .content p, .post-content p',
      'article h1, article h2, article h3, main h1, main h2, main h3',
      'article blockquote, main blockquote, .content blockquote',
      'article li, main li, .content li',
      'article div, main div, .content div'
    ];
    const fallbackSelectors = [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 
      'li', 'pre', 'code', 'figcaption', 'td', 'th'
    ];
    let elements = [];
    for (const selector of prioritySelectors) {
      const found = Array.from(contentContainers?.querySelectorAll(selector) || []);
      if (found.length > 0) {
        elements = found;
        break;
      }
    }
    if (elements.length === 0) {
      elements = Array.from(contentContainers?.querySelectorAll(fallbackSelectors.join(',')) || []);
    }
    const chunks = [];
    elements.forEach((el, idx) => {
      if (!isVisible(el) || !isContentElement(el)) return;
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length < config.minTextLength) return;
      if (isAdvertisementText(text)) return;
      const hasContentParent = chunks.some(chunk => {
        return chunk.content.includes(text) || text.includes(chunk.content);
      });
      if (hasContentParent) return;
      const heading = findContextualHeading(el);
      const tagName = (el.tagName || 'div').toLowerCase();
      chunks.push({
        type: tagName,
        content: text,
        heading,
        order: idx,
        selector: getElementSelector(el),
        importance: tagName.match(/^h[1-6]$/) ? 'high' : 
                   tagName === 'p' ? 'medium' : 'low'
      });
    });
    return chunks;
  }

  // Fallback extraction from text nodes if semantic extraction is insufficient
  function extractFromTextNodesEnhanced(existingChunks) {
    if (!config.enableTextNodeFallback) return [];
    const totalWords = existingChunks.reduce((sum, chunk) => {
      return sum + (chunk.wordCount || chunk.content.split(/\s+/).length);
    }, 0);
    if (totalWords >= 150) return [];
    const contentContainer = 
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('.content, .main-content, .post-content') ||
      document.body;
    const walker = document.createTreeWalker(
      contentContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = (node.nodeValue || '').trim();
          const parent = node.parentElement;
          if (!text || text.length < 25 || !parent) return NodeFilter.FILTER_REJECT;
          if (!isVisible(parent) || isNoise(parent)) return NodeFilter.FILTER_REJECT;
          if (isAdvertisementText(text)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    const chunks = [];
    let node;
    const processedTexts = new Set();
    while ((node = walker.nextNode()) && chunks.length < 100) {
      const parent = node.parentElement;
      const text = (node.nodeValue || '').trim();
      if (existingChunks.some(chunk => chunk.content.includes(text.slice(0, 50)))) {
        continue;
      }
      const textKey = text.slice(0, 100);
      if (processedTexts.has(textKey)) continue;
      processedTexts.add(textKey);
      chunks.push({
        type: 'textnode',
        content: text,
        heading: findContextualHeading(parent),
        order: existingChunks.length + chunks.length,
        selector: 'textnode',
        importance: 'low'
      });
    }
    return chunks;
  }

  // Evaluate the quality and structure of the extracted content
  function buildQualityAssessment(chunks) {
    const totalWords = chunks.reduce((sum, chunk) => sum + (chunk.wordCount || 0), 0);
    const avgWords = Math.round(totalWords / Math.max(1, chunks.length));
    const hasHeadings = chunks.some(chunk => /^h[1-6]$/.test(chunk.type));
    const hasStructure = chunks.some(chunk => chunk.heading);
    const variety = new Set(chunks.map(chunk => chunk.type)).size;
    const highImportanceChunks = chunks.filter(chunk => chunk.importance === 'high').length;
    const quality = {
      isContentRich: totalWords >= 200,
      hasGoodChunkSize: avgWords >= 15 && avgWords <= 300,
      hasStructure: hasHeadings || hasStructure,
      hasVariety: variety > 3,
      hasHighQualityContent: highImportanceChunks > 0,
      ragReady: totalWords >= 200 && chunks.length >= 5
    };
    const ragAssessment = {
      suitable: quality.ragReady && totalWords >= 100,
      recommendation: quality.ragReady
        ? 'Excellent for RAG ingestion - rich content with good structure'
        : totalWords < 100
          ? 'Limited content detected. Page may be dynamic or content-light.'
          : 'Usable content but may benefit from additional sources for comprehensive coverage.',
      contentScore: Math.min(100, Math.round((totalWords / 1000) * 100)),
      qualityScore: Math.round(
        (Object.values(quality).filter(Boolean).length / Object.keys(quality).length) * 100
      )
    };
    return { 
      totalWords, 
      avgWordsPerChunk: avgWords, 
      quality, 
      ragAssessment,
      varietyScore: variety,
      structureElements: hasHeadings ? 'headings' : hasStructure ? 'contextual' : 'minimal'
    };
  }

  // Main extraction and processing logic
  try {
    const startTime = performance.now();
    const metadata = getPageMetadata();
    const semanticChunks = extractFromSemanticElements();
    const fallbackChunks = extractFromTextNodesEnhanced(semanticChunks);
    const allChunks = semanticChunks.concat(fallbackChunks);
    const cleanedChunks = enhancedCleanup(allChunks);
    const sortedChunks = cleanedChunks.sort((a, b) => {
      const importanceOrder = { high: 3, medium: 2, low: 1 };
      const aScore = importanceOrder[a.importance] || 1;
      const bScore = importanceOrder[b.importance] || 1;
      if (aScore !== bScore) return bScore - aScore;
      return a.order - b.order;
    });
    const assessment = buildQualityAssessment(sortedChunks);
    const processingTime = Math.round(performance.now() - startTime);
    const result = {
      success: true,
      metadata: {
        ...metadata,
        processingTimeMs: processingTime
      },
      chunks: sortedChunks,
      totalWords: assessment.totalWords,
      totalChunks: sortedChunks.length,
      averageWordsPerChunk: assessment.avgWordsPerChunk,
      suitable: assessment.ragAssessment.suitable,
      quality: assessment.quality,
      ragAssessment: assessment.ragAssessment,
      extraction: {
        semanticElementsFound: semanticChunks.length,
        fallbackNodesUsed: fallbackChunks.length,
        duplicatesRemoved: allChunks.length - cleanedChunks.length,
        varietyScore: assessment.varietyScore,
        structureType: assessment.structureElements
      },
      timestamp: new Date().toISOString()
    };
    if (config.debug) {
      console.log(`[Enhanced RAG] Processing completed in ${processingTime}ms`);
      console.log(`[Enhanced RAG] Chunks: ${result.totalChunks}, Words: ${result.totalWords}, Avg: ${result.averageWordsPerChunk}`);
      console.log(`[Enhanced RAG] Quality Score: ${result.ragAssessment.qualityScore}%, Content Score: ${result.ragAssessment.contentScore}%`);
      console.log(`[Enhanced RAG] Structure: ${assessment.structureElements}, Variety: ${assessment.varietyScore} types`);
    }
    try { window.ragExtractionResult = result; } catch {}
    return result;
  } catch (error) {
    console.error('Enhanced extraction failed:', error);
    return {
      success: false,
      error: error.message,
      chunks: [],
      totalWords: 0,
      totalChunks: 0,
      suitable: false,
      timestamp: new Date().toISOString()
    };
  }
}

// Listen for extension messages and trigger extraction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    try {
      const result = extractRAGContent();
      if (result && typeof sendResponse === 'function') {
        sendResponse(result);
      }
    } catch (error) {
      console.error('⚠️ Enhanced extraction error:', error);
      sendResponse && sendResponse({
        success: false,
        error: error.message,
        chunks: [],
        totalWords: 0,
        totalChunks: 0,
        suitable: false,
        timestamp: new Date().toISOString()
      });
    }
    return true;
  }
});

// Ready log for extension initialization
console.log('🚀 Enhanced RAG Web Extractor ready - Better content detection & ad filtering enabled');