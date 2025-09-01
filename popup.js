document.addEventListener('DOMContentLoaded', function() {
    const queryInput = document.getElementById('queryInput');
    const searchBtn = document.getElementById('searchBtn');
    const extractBtn = document.getElementById('extractBtn');
    const extractStatus = document.getElementById('extractStatus');
    const extractProgressBar = document.getElementById('extractProgressBar');
    const pageInfo = document.getElementById('pageInfo');
    const pageInfoContent = document.getElementById('pageInfoContent');
    const resultsContent = document.getElementById('resultsContent');
    const historyContent = document.getElementById('historyContent');
    const historyList = document.getElementById('historyList');

    let currentPageContent = null;
    let isExtracting = false;
    let isProcessing = false;

    checkApiConfiguration();

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tabName + 'Content').classList.add('active');
            
            if (tabName === 'history') {
                loadHistory();
            }
        });
    });

    extractBtn.addEventListener('click', async () => {
        if (isExtracting) return;
        
        isExtracting = true;
        extractBtn.disabled = true;
        extractBtn.textContent = '⏳ Extracting...';
        
        showExtractStatus('📋 Extracting content from current page...', 'processing', 20);
        showLoading('Extracting content from current page...');
        
        try {
            const apiCheck = await checkApiConfiguration();
            if (!apiCheck) {
                throw new Error('Please configure your API keys and Pinecone host URL first in the extension options.');
            }

            try {
                const tabs = await chrome.tabs.query({active: true, currentWindow: true});
                if (tabs.length > 0) {
                    const currentTab = tabs[0];
                    showPageInfo(currentTab.title, currentTab.url);
                }
            } catch (e) {
                console.log('Could not get tab info:', e);
            }

            showExtractStatus('📄 Processing page content...', 'processing', 40);

            const response = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Extract operation timed out after 45 seconds. Please try refreshing the page.'));
                }, 45000);

                chrome.runtime.sendMessage({ 
                    action: 'extractContent' 
                }, (response) => {
                    clearTimeout(timeoutId);
                    
                    if (chrome.runtime.lastError) {
                        reject(new Error('Extension communication error: ' + chrome.runtime.lastError.message));
                        return;
                    }
                    
                    if (!response) {
                        reject(new Error('No response from extension. Try reloading the extension.'));
                        return;
                    }
                    
                    if (!response.success) {
                        reject(new Error(response.error || 'Content extraction failed'));
                        return;
                    }
                    
                    resolve(response);
                });
            });

            if (response && response.success) {
                currentPageContent = response;
                const totalWords = response.totalWords || 0;
                
                extractBtn.textContent = '📄 Processing...';
                extractBtn.classList.add('processing');
                showExtractStatus('🧠 Processing content for AI...', 'processing', 70);
                showLoading('Processing content for efficient storage and retrieval...');
                
                const uploadResponse = await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        reject(new Error('Upload operation timed out after 60 seconds.'));
                    }, 60000);

                    chrome.runtime.sendMessage({
                        action: 'uploadWebpage',
                        ragData: response
                    }, (uploadResult) => {
                        clearTimeout(timeoutId);
                        
                        if (chrome.runtime.lastError) {
                            reject(new Error('Upload communication error: ' + chrome.runtime.lastError.message));
                            return;
                        }
                        
                        if (!uploadResult) {
                            reject(new Error('No response from upload service'));
                            return;
                        }
                        
                        console.log('Upload response:', uploadResult);
                        resolve(uploadResult);
                    });
                });

                showExtractStatus('✨ Finalizing...', 'processing', 90);

                if (uploadResponse.useDirectContext === true) {
                    chrome.runtime.sendMessage({
                        action: 'setPageContext',
                        content: response
                    });
                    
                    showExtractStatus(`✅ Page ready! ${totalWords} words extracted (Direct mode)`, 'success', 100);
                    
                    showResult({
                        query: 'Content Extraction',
                        answer: `✅ **Page content extracted successfully!**\n\n📊 **Content Summary:**\n• ${response.chunks?.length || 0} text chunks found\n• ${totalWords} total words\n• **Storage method**: Direct context (token-efficient for small content)\n\n💡 **Ready for Questions!**\nYour content is ready for AI-powered Q&A. The system will use the full content directly for maximum accuracy.\n\n🎯 **Try asking:**\n• "What is this page about?"\n• "Summarize the key points"\n• "What are the main topics covered?"`,
                        sources: [{ 
                            url: response.metadata?.url || 'Current Page',
                            title: response.metadata?.title || 'Current Page'
                        }],
                        timestamp: new Date().toISOString()
                    });
                } else if (uploadResponse.success === true) {
                    showExtractStatus(`✅ Page processed! ${uploadResponse.stored} chunks stored`, 'success', 100);
                    
                    showResult({
                        query: 'Content Extraction',
                        answer: `✅ **Page content processed and stored successfully!**\n\n📊 **Content Summary:**\n• ${response.chunks?.length || 0} text chunks extracted\n• ${totalWords} total words\n• **${uploadResponse.stored} chunks** stored in vector database\n• **Storage method**: Vector embeddings (optimized for search)\n\n🔍 **Smart Search Enabled!**\nYour questions will now search through the most relevant parts of this content using vector similarity search.\n\n🎯 **Benefits:**\n• More accurate and contextual answers\n• Efficient token usage\n• Faster response times\n• Semantic understanding of your content\n\n💬 **Ready for intelligent Q&A!**`,
                        sources: [{ 
                            url: uploadResponse.url,
                            title: response.metadata?.title || 'Stored Content'
                        }],
                        timestamp: new Date().toISOString()
                    });
                } else {
                    const errorMsg = uploadResponse.error || uploadResponse.reason || 'Unknown processing error';
                    console.log('Upload failed:', uploadResponse);
                    
                    if (uploadResponse.reason === 'Not suitable for RAG') {
                        showExtractStatus('⚠️ Content not suitable for processing', 'error', 0);
                        showError(`Content extraction completed but the page content was not suitable for AI processing.\n\n**Possible reasons:**\n• Page contains mostly navigation/UI elements\n• Very little readable text content\n• Content blocked by the website\n\n**Try:**\n• A different webpage with more text content\n• Scroll down to load more content\n• Check if the page finished loading`);
                    } else {
                        showExtractStatus('❌ Processing failed', 'error', 0);
                        throw new Error(errorMsg);
                    }
                }
                
            } else {
                throw new Error('Failed to extract content');
            }
            
        } catch (error) {
            console.error('Extract error:', error);
            let errorMessage = 'Failed to extract and process page content: ' + error.message;
            
            if (error.message.includes('timed out')) {
                errorMessage += '\n\n**Try:** Refresh the page and try again, or try a simpler webpage.';
                showExtractStatus('⏱️ Operation timed out', 'error', 0);
            } else if (error.message.includes('communication error')) {
                errorMessage += '\n\n**Try:** Reload the extension in chrome://extensions/ and refresh this page.';
                showExtractStatus('🔌 Connection error', 'error', 0);
            } else if (error.message.includes('host URL')) {
                errorMessage += '\n\n**Try:** Check your Pinecone host URL in extension options.';
                showExtractStatus('🌐 Configuration error', 'error', 0);
            } else {
                showExtractStatus('❌ Extraction failed', 'error', 0);
            }
            
            showError(errorMessage);
            
            setTimeout(() => {
                extractStatus.style.display = 'none';
            }, 5000);
            
        } finally {
            isExtracting = false;
            extractBtn.disabled = false;
            extractBtn.textContent = '📤 Extract Page';
            extractBtn.classList.remove('processing');
            
            if (extractStatus.classList.contains('success')) {
                setTimeout(() => {
                    extractStatus.style.display = 'none';
                }, 3000);
            }
        }
    });

    searchBtn.addEventListener('click', async () => {
        const query = queryInput.value.trim();
        if (!query || isProcessing) return;

        isProcessing = true;
        searchBtn.disabled = true;
        searchBtn.textContent = '🔍 Searching...';
        
        showLoading('Searching through your content...');

        try {
            const apiCheck = await checkApiConfiguration();
            if (!apiCheck) {
                throw new Error('Please configure your API keys and Pinecone host URL first.');
            }

            const searchResponse = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Search timed out after 60 seconds.'));
                }, 60000);

                chrome.runtime.sendMessage({
                    action: 'processQuery',
                    query: query,
                    directContent: currentPageContent
                }, (response) => {
                    clearTimeout(timeoutId);
                    
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (!response) {
                        reject(new Error('No response from search service'));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (searchResponse && searchResponse.answer) {
                showResult(searchResponse);
                queryInput.value = '';
            } else {
                throw new Error('No valid response received from search');
            }

        } catch (error) {
            console.error('Search error:', error);
            let errorMessage = `Search failed: ${error.message}`;
            
            if (error.message.includes('host URL')) {
                errorMessage += '\n\n**Check:** Your Pinecone host URL in extension options.';
            } else if (error.message.includes('API key')) {
                errorMessage += '\n\n**Check:** Your API keys in extension options.';
            }
            
            showError(errorMessage);
        } finally {
            isProcessing = false;
            searchBtn.disabled = false;
            searchBtn.textContent = '🔍 Search';
        }
    });

    queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isProcessing) {
            searchBtn.click();
        }
    });

    function showExtractStatus(message, type, progress = 0) {
        extractStatus.style.display = 'block';
        extractStatus.className = `extract-status ${type}`;
        extractStatus.innerHTML = `
            <div>${message}</div>
            <div class="extract-progress">
                <div class="extract-progress-bar" style="width: ${progress}%"></div>
            </div>
        `;
    }

    function showPageInfo(title, url) {
        const domain = getDomain(url);
        pageInfoContent.innerHTML = `
            <strong>${title}</strong><br>
            <span style="color: #718096;">${domain}</span>
        `;
        pageInfo.style.display = 'block';
    }

    async function checkApiConfiguration() {
        try {
            const result = await chrome.storage.local.get(['geminiApiKey', 'pineconeApiKey', 'pineconeHost']);
            const hasRequiredKeys = result.geminiApiKey && result.pineconeApiKey && result.pineconeHost;
            
            if (!hasRequiredKeys) {
                let missingItems = [];
                if (!result.geminiApiKey) missingItems.push('Gemini API key');
                if (!result.pineconeApiKey) missingItems.push('Pinecone API key');
                if (!result.pineconeHost) missingItems.push('Pinecone host URL');
                
                showError(`⚙️ **Setup Required**: Missing ${missingItems.join(', ')}\n\n**Steps:**\n1. Right-click the extension icon\n2. Select "Options"\n3. Enter your API keys and Pinecone host URL\n4. Test connection\n5. Save settings\n\n**Get API keys:**\n• Gemini: Google AI Studio\n• Pinecone: Pinecone Console (free tier available)\n\n**Pinecone Host URL Example:**\nhttps://your-index-abc123.svc.pinecone.io`);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('API check error:', error);
            return false;
        }
    }

    function showLoading(message = 'Processing...') {
        resultsContent.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <span>${message}</span>
            </div>
        `;
    }

    function showResult(result) {
        const confidence = result.sources?.length > 0 ? 'high' : 'medium';
        const sourcesHtml = result.sources?.length > 0 ? `
            <div class="sources">
                <div class="sources-title">📚 Sources:</div>
                ${result.sources.map(source => `
                    <a href="${source.url}" class="source-item" target="_blank">
                        <div class="source-title">${source.title || 'Untitled'}</div>
                        <div class="source-domain">${getDomain(source.url || 'http://localhost')}</div>
                    </a>
                `).join('')}
            </div>
        ` : '';

        resultsContent.innerHTML = `
            <div class="answer-card">
                <div class="confidence ${confidence}">${confidence.toUpperCase()} CONFIDENCE</div>
                <div class="answer-text">${formatAnswer(result.answer)}</div>
                ${sourcesHtml}
            </div>
        `;
    }

    function showError(message) {
        resultsContent.innerHTML = `
            <div class="error-message">
                ⚠️ ${message.replace(/\n/g, '<br>')}
            </div>
        `;
    }

    function formatAnswer(text) {
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/•/g, '•');
    }

    function getDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return 'current page';
        }
    }

    function loadHistory() {
        chrome.storage.local.get(['queryHistory'], (result) => {
            const history = result.queryHistory || [];
            
            if (history.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📜</div>
                        <p>No search history yet</p>
                        <small>Your questions and answers will appear here</small>
                    </div>
                `;
                return;
            }
            
            historyList.innerHTML = history.slice(0, 20).map(item => `
                <div class="history-item" data-query="${escapeHtml(item.query)}">
                    <div class="history-query">${escapeHtml(item.query)}</div>
                    <div class="history-time">${new Date(item.timestamp).toLocaleString()}</div>
                </div>
            `).join('');
            
            historyList.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => {
                    const query = item.dataset.query;
                    queryInput.value = query;
                    
                    document.querySelector('[data-tab="results"]').click();
                    queryInput.focus();
                });
            });
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    loadHistory();
});