export interface SampleDocDefinition {
  id: string;
  name: string;
  trustedSource: string;
  content: string;
}

export const SAMPLE_DOCUMENTS: SampleDocDefinition[] = [
  {
    id: 'sample-doc-common-cold',
    name: 'SAMPLE - Common Cold (Viral Upper Respiratory Infection)',
    trustedSource: 'CDC / MedlinePlus (Sample)',
    content: `COMMON COLD: OVERVIEW AND CLINICAL PRESENTATION
The common cold is a viral infectious disease of the upper respiratory tract primarily affecting the mucosal lining of the nose, throat, sinuses, and larynx. Over 200 virus strains are implicated in causing the common cold, with rhinoviruses accounting for approximately 30% to 50% of all cases, followed by coronaviruses, adenoviruses, and enteroviruses.

SYMPTOM PROGRESSION AND DURATION
Symptoms typically appear 1 to 3 days after viral exposure and commonly peak around day 2 to 4. Typical manifestations include:
- Nasal congestion, rhinorrhea (clear, watery, or thick mucus), and frequent sneezing.
- Scratchy or sore throat, especially in the early 24 to 48 hours.
- Mild, low-grade fever (more common in young children; rare or mild in adults).
- Mild fatigue, light headache, and non-productive dry cough that may transition into a mild loose cough.
Symptoms generally resolve on their own within 7 to 10 days, though a residual post-viral cough may persist for up to two weeks.

SUPPORTIVE CARE AND GENERAL PRECAUTIONS
Because the common cold is caused by viral agents, antibacterial antibiotics have zero therapeutic efficacy and must not be used.
- Fluid Hydration: Ample oral fluids including warm broths, herbal teas, and water assist in thinning respiratory secretions and maintaining mucous membrane integrity.
- Rest: Adequate sleep supports immunological response.
- Symptom Relief: Saline nasal sprays or rinses help relieve nasal congestion. Honey (for individuals older than 1 year) can soothe throat irritation and cough. Over-the-counter fever reducers such as acetaminophen or ibuprofen may relieve discomfort when indicated.
- Hygiene: Frequent handwashing with soap and water and covering coughs reduce viral transmission to household members.

RED FLAGS AND WHEN TO SEE A DOCTOR URGENTLY
Consult a healthcare provider immediately if experiencing:
- Persistent high fever above 38.5°C (101.3°F) lasting longer than 3 consecutive days.
- Shortness of breath, chest pressure, or wheezing.
- Inability to retain fluids leading to severe dehydration (scant dark urine, severe dizziness).
- Symptoms that initially improve but then suddenly worsen with severe productive cough and facial sinus pressure (suspected secondary bacterial infection).`,
  },
  {
    id: 'sample-doc-influenza',
    name: 'SAMPLE - Influenza (Seasonal Flu Guidelines)',
    trustedSource: 'WHO / CDC (Sample)',
    content: `INFLUENZA: CLINICAL CHARACTERISTICS AND EPIDEMIOLOGY
Influenza (the flu) is a contagious viral respiratory infection caused by influenza viruses A and B that circulate globally. Unlike the gradual onset of the common cold, influenza is characterized by a sudden, abrupt onset of systemic and respiratory symptoms, often striking within hours.

CLASSIC SYMPTOM PROFILE
Patients frequently report feeling "hit by a truck" with prominent systemic symptoms:
- High fever (often 38.5°C to 40°C / 101°F to 104°F) accompanied by rigorous shaking chills and profuse sweating.
- Severe generalized muscle and body aches (myalgia), particularly affecting the back, legs, and neck.
- Profound, debilitating physical fatigue and generalized malaise that can incapacitate the patient for days.
- Intense frontal or retro-orbital headache.
- Respiratory signs: Severe dry cough, sore throat, and nasal congestion may follow the initial fever.
Systemic acute symptoms typically last 4 to 7 days, though profound weakness and cough may linger for 2 to 3 weeks.

CLINICAL MANAGEMENT AND GENERAL PRECAUTIONS
- Early Clinical Assessment: Antiviral prescription medications (such as neuraminidase inhibitors) may shorten illness duration and reduce complication risks if initiated within 48 hours of symptom onset in high-risk groups.
- Strict Home Isolation: Stay home from work or school until fever-free for at least 24 hours without fever-reducing medications.
- Fluid Balance & Electrolytes: High fever increases insensible fluid losses; regular sips of electrolyte-rich liquids are recommended.
- Humidification: Cool-mist humidifiers ease respiratory irritation.

EMERGENCY RED FLAGS AND COMPLICATIONS
Influenza can lead to severe secondary bacterial pneumonia, myocarditis, and sepsis. Seek immediate emergency medical care if you observe:
- Difficulty breathing, shortness of breath, or rapid shallow respirations.
- Persistent pain, tightness, or pressure in the chest or abdomen.
- Sudden dizziness, confusion, or severe lethargy that impairs waking up.
- Cyanosis (bluish tint around lips, nails, or skin).
- Severe muscular weakness or inability to stand.
- Fever or cough that improves but returns worse with high fever and thick colored sputum.`,
  },
  {
    id: 'sample-doc-dengue',
    name: 'SAMPLE - Dengue Fever (Clinical Identification & Warning Signs)',
    trustedSource: 'WHO Guidelines (Sample)',
    content: `DENGUE VIRUS INFECTION: PATHOLOGY AND TRANSMISSION
Dengue is a mosquito-borne viral infection caused by four distinct dengue virus serotypes (DENV-1, DENV-2, DENV-3, DENV-4) transmitted primarily by female Aedes aegypti mosquitoes in tropical and subtropical regions. Recovery provides lifelong immunity against that specific serotype, but subsequent infection with a different serotype markedly increases the risk of severe dengue.

FEBRILE PHASE AND COMMON CLINICAL MANIFESTATIONS
Following an incubation period of 4 to 10 days, patients enter the febrile phase lasting 2 to 7 days, characterized by:
- Sudden high-grade fever (up to 40°C / 104°F).
- Severe headache with classic retro-orbital pain (excruciating pain behind the eyes).
- Severe muscle aches (myalgia), arthralgia (joint pain), and bone pain, historically giving dengue the name "breakbone fever".
- Maculopapular skin rash, often appearing 2 to 5 days after fever onset.
- Mild hemorrhagic signs such as petechiae (tiny red spots under the skin), minor nosebleeds (epistaxis), or gum bleeding.
- Nausea, vomiting, and loss of appetite.

CRITICAL PHASE AND URGENT WARNING SIGNS
Around days 3 to 7 of illness, as the fever subsides (defervescence), patients may enter the Critical Phase where plasma leakage can occur.
THE DENGUE WARNING SIGNS REQUIRE IMMEDIATE EMERGENCY HOSPITALIZATION:
- Severe, persistent abdominal pain or tenderness.
- Persistent vomiting (at least 3 episodes within 24 hours) or inability to drink fluids.
- Active mucosal bleeding (significant nosebleeds, bleeding gums, blood in vomit or dark tarry stools).
- Extreme lethargy, restlessness, or confusion.
- Clinical fluid accumulation (pleural effusion or ascites).
- Rapid breathing and cold, clammy extremities (signs of incipient dengue shock).
- Laboratory warning: Rapid drop in platelet count accompanied by a rising hematocrit.

GENERAL PRECAUTIONS AND MEDICATION RESTRICTIONS
- Acetaminophen / Paracetamol is the preferred agent for fever and pain management.
- ABSOLUTE CONTRAINDICATION: Avoid Aspirin, Ibuprofen, Naproxen, and other Non-Steroidal Anti-Inflammatory Drugs (NSAIDs), as they inhibit platelet aggregation and dramatically exacerbate internal hemorrhage risks.
- Continuous oral rehydration therapy with Oral Rehydration Salts (ORS), fresh coconut water, or fruit juices to counteract capillary leakage.
- Daily monitoring of complete blood counts (CBC) including hematocrit and platelet levels by a medical clinic.`,
  },
  {
    id: 'sample-doc-dermatology',
    name: 'SAMPLE - Dermatological Conditions (Eczema, Psoriasis, Tinea & Contact Dermatitis)',
    trustedSource: 'AAD / British Association of Dermatologists (Sample)',
    content: `COMMON DERMATOLOGICAL CONDITIONS: CLINICAL IDENTIFICATION & MORPHOLOGY
Skin conditions present with distinct morphological patterns, distributions, and symptom profiles. Accurate visual assessment considers lesion color, borders, scaling, distribution, and secondary changes.

1. ATOPIC DERMATITIS (ECZEMA)
- Morphology: Poorly demarcated erythematous (red) patches and plaques with dry skin (xerosis), fine scaling, excoriations (scratch marks), and in chronic stages, lichenification (thickened, leathery skin). May present with tiny vesicles and weeping in acute flares.
- Distribution: Predominantly flexural surfaces (antecubital and popliteal fossae, wrists, neck) in adults and children; cheeks and extensor surfaces in infants.
- Classic Symptom: Intense, unremitting pruritus (itching), often worsening at night.

2. PSORIASIS (PLAQUE PSORIASIS)
- Morphology: Sharply demarcated erythematous salmon-pink plaques covered with coarse, layered, silvery-white micaceous scales. Gentle removal of scales reveals pinpoint bleeding spots (Auspitz sign).
- Distribution: Symmetrical extensor surfaces (elbows, knees), scalp, lumbosacral region, umbilicus, and nails (pitting, oil-drop sign).
- Nature: Chronic autoimmune inflammatory condition driven by accelerated epidermal keratinocyte turnover.

3. CONTACT DERMATITIS (ALLERGIC VS IRRITANT)
- Morphology: Sharply defined localized erythema, edema, papules, and grouped vesicles corresponding to the exact shape of contact with an offending substance (e.g., jewelry nickel, poison ivy, harsh solvents, fragrances).
- Sensations: Burning, stinging, or intense itching localized to the contact zone.

4. FUNGAL TINEA INFECTIONS (RINGWORM / TINEA CORPORIS / TINEA CRURIS)
- Morphology: Characteristic annular (ring-shaped) erythematous patches or plaques with an active, elevated, scaly or vesicular advancing outer border and central clearing.
- Transmission: Microscopic dermatophyte fungi; exacerbated by warmth, moisture, and tight clothing.

GENERAL SKIN PRECAUTIONS AND HOME CARE
- Gentle Cleansing: Wash with lukewarm (never hot) water and mild, soap-free synthetic detergent cleansers. Avoid harsh scrubbing or loofahs.
- Barrier Restoration: Apply thick, fragrance-free emollient creams or ointments (e.g., petrolatum, ceramide-based creams) immediately within 3 minutes of bathing to seal in hydration.
- Anti-Scratch Measures: Keep fingernails short and clean; apply cool, damp compresses to soothe acute itch flares without traumatizing the epidermal barrier.
- Avoid Self-Prescription of Potent Topical Steroids: Indiscriminate use of high-potency fluorinated steroids on the face, groin, or undiagnosed fungal rashes can cause skin atrophy, telangiectasias, or Tinea Incognito.

CRITICAL DERMATOLOGY RED FLAGS: WHEN TO SEEK URGENT EMERGENCY CARE
Immediately visit an emergency department or urgent care clinic if you observe:
- Rapidly spreading intense erythema with marked localized heat, severe pain, swelling, and systemic fever (suspected spreading bacterial cellulitis, erysipelas, or necrotizing fasciitis).
- Extensive skin detachment, widespread flaccid blistering, or epidermal sloughing resembling burns (suspected Stevens-Johnson Syndrome [SJS], Toxic Epidermal Necrolysis [TEN], or Staphylococcal Scalded Skin Syndrome).
- Targetoid ("bullseye") lesions with oral, genital, or conjunctival mucous membrane erosions or difficulty swallowing.
- Sudden generalized urticarial hives accompanied by lip/tongue swelling, hoarseness, or respiratory distress (anaphylaxis).
- Suspected Melanoma Warning (ABCDE Criteria): Any pigmented mole showing Asymmetry, Border irregularity, Color variation (shades of brown, black, red, white), Diameter >6mm, or rapid Evolution/bleeding requires prompt in-person dermatological dermoscopy and biopsy.`,
  },
];
