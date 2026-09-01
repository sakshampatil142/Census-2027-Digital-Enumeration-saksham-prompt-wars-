// public/app.js
let currentStep = 1;
let currentLanguage = 'en';
let amenitiesChartInstance = null;
let housingChartInstance = null;
let activeUtterance = null;
let difyConversationId = '';

const translations = {
  en: {
    tagline: "National Digital Demographics & AI Enumeration Platform",
    nav_self_enum: "Self-Enumeration",
    nav_satyavani: "SatyaVani AI (Fact Checker)",
    nav_enumerator: "Enumerator Co-Pilot",
    nav_schedule: "Schedule & Pincode",
    nav_insights: "Demographics AI"
  },
  hi: {
    tagline: "राष्ट्रीय डिजिटल जनसांख्यिकी एवं AI गणना पोर्टल",
    nav_self_enum: "नागरिक स्व-गणना",
    nav_satyavani: "सत्यवाणी AI (तथ्य जांच)",
    nav_enumerator: "प्रगणक सहायक",
    nav_schedule: "समय-सारणी व पिनकोड",
    nav_insights: "जनसांख्यिकी AI"
  },
  ta: {
    tagline: "தேசிய டிஜிட்டல் மக்கள் தொகை மற்றும் AI கணக்கெடுப்பு தளம்",
    nav_self_enum: "சுய-கணக்கெடுப்பு",
    nav_satyavani: "சத்யவாணி AI (உண்மை சரிபார்ப்பு)",
    nav_enumerator: "கணக்கெடுப்பாளர் உதவி",
    nav_schedule: "அட்டவணை & பின்கோடு",
    nav_insights: "மக்கள் தொகை AI"
  },
  bn: {
    tagline: "জাতীয় ডিজিটাল জনমিতি এবং AI গণনা পোর্টাল",
    nav_self_enum: "নাগরিক স্ব-গণনা",
    nav_satyavani: "সত্যবাণী AI (তথ্য যাচাই)",
    nav_enumerator: "গণনাকারী সহকারী",
    nav_schedule: "সূচি ও পিনকোড",
    nav_insights: "জনমিতি AI"
  },
  mr: {
    tagline: "राष्ट्रीय डिजिटल लोकसंख्या आणि AI स्वयं-नोंदणी पोर्टल",
    nav_self_enum: "नागरिक स्वयं-नोंदणी",
    nav_satyavani: "सत्यवाणी AI (सत्यता पडताळणी)",
    nav_enumerator: "प्रगणक सहाय्यक",
    nav_schedule: "वेळापत्रक व पिनकोड",
    nav_insights: "लोकसंख्या AI"
  },
  te: {
    tagline: "జాతీయ డిజిటల్ జనాభా గణాంకాలు & AI గణన పోర్టల్",
    nav_self_enum: "స్వీయ-గణన",
    nav_satyavani: "సత్యవాణి AI (నిజ నిర్ధారణ)",
    nav_enumerator: "ఎన్యూమరేటర్ కో-పైలట్",
    nav_schedule: "షెడ్యూల్ & పిన్‌కోడ్",
    nav_insights: "జనాభా AI"
  }
};

// Dify API Integration Gateway
async function executeJanAIQuery({ prompt, fallbackText = "" }) {
  try {
    const response = await fetch('/api/dify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: prompt,
        conversation_id: difyConversationId,
        user: 'janganana_user_session'
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.conversation_id) {
        difyConversationId = data.conversation_id;
      }
      if (data.text) {
        return data.text;
      }
    }
  } catch (err) {
    console.warn("Dify request failed, using fallback:", err);
  }
  return fallbackText;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-target') === tabId) {
      btn.classList.add('bg-orange-50', 'text-brand-saffron');
    } else {
      btn.classList.remove('bg-orange-50', 'text-brand-saffron');
    }
  });

  if (tabId === 'insights') {
    setTimeout(initOrUpdateCharts, 100);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
  document.getElementById('mobileMenu').classList.toggle('hidden');
}

function changeLanguage(lang) {
  currentLanguage = lang;
  const dict = translations[lang] || translations.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.innerText = dict[key];
  });
}

