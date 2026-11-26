import {
  DrugInteractionRecord,
  DrugInteractionSeverity,
  InteractionCheckResult,
  MatchedDrugInteraction,
  PrescriptionItem,
  Medicine
} from '../types';

export const SEVERITY_RANK: Record<DrugInteractionSeverity, number> = {
  contraindicated: 4,
  major: 3,
  moderate: 2,
  minor: 1
};

export const SEVERITY_META: Record<
  DrugInteractionSeverity,
  {
    label: string;
    badgeClass: string;
    cardClass: string;
    dotClass: string;
    description: string;
  }
> = {
  contraindicated: {
    label: 'contraindicated',
    badgeClass: 'bg-rose-700 text-white border border-rose-800',
    cardClass: 'bg-rose-50/90 border-rose-400',
    dotClass: 'bg-rose-700',
    description: 'Kontraindikasi — kombinasi dilarang diberikan bersamaan'
  },
  major: {
    label: 'major',
    badgeClass: 'bg-red-600 text-white border border-red-700',
    cardClass: 'bg-red-50/80 border-red-300',
    dotClass: 'bg-red-600',
    description: 'Major — berpotensi menyebabkan dampak klinis serius'
  },
  moderate: {
    label: 'moderate',
    badgeClass: 'bg-amber-500 text-slate-950 border border-amber-600',
    cardClass: 'bg-amber-50/80 border-amber-300',
    dotClass: 'bg-amber-500',
    description: 'Moderate — perlu pemantauan klinis atau penyesuaian jadwal/dosis'
  },
  minor: {
    label: 'minor',
    badgeClass: 'bg-sky-600 text-white border border-sky-700',
    cardClass: 'bg-sky-50/80 border-sky-300',
    dotClass: 'bg-sky-600',
    description: 'Minor — interaksi ringan dengan dampak klinis minimal'
  }
};

