console.log('🚀 Web Helper background service worker starting...');

try {
  importScripts('browser-embedding.js', 'browser-query.js');
  console.log('✅ Service scripts imported successfully');
} catch (error) {
  console.warn('⚠️ Failed to import service scripts:', error);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Background received message:', request.action);
  
  if (request.action === 'extractContent') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.error('❌ No active tab found');
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const activeTab = tabs[0];
      console.log('🎯 Extracting from tab:', activeTab.id, activeTab.url);

      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['final.js']
      }).then(() => {
        console.log('✅ Content script injected successfully');
        
        setTimeout(() => {
          chrome.tabs.sendMessage(activeTab.id, { action: 'extract' }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('❌ Content script communication error:', chrome.runtime.lastError.message);
              sendResponse({ 
                success: false, 
                error: chrome.runtime.lastError.message 
              });
            } else if (!response) {
              console.error('❌ No response from content script');
              sendResponse({ 
                success: false, 
                error: 'No response from content script. Please try refreshing the page.' 
              });
            } else {
              console.log('📤 Content extraction response:', response?.success ? 'success' : 'failed');
              sendResponse(response);
            }
          });
        }, 300);
      }).catch(error => {
        console.error('❌ Script injection failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    });
    
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log(' Web Helper extension installed!');
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    console.log('Web Helper extension updated!');
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'quick_extract') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.runtime.sendMessage({ 
          action: 'extractContent' 
        }, (response) => {
          console.log('Keyboard shortcut extract result:', response?.success ? 'success' : 'failed');
        });
      }
    });
  }
});

console.log(' Web Helper background service worker initialized.');