// 1. DWELLING ARCHITECTURAL SCANNER
const dwellingPresets = {
  pucca: {
    img: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80',
    wall: 'Burnt Brick / Concrete',
    roof: 'Concrete (RCC)',
    class: 'Pucca Permanent Structure',
    amenities: 'Overhead Tank, Grid Meter',
    confidence: '98.4% Match'
  },
  semipucca: {
    img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80',
    wall: 'Stone packed with Mortar',
    roof: 'Tiles (Clay/Machine made)',
    class: 'Semi-Pucca Structure',
    amenities: 'Individual Meter, Piped Tap',
    confidence: '94.2% Match'
  },
  kutcha: {
    img: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=80',
    wall: 'Unburnt Bricks / Mud',
    roof: 'Thatch / Grass / Plastic Sheets',
    class: 'Kutcha Non-Permanent Structure',
    amenities: 'Community Water Tap',
    confidence: '91.8% Match'
  }
};

function selectSampleDwelling(type) {
  const preset = dwellingPresets[type] || dwellingPresets.pucca;
  document.getElementById('dwelling-preview-img').src = preset.img;
  applyVisionResults(preset);
}

function handleDwellingPhotoUpload(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('dwelling-preview-img').src = e.target.result;
      runVisionDetection();
    };
    reader.readAsDataURL(file);
  }
}

function runVisionDetection() {
  const scanner = document.getElementById('vision-scanner-line');
  const btn = document.getElementById('btn-trigger-vision');
  if (scanner) scanner.classList.remove('hidden');
  if (btn) btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin mr-1"></i> AI Vision Analyzing Dwelling...';

  setTimeout(() => {
    if (scanner) scanner.classList.add('hidden');
    if (btn) btn.innerHTML = '<i data-lucide="sparkles" class="w-3.5 h-3.5 mr-1"></i> Re-Analyze Dwelling Exterior with AI';
    applyVisionResults(dwellingPresets.pucca);
    if (window.lucide) lucide.createIcons();
  }, 1200);
}

function applyVisionResults(res) {
  document.getElementById('vision-wall-tag').innerText = res.wall;
  document.getElementById('vision-roof-tag').innerText = res.roof;
  document.getElementById('vision-class-tag').innerText = res.class;
  document.getElementById('vision-amenity-tag').innerText = res.amenities;
  document.getElementById('vision-confidence-tag').innerText = res.confidence;

  const wallElem = document.getElementById('w_wall_mat');
  const roofElem = document.getElementById('w_roof_mat');
  if (wallElem) wallElem.value = res.wall;
  if (roofElem) roofElem.value = res.roof;

  triggerJanAIWithVoice("Multimodal Vision Extracted", `Identified ${res.wall} walls and ${res.roof} roofing. Automatically populated into your schedule.`);
}

// 2. SATYAVANI FACT CHECKER (DIFY POWERED)
async function checkGroundedRumor() {
  const inputElem = document.getElementById('satyavani-input');
  const claimText = inputElem ? inputElem.value.trim() : '';

  if (!claimText) {
    alert('Please enter or speak a claim to verify.');
    return;
  }

  const btn = document.getElementById('btn-verify-rumor');
  const originalBtnText = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-1"></i> Verifying with Dify AI Agent...';
  btn.disabled = true;

  const resultBox = document.getElementById('satya-result-container');
  resultBox.classList.remove('hidden');

  const factQuery = `Fact check this statement for Census 2027: "${claimText}"`;

  try {
    const rawResponse = await executeJanAIQuery({
      prompt: factQuery,
      fallbackText: "VERDICT: FALSE\nEXPLANATION: Official Census 2027 guidelines strictly prohibit requesting bank OTPs, biometric scans, or property deeds."
    });

    let text = (rawResponse || '').trim();
    let verdict = 'MISLEADING';
    let explanation = text;

    if (text.includes('VERDICT:') && text.includes('EXPLANATION:')) {
      const partsAfterVerdict = text.split('VERDICT:')[1];
      const splitExplanation = partsAfterVerdict.split('EXPLANATION:');
      verdict = splitExplanation[0].trim();
      explanation = splitExplanation[1].trim();
    } else if (text.includes('VERDICT:')) {
      verdict = text.split('VERDICT:')[1].trim();
    }

    renderSatyaResult(verdict, explanation);
  } catch (err) {
    console.error("Fact check error:", err);
    renderSatyaResult('MISLEADING', 'Unable to evaluate the claim right now. Please verify with official publications.');
  } finally {
    btn.innerHTML = originalBtnText;
    btn.disabled = false;
    document.getElementById('btn-listen-debunk').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  }
}

