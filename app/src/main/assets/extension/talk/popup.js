document.getElementById('injectBtn').addEventListener('click', async () => {
  const lang = document.getElementById('langSelect').value;
  const statusEl = document.getElementById('status');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: initVoiceFillerWidget,
      args: [lang]
    });
    window.close();
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

function initVoiceFillerWidget(selectedLang) {
  // পেজে কোনো ইনপুট বক্স আছে কিনা চেক করা
  const allInputs = Array.from(document.querySelectorAll('input')).filter(inp => 
    (inp.type === 'text' || inp.type === 'number' || !inp.type) && 
    !inp.disabled && !inp.readOnly && inp.offsetParent !== null
  );

  if (allInputs.length === 0) return;

  // আগে থেকে প্যানেল থাকলে রিমুভ করা
  const existing = document.getElementById('vmf-floating-panel');
  if (existing) existing.remove();

  // কন্ট্রোল প্যানেল তৈরি (পেজের ডানদিকে ভাসমান থাকবে)
  const panel = document.createElement('div');
  panel.id = 'vmf-floating-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 310px;
    background: #ffffff;
    border: 2px solid #1a73e8;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    z-index: 999999;
    font-family: 'Segoe UI', sans-serif;
    padding: 14px;
    color: #202124;
  `;

  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <strong style="color:#1a73e8; font-size:15px;">🎙️ Voice Marks Entry</strong>
      <button id="vmf-close" style="background:none; border:none; font-size:18px; cursor:pointer; color:#555;">&times;</button>
    </div>
    <div style="display:flex; gap:6px; margin-bottom:10px;">
      <select id="vmf-lang" style="flex:1; padding:5px; border-radius:5px; border:1px solid #ccc; font-size:12px;">
        <option value="bn-IN" ${selectedLang === 'bn-IN' ? 'selected' : ''}>বাংলা (Bangla)</option>
        <option value="en-IN" ${selectedLang === 'en-IN' ? 'selected' : ''}>English</option>
      </select>
      <button id="vmf-toggle" style="padding:6px 12px; background:#188038; color:#fff; border:none; border-radius:5px; font-weight:bold; cursor:pointer; font-size:12px;">Start Mic</button>
    </div>
    <div id="vmf-current-info" style="background:#e8f0fe; padding:8px; border-radius:6px; font-size:13px; margin-bottom:8px; font-weight:600; color:#1967d2;">
      বর্তমান ঘর: Row 1
    </div>
    <div id="vmf-heard" style="background:#f1f3f4; padding:8px; border-radius:6px; font-size:12px; min-height:20px; color:#3c4043;">
      মাইক চালু করতে "Start Mic" চাপুন...
    </div>
  `;

  document.body.appendChild(panel);

  let currentIndex = 0;
  let isListening = false;
  let lastHighlightedInput = null;
  let isProgrammaticFocus = false;

  const studentNameCache = allInputs.map((inp) => {
    const row = inp.closest('tr');
    if (!row) return '';
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      return ' - ' + cells[1].innerText.trim();
    }
    return '';
  });

  // Angular / React / Standard ইনপুটে ভ্যালু বসানোর ফাংশন
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // বর্তমান ইনপুট ঘর হাইলাইট করা
  function highlightCurrentInput() {
    if (lastHighlightedInput && lastHighlightedInput !== allInputs[currentIndex]) {
      lastHighlightedInput.style.outline = '';
      lastHighlightedInput.style.backgroundColor = '';
      lastHighlightedInput = null;
    }

    const infoEl = document.getElementById('vmf-current-info');
    if (currentIndex < allInputs.length) {
      const inp = allInputs[currentIndex];
      inp.style.outline = '3px solid #1a73e8';
      inp.style.backgroundColor = '#e8f0fe';
      lastHighlightedInput = inp;

      const rect = inp.getBoundingClientRect();
      if (rect.top < 70 || rect.bottom > window.innerHeight - 120) {
        inp.scrollIntoView({ behavior: 'auto', block: 'center' });
      }

      isProgrammaticFocus = true;
      try {
        inp.focus({ preventScroll: true });
      } catch (e) {
        inp.focus();
      } finally {
        isProgrammaticFocus = false;
      }

      const studentName = studentNameCache[currentIndex] || '';
      infoEl.textContent = `বর্তমান ঘর: #${currentIndex + 1}${studentName}`;
    } else {
      infoEl.textContent = `✅ সবগুলো ঘর (${allInputs.length}টি) পূরণ হয়ে গেছে!`;
    }
  }

  // ইউজার যদি মাউস দিয়ে কোনো ঘরে ক্লিক করে, তবে সেখান থেকে শুরু হবে
  allInputs.forEach((inp, idx) => {
    inp.addEventListener('focus', () => {
      if (isProgrammaticFocus) return;
      currentIndex = idx;
      highlightCurrentInput();
    });
  });

  // বাংলা ও ইংরেজি শব্দ থেকে সংখ্যায় রূপান্তর ডিকশনারি
  const wordToNumberMap = {
    // বাংলা সংখ্যা ও বানান
    '০': 0, 'শূন্য': 0, 'জিরো': 0, 'zero': 0,
    '১': 1, 'এক': 1, 'ওয়ান': 1, 'ওয়ান': 1, 'one': 1,
    '২': 2, 'দুই': 2, 'টু': 2, 'two': 2,
    '৩': 3, 'তিন': 3, 'থ্রি': 3, 'three': 3,
    '৪': 4, 'চার': 4, 'ফোর': 4, 'four': 4,
    '৫': 5, 'পাঁচ': 5, 'পাচ': 5, 'ফাইভ': 5, 'five': 5,
    '৬': 6, 'ছয়': 6, 'ছয়': 6, 'সিক্স': 6, 'six': 6,
    '৭': 7, 'সাত': 7, 'সেভেন': 7, 'seven': 7,
    '৮': 8, 'আট': 8, 'এইট': 8, 'eight': 8,
    '৯': 9, 'নয়': 9, 'নয়': 9, 'নাইন': 9, 'nine': 9,
    '১০': 10, 'দশ': 10, 'টেন': 10, 'ten': 10,
    '১১': 11, 'এগারো': 11, 'এগার': 11, 'ইলেভেন': 11, 'eleven': 11,
    '১২': 12, 'বারো': 12, 'বার': 12, 'টুয়েলভ': 12, 'twelve': 12,
    '১৩': 13, 'তেরো': 13, 'তের': 13, 'থার্টিন': 13, 'thirteen': 13,
    '১৪': 14, 'চৌদ্দ': 14, 'ফোর্টিন': 14, 'fourteen': 14,
    '১৫': 15, 'পনেরো': 15, 'পনের': 15, 'ফিফটিন': 15, 'fifteen': 15,
    '১৬': 16, 'ষোলো': 16, 'ষোল': 16, 'সিক্সটিন': 16, 'sixteen': 16,
    '১৭': 17, 'সতেরো': 17, 'সতের': 17, 'সেভেনটিন': 17, 'seventeen': 17,
    '১৮': 18, 'আঠারো': 18, 'আঠার': 18, 'এইটিন': 18, 'eighteen': 18,
    '১৯': 19, 'উনিশ': 19, 'নাইনটিন': 19, 'nineteen': 19,
    '২০': 20, 'বিশ': 20, 'কুড়ি': 20, 'কুড়ি': 20, 'টুয়েন্টি': 20, 'twenty': 20,
    '২১': 21, 'একুশ': 21, '২২': 22, 'বাইশ': 22, '২৩': 23, 'তেইশ': 23,
    '২৪': 24, 'চব্বিশ': 24, '২৫': 25, 'পঁচিশ': 25, 'পচিশ': 25,
    '৩০': 30, 'ত্রিশ': 30, 'thirty': 30,
    '৪০': 40, 'চল্লিশ': 40, 'forty': 40,
    '৫০': 50, 'পঞ্চাশ': 50, 'fifty': 50
  };

  function convertBengaliDigits(str) {
    const bn = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
    return str.replace(/[০-৯]/g, d => bn.indexOf(d));
  }

  // ভয়েস টেক্সট প্রসেস করা
  function processVoiceTranscript(transcript) {
    const heardEl = document.getElementById('vmf-heard');
    heardEl.textContent = '';
    heardEl.append('শুনেছি: ');
    const boldEl = document.createElement('b');
    boldEl.textContent = `"${transcript}"`;
    heardEl.appendChild(boldEl);

    let text = transcript.toLowerCase().trim();
    text = convertBengaliDigits(text);

    // টোকেন বা শব্দে ভাগ করা (স্পেস বা কমা দিয়ে)
    const tokens = text.split(/[\s,।]+/).filter(Boolean);
    let needsHighlightUpdate = false;

    tokens.forEach(token => {
      // ১. Skip কমান্ড
      if (['skip', 'স্কিপ', 'বাদ', 'ছাড়ো', 'ছাড়ো', 'leave'].includes(token)) {
        if (currentIndex < allInputs.length) {
          currentIndex++;
          needsHighlightUpdate = true;
        }
        return;
      }

      // ২. Back কমান্ড
      if (['back', 'ব্যাক', 'আগের', 'পিছনে', 'আগে', 'previous'].includes(token)) {
        if (currentIndex > 0) {
          currentIndex--;
          needsHighlightUpdate = true;
        }
        return;
      }

      // ৩. Delete কমান্ড (বর্তমান ঘরের নম্বর মুছে ফেলবে, যাতে নতুন নম্বর বলা যায়)
      if (['delete', 'ডিলিট', 'মুছুন', 'মুছে', 'কাটো', 'clear', 'ক্লিয়ার', 'ক্লিয়ার'].includes(token)) {
        if (currentIndex < allInputs.length) {
          setNativeValue(allInputs[currentIndex], '');
          needsHighlightUpdate = true;
        }
        return;
      }

      // ৪. Next / Pore কমান্ড
      if (['next', 'নেক্সট', 'পরের', 'পরে', 'সামনে', 'আগামী'].includes(token)) {
        if (currentIndex < allInputs.length - 1) {
          currentIndex++;
          needsHighlightUpdate = true;
        }
        return;
      }

      // ৫. নম্বর চেক করা (সরাসরি ডিজিট বা শব্দের মাধ্যমে)
      let numVal = null;
      if (/^\d+(\.\d+)?$/.test(token)) {
        numVal = token;
      } else if (wordToNumberMap.hasOwnProperty(token)) {
        numVal = wordToNumberMap[token];
      }

      if (numVal !== null && currentIndex < allInputs.length) {
        setNativeValue(allInputs[currentIndex], numVal);
        currentIndex++;
        needsHighlightUpdate = true;
      }
    });

    if (needsHighlightUpdate) {
      highlightCurrentInput();
    }
  }

  // SpeechRecognition সেটআপ
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('vmf-heard').textContent = 'দুঃখিত, আপনার ব্রাউজারে Speech Recognition সাপোর্ট করছে না।';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = document.getElementById('vmf-lang').value;

  recognition.oninterim = (partial) => {
    if (!isListening || !partial) return;
    const heardEl = document.getElementById('vmf-heard');
    if (heardEl) {
      heardEl.textContent = `শুনছি: "${partial}"`;
    }
  };

  recognition.onresult = (event) => {
    const lastResultIndex = event.results.length - 1;
    const transcript = event.results[lastResultIndex][0].transcript;
    processVoiceTranscript(transcript);
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' && isListening) {
      document.getElementById('vmf-heard').textContent = 'শুনছি... নম্বর বা কমান্ড বলুন';
      return;
    }
    document.getElementById('vmf-heard').textContent = 'Mic Error: ' + event.error;
  };

  recognition.onend = () => {
    // যদি ইউজার বন্ধ না করে থাকেন, তবে অটোমেটিক আবার শুনতে থাকবে
    if (isListening) {
      try {
        recognition.start();
      } catch (e) {}
    }
  };

  // Start / Stop বাটন লজিক
  const toggleBtn = document.getElementById('vmf-toggle');
  toggleBtn.addEventListener('click', () => {
    if (!isListening) {
      recognition.lang = document.getElementById('vmf-lang').value;
      try {
        recognition.start();
        isListening = true;
        toggleBtn.textContent = 'Stop Mic';
        toggleBtn.style.background = '#d93025';
        document.getElementById('vmf-heard').textContent = 'শুনছি... নম্বর বা কমান্ড বলুন';
        highlightCurrentInput();
      } catch (err) {
        document.getElementById('vmf-heard').textContent = 'Error: ' + err.message;
      }
    } else {
      isListening = false;
      recognition.stop();
      toggleBtn.textContent = 'Start Mic';
      toggleBtn.style.background = '#188038';
      document.getElementById('vmf-heard').textContent = 'মাইক বন্ধ করা হয়েছে।';
    }
  });

  // ভাষা পরিবর্তন করলে সাথে সাথে আপডেট হবে
  document.getElementById('vmf-lang').addEventListener('change', (e) => {
    recognition.lang = e.target.value;
    if (isListening) {
      recognition.stop(); // onend থেকে নতুন ভাষায় আবার স্টার্ট হবে
    }
  });

  // প্যানেল বন্ধ করার বাটন
  document.getElementById('vmf-close').addEventListener('click', () => {
    isListening = false;
    recognition.stop();
    allInputs.forEach(inp => {
      inp.style.outline = '';
      inp.style.backgroundColor = '';
    });
    panel.remove();
  });

  highlightCurrentInput();
}
