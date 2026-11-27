// Audio synthesizer for hospital queue chime using Web Audio API
export function playQueueChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        resolve();
        return;
      }

      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      // Hospital chime notes: D5 -> A5 -> F#5 -> D5 (classic pleasant two-tone or four-tone airport/hospital chime)
      const notes = [
        { freq: 587.33, start: 0, duration: 0.35 },    // D5
        { freq: 880.00, start: 0.25, duration: 0.4 },   // A5
        { freq: 739.99, start: 0.5, duration: 0.45 },   // F#5
        { freq: 587.33, start: 0.75, duration: 0.6 }    // D5
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        // Envelope
        gain.gain.setValueAtTime(0.0001, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.3, now + note.start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.duration + 0.05);
      });

      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          // ignore
        }
        resolve();
      }, 1400);
    } catch {
      resolve();
    }
  });
}

const LEADING_PATIENT_TITLE_RULES: Array<{ pattern: RegExp; expansion: string }> = [
  // Must check SDRI / SDR.I / SDR/I / SDR I before SDR
  { pattern: /^sdr[\s.,/:;-]*i(?:[\s.,/:;-]+|$)/i, expansion: 'Saudari' },
  { pattern: /^sdr(?:[\s.,/:;-]+|$)/i, expansion: 'Saudara' },
  { pattern: /^tn(?:[\s.,/:;-]+|$)/i, expansion: 'Tuan' },
  { pattern: /^ny(?:[\s.,/:;-]+|$)/i, expansion: 'Nyonya' },
  { pattern: /^an(?:[\s.,/:;-]+|$)/i, expansion: 'Anak' },
  // Standalone initial "I" (e.g. "I. Alya", "i, siti", "I Alya") as Saudari abbreviation at start of name
  { pattern: /^i(?:[\s.,/:;-]+|$)/i, expansion: 'Saudari' }
];