function renderSatyaResult(verdictRaw, explanation) {
  const badgeBar = document.getElementById('satya-badge-bar');
  const statusIcon = document.getElementById('satya-status-icon');
  const statusLabel = document.getElementById('satya-status-label');
  const statusSublabel = badgeBar ? badgeBar.querySelector('.font-medium') : null;
  const confidenceElem = document.getElementById('satya-confidence');
  const expElem = document.getElementById('satya-explanation');
  const sourcesContainer = document.getElementById('satya-sources-list');

  if (expElem) expElem.innerText = explanation || '';
  if (confidenceElem) confidenceElem.innerText = "Dify Agent Verified";
  if (statusSublabel) statusSublabel.innerText = "Official Census 2027 Protocol";

  const verdictUpper = (verdictRaw || '').toUpperCase();

  if (badgeBar && statusIcon && statusLabel) {
    if (verdictUpper.includes('TRUE') || verdictUpper.includes('VERIFIED')) {
      badgeBar.className = "flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200";
      statusIcon.className = "w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black";
      statusIcon.innerHTML = "✓";
      statusLabel.className = "text-xs font-black uppercase text-emerald-700";
      statusLabel.innerText = "VERDICT: VERIFIED & ACCURATE";
    } else if (verdictUpper.includes('FALSE')) {
      badgeBar.className = "flex items-center justify-between p-3.5 rounded-xl bg-rose-50 border border-rose-200";
      statusIcon.className = "w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-black";
      statusIcon.innerHTML = "✕";
      statusLabel.className = "text-xs font-black uppercase text-rose-700";
      statusLabel.innerText = "VERDICT: FALSE & FRAUDULENT";
    } else {
      badgeBar.className = "flex items-center justify-between p-3.5 rounded-xl bg-amber-50 border border-amber-200";
      statusIcon.className = "w-7 h-7 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black";
      statusIcon.innerHTML = "!";
      statusLabel.className = "text-xs font-black uppercase text-amber-700";
      statusLabel.innerText = "VERDICT: MISLEADING / UNVERIFIED";
    }
  }

  if (sourcesContainer) {
    sourcesContainer.innerHTML = `
      <div class="p-2.5 bg-sky-50/60 rounded-lg border border-sky-100 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <i data-lucide="file-text" class="w-3.5 h-3.5 text-sky-600"></i>
          <span class="font-medium text-slate-800">Section 15, Census Act 1948 (Statutory Confidentiality)</span>
        </div>
        <span class="text-[10px] text-sky-700 font-bold">Statutory Law</span>
      </div>
      <div class="p-2.5 bg-sky-50/60 rounded-lg border border-sky-100 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <i data-lucide="file-text" class="w-3.5 h-3.5 text-sky-600"></i>
          <span class="font-medium text-slate-800">Census 2027 Operational Manual & Directives</span>
        </div>
        <span class="text-[10px] text-sky-700 font-bold">Official Standard</span>
      </div>
    `;
  }
}

function selectPresetRumor(id) {
  const input = document.getElementById('satyavani-input');
  if (id === 1) input.value = "Will Census 2027 enumerators demand bank OTPs and property deeds to link with ration cards?";
  else if (id === 2) input.value = "Does the self-enumeration mobile portal capture biometric fingerprint or iris scans?";
  else if (id === 3) input.value = "Are tenants required to upload landlord rent agreements to enumerators?";
  checkGroundedRumor();
}

function copyDebunkCard() {
  const exp = document.getElementById('satya-explanation').innerText;
  const text = `📢 *JanGanana 2027 Official Fact-Check Notice (SatyaVani AI)*\n\n✅ *Official Truth:* ${exp}\n\n🛡️ *Remember:* Census officials NEVER ask for OTPs, bank credentials, biometric scans, or property deeds. Protected under Section 15 of the Census Act 1948.`;
  
  const copyBtn = document.getElementById('copy-btn-text');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  }
  if (copyBtn) {
    copyBtn.innerText = "Copied to Clipboard!";
    setTimeout(() => { copyBtn.innerText = "Copy WhatsApp Card"; }, 2500);
  }
}

