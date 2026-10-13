import { RedFlagAlert } from '../../types';

interface RedFlagRule {
  category: string;
  keywords: string[];
  action: string;
}

const RED_FLAG_RULES: RedFlagRule[] = [
  {
    category: 'Acute Coronary Syndrome / Heart Attack',
    keywords: [
      'chest pain',
      'chest pressure',
      'crushing chest',
      'tightness in chest',
      'pain radiating to left arm',
      'pain in jaw and chest',
      'angina',
      'छाती में दर्द',
    ],
    action:
      'Possible acute cardiac emergency. Call 911 / 112 / your local emergency number immediately. Sit quietly and avoid physical exertion.',
  },
  {
    category: 'Severe Respiratory Compromise',
    keywords: [
      'trouble breathing',
      'severe shortness of breath',
      'gasping for air',
      'blue lips',
      'cyanosis',
      'choking',
      'can barely breathe',
      'सांस लेने में तकलीफ',
    ],
    action:
      'Severe respiratory compromise detected. Call emergency medical services immediately. Keep patient sitting upright with open airway.',
  },
  {
    category: 'Cerebrovascular Accident (Stroke / FAST)',
    keywords: [
      'facial drooping',
      'face drooping',
      'arm weakness',
      'slurred speech',
      'sudden numbness one side',
      'sudden loss of balance',
      'stroke',
      'लकवा',
    ],
    action:
      'Suspected stroke emergency. FAST protocol: Face drooping, Arm weakness, Speech difficulty = Time to call emergency services immediately.',
  },
  {
    category: 'Severe Hemorrhage / Active Bleeding',
    keywords: [
      'coughing up blood',
      'vomiting blood',
      'severe bleeding',
      'heavy blood loss',
      'uncontrolled bleeding',
      'खून की उल्टी',
    ],
    action:
      'Severe hemorrhage requires immediate emergency hospital evaluation. Apply firm direct pressure to external wounds if present.',
  },
  {
    category: 'Suspected Meningitis / Severe Neurological Infection',
    keywords: [
      'stiff neck and high fever',
      'stiff neck fever confusion',
      'thunderclap headache',
      'worst headache of my life',
      'photophobia fever rash',
    ],
    action:
      'Possible acute neurological or central nervous system emergency. Seek immediate emergency room evaluation.',
  },
  {
    category: 'Severe Anaphylaxis',
    keywords: [
      'throat swelling',
      'tongue swelling',
      'swollen airway',
      'hives and breathing',
      'anaphylaxis',
      'allergic shock',
    ],
    action:
      'Potential anaphylactic allergic emergency. Administer epinephrine autoinjector (EpiPen) if prescribed and call emergency services immediately.',
  },
  {
    category: 'Psychiatric / Self-Harm Crisis',
    keywords: [
      'suicidal',
      'want to die',
      'kill myself',
      'end my life',
      'self harm',
      'आत्महत्या',
    ],
    action:
      'Crisis Support: Please reach out immediately to the Suicide & Crisis Lifeline by dialing 988 (USA), 112 (EU/India), or your national mental health helpline. You are not alone and immediate support is available.',
  },
  {
    category: 'Acute Spreading Cellulitis / Severe Skin Infection',
    keywords: [
      'spreading redness with fever',
      'redness spreading rapidly',
      'hot red swollen skin and fever',
      'skin feels hot and fever',
      'red streak on skin',
      'सेल्युलाइटिस',
    ],
    action:
      'Suspected spreading bacterial soft-tissue infection (cellulitis/erysipelas). Seek urgent medical care or emergency evaluation for prompt antibiotic assessment.',
  },
  {
    category: 'Severe Cutaneous Adverse Reaction / Widespread Blistering (SJS/TEN)',
    keywords: [
      'widespread blistering',
      'skin peeling off',
      'skin sloughing',
      'mouth sores and skin peeling',
      'blisters and fever',
    ],
    action:
      'Severe dermatological emergency. Widespread blistering or epidermal detachment requires immediate hospital emergency room evaluation.',
  },
];

/**
 * Scans text and symptom selections for critical medical emergency red flags.
 */
export function detectRedFlags(input: string): RedFlagAlert {
  if (!input) {
    return {
      triggered: false,
      emergencyType: '',
      matchedKeywords: [],
      immediateAction: '',
    };
  }

  const normalized = input.toLowerCase();
  const matchedKeywords: string[] = [];
  let triggeredRule: RedFlagRule | null = null;

  for (const rule of RED_FLAG_RULES) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
        if (!triggeredRule) {
          triggeredRule = rule;
        }
      }
    }
  }

  if (triggeredRule && matchedKeywords.length > 0) {
    return {
      triggered: true,
      emergencyType: triggeredRule.category,
      matchedKeywords: Array.from(new Set(matchedKeywords)),
      immediateAction: triggeredRule.action,
    };
  }

  return {
    triggered: false,
    emergencyType: '',
    matchedKeywords: [],
    immediateAction: '',
  };
}