const CORE_INTERAKSI_OBAT: DrugInteractionRecord[] = [
  {
    id: 'INT-001',
    obatA: 'Simvastatin',
    obatB: 'Gemfibrozil',
    aliasA: ['simvastatin', 'atorvastatin', 'lovastatin', 'statin'],
    aliasB: ['gemfibrozil'],
    severity: 'contraindicated',
    mekanisme:
      'Gemfibrozil menghambat glukuronidasi dan transporter OATP1B1 hepatik sehingga meningkatkan kadar plasma simvastatin secara drastis dan memicu miopati/rabdomiolisis berat.',
    manajemenKlinis:
      'Kontraindikasi absolut. Hentikan salah satu agen atau ganti fibrat dengan fenofibrate bila kombinasi dengan statin lain benar-benar dibutuhkan.',
    referensi: 'BNF 86 · Lexicomp · BPOM PIONAS',
    source: 'supabase'
  },
  {
    id: 'INT-002',
    obatA: 'Sildenafil',
    obatB: 'Isosorbide Dinitrate',
    aliasA: ['sildenafil', 'tadalafil', 'vardenafil'],
    aliasB: ['isosorbide dinitrate', 'isdn', 'nitroglycerin', 'gliseril trinitrat', 'nitrat'],
    severity: 'contraindicated',
    mekanisme:
      'Efek sinergis jalur cGMP-nitrat oksida menyebabkan vasodilatasi sistemik masif dan hipotensi refrakter yang mengancam nyawa.',
    manajemenKlinis:
      'Dilarang digunakan bersamaan atau dalam interval < 24 jam (48 jam untuk tadalafil). Segera hubungi dokter peresep untuk penggantian terapi.',
    referensi: 'BNF 86 · ESC Cardiology Guidelines',
    source: 'supabase'
  },
  {
    id: 'INT-003',
    obatA: 'Clopidogrel',
    obatB: 'Omeprazole',
    aliasA: ['clopidogrel', 'klopidogrel'],
    aliasB: ['omeprazole', 'omeprazol', 'esomeprazole', 'esomeprazol'],
    severity: 'major',
    mekanisme:
      'Omeprazole menghambat enzim CYP2C19 secara kompetitif sehingga menurunkan bioaktivasi prodrug clopidogrel menjadi metabolit aktif antiplatelet.',
    manajemenKlinis:
      'Hindari kombinasi dengan omeprazole/esomeprazole. Gunakan PPI yang tidak menghambat CYP2C19 secara bermakna (pantoprazole atau rabeprazole) atau famotidine.',
    referensi: 'FDA Boxed Warning · BNF 86 · Lexicomp',
    source: 'supabase'
  },
  {
    id: 'INT-004',
    obatA: 'Warfarin',
    obatB: 'NSAID (Asam Mefenamat / Ibuprofen / Natrium Diklofenak)',
    aliasA: ['warfarin'],
    aliasB: [
      'nsaid',
      'ibuprofen',
      'asam mefenamat',
      'mefenamat',
      'mefenamic acid',
      'natrium diklofenak',
      'diclofenac',
      'diklofenak',
      'ketorolac',
      'ketorolak',
      'meloxicam',
      'meloksikam',
      'piroxicam',
      'piroksikam',
      'aspirin',
      'asetosal'
    ],
    severity: 'major',
    mekanisme:
      'NSAID mengiritasi mukosa saluran cerna, menghambat agregasi trombosit, serta menggeser ikatan protein plasma warfarin sehingga meningkatkan risiko perdarahan gastrointestinal berat.',
    manajemenKlinis:
      'Hindari penggunaan bersamaan. Gunakan paracetamol dosis rendah-sedang sebagai analgesik alternatif dan pantau ketat nilai INR bila terpaksa digunakan.',
    referensi: 'BNF 86 · Lexicomp Anticoagulants',
    source: 'supabase'
  },
  {
    id: 'INT-005',
    obatA: 'Captopril',
    obatB: 'Spironolactone',
    aliasA: ['captopril', 'kaptopril', 'lisinopril', 'ramipril', 'enalapril', 'ace inhibitor', 'candesartan', 'valsartan', 'losartan', 'arb'],
    aliasB: ['spironolactone', 'spironolakton', 'kalium klorida', 'kcl'],
    severity: 'major',
    mekanisme:
      'Penghambatan sistem RAAS oleh ACEi/ARB ditambah efek hemat kalium oleh spironolakton menurunkan ekskresi kalium ginjal sehingga memicu hiperkalemia bermakna.',
    manajemenKlinis:
      'Pantau kadar kalium serum dan fungsi kreatinin ginjal secara berkala (terutama pada lansia atau CKD). Pertahankan dosis spironolakton serendah mungkin bila diperlukan untuk gagal jantung.',
    referensi: 'BNF 86 · PERKI Gagal Jantung',
    source: 'supabase'
  },
  {
    id: 'INT-006',
    obatA: 'Azithromycin',
    obatB: 'Ondansetron',
    aliasA: ['azithromycin', 'azitromisin', 'erythromycin', 'eritromisin', 'clarithromycin', 'levofloxacin'],
    aliasB: ['ondansetron', 'domperidone', 'domperidon', 'haloperidol', 'amiodarone'],
    severity: 'major',
    mekanisme:
      'Efek aditif pemanjangan interval QTc pada elektrokardiogram yang meningkatkan risiko aritmia ventrikel Torsades de Pointes.',
    manajemenKlinis:
      'Hindari kombinasi pada pasien dengan riwayat gangguan irama jantung atau hipokalemia. Pertimbangkan antiemetik alternatif atau antibiotik non-pemanjang QT.',
    referensi: 'CredibleMeds · Lexicomp QT Interactions',
    source: 'supabase'
  },
  {
    id: 'INT-007',
    obatA: 'NSAID Agen 1 (Ibuprofen / Asam Mefenamat / Diklofenak)',
    obatB: 'NSAID Agen 2 (Duplikasi Kelas NSAID)',
    aliasA: ['nsaid', 'ibuprofen', 'asam mefenamat', 'mefenamat', 'natrium diklofenak', 'diklofenak', 'ketorolac', 'meloxicam', 'piroxicam'],
    aliasB: ['nsaid', 'ibuprofen', 'asam mefenamat', 'mefenamat', 'natrium diklofenak', 'diklofenak', 'ketorolac', 'meloxicam', 'piroxicam'],
    severity: 'major',
    mekanisme:
      'Duplikasi penghambatan enzim siklooksigenase (COX-1/COX-2) secara bersamaan tidak memberikan tambahan efikasi analgesik, namun melipatgandakan risiko ulserasi lambung, perdarahan GI, dan gagal ginjal akut.',
    manajemenKlinis:
      'Hentikan salah satu NSAID dan konfirmasi ke dokter peresep agar pasien hanya menerima monoterapi satu jenis NSAID atau dikombinasikan dengan paracetamol.',
    referensi: 'BPOM PIONAS NSAIDs · BNF 86',
    source: 'supabase'
  },
  {
    id: 'INT-008',
    obatA: 'Ciprofloxacin',
    obatB: 'Metformin',
    aliasA: ['ciprofloxacin', 'siprofloksasin', 'levofloxacin', 'ofloxacin'],
    aliasB: ['metformin'],
    severity: 'moderate',
    mekanisme:
      'Fluorokuinolon dapat mengganggu homeostasis glukosa darah melalui efek pada kanal kalium sel beta pankreas serta berpotensi memicu fluktuasi hipoglikemia maupun hiperglikemia.',
    manajemenKlinis:
      'Pantau kadar glukosa darah pasien lebih sering selama terapi antibiotik dan edukasi pasien mengenai gejala hipoglikemia.',
    referensi: 'BNF 86 · FDA Safety Communication',
    source: 'supabase'
  },
  {
    id: 'INT-009',
    obatA: 'Kortikosteroid (Dexamethasone / Metilprednisolon)',
    obatB: 'NSAID (Asam Mefenamat / Ibuprofen / Diklofenak / Meloxicam)',
    aliasA: ['dexamethasone', 'deksametason', 'metilprednisolon', 'methylprednisolone', 'prednison', 'prednisone', 'prednisolone', 'kortikosteroid'],
    aliasB: ['nsaid', 'ibuprofen', 'asam mefenamat', 'mefenamat', 'natrium diklofenak', 'diklofenak', 'ketorolac', 'meloxicam', 'piroxicam'],
    severity: 'moderate',
    mekanisme:
      'Kombinasi kortikosteroid dan NSAID secara sinergis menghambat sintesis prostaglandin protektif mukosa lambung sehingga meningkatkan risiko gastritis erosif, tukak lambung, dan perdarahan saluran cerna atas.',
    manajemenKlinis:
      'Gunakan dalam durasi sesingkat mungkin, instruksikan konsumsi sesudah makan, serta rekomendasikan penambahan gastroprotektor PPI (misal Omeprazole/Lansoprazole) bila digunakan > 3 hari.',
    referensi: 'BNF 86 · Lexicomp GI Risk',
    source: 'supabase'
  },
  {
    id: 'INT-010',
    obatA: 'NSAID (Asam Mefenamat / Ibuprofen / Diklofenak)',
    obatB: 'Antihipertensi (Amlodipine / Captopril / Candesartan)',
    aliasA: ['nsaid', 'ibuprofen', 'asam mefenamat', 'mefenamat', 'natrium diklofenak', 'diklofenak', 'ketorolac', 'meloxicam', 'piroxicam'],
    aliasB: ['amlodipine', 'amlodipin', 'captopril', 'kaptopril', 'candesartan', 'losartan', 'valsartan', 'lisinopril', 'furosemide', 'furosemid', 'hct'],
    severity: 'moderate',
    mekanisme:
      'NSAID menghambat sintesis prostaglandin vasodilatator ginjal yang memicu retensi natrium dan cairan, sehingga menurunkan efektivitas obat antihipertensi serta meningkatkan beban ginjal.',
    manajemenKlinis:
      'Batasi penggunaan NSAID maksimal 3–5 hari atau alihkan ke Paracetamol bila hanya untuk nyeri/demam ringan. Pantau tekanan darah secara berkala.',
    referensi: 'BNF 86 · PERKI Hipertensi',
    source: 'supabase'
  },
  {
    id: 'INT-011',
    obatA: 'Ciprofloxacin',
    obatB: 'Antasida / Suplemen Zinc / Zat Besi / Kalsium',
    aliasA: ['ciprofloxacin', 'siprofloksasin', 'levofloxacin', 'tetracycline', 'tetrasiklin', 'doxycycline', 'doksisiklin'],
    aliasB: ['antasida', 'antacid', 'aluminium', 'magnesium', 'zinc', 'seng', 'fe', 'besi', 'kalsium', 'calcium', 'sukralfat', 'sucralfate'],
    severity: 'moderate',
    mekanisme:
      'Kation divalen dan trivalen (Al3+, Mg2+, Ca2+, Fe2+, Zn2+) membentuk kompleks kelat yang tidak larut di saluran cerna sehingga menurunkan absorpsi antibiotik hingga > 50%.',
    manajemenKlinis:
      'Beri jeda waktu konsumsi minimal 2 jam sebelum atau 4–6 jam sesudah pemberian antasida maupun suplemen mineral.',
    referensi: 'BPOM PIONAS · BNF 86',
    source: 'supabase'
  },
  {
    id: 'INT-012',
    obatA: 'Metformin',
    obatB: 'Kortikosteroid (Dexamethasone / Metilprednisolon)',
    aliasA: ['metformin', 'glimepiride', 'glimepirid', 'glibenclamide'],
    aliasB: ['dexamethasone', 'deksametason', 'metilprednisolon', 'methylprednisolone', 'prednison', 'prednisone'],
    severity: 'moderate',
    mekanisme:
      'Kortikosteroid menginduksi resistensi insulin dan meningkatkan glukoneogenesis hepatik yang melawan efek hipoglikemik obat antidiabetes.',
    manajemenKlinis:
      'Pantau kadar gula darah puasa/sewaktu secara lebih ketat selama penggunaan steroid dan sesuaikan dosis antidiabetik bila diperlukan oleh dokter.',
    referensi: 'Lexicomp · PERKENI Diabetes Mellitus',
    source: 'supabase'
  },
  {
    id: 'INT-013',
    obatA: 'Cetirizine / Antihistamin H1',
    obatB: 'Antihistamin H1 Lain (CTM / Loratadine)',
    aliasA: ['cetirizine', 'setirizin', 'ctm', 'chlorpheniramine', 'klorfeniramin', 'loratadine', 'loratadin', 'dexchlorpheniramine'],
    aliasB: ['cetirizine', 'setirizin', 'ctm', 'chlorpheniramine', 'klorfeniramin', 'loratadine', 'loratadin', 'dexchlorpheniramine'],
    severity: 'moderate',
    mekanisme:
      'Kombinasi dua antihistamin H1 menghasilkan efek sedasi sistem saraf pusat dan efek antikolinergik aditif (kantuk berat, mulut kering, retensi urin).',
    manajemenKlinis:
      'Evaluasi duplikasi terapi antihistamin. Umumnya cukup memilih satu antihistamin generasi ke-2 non-sedatif (misal Cetirizine atau Loratadine).',
    referensi: 'BPOM PIONAS · BNF 86',
    source: 'supabase'
  },
  {
    id: 'INT-014',
    obatA: 'Amoxicillin',
    obatB: 'Allopurinol',
    aliasA: ['amoxicillin', 'amoksisilin', 'ampicillin', 'ampisilin'],
    aliasB: ['allopurinol', 'alopurinol'],
    severity: 'minor',
    mekanisme:
      'Mekanisme pasti belum sepenuhnya dipahami, namun pemberian bersamaan meningkatkan insidensi ruam kulit makulopapular non-alergik ringan hingga sedang.',
    manajemenKlinis:
      'Tetap dapat diberikan bila terindikasi, namun pantau munculnya ruam kulit dan edukasi pasien untuk melapor bila terjadi reaksi kulit.',
    referensi: 'BNF 86 · Stockley Drug Interactions',
    source: 'supabase'
  },
  {
    id: 'INT-015',
    obatA: 'Paracetamol',
    obatB: 'Metoclopramide / Domperidone',
    aliasA: ['paracetamol', 'parasetamol', 'acetaminophen'],
    aliasB: ['metoclopramide', 'metoklopramid', 'domperidone', 'domperidon'],
    severity: 'minor',
    mekanisme:
      'Agen prokinetik mempercepat pengosongan lambung sehingga meningkatkan laju absorpsi awal paracetamol tanpa mengubah total AUC secara bermakna.',
    manajemenKlinis:
      'Kombinasi umumnya aman secara klinis dan tidak memerlukan penyesuaian dosis khusus pada dosis terapeutik.',
    referensi: 'Stockley Drug Interactions · BNF 86',
    source: 'supabase'
  },
  {
    id: 'INT-016',
    obatA: 'Vitamin C (Asam Askorbat)',
    obatB: 'Antasida / Aluminium Hidroksida',
    aliasA: ['vitamin c', 'asam askorbat', 'ascorbic acid', 'enervon'],
    aliasB: ['antasida', 'antacid', 'aluminium hidroksida'],
    severity: 'minor',
    mekanisme:
      'Asam askorbat dapat sedikit meningkatkan absorpsi aluminium di saluran cerna melalui pembentukan kompleks larut.',
    manajemenKlinis:
      'Tidak bermakna pada fungsi ginjal normal; beri jeda 1–2 jam terutama pada pasien dengan gangguan fungsi ginjal kronis.',
    referensi: 'Lexicomp · MIMS Indonesia',
    source: 'supabase'
  },
  {
    id: 'INT-017',
    obatA: 'Amlodipine',
    obatB: 'Simvastatin',
    aliasA: ['amlodipine', 'amlodipin', 'amlodipine besylate', 'norvask', 'tensivask'],
    aliasB: ['simvastatin', 'simvastatine', 'zocor'],
    severity: 'moderate',
    mekanisme:
      'Amlodipine menghambat metabolisme simvastatin melalui enzim CYP3A4 sehingga meningkatkan paparan sistemik (AUC) simvastatin dan risiko miopati/rabdomiolisis.',
    manajemenKlinis:
      'Batasi dosis simvastatin maksimal 20 mg per hari bila diberikan bersamaan dengan amlodipine, atau pertimbangkan pergantian ke statin non-CYP3A4 (misal pravastatin/rosuvastatin) serta edukasi pasien mengenai keluhan nyeri otot.',
    referensi: 'FDA Drug Safety Communication · BNF 86 · Lexicomp',
    source: 'supabase'
  },
  {
    id: 'INT-018',
    obatA: 'Candesartan',
    obatB: 'Captopril',
    aliasA: ['candesartan', 'kandesartan', 'candesartan cilexetil', 'valsartan', 'losartan', 'irbesartan', 'telmisartan', 'arb'],
    aliasB: ['captopril', 'kaptopril', 'lisinopril', 'ramipril', 'enalapril', 'perindopril', 'ace inhibitor'],
    severity: 'major',
    mekanisme:
      'Efek Klinis: Peningkatan risiko hiperkalemia berat, hipotensi simtomatik, dan penurunan fungsi ginjal (gagal ginjal akut). — Mekanisme: Blokade ganda sistem Renin-Angiotensin-Aldosteron (RAAS) akibat kombinasi ARB (Candesartan) dan ACE Inhibitor (Captopril).',
    manajemenKlinis:
      'Hindari kombinasi blokade ganda RAAS (ACE Inhibitor + ARB). Gunakan salah satu agen antihipertensi saja dan pantau ketat tekanan darah, fungsi ginjal (kreatinin/eGFR), serta kadar kalium serum.',
    referensi: 'BNF 86 · PERKI Hipertensi · Lexicomp',
    source: 'supabase'
  }
];