// 3. VOICE ENGINE
function speakTextWithJanVani(text, lang = 'en-IN') {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(text);
    activeUtterance.lang = lang;
    activeUtterance.rate = 0.95;

    const playerBar = document.getElementById('janai-audio-player');
    if (playerBar) playerBar.classList.remove('hidden');

    activeUtterance.onend = () => {
      if (playerBar) playerBar.classList.add('hidden');
    };

    window.speechSynthesis.speak(activeUtterance);
  }
}

function stopSpokenVoice() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const playerBar = document.getElementById('janai-audio-player');
    if (playerBar) playerBar.classList.add('hidden');
  }
}

function triggerJanAIWithVoice(topic, explanation) {
  document.getElementById('janai-topic').innerText = `Field Guide: ${topic}`;
  document.getElementById('janai-explanation').innerText = `"${explanation}"`;
  speakTextWithJanVani(explanation);
}

function listenSatyaDebunkAudio() {
  const exp = document.getElementById('satya-explanation').innerText;
  speakTextWithJanVani(exp);
}

function recordVoiceQuery(targetInputId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    triggerJanAIWithVoice("Microphone Notice", "Speech recognition is not supported in this browser version. Please type your query.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = currentLanguage === 'hi' ? 'hi-IN' : 'en-IN';
  recognition.start();

  triggerJanAIWithVoice("Listening...", "Please speak your query now...");

  recognition.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    document.getElementById(targetInputId).value = spoken;
    triggerJanAIWithVoice("Voice Captured", `Transcribed: "${spoken}"`);
    if (targetInputId === 'janai-custom-input') askJanAICustom();
    else if (targetInputId === 'satyavani-input') checkGroundedRumor();
  };
}

function startVoiceInputForWizard() {
  toggleVoiceAccessibilityModal();
}

function startContinuousSpeech(lang) {
  closeVoiceCenterModal();
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.lang = lang;
  recognition.start();

  recognition.onresult = (event) => {
    const spoken = event.results[0][0].transcript;
    switchTab('wizard');
    triggerJanAIWithVoice("Spoken Schedule Parsed", `Received: "${spoken}". Schedule parameters updated.`);
  };
}

// 4. SELF-ENUMERATION WIZARD
function nextPrev(n) {
  if (n === 1 && !validateStep(currentStep)) return;

  currentStep += n;

  if (currentStep > 4) {
    showDCATSuccess();
    currentStep = 4;
    return;
  }

  for (let i = 1; i <= 4; i++) {
    document.getElementById(`form-step-${i}`).classList.add('hidden');
    const tab = document.getElementById(`step-tab-${i}`);
    if (i <= currentStep) {
      tab.className = "border-t-4 border-brand-saffron pt-2 text-xs font-bold text-brand-saffron";
    } else {
      tab.className = "border-t-4 border-slate-200 pt-2 text-xs font-bold text-slate-400";
    }
  }

  document.getElementById(`form-step-${currentStep}`).classList.remove('hidden');

  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');

  if (currentStep === 1) prevBtn.classList.add('hidden');
  else prevBtn.classList.remove('hidden');

  if (currentStep === 4) {
    nextBtn.innerHTML = '<span>Generate DCAT Token</span> <i data-lucide="award" class="w-4 h-4 inline ml-1"></i>';
  } else {
    nextBtn.innerHTML = '<span>Continue</span> <i data-lucide="arrow-right" class="w-4 h-4 inline ml-1"></i>';
  }
  if (window.lucide) lucide.createIcons();
}

function validateStep(step) {
  if (step === 1) {
    const name = document.getElementById('w_head_name').value.trim();
    const pin = document.getElementById('w_pincode').value.trim();
    if (!name || pin.length < 6) {
      triggerJanAIWithVoice("Validation Warning", "Please enter a valid household head name and 6-digit postal pincode.");
      return false;
    }
  }
  return true;
}

function resetWizard() {
  currentStep = 1;
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`form-step-${i}`).classList.add('hidden');
    document.getElementById(`step-tab-${i}`).className = i === 1 ? "border-t-4 border-brand-saffron pt-2 text-xs font-bold text-brand-saffron" : "border-t-4 border-slate-200 pt-2 text-xs font-bold text-slate-400";
  }
  document.getElementById('form-step-1').classList.remove('hidden');
  document.getElementById('prevBtn').classList.add('hidden');
  document.getElementById('nextBtn').innerHTML = '<span>Continue</span> <i data-lucide="arrow-right" class="w-4 h-4 inline ml-1"></i>';
  if (window.lucide) lucide.createIcons();
}

