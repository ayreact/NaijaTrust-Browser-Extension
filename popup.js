async function getBaseUrl(fullUrl) {
  try {
    const urlObj = new URL(fullUrl);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch {
    return null;
  }
}

function formatRiskScore(score) {
  if (!score || score === "N/A") return "N/A";
  
  if (score.includes('-')) {
    const [min, max] = score.split('-').map(Number);
    const avg = (min + max) / 2;
    return Math.round(avg * 10);
  }
  
  const numScore = parseFloat(score);
  return isNaN(numScore) ? "N/A" : Math.round(numScore * 10);
}

function getRiskBadgeClass(score) {
  if (score === "N/A") return "bg-secondary";
  
  const numScore = typeof score === 'string' ? formatRiskScore(score) : score;
  
  if (numScore === "N/A") return "bg-secondary";
  if (numScore < 30) return "bg-success";
  if (numScore < 60) return "bg-warning text-dark";
  return "bg-danger";
}

function updateRiskMeter(score) {
  const riskFill = document.getElementById("riskFill");
  if (!riskFill) return;
  
  const numScore = formatRiskScore(score);
  if (numScore === "N/A") {
    riskFill.style.width = "0%";
    riskFill.style.backgroundColor = "#6c757d"; 
    return;
  }
  
  riskFill.style.width = `${numScore}%`;
  
  if (numScore < 30) {
    riskFill.style.backgroundColor = "#28a745";
  } else if (numScore < 60) {
    riskFill.style.backgroundColor = "#ffc107";
  } else {
    riskFill.style.backgroundColor = "#dc3545";
  }
}

function displayDataCollected(dataArray) {
  const container = document.getElementById("dataCollected");
  if (!container) return;
  
  if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
    container.innerHTML = '<small class="text-muted">No specific data collection details available</small>';
    return;
  }
  
  container.innerHTML = '<small class="text-secondary">Data collected:</small><br>';
  dataArray.forEach(item => {
    if (item && item.trim()) {
      container.innerHTML += `<span class="data-tag">${item}</span>`;
    }
  });
}

async function displayStoredResults() {
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const scanBtn = document.getElementById("scanCurrentPage");

  // Reset display
  statusEl.style.display = "block";
  resultEl.style.display = "none";
  scanBtn.style.display = "none";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentBaseUrl = await getBaseUrl(tab.url);

    if (!currentBaseUrl) {
      statusEl.className = "alert alert-warning";
      statusEl.innerHTML = `<i class="fas fa-exclamation-circle me-2"></i>Cannot scan this page type (e.g., internal Chrome pages). Please navigate to a valid website.`;
      scanBtn.style.display = "block";
      return;
    }

    statusEl.innerHTML = `<i class="fas fa-spinner fa-spin status-icon"></i>Checking scan data for ${currentBaseUrl}...`;

    const storedData = await chrome.storage.local.get(currentBaseUrl);
    const data = storedData[currentBaseUrl];

    if (data && data.error) {
      statusEl.className = "alert alert-danger";
      statusEl.innerHTML = `<i class="fas fa-exclamation-triangle me-2"></i>Scan Error: ${data.error}`;
      scanBtn.style.display = "block";
    } else if (data && data.status === "success") {
      document.getElementById("url").textContent = data.url || currentBaseUrl;
      document.getElementById("url").setAttribute("title", data.url || currentBaseUrl);

      const safetyEl = document.getElementById("safety");
      const isSafe = data.safe_check?.safe;
      const safetyIcon = (isSafe === true) ? 
        '<i class="fas fa-check-circle me-1 text-success"></i>' : 
        '<i class="fas fa-exclamation-circle me-1 text-danger"></i>';
      safetyEl.innerHTML = `${safetyIcon}${(isSafe === true) ? "Safe" : "Unsafe"}`;

      const riskScore = data.ai_summary?.risk_score || "N/A";
      const riskEl = document.getElementById("risk");
      riskEl.innerHTML = `<span class="badge ${getRiskBadgeClass(riskScore)}">${formatRiskScore(riskScore)}/100</span>`;
      
      updateRiskMeter(riskScore);

      document.getElementById("summary").textContent = data.ai_summary?.summary || "No summary available.";

      displayDataCollected(data.ai_summary?.data_collected);

      const scanTimeEl = document.getElementById("scanTime");
      if (data.timestamp) {
        const scanDate = new Date(data.timestamp);
        scanTimeEl.textContent = `Scanned: ${scanDate.toLocaleTimeString()}`;
      } else {
        scanTimeEl.textContent = "Recently scanned";
      }

      statusEl.style.display = "none";
      resultEl.style.display = "block";
    } else {
      statusEl.className = "alert alert-info";
      statusEl.innerHTML = `<i class="fas fa-info-circle me-2"></i>No scan data available for this URL. Click "Scan Now" to perform a security check.`;
      scanBtn.style.display = "block";
    }
  } catch (err) {
    console.error("Error retrieving or displaying results:", err);
    statusEl.className = "alert alert-danger";
    statusEl.innerHTML = `<i class="fas fa-times-circle me-2"></i>Unexpected error: ${err.message}`;
    scanBtn.style.display = "block";
  }
}

document.getElementById('scanCurrentPage').addEventListener('click', async () => {
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");
  const scanBtn = document.getElementById("scanCurrentPage");

  statusEl.style.display = "block";
  resultEl.style.display = "none";
  scanBtn.style.display = "none";

  statusEl.className = "alert alert-info";
  statusEl.innerHTML = `<i class="fas fa-spinner fa-spin status-icon"></i>Performing security scan...`;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentBaseUrl = await getBaseUrl(tab.url);

    if (currentBaseUrl) {
      chrome.runtime.sendMessage({ 
        action: "performManualScan", 
        url: currentBaseUrl 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError);
          statusEl.className = "alert alert-danger";
          statusEl.innerHTML = `<i class="fas fa-times-circle me-2"></i>Connection error. Please try again.`;
          scanBtn.style.display = "block";
          return;
        }

        if (response && response.status === "success") {
          console.log("Manual scan initiated successfully");
          setTimeout(displayStoredResults, 1000);
        } else {
          statusEl.className = "alert alert-danger";
          statusEl.innerHTML = `<i class="fas fa-times-circle me-2"></i>Scan failed: ${response?.error || 'Unknown error'}`;
          scanBtn.style.display = "block";
        }
      });
    } else {
      statusEl.className = "alert alert-warning";
      statusEl.innerHTML = `<i class="fas fa-exclamation-circle me-2"></i>Cannot scan this page type.`;
      scanBtn.style.display = "block";
    }
  } catch (err) {
    console.error("Error initiating manual scan:", err);
    statusEl.className = "alert alert-danger";
    statusEl.innerHTML = `<i class="fas fa-times-circle me-2"></i>Error: ${err.message}`;
    scanBtn.style.display = "block";
  }
});

document.getElementById('visitNaijaTrust').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://naijatrust.vercel.app' });
});

document.addEventListener('DOMContentLoaded', () => {
  displayStoredResults();
});

chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentBaseUrl = await getBaseUrl(tab.url); 
    
    if (currentBaseUrl && changes[currentBaseUrl]) {
      displayStoredResults();
    }
  }
});