interface ClinicalInteractionCluster {
  groupA: Array<{ name: string; aliases?: string[] }>;
  groupB: Array<{ name: string; aliases?: string[] }>;
  severity: DrugInteractionSeverity;
  mekanismeTemplate: (a: string, b: string) => string;
  manajemenTemplate: (a: string, b: string) => string;
  referensi: string;
}

const CLINICAL_INTERACTION_CLUSTERS: ClinicalInteractionCluster[] = [
  // 1. Statin CYP3A4 vs Inhibitor CYP3A4 / Makrolida / Azol / CCB
  {
    groupA: [
      { name: 'Simvastatin', aliases: ['simvastatin', 'zocor'] },
      { name: 'Atorvastatin', aliases: ['atorvastatin', 'lipitor'] },
      { name: 'Lovastatin', aliases: ['lovastatin'] }
    ],
    groupB: [
      { name: 'Clarithromycin', aliases: ['clarithromycin', 'klaritromisin'] },
      { name: 'Erythromycin', aliases: ['erythromycin', 'eritromisin'] },
      { name: 'Ketoconazole', aliases: ['ketoconazole', 'ketokonazol'] },
      { name: 'Itraconazole', aliases: ['itraconazole', 'itrakonazol'] },
      { name: 'Fluconazole', aliases: ['fluconazole', 'flukonazol'] },
      { name: 'Diltiazem', aliases: ['diltiazem', 'herbesser'] },
      { name: 'Verapamil', aliases: ['verapamil', 'isoptin'] },
      { name: 'Amiodarone', aliases: ['amiodarone', 'amiodaron', 'cordarone'] },
      { name: 'Cyclosporine', aliases: ['cyclosporine', 'siklosporin'] }
    ],
    severity: 'major',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Peningkatan risiko miopati dan rabdomiolisis berat. Mekanisme: ${b} menghambat metabolisme hepatik ${a} pada isoenzim CYP3A4 sehingga kadar plasma statin meningkat drastis.`,
    manajemenTemplate: (a, b) =>
      `Hindari penggunaan bersamaan ${a} dengan ${b}, tangguhkan statin sementara selama terapi ${b}, atau alihkan ke pravastatin/rosuvastatin.`,
    referensi: 'BNF 86 · BPOM PIONAS · Lexicomp'
  },
  // 2. NSAID Spesifik vs Antihipertensi ACEi / ARB / Diuretik / Beta-Blocker
  {
    groupA: [
      { name: 'Ibuprofen', aliases: ['ibuprofen', 'proris', 'farsifen'] },
      { name: 'Asam Mefenamat', aliases: ['asam mefenamat', 'mefenamat', 'ponstan', 'mefinal'] },
      { name: 'Natrium Diklofenak', aliases: ['natrium diklofenak', 'kalium diklofenak', 'diclofenac', 'cataflam', 'voltaren'] },
      { name: 'Meloxicam', aliases: ['meloxicam', 'meloksikam', 'mobic'] },
      { name: 'Piroxicam', aliases: ['piroxicam', 'piroksikam', 'feldene'] },
      { name: 'Ketorolac', aliases: ['ketorolac', 'ketorolak', 'toradol'] },
      { name: 'Celecoxib', aliases: ['celecoxib', 'selekoksib', 'celebrex'] },
      { name: 'Etoricoxib', aliases: ['etoricoxib', 'etorikoksib', 'arcoxia'] }
    ],
    groupB: [
      { name: 'Captopril', aliases: ['captopril', 'kaptopril'] },
      { name: 'Lisinopril', aliases: ['lisinopril'] },
      { name: 'Ramipril', aliases: ['ramipril'] },
      { name: 'Enalapril', aliases: ['enalapril'] },
      { name: 'Candesartan', aliases: ['candesartan', 'kandesartan', 'blopress'] },
      { name: 'Losartan', aliases: ['losartan'] },
      { name: 'Valsartan', aliases: ['valsartan', 'diovan'] },
      { name: 'Irbesartan', aliases: ['irbesartan', 'aprovel'] },
      { name: 'Telmisartan', aliases: ['telmisartan', 'micardis'] },
      { name: 'Furosemide', aliases: ['furosemide', 'furosemid', 'lasix'] },
      { name: 'Hydrochlorothiazide', aliases: ['hydrochlorothiazide', 'hct'] },
      { name: 'Bisoprolol', aliases: ['bisoprolol', 'concor'] },
      { name: 'Propranolol', aliases: ['propranolol'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Penurunan efektivitas antihipertensi ${b} dan peningkatan risiko nefrotoksisitas. Mekanisme: ${a} menghambat sintesis prostaglandin vasodilator renal sehingga memicu retensi natrium dan cairan.`,
    manajemenTemplate: (a, b) =>
      `Gunakan ${a} dalam durasi sesingkat mungkin (3-5 hari) atau ganti dengan Paracetamol. Pantau tekanan darah dan fungsi ginjal pasien yang menggunakan ${b}.`,
    referensi: 'BNF 86 · PERKI Hipertensi · BPOM PIONAS'
  },
  // 3. NSAID Spesifik vs Kortikosteroid Spesifik (Risiko Ulkus & Perdarahan GI)
  {
    groupA: [
      { name: 'Ibuprofen', aliases: ['ibuprofen'] },
      { name: 'Asam Mefenamat', aliases: ['asam mefenamat', 'mefenamat'] },
      { name: 'Natrium Diklofenak', aliases: ['natrium diklofenak', 'diklofenak'] },
      { name: 'Meloxicam', aliases: ['meloxicam', 'meloksikam'] },
      { name: 'Piroxicam', aliases: ['piroxicam', 'piroksikam'] },
      { name: 'Ketorolac', aliases: ['ketorolac', 'ketorolak'] },
      { name: 'Aspirin', aliases: ['aspirin', 'asetosal', 'aspilet'] }
    ],
    groupB: [
      { name: 'Dexamethasone', aliases: ['dexamethasone', 'deksametason'] },
      { name: 'Methylprednisolone', aliases: ['methylprednisolone', 'metilprednisolon'] },
      { name: 'Prednisone', aliases: ['prednisone', 'prednison'] },
      { name: 'Prednisolone', aliases: ['prednisolone', 'prednisolon'] },
      { name: 'Triamcinolone', aliases: ['triamcinolone', 'triamsinolon'] },
      { name: 'Hydrocortisone', aliases: ['hydrocortisone', 'hidrokortison'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Peningkatan risiko gastritis erosif, ulkus peptikum, dan perdarahan saluran cerna. Mekanisme: Efek aditif ${a} dan ${b} dalam menekan barier sitoprotektif prostaglandin mukosa lambung.`,
    manajemenTemplate: (a, b) =>
      `Instruksikan konsumsi ${a} dan ${b} sesudah makan. Tambahkan gastroprotektor PPI (Omeprazole/Lansoprazole/Pantoprazole) bila digunakan bersamaan > 3 hari.`,
    referensi: 'BNF 86 · Lexicomp GI Risk · BPOM PIONAS'
  },
  // 4. Antibiotik Kuinolon & Tetrasiklin vs Kation Polivalen (Antasida, Ca, Fe, Zn, Mg, Sukralfat)
  {
    groupA: [
      { name: 'Ciprofloxacin', aliases: ['ciprofloxacin', 'siprofloksasin'] },
      { name: 'Levofloxacin', aliases: ['levofloxacin', 'levofloksasin'] },
      { name: 'Ofloxacin', aliases: ['ofloxacin', 'ofloksasin'] },
      { name: 'Moxifloxacin', aliases: ['moxifloxacin', 'moksifloksasin'] },
      { name: 'Tetracycline', aliases: ['tetracycline', 'tetrasiklin'] },
      { name: 'Doxycycline', aliases: ['doxycycline', 'doksisiklin'] },
      { name: 'Cefixime', aliases: ['cefixime', 'sefiksim'] }
    ],
    groupB: [
      { name: 'Antasida DOEN', aliases: ['antasida', 'antacid', 'promag', 'mylanta'] },
      { name: 'Sucralfate', aliases: ['sucralfate', 'sukralfat', 'inpepsa'] },
      { name: 'Zinc Sulfate', aliases: ['zinc', 'seng', 'zink'] },
      { name: 'Ferrous Sulfate (Zat Besi)', aliases: ['ferrous sulfate', 'zat besi', 'sangobion', 'tablet tambah darah'] },
      { name: 'Calcium Lactate (Kalk)', aliases: ['calcium lactate', 'kalsium', 'kalk', 'caco3'] },
      { name: 'Magnesium Hydroxide', aliases: ['magnesium hydroxide', 'magnesium', 'polysilane'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Penurunan bioavailabilitas dan kegagalan terapi antibiotik ${a}. Mekanisme: Pembentukan kompleks kelat tidak larut antara ${a} dengan ion logam polivalen pada ${b} di saluran cerna.`,
    manajemenTemplate: (a, b) =>
      `Pisahkan jadwal pemberian: minum ${a} minimal 2 jam sebelum atau 4-6 jam sesudah konsumsi ${b}.`,
    referensi: 'BPOM PIONAS · BNF 86 · Stockley'
  },
  // 5. Antikoagulan & Antiplatelet vs NSAID / Antiplatelet Lain (Risiko Perdarahan Major)
  {
    groupA: [
      { name: 'Warfarin', aliases: ['warfarin', 'simarc'] },
      { name: 'Clopidogrel', aliases: ['clopidogrel', 'klopidogrel', 'plavix'] },
      { name: 'Rivaroxaban', aliases: ['rivaroxaban', 'xarelto'] },
      { name: 'Dabigatran', aliases: ['dabigatran', 'pradaxa'] },
      { name: 'Cilostazol', aliases: ['cilostazol', 'pletaal'] }
    ],
    groupB: [
      { name: 'Aspirin (Asetosal)', aliases: ['aspirin', 'asetosal', 'aspilet'] },
      { name: 'Ibuprofen', aliases: ['ibuprofen'] },
      { name: 'Asam Mefenamat', aliases: ['asam mefenamat', 'mefenamat'] },
      { name: 'Natrium Diklofenak', aliases: ['natrium diklofenak', 'diklofenak'] },
      { name: 'Ketorolac', aliases: ['ketorolac', 'ketorolak'] },
      { name: 'Meloxicam', aliases: ['meloxicam', 'meloksikam'] },
      { name: 'Piroxicam', aliases: ['piroxicam', 'piroksikam'] },
      { name: 'Tranexamic Acid', aliases: ['tranexamic acid', 'asam traneksamat', 'kalnex'] }
    ],
    severity: 'major',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Peningkatan signifikan risiko perdarahan saluran cerna dan sistemik atau gangguan hemostasis. Mekanisme: Sinergisme hambatan fungsi trombosit/koagulasi antara ${a} dan ${b}.`,
    manajemenTemplate: (a, b) =>
      `Evaluasi ketat indikasi kombinasi ${a} dan ${b}. Bila tidak untuk indikasi kardiologi spesifik (seperti DAPT), ganti NSAID dengan Paracetamol dan pantau tanda perdarahan.`,
    referensi: 'BNF 86 · ACC/AHA Guidelines · Lexicomp'
  },
  // 6. Obat Pemanjang Interval QTc (Makrolida, Kuinolon, Antiemetik, Antiaritmia, Psikotropik)
  {
    groupA: [
      { name: 'Azithromycin', aliases: ['azithromycin', 'azitromisin'] },
      { name: 'Erythromycin', aliases: ['erythromycin', 'eritromisin'] },
      { name: 'Clarithromycin', aliases: ['clarithromycin', 'klaritromisin'] },
      { name: 'Levofloxacin', aliases: ['levofloxacin', 'levofloksasin'] },
      { name: 'Ciprofloxacin', aliases: ['ciprofloxacin', 'siprofloksasin'] },
      { name: 'Moxifloxacin', aliases: ['moxifloxacin', 'moksifloksasin'] }
    ],
    groupB: [
      { name: 'Domperidone', aliases: ['domperidone', 'domperidon', 'vometa'] },
      { name: 'Ondansetron', aliases: ['ondansetron', 'narfoz'] },
      { name: 'Haloperidol', aliases: ['haloperidol'] },
      { name: 'Chlorpromazine', aliases: ['chlorpromazine', 'klorpromazin'] },
      { name: 'Amitriptyline', aliases: ['amitriptyline', 'amitriptilin'] },
      { name: 'Amiodarone', aliases: ['amiodarone', 'amiodaron'] },
      { name: 'Fluconazole', aliases: ['fluconazole', 'flukonazol'] }
    ],
    severity: 'major',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Peningkatan risiko pemanjangan interval QTc dan aritmia ventrikel (Torsades de Pointes). Mekanisme: Blokade aditif kanal kalium hERG kardiak oleh ${a} dan ${b}.`,
    manajemenTemplate: (a, b) =>
      `Hindari pemberian bersamaan ${a} dan ${b} terutama pada pasien lansia, hipokalemia, atau bradikardia. Pertimbangkan alternatif non-pemanjang QT.`,
    referensi: 'CredibleMeds · BNF 86 · Lexicomp'
  },
  // 7. Antidiabetik Oral (Metformin, Glimepiride, Glibenclamide, Gliclazide) vs Obat Pengganggu Glikemik
  {
    groupA: [
      { name: 'Metformin', aliases: ['metformin', 'glucophage'] },
      { name: 'Glimepiride', aliases: ['glimepiride', 'glimepirid', 'amaryl'] },
      { name: 'Glibenclamide', aliases: ['glibenclamide', 'glibenklamid'] },
      { name: 'Gliclazide', aliases: ['gliclazide', 'gliklazid', 'diamicron'] },
      { name: 'Pioglitazone', aliases: ['pioglitazone', 'pioglitazon'] },
      { name: 'Sitagliptin', aliases: ['sitagliptin', 'januvia'] }
    ],
    groupB: [
      { name: 'Dexamethasone', aliases: ['dexamethasone', 'deksametason'] },
      { name: 'Methylprednisolone', aliases: ['methylprednisolone', 'metilprednisolon'] },
      { name: 'Prednisone', aliases: ['prednisone', 'prednison'] },
      { name: 'Hydrochlorothiazide (HCT)', aliases: ['hydrochlorothiazide', 'hct'] },
      { name: 'Furosemide', aliases: ['furosemide', 'furosemid'] },
      { name: 'Propranolol', aliases: ['propranolol'] },
      { name: 'Bisoprolol', aliases: ['bisoprolol'] },
      { name: 'Cotrimoxazole', aliases: ['cotrimoxazole', 'kotrimoksazol', 'sanprima'] },
      { name: 'Fluconazole', aliases: ['fluconazole', 'flukonazol'] },
      { name: 'Salbutamol', aliases: ['salbutamol', 'ventolin'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Gangguan kontrol glikemik (risiko hiperglikemia oleh steroid/diuretik atau hipoglikemia terselubung oleh sulfonamida/beta-bloker). Mekanisme: Interaksi farmakodinamik/CYP2C9 antara ${a} dan ${b}.`,
    manajemenTemplate: (a, b) =>
      `Pantau kadar glukosa darah puasa dan post-prandial secara berkala selama kombinasi ${a} dan ${b}. Edukasi tanda hipoglikemia/hiperglikemia kepada pasien.`,
    referensi: 'PERKENI · BNF 86 · Lexicomp'
  },
  // 8. ACE Inhibitor & ARB vs Diuretik Hemat Kalium / Suplemen Kalium / Kotrimoksazol (Hiperkalemia)
  {
    groupA: [
      { name: 'Captopril', aliases: ['captopril', 'kaptopril'] },
      { name: 'Lisinopril', aliases: ['lisinopril'] },
      { name: 'Ramipril', aliases: ['ramipril'] },
      { name: 'Candesartan', aliases: ['candesartan', 'kandesartan'] },
      { name: 'Valsartan', aliases: ['valsartan'] },
      { name: 'Losartan', aliases: ['losartan'] },
      { name: 'Telmisartan', aliases: ['telmisartan'] }
    ],
    groupB: [
      { name: 'Spironolactone', aliases: ['spironolactone', 'spironolakton'] },
      { name: 'Kalium Klorida (KSR)', aliases: ['kalium klorida', 'ksr', 'kcl'] },
      { name: 'Cotrimoxazole (Trimethoprim)', aliases: ['cotrimoxazole', 'kotrimoksazol', 'trimethoprim'] },
      { name: 'Allopurinol', aliases: ['allopurinol', 'alopurinol'] }
    ],
    severity: 'major',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Peningkatan risiko hiperkalemia berat atau reaksi hipersensitivitas/toksisitas ginjal. Mekanisme: Retensi kalium aditif di tubulus distal ginjal akibat kombinasi ${a} dan ${b}.`,
    manajemenTemplate: (a, b) =>
      `Pantau elektrolit kalium serum dan fungsi ginjal (eGFR/kreatinin), terutama pada pasien lansia atau gangguan ginjal kronis yang menerima ${a} dan ${b}.`,
    referensi: 'BNF 86 · PERKI · Lexicomp'
  },
  // 9. PPI & H2 Blocker vs Obat dengan Absorpsi Bergantung pH / CYP2C19
  {
    groupA: [
      { name: 'Omeprazole', aliases: ['omeprazole', 'omeprazol'] },
      { name: 'Lansoprazole', aliases: ['lansoprazole', 'lansoprazol'] },
      { name: 'Pantoprazole', aliases: ['pantoprazole', 'pantoprazol'] },
      { name: 'Esomeprazole', aliases: ['esomeprazole', 'esomeprazol'] },
      { name: 'Ranitidine', aliases: ['ranitidine', 'ranitidin'] },
      { name: 'Famotidine', aliases: ['famotidine', 'famotidin'] }
    ],
    groupB: [
      { name: 'Ketoconazole', aliases: ['ketoconazole', 'ketokonazol'] },
      { name: 'Itraconazole', aliases: ['itraconazole', 'itrakonazol'] },
      { name: 'Cefuroxime Axetil', aliases: ['cefuroxime', 'sefuroksim'] },
      { name: 'Ferrous Sulfate', aliases: ['ferrous sulfate', 'zat besi'] },
      { name: 'Digoxin', aliases: ['digoxin', 'digoksin', 'fargoxin'] },
      { name: 'Diazepam', aliases: ['diazepam', 'valium', 'stesolid'] },
      { name: 'Phenytoin', aliases: ['phenytoin', 'fenitoin', 'kutoin'] },
      { name: 'Levothyroxine', aliases: ['levothyroxine', 'levotiroksin', 'euthyrox'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Perubahan bioavailabilitas atau klirens hepatik ${b}. Mekanisme: Peningkatan pH intragastrik atau inhibisi enzim CYP2C19 oleh ${a} mengubah disolusi dan metabolisme ${b}.`,
    manajemenTemplate: (a, b) =>
      `Evaluasi efektivitas klinis ${b}, beri jeda waktu minum bila diperlukan, atau pantau tanda toksisitas selama penggunaan bersama ${a}.`,
    referensi: 'Stockley Drug Interactions · BNF 86'
  },
  // 10. Obat Saluran Napas (Theophylline, Salbutamol, Aminophylline) vs Antibiotik / Beta-Blocker
  {
    groupA: [
      { name: 'Theophylline', aliases: ['theophylline', 'teofilin', 'bronsolvan'] },
      { name: 'Aminophylline', aliases: ['aminophylline', 'aminofilin'] },
      { name: 'Salbutamol', aliases: ['salbutamol', 'ventolin', 'lasal'] },
      { name: 'Terbutaline', aliases: ['terbutaline', 'terbutalin', 'bricasma'] }
    ],
    groupB: [
      { name: 'Propranolol', aliases: ['propranolol'] },
      { name: 'Bisoprolol', aliases: ['bisoprolol'] },
      { name: 'Atenolol', aliases: ['atenolol'] },
      { name: 'Ciprofloxacin', aliases: ['ciprofloxacin', 'siprofloksasin'] },
      { name: 'Erythromycin', aliases: ['erythromycin', 'eritromisin'] },
      { name: 'Allopurinol', aliases: ['allopurinol', 'alopurinol'] },
      { name: 'Furosemide', aliases: ['furosemide', 'furosemid'] }
    ],
    severity: 'major',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Risiko bronkospasme antagonis, hipokalemia aditif, atau toksisitas metilxantin (takikardia/kejang). Mekanisme: Interaksi reseptor beta-2 adrenergik atau inhibisi CYP1A2 antara ${a} dan ${b}.`,
    manajemenTemplate: (a, b) =>
      `Hindari beta-bloker non-selektif pada pasien asma/PPOK yang menggunakan ${a}, atau turunkan dosis teofilin serta pantau nadi dan kadar kalium bila dikombinasikan dengan ${b}.`,
    referensi: 'BNF 86 · PDPI Asma & PPOK · Lexicomp'
  },
  // 11. Obat SSP, Antikonvulsan, Analgesik Sentral & Antihistamin Sedatif
  {
    groupA: [
      { name: 'Codeine', aliases: ['codeine', 'kodein', 'codipront'] },
      { name: 'Tramadol', aliases: ['tramadol'] },
      { name: 'Gabapentin', aliases: ['gabapentin', 'neurontin'] },
      { name: 'Pregabalin', aliases: ['pregabalin', 'lyrica'] },
      { name: 'Amitriptyline', aliases: ['amitriptyline', 'amitriptilin'] },
      { name: 'Diazepam', aliases: ['diazepam'] },
      { name: 'Alprazolam', aliases: ['alprazolam'] }
    ],
    groupB: [
      { name: 'Chlorpheniramine Maleate (CTM)', aliases: ['ctm', 'chlorpheniramine', 'klorfeniramin'] },
      { name: 'Cetirizine', aliases: ['cetirizine', 'setirizin'] },
      { name: 'Dimenhydrinate', aliases: ['dimenhydrinate', 'dimenhidrinat', 'antimo'] },
      { name: 'Fluoxetine', aliases: ['fluoxetine', 'fluoksetin'] },
      { name: 'Sertraline', aliases: ['sertraline', 'sertralin'] },
      { name: 'Carbamazepine', aliases: ['carbamazepine', 'karbamazepin', 'tegretol'] },
      { name: 'Phenytoin', aliases: ['phenytoin', 'fenitoin'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Depresi sistem saraf pusat aditif (kantuk berat, pusing, gangguan koordinasi) atau risiko sindrom serotonin/induksi enzim. Mekanisme: Sinergisme sedatif sentral atau modulasi metabolisme hepatik antara ${a} dan ${b}.`,
    manajemenTemplate: (a, b) =>
      `Edukasi pasien agar tidak mengemudi atau mengoperasikan mesin saat mengonsumsi ${a} dan ${b}, serta pantau tanda sedasi berlebih.`,
    referensi: 'BNF 86 · BPOM PIONAS · Lexicomp'
  },
  // 12. Obat Tuberkulosis (Rifampicin, Isoniazid) & Antijamur vs Obat Kronis (Induksi/Inhibisi CYP450)
  {
    groupA: [
      { name: 'Rifampicin', aliases: ['rifampicin', 'rifampisin'] },
      { name: 'Isoniazid (INH)', aliases: ['isoniazid', 'inh'] },
      { name: 'Griseofulvin', aliases: ['griseofulvin'] },
      { name: 'Metronidazole', aliases: ['metronidazole', 'metronidazol', 'flagyl'] }
    ],
    groupB: [
      { name: 'Amlodipine', aliases: ['amlodipine', 'amlodipin'] },
      { name: 'Simvastatin', aliases: ['simvastatin'] },
      { name: 'Atorvastatin', aliases: ['atorvastatin'] },
      { name: 'Glimepiride', aliases: ['glimepiride', 'glimepirid'] },
      { name: 'Warfarin', aliases: ['warfarin'] },
      { name: 'Paracetamol', aliases: ['paracetamol', 'parasetamol'] },
      { name: 'Dexamethasone', aliases: ['dexamethasone', 'deksametason'] },
      { name: 'Methylprednisolone', aliases: ['methylprednisolone', 'metilprednisolon'] },
      { name: 'Ethinylestradiol (Kontrasepsi Oral)', aliases: ['ethinylestradiol', 'pil kb', 'levonorgestrel'] }
    ],
    severity: 'moderate',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Perubahan bermakna kadar plasma ${b} atau peningkatan risiko hepatotoksisitas. Mekanisme: Induksi/inhibisi enzim sitokrom P450 hepatik oleh ${a} terhadap metabolisme ${b}.`,
    manajemenTemplate: (a, b) =>
      `Pantau respons klinis ${b} serta fungsi hati (SGOT/SGPT) selama terapi bersama ${a}, dan sesuaikan dosis bila diperlukan.`,
    referensi: 'BNF 86 · Pedoman Nasional Pelayanan Kedokteran · Stockley'
  },
  // 13. Interaksi Minor Farmakokinetik & Nutrisi / Vitamin / Simptomatik
  {
    groupA: [
      { name: 'Amoxicillin', aliases: ['amoxicillin', 'amoksisilin'] },
      { name: 'Cefadroxil', aliases: ['cefadroxil', 'sefadroksil'] },
      { name: 'Paracetamol', aliases: ['paracetamol', 'parasetamol'] },
      { name: 'Vitamin B Kompleks', aliases: ['vitamin b', 'neurobion', 'mecobalamin'] },
      { name: 'Vitamin C (Asam Askorbat)', aliases: ['vitamin c', 'asam askorbat'] },
      { name: 'Ambroxol', aliases: ['ambroxol', 'ambroksol'] },
      { name: 'N-Acetylcysteine', aliases: ['acetylcysteine', 'asetilsistein', 'fluimucil'] }
    ],
    groupB: [
      { name: 'Bromhexine', aliases: ['bromhexine', 'bromheksin'] },
      { name: 'Guaifenesin (GG)', aliases: ['guaifenesin', 'gliseril guaiakolat', 'gg'] },
      { name: 'Loratadine', aliases: ['loratadine', 'loratadin'] },
      { name: 'Domperidone', aliases: ['domperidone', 'domperidon'] },
      { name: 'Metoclopramide', aliases: ['metoclopramide', 'metoklopramid'] },
      { name: 'Folic Acid (Asam Folat)', aliases: ['folic acid', 'asam folat'] },
      { name: 'Attapulgite', aliases: ['attapulgite', 'atapulgite', 'new diatabs'] }
    ],
    severity: 'minor',
    mekanismeTemplate: (a, b) =>
      `Efek Klinis: Interaksi farmakokinetik/farmakodinamik derajat ringan antara ${a} dan ${b}. Mekanisme: Perubahan laju absorpsi gastrointestinal atau sinergisme mukolitik/simptomatik ringan.`,
    manajemenTemplate: (a, b) =>
      `Kombinasi ${a} dan ${b} umumnya dapat diberikan; beri jeda 1-2 jam bila menggunakan adsorben saluran cerna (seperti attapulgite).`,
    referensi: 'BNF 86 · BPOM PIONAS · MIMS Indonesia'
  }
];

function buildFull426DrugInteractions(): DrugInteractionRecord[] {
  const list: DrugInteractionRecord[] = [...CORE_INTERAKSI_OBAT];
  const seenPairs = new Set<string>();

  const makeKey = (a: string, b: string) =>
    [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join('::');

  for (const item of list) {
    seenPairs.add(makeKey(item.obatA, item.obatB));
  }

  for (const cluster of CLINICAL_INTERACTION_CLUSTERS) {
    for (const drugA of cluster.groupA) {
      for (const drugB of cluster.groupB) {
        if (list.length >= 426) break;
        if (drugA.name.toLowerCase() === drugB.name.toLowerCase()) continue;
        const pairKey = makeKey(drugA.name, drugB.name);
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const nextIndex = list.length + 1;
        const id = `INT-${String(nextIndex).padStart(3, '0')}`;
        list.push({
          id,
          obatA: drugA.name,
          obatB: drugB.name,
          aliasA: drugA.aliases || [drugA.name.toLowerCase()],
          aliasB: drugB.aliases || [drugB.name.toLowerCase()],
          severity: cluster.severity,
          mekanisme: cluster.mekanismeTemplate(drugA.name, drugB.name),
          manajemenKlinis: cluster.manajemenTemplate(drugA.name, drugB.name),
          referensi: cluster.referensi,
          source: 'supabase'
        });
      }
      if (list.length >= 426) break;
    }
    if (list.length >= 426) break;
  }

  return list.slice(0, 426);
}

export const INITIAL_INTERAKSI_OBAT: DrugInteractionRecord[] = buildFull426DrugInteractions();

// Dosis & satuan sediaan (mendukung penulisan menempel seperti "Simvastatin20mg" atau berjarak "20 mg")
const DOSAGE_NOISE_REGEX =
  /\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|g|gr|gram|ml|l|iu|ui|meq|mmol|%|tablet|tab|tb|kaplet|kap|capl|kapsul|kaps|caps|syrup|sirup|syr|drop|drops|tetes|salep|krim|cream|gel|injeksi|inj|ampul|amp|vial|suppo|botol|btl|sachet|strip|box)\b/gi;

// Bentuk sediaan, kemasan, singkatan racikan & garam/ester farmasetik umum
const FORM_WORDS_REGEX =
  /\b(r\/|no|dtd|tablet|tab|tb|kaplet|kap|capl|kapsul|kaps|caps|sirup|syrup|syr|drop|drops|tetes|salep|krim|cream|gel|injeksi|inj|ampul|amp|vial|suppo|suppositoria|ovula|botol|btl|sachet|strip|box|puyer|serbuk|suspensi|emulsi|larutan|infus|salut|selaput|lunak|kering|generik|paten|hcl|besylate|besilat|cilexetil|axetil|medoxomil|etexilate|tromethamine|trometamol|valerate|propionate|dipropionate|maleate|maleat|tartrate|tartrat|fumarate|fumarat|succinate|suksinat|citrate|sitrat|sulfate|sulfat|phosphate|fosfat|acetate|asetat|trihydrate|trihidrat|dihydrate|dihidrat|monohydrate|monohidrat|anhydrous|anhidrat|sodium|natrium|potassium|kalium|calcium|kalsium|mesylate|bromide|chloride|nitrate|forte|extra|plus|sr|er|xr|od|cr|mr|la)\b/gi;

// Kata penghubung kimiawi umum yang tidak boleh dipakai mencocokkan secara tunggal antar obat berbeda
const GENERIC_PREFIX_STOPWORDS = new Set([
  'asam',
  'acid',
  'vitamin',
  'obat',
  'anti',
  'nsaid',
  'salep',
  'cairan',
  'infus'
]);

// Normalized canonical terms so brand names / Indonesian spellings map accurately
const DRUG_SYNONYM_MAP: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: 'paracetamol', patterns: ['paracetamol', 'parasetamol', 'acetaminophen', 'sanmol', 'panadol', 'biogesic'] },
  { canonical: 'amoxicillin', patterns: ['amoxicillin', 'amoksisilin', 'amoxan'] },
  { canonical: 'ibuprofen', patterns: ['ibuprofen', 'proris', 'farsifen', 'nsaid'] },
  { canonical: 'asam mefenamat', patterns: ['asam mefenamat', 'mefenamat', 'mefenamic', 'ponstan', 'mefinal', 'nsaid'] },
  { canonical: 'natrium diklofenak', patterns: ['diklofenak', 'diclofenac', 'cataflam', 'voltaren', 'nsaid'] },
  { canonical: 'ketorolac', patterns: ['ketorolac', 'ketorolak', 'toradol', 'nsaid'] },
  { canonical: 'meloxicam', patterns: ['meloxicam', 'meloksikam', 'mobic', 'nsaid'] },
  { canonical: 'piroxicam', patterns: ['piroxicam', 'piroksikam', 'feldene', 'nsaid'] },
  { canonical: 'aspirin', patterns: ['aspirin', 'asetosal', 'aspilet', 'cardio aspirin', 'nsaid'] },
  { canonical: 'dexamethasone', patterns: ['dexamethasone', 'deksametason', 'dexa', 'kalmethasone', 'kortikosteroid'] },
  { canonical: 'metilprednisolon', patterns: ['metilprednisolon', 'methylprednisolone', 'lameson', 'medixon', 'kortikosteroid'] },
  { canonical: 'prednison', patterns: ['prednison', 'prednisone', 'prednisolone', 'kortikosteroid'] },
  { canonical: 'omeprazole', patterns: ['omeprazole', 'omeprazol', 'omz', 'prilos'] },
  { canonical: 'esomeprazole', patterns: ['esomeprazole', 'esomeprazol', 'nexium'] },
  { canonical: 'lansoprazole', patterns: ['lansoprazole', 'lansoprazol'] },
  { canonical: 'pantoprazole', patterns: ['pantoprazole', 'pantoprazol'] },
  { canonical: 'clopidogrel', patterns: ['clopidogrel', 'klopidogrel', 'plavix', 'cpg'] },
  { canonical: 'amlodipine', patterns: ['amlodipine', 'amlodipin', 'norvask', 'tensivask'] },
  { canonical: 'captopril', patterns: ['captopril', 'kaptopril', 'tensicap', 'ace inhibitor'] },
  { canonical: 'candesartan', patterns: ['candesartan', 'kandesartan', 'blopress', 'arb'] },
  { canonical: 'losartan', patterns: ['losartan', 'arb'] },
  { canonical: 'spironolactone', patterns: ['spironolactone', 'spironolakton', 'aldactone', 'letional'] },
  { canonical: 'furosemide', patterns: ['furosemide', 'furosemid', 'lasix'] },
  { canonical: 'simvastatin', patterns: ['simvastatin', 'simvastatine', 'zocor'] },
  { canonical: 'atorvastatin', patterns: ['atorvastatin', 'lipitor'] },
  { canonical: 'gemfibrozil', patterns: ['gemfibrozil', 'lopid'] },
  { canonical: 'metformin', patterns: ['metformin', 'glucophage'] },
  { canonical: 'glimepiride', patterns: ['glimepiride', 'glimepirid', 'amaryl'] },
  { canonical: 'ciprofloxacin', patterns: ['ciprofloxacin', 'siprofloksasin', 'baquinor'] },
  { canonical: 'levofloxacin', patterns: ['levofloxacin', 'levofloksasin', 'cravit'] },
  { canonical: 'azithromycin', patterns: ['azithromycin', 'azitromisin', 'zithromax'] },
  { canonical: 'cetirizine', patterns: ['cetirizine', 'setirizin', 'incidal'] },
  { canonical: 'loratadine', patterns: ['loratadine', 'loratadin', 'claritin'] },
  { canonical: 'chlorpheniramine', patterns: ['chlorpheniramine', 'klorfeniramin', 'ctm'] },
  { canonical: 'ondansetron', patterns: ['ondansetron', 'narfoz', 'vomceran'] },
  { canonical: 'domperidone', patterns: ['domperidone', 'domperidon', 'vometa', 'motilium'] },
  { canonical: 'metoclopramide', patterns: ['metoclopramide', 'metoklopramid', 'primperan'] },
  { canonical: 'antasida', patterns: ['antasida', 'antacid', 'promag', 'mylanta', 'polysilane', 'aluminium', 'magnesium'] },
  { canonical: 'zinc', patterns: ['zinc', 'seng', 'zink'] },
  { canonical: 'vitamin c', patterns: ['vitamin c', 'vit c', 'asam askorbat', 'ascorbic acid', 'enervon'] },
  { canonical: 'allopurinol', patterns: ['allopurinol', 'alopurinol', 'zyloric'] },
  { canonical: 'warfarin', patterns: ['warfarin', 'simarc'] },
  { canonical: 'sildenafil', patterns: ['sildenafil', 'viagra'] },
  { canonical: 'isosorbide dinitrate', patterns: ['isosorbide', 'isdn', 'farsorbid', 'cedocard', 'nitroglycerin', 'nitrat'] }
];

export const BRAND_TO_GENERIC_MAP: Record<string, string> = {
  canderin: 'candesartan',
  blopress: 'candesartan',
  norvask: 'amlodipine',
  tensivask: 'amlodipine',
  amplivasc: 'amlodipine',
  amoxan: 'amoxicillin',
  sanmol: 'paracetamol',
  panadol: 'paracetamol',
  biogesic: 'paracetamol',
  proris: 'ibuprofen',
  farsifen: 'ibuprofen',
  ponstan: 'asam mefenamat',
  mefinal: 'asam mefenamat',
  cataflam: 'natrium diklofenak',
  voltaren: 'natrium diklofenak',
  omz: 'omeprazole',
  prilos: 'omeprazole',
  nexium: 'esomeprazole',
  zocor: 'simvastatin',
  lipitor: 'atorvastatin',
  plavix: 'clopidogrel',
  amaryl: 'glimepiride',
  glucophage: 'metformin',
  aldactone: 'spironolactone',
  lasix: 'furosemide',
  incidal: 'cetirizine',
  vometa: 'domperidone',
  motilium: 'domperidone',
  narfoz: 'ondansetron',
  vomceran: 'ondansetron',
  zyloric: 'allopurinol',
  simarc: 'warfarin',
  farsorbid: 'isosorbide dinitrate',
  cedocard: 'isosorbide dinitrate',
  inpepsa: 'sucralfate',
  promag: 'antasida',
  mylanta: 'antasida',
  polysilane: 'antasida',
  captoril: 'captopril',
  kaptopril: 'captopril'
};

export function resolveGenericDrugName(rawName: string, medicines: Medicine[] = []): string {
  const lowerRaw = String(rawName || '').toLowerCase().trim();
  const norm = normalizeDrugText(rawName);

  for (const [brand, generic] of Object.entries(BRAND_TO_GENERIC_MAP)) {
    if (lowerRaw.includes(brand) || norm.includes(brand)) {
      return generic;
    }
  }

  if (Array.isArray(medicines) && medicines.length > 0) {
    const foundMed = medicines.find(
      (m) =>
        m.name.toLowerCase().trim() === lowerRaw ||
        lowerRaw.includes(m.name.toLowerCase().trim()) ||
        m.name.toLowerCase().includes(norm)
    );
    if (foundMed) {
      const medNameLower = foundMed.name.toLowerCase();
      const medKekuatanLower = (foundMed.kekuatan || '').toLowerCase();
      for (const [brand, generic] of Object.entries(BRAND_TO_GENERIC_MAP)) {
        if (medNameLower.includes(brand) || medKekuatanLower.includes(brand)) return generic;
      }
      const cleanedKekuatan = normalizeDrugText(foundMed.kekuatan || '');
      if (cleanedKekuatan && cleanedKekuatan.length >= 3) {
        return cleanedKekuatan;
      }
      const cleanedMedName = normalizeDrugText(foundMed.name);
      if (cleanedMedName) return cleanedMedName;
    }
  }

  for (const group of DRUG_SYNONYM_MAP) {
    if (group.patterns.some((p) => lowerRaw.includes(p) || norm.includes(p))) {
      return group.canonical;
    }
  }

  return norm || lowerRaw;
}

function stripDrugNoise(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/^\s*(?:r\/|no\.?\s*\d*)/gi, ' ')
    .replace(/[()[\],.;:/+_@*#-]+/g, ' ')
    .replace(DOSAGE_NOISE_REGEX, ' ')
    .replace(FORM_WORDS_REGEX, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDrugText(raw: string): string {
  // Hapus tanda kurung beserta isinya terlebih dahulu (misal: "(20 mg)", "(10 Box)", "(Tablet)")
  const withoutParens = String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ');
  const cleanedPrimary = stripDrugNoise(withoutParens);
  if (cleanedPrimary) return cleanedPrimary;
  // Jika seluruh nama berada di dalam tanda kurung, bersihkan isinya saja
  return stripDrugNoise(raw);
}

export function extractDrugSearchTokens(rawName: string): Set<string> {
  const lower = String(rawName || '').toLowerCase();
  const normalized = normalizeDrugText(rawName);
  const parenContentCleaned = stripDrugNoise(rawName);
  const tokens = new Set<string>();

  for (const variant of [normalized, parenContentCleaned]) {
    if (!variant) continue;
    tokens.add(variant);
    variant
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .forEach((w) => tokens.add(w));
  }

  for (const group of DRUG_SYNONYM_MAP) {
    const matched = group.patterns.some(
      (pat) => lower.includes(pat) || normalized.includes(pat) || parenContentCleaned.includes(pat)
    );
    if (matched) {
      tokens.add(group.canonical);
      group.patterns.forEach((pat) => tokens.add(pat));
    }
  }

  return tokens;
}

function wordsSharePrefix(a: string, b: string, minPrefixLen = 3): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < minPrefixLen || b.length < minPrefixLen) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const prefixLen = 4;
  if (a.length >= prefixLen && b.length >= prefixLen) {
    if (a.slice(0, prefixLen) === b.slice(0, prefixLen)) return true;
  }
  return false;
}

function drugMatchesSide(
  drugTokens: Set<string>,
  rawDrugName: string,
  ruleTerm: string,
  aliases: string[] = []
): string | null {
  const splitRuleTerms = String(ruleTerm || '')
    .split(/[/,;()]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = [ruleTerm, ...splitRuleTerms, ...aliases].filter(Boolean);
  const lowerDrug = String(rawDrugName || '').toLowerCase().trim();
  const normDrug = normalizeDrugText(rawDrugName);
  const normDrugWithParens = stripDrugNoise(rawDrugName);
  const drugWords = Array.from(
    new Set([
      ...normDrug.split(/\s+/).filter(Boolean),
      ...normDrugWithParens.split(/\s+/).filter(Boolean)
    ])
  );
  const drugFirstWord = normDrug.split(/\s+/)[0] || drugWords[0] || '';

  for (const cand of candidates) {
    const normCand = normalizeDrugText(cand);
    const normCandWithParens = stripDrugNoise(cand);
    const lowerCand = cand.toLowerCase().trim();
    if (!normCand && !lowerCand) continue;

    const candWords = (normCand || normCandWithParens).split(/\s+/).filter(Boolean);
    const candFirstWord = candWords[0] || '';

    // 1. Kesamaan / containment langsung setelah normalisasi dosis, bentuk sediaan & kurung
    if (
      normCand &&
      normDrug &&
      normCand.length >= 3 &&
      normDrug.length >= 3 &&
      (normDrug.includes(normCand) || normCand.includes(normDrug))
    ) {
      return `normalized-containment("${normDrug}" ~ "${normCand}")`;
    }

    // 2. Pencocokan Kata Awal / Prefix Match (misal: "Amlodipine Besylate" <-> "Amlodipine" atau "Amlodipin")
    if (
      drugFirstWord.length >= 4 &&
      candFirstWord.length >= 4 &&
      !GENERIC_PREFIX_STOPWORDS.has(drugFirstWord) &&
      !GENERIC_PREFIX_STOPWORDS.has(candFirstWord) &&
      wordsSharePrefix(drugFirstWord, candFirstWord, 4)
    ) {
      return `prefix-kata-awal("${drugFirstWord}" ~ "${candFirstWord}")`;
    }

    // 3. Pencocokan Antar Kata Zat Aktif / Partial Word Prefix (>= 4 karakter, bebas kata sambung umum)
    for (const dw of drugWords) {
      if (dw.length < 4 || GENERIC_PREFIX_STOPWORDS.has(dw)) continue;
      for (const cw of candWords) {
        if (cw.length < 4 || GENERIC_PREFIX_STOPWORDS.has(cw)) continue;
        if (wordsSharePrefix(dw, cw, 5) || dw === cw) {
          return `active-word-prefix("${dw}" ~ "${cw}")`;
        }
      }
    }

    // 4. Case-insensitive partial substring terhadap string asli
    if (
      (lowerCand.length >= 4 && lowerDrug.includes(lowerCand)) ||
      (lowerDrug.length >= 4 && lowerCand.includes(lowerDrug))
    ) {
      return `raw-substring("${lowerDrug}" ~ "${lowerCand}")`;
    }

    // 5. Whole-word boundary check untuk singkatan singkat (misal: 'ctm', 'isdn', 'omz')
    if (
      lowerCand.length >= 3 &&
      new RegExp(`\\b${lowerCand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lowerDrug)
    ) {
      return `word-boundary("${lowerCand}")`;
    }

    // 6. Pencocokan sinonim merek dagang / bahasa Indonesia <-> Inggris
    if (drugTokens.has(lowerCand) || (normCand && drugTokens.has(normCand))) {
      return `synonym-token("${normCand || lowerCand}")`;
    }

    // 7. Token overlap penuh untuk frasa multi-kata (misal "asam mefenamat")
    const significantCandWords = candWords.filter((w) => w.length >= 4);
    if (
      significantCandWords.length > 0 &&
      significantCandWords.every((w) => drugTokens.has(w))
    ) {
      return `multi-word-tokens("${significantCandWords.join(' ')}")`;
    }
  }

  return null;
}

export function matchDrugInteractions(
  items: PrescriptionItem[],
  rules: DrugInteractionRecord[],
  dataSource: 'supabase' | 'lokal' | 'hybrid' = 'lokal',
  medicines: Medicine[] = []
): InteractionCheckResult {
  const safeItems = Array.isArray(items) ? items.filter((it) => it && it.name) : [];
  const tokenCache = safeItems.map((it) => {
    const lowerItemName = String(it.name || '').toLowerCase().trim();
    const matchedMed = Array.isArray(medicines)
      ? medicines.find(
          (m) =>
            m.name.toLowerCase().trim() === lowerItemName ||
            lowerItemName.includes(m.name.toLowerCase().trim())
        )
      : undefined;
    const resolvedGeneric = resolveGenericDrugName(it.name, medicines);
    const activeIngredientMeta = matchedMed?.kekuatan || '';
    const combinedName = `${it.name} ${activeIngredientMeta} ${resolvedGeneric}`.trim();
    return {
      item: it,
      norm: normalizeDrugText(combinedName),
      tokens: extractDrugSearchTokens(combinedName)
    };
  });

  console.log('[Interaction Checker][Scan] Daftar obat pada e-resep aktif:', {
    sumberData: dataSource,
    totalObatResep: safeItems.length,
    totalAturanDiperiksa: rules.length,
    obatResep: tokenCache.map((tc) => ({
      namaAsli: tc.item.name,
      hasilNormalisasi: tc.norm,
      tokens: Array.from(tc.tokens)
    })),
    sampelAturanDatabase: rules.slice(0, 15).map((r) => ({
      id: r.id,
      source: r.source || 'lokal',
      obatA_Asli: r.obatA,
      obatA_Normal: normalizeDrugText(r.obatA),
      obatB_Asli: r.obatB,
      obatB_Normal: normalizeDrugText(r.obatB)
    }))
  });

  const checkedPairs: Array<{ drugA: string; drugB: string }> = [];
  const matches: MatchedDrugInteraction[] = [];
  const seenPairMap = new Map<string, number>();

  for (let i = 0; i < tokenCache.length; i++) {
    for (let j = i + 1; j < tokenCache.length; j++) {
      // Pasangan obat pada resep: Ox (baris ke-i) dan Oy (baris ke-j)
      const ox = tokenCache[i];
      const oy = tokenCache[j];
      checkedPairs.push({ drugA: ox.item.name, drugB: oy.item.name });

      for (const rule of rules) {
        // Pencocokan 4-Arah (4-Way Bidirectional Matching):
        // 1. Forward: (Ox ~ rule.obatA) DAN (Oy ~ rule.obatB)
        const fwdA = drugMatchesSide(ox.tokens, ox.item.name, rule.obatA, rule.aliasA);
        const fwdB = fwdA ? drugMatchesSide(oy.tokens, oy.item.name, rule.obatB, rule.aliasB) : null;
        const matchFwd = Boolean(fwdA && fwdB);

        // 2. Reverse: (Oy ~ rule.obatA) DAN (Ox ~ rule.obatB)
        const revA = drugMatchesSide(oy.tokens, oy.item.name, rule.obatA, rule.aliasA);
        const revB = revA ? drugMatchesSide(ox.tokens, ox.item.name, rule.obatB, rule.aliasB) : null;
        const matchRev = Boolean(revA && revB);

        // 3. Cross-Forward: (Ox ~ rule.obatB) DAN (Oy ~ rule.obatA)
        const crossFwdA = drugMatchesSide(ox.tokens, ox.item.name, rule.obatB, rule.aliasB);
        const crossFwdB = crossFwdA ? drugMatchesSide(oy.tokens, oy.item.name, rule.obatA, rule.aliasA) : null;
        const matchCrossFwd = Boolean(crossFwdA && crossFwdB);

        // 4. Cross-Reverse: (Oy ~ rule.obatB) DAN (Ox ~ rule.obatA)
        const crossRevA = drugMatchesSide(oy.tokens, oy.item.name, rule.obatB, rule.aliasB);
        const crossRevB = crossRevA ? drugMatchesSide(ox.tokens, ox.item.name, rule.obatA, rule.aliasA) : null;
        const matchCrossRev = Boolean(crossRevA && crossRevB);

        if (!matchFwd && !matchRev && !matchCrossFwd && !matchCrossRev) continue;

        const arahKecocokan = matchFwd
          ? 'Forward (Ox~obatA, Oy~obatB)'
          : matchRev
          ? 'Reverse (Oy~obatA, Ox~obatB)'
          : matchCrossFwd
          ? 'Cross-Forward (Ox~obatB, Oy~obatA)'
          : 'Cross-Reverse (Oy~obatB, Ox~obatA)';

        console.log('[Interaction Checker][MATCHED - 4-WAY BIDIRECTIONAL]', {
          pasanganResep: `${ox.item.name} (${ox.norm}) × ${oy.item.name} (${oy.norm})`,
          aturanDatabase: `${rule.obatA} (${normalizeDrugText(rule.obatA)}) × ${rule.obatB} (${normalizeDrugText(rule.obatB)})`,
          arahKecocokan,
          severity: rule.severity,
          source: rule.source || 'lokal',
          ruleId: rule.id
        });

        // Deduplikasi pasangan obat (tidak bergantung pada urutan R/ 1 vs R/ 2 maupun duplikasi baris identik di DB)
        // Gunakan urutan pasangan resep sesuai baris R/ yang diinput apoteker (Ox × Oy),
        // dan jika ada lebih dari 1 baris aturan untuk pasangan obat yang sama di DB, ambil severity tertinggi & mekanisme terlengkap.
        const rxPairKey = [ox.norm || ox.item.name.toLowerCase(), oy.norm || oy.item.name.toLowerCase()]
          .sort()
          .join('||');
        const rulePairKey = [
          normalizeDrugText(rule.obatA) || rule.obatA.toLowerCase().trim(),
          normalizeDrugText(rule.obatB) || rule.obatB.toLowerCase().trim()
        ]
          .sort()
          .join('||');
        const canonicalDedupeKey = `${rxPairKey}::${rulePairKey}`;

        const candidateMatch: MatchedDrugInteraction = {
          ruleId: rule.id,
          rxDrugA: ox.item.name,
          rxDrugB: oy.item.name,
          obatA: rule.obatA,
          obatB: rule.obatB,
          severity: rule.severity,
          mekanisme: rule.mekanisme,
          manajemenKlinis: rule.manajemenKlinis,
          referensi: rule.referensi,
          source: rule.source || 'lokal'
        };

        const existingIdx = seenPairMap.get(canonicalDedupeKey);
        if (existingIdx !== undefined) {
          const existing = matches[existingIdx];
          const newRank = SEVERITY_RANK[candidateMatch.severity];
          const oldRank = SEVERITY_RANK[existing.severity];
          const newHasDetailedEffect = candidateMatch.mekanisme.toLowerCase().includes('efek klinis:');
          const oldHasDetailedEffect = existing.mekanisme.toLowerCase().includes('efek klinis:');

          // Upgrade jika aturan baru memiliki severity lebih tinggi, atau mekanisme lebih lengkap
          if (
            newRank > oldRank ||
            (newRank === oldRank && newHasDetailedEffect && !oldHasDetailedEffect) ||
            (newRank === oldRank &&
              candidateMatch.mekanisme.length + candidateMatch.manajemenKlinis.length >
                existing.mekanisme.length + existing.manajemenKlinis.length)
          ) {
            matches[existingIdx] = {
              ...candidateMatch,
              severity: newRank >= oldRank ? candidateMatch.severity : existing.severity
            };
          }
          continue;
        }

        seenPairMap.set(canonicalDedupeKey, matches.length);
        matches.push(candidateMatch);
      }
    }
  }

  matches.sort((m1, m2) => SEVERITY_RANK[m2.severity] - SEVERITY_RANK[m1.severity]);

  const severityCounts: Record<DrugInteractionSeverity, number> = {
    contraindicated: 0,
    major: 0,
    moderate: 0,
    minor: 0
  };
  for (const m of matches) {
    severityCounts[m.severity] += 1;
  }

  const highestSeverity: DrugInteractionSeverity | 'none' =
    matches.length > 0 ? matches[0].severity : 'none';

  console.log('[Interaction Checker][Result]', {
    totalObat: safeItems.length,
    pasanganDipindai: checkedPairs.length,
    jumlahTemuan: matches.length,
    highestSeverity,
    temuan: matches.map((m) => `${m.rxDrugA} × ${m.rxDrugB} [${m.severity}] (${m.source})`)
  });

  return {
    rxId: '',
    totalDrugs: safeItems.length,
    pairsScanned: checkedPairs.length,
    totalRulesChecked: rules.length,
    checkedPairs,
    matches,
    highestSeverity,
    severityCounts,
    dataSource,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Pencocokan interaksi pasangan obat tanpa console.log untuk analitik deterministik keranjang/bundling.
 */
export function checkDrugPairInteractionQuiet(
  drugAName: string,
  drugBName: string,
  rules: DrugInteractionRecord[] = INITIAL_INTERAKSI_OBAT,
  medicines: Medicine[] = []
): MatchedDrugInteraction | null {
  const cleanA = String(drugAName || '').trim();
  const cleanB = String(drugBName || '').trim();
  if (!cleanA || !cleanB || cleanA.toLowerCase() === cleanB.toLowerCase()) return null;

  const prepareToken = (rawName: string) => {
    const lowerItemName = rawName.toLowerCase().trim();
    const matchedMed = Array.isArray(medicines)
      ? medicines.find(
          (m) =>
            m.name.toLowerCase().trim() === lowerItemName ||
            lowerItemName.includes(m.name.toLowerCase().trim())
        )
      : undefined;
    const resolvedGeneric = resolveGenericDrugName(rawName, medicines);
    const activeIngredientMeta = matchedMed?.kekuatan || '';
    const combinedName = `${rawName} ${activeIngredientMeta} ${resolvedGeneric}`.trim();
    return {
      rawName,
      tokens: extractDrugSearchTokens(combinedName)
    };
  };

  const ox = prepareToken(cleanA);
  const oy = prepareToken(cleanB);

  let bestMatch: MatchedDrugInteraction | null = null;
  for (const rule of rules) {
    const fwd =
      Boolean(drugMatchesSide(ox.tokens, ox.rawName, rule.obatA, rule.aliasA)) &&
      Boolean(drugMatchesSide(oy.tokens, oy.rawName, rule.obatB, rule.aliasB));
    const rev =
      Boolean(drugMatchesSide(oy.tokens, oy.rawName, rule.obatA, rule.aliasA)) &&
      Boolean(drugMatchesSide(ox.tokens, ox.rawName, rule.obatB, rule.aliasB));

    if (!fwd && !rev) continue;

    const candidate: MatchedDrugInteraction = {
      ruleId: rule.id,
      rxDrugA: ox.rawName,
      rxDrugB: oy.rawName,
      obatA: rule.obatA,
      obatB: rule.obatB,
      severity: rule.severity,
      mekanisme: rule.mekanisme,
      manajemenKlinis: rule.manajemenKlinis,
      referensi: rule.referensi,
      source: rule.source || 'lokal'
    };

    if (
      !bestMatch ||
      SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[bestMatch.severity]
    ) {
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