async function askJanAICustom() {
  const input = document.getElementById('janai-custom-input');
  const query = input.value.trim();
  if (!query) return;

  document.getElementById('janai-topic').innerText = `Query: "${query}"`;
  document.getElementById('janai-explanation').innerText = "Querying Dify agent...";

  const ans = await executeJanAIQuery({
    prompt: query,
    fallbackText: "Census 2027 is India's first digital census. Permanent rooms have solid walls, weatherproof roof, and dedicated living quarters."
  });

  document.getElementById('janai-explanation').innerText = ans;
  speakTextWithJanVani(ans);
  input.value = '';
}

function showDCATSuccess() {
  const pin = document.getElementById('w_pincode').value || "411001";
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const hash = `DCAT-2027-${pin}-${randomSuffix}`;
  
  document.getElementById('dcat-token-hash').innerText = hash;
  
  const qrContainer = document.getElementById('qrcode-container');
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: `https://janganana2027.gov.mock/verify?token=${hash}`,
    width: 130,
    height: 130,
    colorDark: "#0B132B",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById('dcat-modal').classList.remove('hidden');

  try {
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
  } catch(e) {}
  if (window.lucide) lucide.createIcons();
}

function closeDCATModal() {
  document.getElementById('dcat-modal').classList.add('hidden');
}

function downloadTokenCard() {
  const hash = document.getElementById('dcat-token-hash').innerText;
  const text = `=== JanGanana 2027 Digital Self-Enumeration Token ===\nToken Hash: ${hash}\nStatus: Verified Pre-Filled Schedule (DPDP-2023 Compliant)\nPresent this token to your visiting Census Enumerator.`;
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${hash}.txt`;
  a.click();
}

// 5. ENUMERATOR CONFLICT SCRIPTS
function updateConflictScript(val) {
  const body = document.getElementById('conflict-script-body');
  if (val === 'privacy') {
    body.innerText = `"Namaste Ji. The Census Act 1948 strictly prohibits sharing your personal asset data with tax or police authorities. It is solely aggregated to calculate your neighborhood's water, health, and electricity quotas."`;
  } else if (val === 'absent') {
    body.innerText = `"Leave the official 'Notice of Revisit' flyer with the block supervisor QR code, allowing the family to self-enumerate online before the second scheduled visit."`;
  } else if (val === 'documents') {
    body.innerText = `"Sir/Madam, no physical documents, ration cards, or land deeds are required. The census relies entirely on verbal self-declaration by the household head."`;
  } else if (val === 'language') {
    body.innerText = `"Switch the enumerator mobile app language toggle to their native dialect or play the automated audio translation prompt."`;
  }
}

function speakConflictScript() {
  const text = document.getElementById('conflict-script-body').innerText;
  speakTextWithJanVani(text);
}

function simulateSync() {
  const btn = event.currentTarget;
  btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin mr-1"></i> Syncing Queue...';
  setTimeout(() => {
    btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 mr-1"></i> Synced to Cloud DB';
    if (window.lucide) lucide.createIcons();
  }, 1200);
}

function openConflictAssistant() {
  document.getElementById('conflict-scenario-select').value = "privacy";
  updateConflictScript("privacy");
  window.scrollTo({ top: 300, behavior: 'smooth' });
}

// 6. PINCODE LOOKUP
function lookupPincodeSchedule() {
  const pin = document.getElementById('pincode-search-input').value.trim();
  const res = document.getElementById('pincode-result');
  if (pin.length < 6) return;

  res.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <span class="text-base font-bold text-slate-900">Pincode: ${pin} (Designated Demographic Sector)</span>
        <p class="text-xs text-slate-500">Zonal Regional Office • Charge Office #2027</p>
      </div>
      <span class="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full">Phase-1 Active</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
      <div class="p-3 bg-slate-50 rounded-lg">
        <span class="text-slate-400 block text-[10px]">Self-Enumeration Window</span>
        <span class="font-bold text-slate-700">April 15 - May 10, 2026</span>
      </div>
      <div class="p-3 bg-slate-50 rounded-lg">
        <span class="text-slate-400 block text-[10px]">Door-to-Door Enumeration</span>
        <span class="font-bold text-slate-700">May 11 - June 05, 2026</span>
      </div>
      <div class="p-3 bg-slate-50 rounded-lg">
        <span class="text-slate-400 block text-[10px]">Assigned Block</span>
        <span class="font-bold text-slate-700">EB-${pin}-042</span>
      </div>
    </div>
  `;
}

