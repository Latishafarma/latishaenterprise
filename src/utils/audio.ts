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

// Indonesian Voice Announcer via Web Speech Synthesis
export function announceQueueVoice(nomor: string, nama: string, poli: string = 'Ruang Periksa Dokter'): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    // Spacing numbers for natural phonetic reading in Indonesian (e.g., A-001 -> A, kosong kosong satu)
    const formattedNomor = nomor
      .replace('A-00', 'A, kosong, kosong, ')
      .replace('A-0', 'A, kosong, ')
      .replace('A-', 'A, ');

    const text = `Nomor antrean, ${formattedNomor}, atas nama, ${nama}, silakan menuju ke ${poli}.`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 0.88;
    utterance.pitch = 1.05;

    // Pick Indonesian voice if available
    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID') || v.name.toLowerCase().includes('indonesia'));
    if (idVoice) {
      utterance.voice = idVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    // Play chime first then speak
    playQueueChime().then(() => {
      window.speechSynthesis.speak(utterance);
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

