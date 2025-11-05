function getBaseUrl(fullUrl) {
  try {
    const urlObj = new URL(fullUrl);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (e) {
    console.error("Invalid URL:", fullUrl, e);
    return null;
  }
}

function parseApiResponse(textResponse) {
  try {
    let data = JSON.parse(textResponse);
    
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (innerError) {
        console.warn("Second parse attempt failed, treating as string response");
        return {
          status: "success",
          rawResponse: textResponse,
          ai_summary: {
            summary: textResponse,
            risk_score: "N/A"
          }
        };
      }
    }
    
    if (!data.status) {
      data.status = "success";
    }
    
    return data;
  } catch (parseError) {
    console.error("JSON parse failed:", parseError);

    return {
      status: "error",
      error: "Invalid API response format",
      rawResponse: textResponse
    };
  }
}

async function performScan(baseUrl) {
  if (!baseUrl) {
    console.error("No base URL provided for scan");
    return { error: "Invalid URL" };
  }

  console.log("🔍 Initiating scan for:", baseUrl);
  
  try {
    const response = await fetch("https://naijatrust-webscanner.onrender.com/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: baseUrl })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const textResponse = await response.text();
    console.log("✅ Raw API Response:", textResponse);

    const data = parseApiResponse(textResponse);
    
    data.timestamp = Date.now();
    if (!data.url) {
      data.url = baseUrl;
    }
    
    if (!data.safe_check) {
      data.safe_check = {
        safe: data.ai_summary?.risk_score ? 
          (formatRiskScore(data.ai_summary.risk_score) < 60) : true,
        message: "Safety assessment completed"
      };
    }

    console.log("✅ Processed scan data for", baseUrl, ":", data);

    await chrome.storage.local.set({ [baseUrl]: data });
    await chrome.storage.local.set({ lastScannedUrl: baseUrl });
    
    return data;
  } catch (err) {
    console.error("❌ Error scanning site:", baseUrl, err);
    
    const errorData = { 
      error: err.message,
      timestamp: Date.now(),
      url: baseUrl
    };
    
    await chrome.storage.local.set({ [baseUrl]: errorData });
    await chrome.storage.local.set({ lastScannedUrl: baseUrl });
    
    return errorData;
  }
}

function formatRiskScore(score) {
  if (!score || score === "N/A") return 50;
  
  if (score.includes('-')) {
    const [min, max] = score.split('-').map(Number);
    return Math.round((min + max) / 2 * 10);
  }
  
  const numScore = parseFloat(score);
  return isNaN(numScore) ? 50 : Math.round(numScore * 10);
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.active) {
    const currentBaseUrl = getBaseUrl(tab.url);
    
    if (currentBaseUrl) {
      const lastScanned = (await chrome.storage.local.get('lastScannedUrl')).lastScannedUrl;
      const lastScanTime = (await chrome.storage.local.get('lastScanTime')).lastScanTime;
      const now = Date.now();
      
      if (lastScanned === currentBaseUrl && lastScanTime && (now - lastScanTime < 120000)) {
        console.log("Skipping recent scan for:", currentBaseUrl);
        return;
      }

      await performScan(currentBaseUrl);
      await chrome.storage.local.set({ 
        lastScannedUrl: currentBaseUrl,
        lastScanTime: now 
      });
    }
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    const currentBaseUrl = getBaseUrl(tab.url);
    
    if (currentBaseUrl) {
      const lastScanned = (await chrome.storage.local.get('lastScannedUrl')).lastScannedUrl;
      const lastScanTime = (await chrome.storage.local.get('lastScanTime')).lastScanTime;
      const now = Date.now();
      
      if (lastScanned === currentBaseUrl && lastScanTime && (now - lastScanTime < 120000)) {
        console.log("Skipping recent scan for:", currentBaseUrl);
        return;
      }
      
      await performScan(currentBaseUrl);
      await chrome.storage.local.set({ 
        lastScannedUrl: currentBaseUrl,
        lastScanTime: now 
      });
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "performManualScan") {
    console.log("Manual scan requested for:", request.url);
    
    performScan(request.url)
      .then(result => {
        if (result && !result.error) {
          sendResponse({ status: "success" });
        } else {
          sendResponse({ status: "error", error: result?.error || "Scan failed" });
        }
      })
      .catch(error => {
        console.error("Manual scan error:", error);
        sendResponse({ status: "error", error: error.message });
      });
    
    return true;
  }
});

console.log("NaijaTrust Scanner background script loaded");