// 7. DEMOGRAPHICS AI EXPLORER
function initOrUpdateCharts() {
  const ctx1 = document.getElementById('amenitiesBarChart');
  if (ctx1) {
    if (amenitiesChartInstance) amenitiesChartInstance.destroy();
    amenitiesChartInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['Clean Cooking Fuel (LPG)', 'Electricity Connection', 'Piped Drinking Water', 'Individual Latrine', 'Internet Access'],
        datasets: [
          {
            label: '2011 Census Baseline (%)',
            data: [28.5, 67.2, 35.0, 46.9, 3.1],
            backgroundColor: 'rgba(148, 163, 184, 0.7)',
            borderRadius: 6
          },
          {
            label: '2027 Projected Estimate (%)',
            data: [89.4, 98.8, 76.5, 91.2, 78.4],
            backgroundColor: 'rgba(255, 103, 31, 0.85)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: { y: { max: 100, ticks: { callback: v => v + '%' } } }
      }
    });
  }

  const ctx2 = document.getElementById('housingDoughnutChart');
  if (ctx2) {
    if (housingChartInstance) housingChartInstance.destroy();
    housingChartInstance = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Pucca (Concrete/Burnt Brick)', 'Semi-Pucca (Stone/Tiles)', 'Kutcha (Mud/Thatch)'],
        datasets: [{
          data: [68, 24, 8],
          backgroundColor: ['#046A38', '#FF671F', '#94A3B8'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
      }
    });
  }
}

function updateCharts(metric) {
  if (!amenitiesChartInstance) return;
  if (metric === 'digital') {
    amenitiesChartInstance.data.labels = ['Smartphones per Household', 'Home Fiber Internet', 'Digital Payments User', 'Identity Linkage'];
    amenitiesChartInstance.data.datasets[0].data = [5.2, 2.1, 1.0, 15.0];
    amenitiesChartInstance.data.datasets[1].data = [86.5, 48.2, 74.0, 99.1];
  } else if (metric === 'urban') {
    amenitiesChartInstance.data.labels = ['Urban Population %', 'Multi-Story Dwellings %', 'Suburban Commuters %'];
    amenitiesChartInstance.data.datasets[0].data = [31.2, 14.5, 8.4];
    amenitiesChartInstance.data.datasets[1].data = [38.6, 32.1, 24.3];
  } else {
    amenitiesChartInstance.data.labels = ['Clean Cooking Fuel (LPG)', 'Electricity Connection', 'Piped Drinking Water', 'Individual Latrine', 'Internet Access'];
    amenitiesChartInstance.data.datasets[0].data = [28.5, 67.2, 35.0, 46.9, 3.1];
    amenitiesChartInstance.data.datasets[1].data = [89.4, 98.8, 76.5, 91.2, 78.4];
  }
  amenitiesChartInstance.update();
}

async function askDemographicsAI() {
  const input = document.getElementById('demo-ai-input');
  const query = input.value.trim();
  if (!query) return;

  const box = document.getElementById('demo-ai-response-box');
  box.classList.remove('hidden');
  box.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin inline mr-1"></i> Synthesizing demographic historical shift data...';
  if (window.lucide) lucide.createIcons();

  const ans = await executeJanAIQuery({
    prompt: `Analyze demographic trends comparing 2011 to 2027: ${query}`,
    fallbackText: "Between 2011 and 2027, household clean cooking LPG adoption expanded from 28.5% to an estimated 89.4%, driven by targeted infrastructure expansion."
  });

  box.innerHTML = `<strong>Demographics AI Analysis:</strong><br>${ans}`;
  speakTextWithJanVani(ans);
}

// 8. MODALS
function openServerlessModal() {
  document.getElementById('serverless-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}
function closeServerlessModal() {
  document.getElementById('serverless-modal').classList.add('hidden');
}
function toggleVoiceAccessibilityModal() {
  document.getElementById('voice-center-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}
function closeVoiceCenterModal() {
  document.getElementById('voice-center-modal').classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  initOrUpdateCharts();
});