function toNaturalTitleCaseWord(word: string): string {
  if (!word) return '';
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Normalisasi nama pasien khusus untuk Text-to-Speech (TTS) agar:
 * 1. Singkatan awal nama (AN, TN, NY, SDR, SDRI, SDR.I, I) case-insensitive
 *    dan berbagai pemisah (titik, koma, garis miring, spasi berlebih)
 *    dibaca sebagai kata penuh (Anak, Tuan, Nyonya, Saudara, Saudari).
 * 2. Huruf kapital penuh / tanda baca pemicu pengejaan per huruf dinormalisasi
 *    menjadi kata utuh (Title Case) sehingga dibaca per kata, bukan dieja huruf demi huruf.
 */
export function normalizePatientNameForTTS(rawName: string): string {
  const cleanedRaw = (rawName || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanedRaw) return 'Pasien';

  let expandedPrefix = '';
  let remainder = cleanedRaw;

  for (const rule of LEADING_PATIENT_TITLE_RULES) {
    const match = remainder.match(rule.pattern);
    if (match) {
      expandedPrefix = rule.expansion;
      remainder = remainder.slice(match[0].length).trim();
      break;
    }
  }

  // Satukan huruf-huruf yang dipisahkan titik (mis. "B.U.D.I" -> "BUDI") agar tidak dieja per huruf
  remainder = remainder.replace(
    /(^|\s)([A-Za-z](?:\.[A-Za-z]){2,})\.?(?=\s|$)/g,
    (_m, lead: string, dotted: string) => `${lead}${dotted.replace(/\./g, '')}`
  );

  // Bersihkan karakter aneh / tanda baca pemisah yang dapat memicu pengejaan huruf pada TTS
  remainder = remainder
    // Pertahankan tanda petik tunggal di tengah kata (mis. Ma'ruf), hapus petik di tepi kata
    .replace(/(^|\s)['`’]+|['`’]+(?=\s|$)/g, '$1')
    // Ganti tanda baca / simbol pemisah menjadi spasi
    .replace(/[.,/\\|;:!?()[\]{}<>*#~`"+=^$@%&_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedWords = remainder
    ? remainder
        .split(' ')
        .filter(Boolean)
        .map(toNaturalTitleCaseWord)
        .join(' ')
    : '';

  if (expandedPrefix && normalizedWords) {
    return `${expandedPrefix} ${normalizedWords}`;
  }
  return expandedPrefix || normalizedWords || 'Pasien';
}

export function formatQueueNumberForTTS(nomor: string): string {
  const clean = (nomor || '').trim();
  if (!clean) return '';

  const match = clean.match(/^([A-Za-z]+)\s*[-–—]?\s*(\d+)$/);
  if (match) {
    const prefix = match[1].toUpperCase();
    const digits = match[2];
    const leadingZerosMatch = digits.match(/^(0+)(.*)$/);
    if (leadingZerosMatch) {
      const zerosText = Array.from(leadingZerosMatch[1])
        .map(() => 'kosong')
        .join(', ');
      const restDigits = leadingZerosMatch[2];
      return restDigits
        ? `${prefix}, ${zerosText}, ${restDigits}`
        : `${prefix}, ${zerosText}`;
    }
    return `${prefix}, ${digits}`;
  }

  return clean
    .replace(/A-00/gi, 'A, kosong, kosong, ')
    .replace(/A-0/gi, 'A, kosong, ')
    .replace(/A-/gi, 'A, ');
}

function formatDestinationForTTS(poli: string): string {
  return (poli || 'Ruang Periksa Dokter')
    .replace(/\s*&\s*/g, ' dan ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Indonesian Voice Announcer via Web Speech Synthesis
export function announceQueueVoice(nomor: string, nama: string, poli: string = 'Ruang Periksa Dokter'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const formattedNomor = formatQueueNumberForTTS(nomor);
    const normalizedNama = normalizePatientNameForTTS(nama);
    const formattedPoli = formatDestinationForTTS(poli);

    const text = `Nomor antrean, ${formattedNomor}, atas nama, ${normalizedNama}, silakan menuju ke ${formattedPoli}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 0.88;
    utterance.pitch = 1.05;

    let settled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    // Play chime first then speak
    playQueueChime().then(() => {
      try {
        const voices = window.speechSynthesis.getVoices();
        const idVoice = voices.find(
          (v) =>
            v.lang.toLowerCase().includes('id') ||
            v.name.toLowerCase().includes('indonesia')
        );
        if (idVoice) {
          utterance.voice = idVoice;
        }
        safetyTimer = setTimeout(finish, 15000);
        window.speechSynthesis.speak(utterance);
      } catch {
        finish();
      }
    });
  });
}

let activeAlarmAudioCtx: AudioContext | null = null;
let activeAlarmCloseTimer: ReturnType<typeof setTimeout> | null = null;
let alarmPlaybackToken = 0;

export function stopRestrictedSaleAlarmAudio(): void {
  alarmPlaybackToken += 1;
  try {
    if (activeAlarmCloseTimer) {
      clearTimeout(activeAlarmCloseTimer);
      activeAlarmCloseTimer = null;
    }
    if (activeAlarmAudioCtx) {
      activeAlarmAudioCtx.close().catch(() => {});
      activeAlarmAudioCtx = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore cleanup failures
  }
}

/**
 * Alarm suara peringatan khusus APJ / Owner ketika terjadi penjualan
 * Psikotropik / Narkotik / Antibiotik (label merah Master Obat) di luar jalur Pasien Klinik.
 */
export function playRestrictedSaleAlarmAudio(spokenAnnouncement?: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      stopRestrictedSaleAlarmAudio();
      const myToken = alarmPlaybackToken;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        if (spokenAnnouncement && 'speechSynthesis' in window && myToken === alarmPlaybackToken) {
          const utterance = new SpeechSynthesisUtterance(spokenAnnouncement);
          utterance.lang = 'id-ID';
          utterance.rate = 0.95;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
          return;
        }
        resolve();
        return;
      }

      const ctx = new AudioContextClass();
      activeAlarmAudioCtx = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      // 3 cycles of sharp high-alert dual-tone siren (B5 -> E6 -> B5)
      const pulses = [
        { freq: 987.77, start: 0.0, duration: 0.16 },
        { freq: 1318.51, start: 0.18, duration: 0.18 },
        { freq: 987.77, start: 0.44, duration: 0.16 },
        { freq: 1318.51, start: 0.62, duration: 0.18 },
        { freq: 987.77, start: 0.88, duration: 0.16 },
        { freq: 1318.51, start: 1.06, duration: 0.24 }
      ];

      pulses.forEach((pulse) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(pulse.freq, now + pulse.start);

        gain.gain.setValueAtTime(0.0001, now + pulse.start);
        gain.gain.exponentialRampToValueAtTime(0.32, now + pulse.start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + pulse.start + pulse.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + pulse.start);
        osc.stop(now + pulse.start + pulse.duration + 0.03);
      });

      activeAlarmCloseTimer = setTimeout(() => {
        activeAlarmCloseTimer = null;
        try {
          if (activeAlarmAudioCtx === ctx) {
            ctx.close().catch(() => {});
            activeAlarmAudioCtx = null;
          }
        } catch {
          // ignore
        }

        if (myToken !== alarmPlaybackToken) {
          resolve();
          return;
        }

        if (spokenAnnouncement && 'speechSynthesis' in window) {
          try {
            window.speechSynthesis.cancel();
            if (myToken !== alarmPlaybackToken) {
              resolve();
              return;
            }
            const utterance = new SpeechSynthesisUtterance(spokenAnnouncement);
            utterance.lang = 'id-ID';
            utterance.rate = 0.96;
            utterance.pitch = 1.05;
            const voices = window.speechSynthesis.getVoices();
            const idVoice = voices.find(
              (v) =>
                v.lang.includes('id') ||
                v.lang.includes('ID') ||
                v.name.toLowerCase().includes('indonesia')
            );
            if (idVoice) {
              utterance.voice = idVoice;
            }
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.speak(utterance);
            return;
          } catch {
            // fallback resolve
          }
        }
        resolve();
      }, 1450);
    } catch {
      resolve();
    }
  });
}

let checkInAlarmToken = 0;
let activeCheckInAudioCtx: AudioContext | null = null;
let activeCheckInTimer: ReturnType<typeof setTimeout> | null = null;

export function stopCheckInOverdueAlarmAudio(): void {
  checkInAlarmToken += 1;
  try {
    if (activeCheckInTimer) {
      clearTimeout(activeCheckInTimer);
      activeCheckInTimer = null;
    }
    if (activeCheckInAudioCtx) {
      activeCheckInAudioCtx.close().catch(() => {});
      activeCheckInAudioCtx = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Alarm bunyi peringatan terlebih dahulu lalu disusul suara "anda belum checkin"
 * Aman jika browser membatasi autoplay dan terlindung token dari pemutaran ganda.
 */
export function playCheckInOverdueAlarmAndVoice(): Promise<{
  playedAudio: boolean;
  playedSpeech: boolean;
}> {
  return new Promise((resolve) => {
    try {
      stopCheckInOverdueAlarmAudio();
      const myToken = checkInAlarmToken;
      let playedAudio = false;
      let playedSpeech = false;

      const speakReminder = () => {
        if (myToken !== checkInAlarmToken) {
          resolve({ playedAudio, playedSpeech });
          return;
        }
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          resolve({ playedAudio, playedSpeech });
          return;
        }
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance('anda belum checkin');
          utterance.lang = 'id-ID';
          utterance.rate = 0.94;
          utterance.pitch = 1.04;
          const voices = window.speechSynthesis.getVoices();
          const idVoice = voices.find(
            (v) =>
              v.lang.includes('id') ||
              v.lang.includes('ID') ||
              v.name.toLowerCase().includes('indonesia')
          );
          if (idVoice) {
            utterance.voice = idVoice;
          }
          utterance.onstart = () => {
            playedSpeech = true;
          };
          utterance.onend = () => resolve({ playedAudio, playedSpeech: true });
          utterance.onerror = () => resolve({ playedAudio, playedSpeech });
          window.speechSynthesis.speak(utterance);
        } catch {
          resolve({ playedAudio, playedSpeech });
        }
      };

      const AudioContextClass =
        typeof window !== 'undefined'
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          : undefined;

      if (!AudioContextClass) {
        speakReminder();
        return;
      }

      const ctx = new AudioContextClass();
      activeCheckInAudioCtx = ctx;

      const scheduleBeeps = () => {
        if (myToken !== checkInAlarmToken) {
          resolve({ playedAudio, playedSpeech });
          return;
        }
        const now = ctx.currentTime;
        const pulses = [
          { freq: 880, start: 0.0, duration: 0.16 },
          { freq: 1174.66, start: 0.2, duration: 0.16 },
          { freq: 880, start: 0.42, duration: 0.16 },
          { freq: 1174.66, start: 0.62, duration: 0.24 }
        ];

        pulses.forEach((pulse) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(pulse.freq, now + pulse.start);
          gain.gain.setValueAtTime(0.0001, now + pulse.start);
          gain.gain.exponentialRampToValueAtTime(0.28, now + pulse.start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + pulse.start + pulse.duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + pulse.start);
          osc.stop(now + pulse.start + pulse.duration + 0.03);
        });
        playedAudio = true;

        activeCheckInTimer = setTimeout(() => {
          activeCheckInTimer = null;
          try {
            if (activeCheckInAudioCtx === ctx) {
              ctx.close().catch(() => {});
              activeCheckInAudioCtx = null;
            }
          } catch {
            // ignore
          }
          speakReminder();
        }, 1020);
      };

      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => scheduleBeeps())
          .catch(() => {
            // Autoplay blocked by browser policy; gracefully attempt speech or exit
            try {
              ctx.close().catch(() => {});
            } catch {}
            activeCheckInAudioCtx = null;
            speakReminder();
          });
      } else {
        scheduleBeeps();
      }
    } catch {
      resolve({ playedAudio: false, playedSpeech: false });
    }
  });
}

