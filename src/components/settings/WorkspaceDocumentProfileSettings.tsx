import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Workspace,
  UserProfile,
  WorkspaceDocumentProfile,
  DocumentProfileBankAccount,
  QuotationPreset,
  QuotationTaxMode,
  QuotationSignatoryMode,
  QuotationLineItem,
  Quotation,
  Enquiry,
  QuotationHeaderConfig,
  Attachment
} from '../../types';
import { QuotationRepository, DEFAULT_QUOTATION_BLOCKS } from '../../services/repositories/QuotationRepository';
import { deleteFromStorageBucket } from '../../services/attachmentStorage';
import { QuotationDocument } from '../quotations/QuotationDocument';
import { QuotationStudioModal } from '../quotations/QuotationStudioModal';
import {
  Building,
  Landmark,
  Sliders,
  Plus,
  Trash2,
  Save,
  Palette,
  Edit2,
  X,
  Upload,
  Star,
  Sparkles,
  FlaskConical,
  Shuffle,
  RotateCcw,
  Scissors,
  Eye,
  Maximize2,
  Layers,
  PenTool,
  LayoutTemplate,
  Image as ImageIcon,
  Check
} from 'lucide-react';

export interface WorkspaceDocumentProfileSettingsProps {
  activeWorkspace?: Workspace | null;
  user: UserProfile;
  isAdmin: boolean;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type ThemeAccentKey = 'navy' | 'emerald' | 'slate' | 'amber' | 'crimson' | 'teal' | 'blue';

const THEME_ACCENT_SWATCHES: Array<{
  key: ThemeAccentKey;
  label: string;
  hex: string;
  bgClass: string;
}> = [
  { key: 'navy', label: 'Executive Navy', hex: '#0f172a', bgClass: 'bg-slate-900' },
  { key: 'blue', label: 'Royal Blue', hex: '#2563eb', bgClass: 'bg-blue-600' },
  { key: 'emerald', label: 'Emerald Corp', hex: '#059669', bgClass: 'bg-emerald-600' },
  { key: 'teal', label: 'Industrial Teal', hex: '#0d9488', bgClass: 'bg-teal-600' },
  { key: 'slate', label: 'Graphite Slate', hex: '#334155', bgClass: 'bg-slate-700' },
  { key: 'amber', label: 'Gold / Amber', hex: '#d97706', bgClass: 'bg-amber-600' },
  { key: 'crimson', label: 'Crimson Red', hex: '#dc2626', bgClass: 'bg-red-600' }
];

type SandboxScenarioKey = 'standard_2' | 'tender_8' | 'turnkey_annex';

const SAMPLE_ANNEX_SVG_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <rect width="800" height="1000" fill="#f8fafc"/>
  <rect x="40" y="40" width="720" height="920" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="40" y="40" width="720" height="110" rx="16" fill="#0f172a"/>
  <text x="80" y="92" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="bold">TECHNICAL SUBMITTAL DATASHEET</text>
  <text x="80" y="124" fill="#94a3b8" font-family="Arial, sans-serif" font-size="14">Containerized Brackish Water Reverse Osmosis Plant — BWRO-250-SKID</text>
  <rect x="80" y="190" width="640" height="240" rx="12" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="400" y="295" text-anchor="middle" fill="#0f172a" font-family="Arial, sans-serif" font-size="22" font-weight="bold">P&amp;ID / SKID ELEVATION DIAGRAM</text>
  <text x="400" y="330" text-anchor="middle" fill="#475569" font-family="Arial, sans-serif" font-size="14">250 m³/day Permeate Capacity • Duplex 2205 High-Pressure Piping • CIP Skid Included</text>
  <text x="80" y="485" fill="#0f172a" font-family="Arial, sans-serif" font-size="18" font-weight="bold">KEY OPERATING PARAMETERS</text>
  <line x1="80" y1="500" x2="720" y2="500" stroke="#cbd5e1" stroke-width="2"/>
  <text x="80" y="540" fill="#334155" font-family="Arial, sans-serif" font-size="15">• Design Feed TDS: Up to 8,500 mg/L Brackish Well Water</text>
  <text x="80" y="575" fill="#334155" font-family="Arial, sans-serif" font-size="15">• Permeate Recovery Rate: 75% Continuous Duty (24/7 Industrial Rating)</text>
  <text x="80" y="610" fill="#334155" font-family="Arial, sans-serif" font-size="15">• Membrane Array: 8" High-Rejection Polyamide TFC Elements (USA Origin)</text>
  <text x="80" y="645" fill="#334155" font-family="Arial, sans-serif" font-size="15">• High Pressure Pump: Grundfos Vertical Multistage SS316L + Danfoss VFD</text>
  <text x="80" y="680" fill="#334155" font-family="Arial, sans-serif" font-size="15">• PLC &amp; HMI Automation: Siemens S7-1200 PLC with 10" Color Touch Panel</text>
</svg>`);

function buildScenarioItems(scenario: SandboxScenarioKey): QuotationLineItem[] {
  if (scenario === 'standard_2') {
    return [
      {
        id: 'sim_item_1',
        item_name: 'High-Rejection Brackish Water RO Membrane Element 8" (400 sq.ft)',
        description: 'Low-fouling spiral wound polyamide thin-film composite membrane element for industrial demineralization.',
        brand: 'DuPont FilmTec',
        model: 'BW30-400',
        origin: 'USA',
        availability: 'Ex-Stock Dubai',
        quantity: 12,
        uom: 'PCS',
        unit_price: 1850,
        line_total: 22200,
        technical_attributes: {
          'Active Area': '400 ft² (37.2 m²)',
          'Salt Rejection': '99.5% Stabilized',
          'Max Operating Pressure': '41 bar (600 psi)'
        },
        visible_attributes: ['Active Area', 'Salt Rejection', 'Max Operating Pressure'],
        page_break_after: false
      },
      {
        id: 'sim_item_2',
        item_name: 'Vertical Multistage Centrifugal High-Pressure Booster Pump (SS316L)',
        description: 'Complete with IE3 15 kW flameproof motor, mechanical cartridge seal, and dry-run protection sensor.',
        brand: 'Grundfos',
        model: 'CRN 32-6',
        origin: 'Denmark',
        availability: '1–2 Weeks',
        quantity: 2,
        uom: 'SET',
        unit_price: 14600,
        line_total: 29200,
        technical_attributes: {
          'Flow Rate': '32 m³/h @ 12.5 bar',
          'Wetted Parts': 'AISI 316L Stainless Steel',
          'Motor Rating': '15 kW, 380-415V, 50Hz, IP55'
        },
        visible_attributes: ['Flow Rate', 'Wetted Parts', 'Motor Rating'],
        page_break_after: false
      }
    ];
  }

  if (scenario === 'tender_8') {
    return [
      {
        id: 'sim_t_1',
        item_name: 'FRP Pressure Vessel 8" Side-Port 4-Element Housing (450 PSI)',
        description: 'ASME Code X certified filament-wound epoxy vessel complete with victaulic couplings and saddles.',
        brand: 'Codeline / Pentair',
        model: '80S45-4',
        origin: 'USA',
        availability: 'Ex-Stock',
        quantity: 6,
        uom: 'NOS',
        unit_price: 3950,
        line_total: 23700,
        technical_attributes: {
          'Design Pressure': '450 PSI (31 bar)',
          'Port Size': '2" IPS Grooved Side Port'
        },
        visible_attributes: ['Design Pressure', 'Port Size'],
        page_break_after: false
      },
      {
        id: 'sim_t_2',
        item_name: 'Sea-Water / High-Brackish RO Membrane Element 8"x40"',
        description: 'High productivity fouling-resistant membrane for municipal & industrial water treatment.',
        brand: 'Hydranautics',
        model: 'CPA5-LD-8040',
        origin: 'USA / Japan',
        availability: 'Ex-Stock',
        quantity: 24,
        uom: 'PCS',
        unit_price: 1920,
        line_total: 46080,
        technical_attributes: {
          'Permeate Flow': '11,000 GPD (41.6 m³/d)',
          'Spacer Thickness': '34 mil Low Differential'
        },
        visible_attributes: ['Permeate Flow', 'Spacer Thickness'],
        page_break_after: false
      },
      {
        id: 'sim_t_3',
        item_name: 'Simplex Electromagnetic Chemical Dosing Pump (Antiscalant Duty)',
        description: 'Microprocessor-controlled diaphragm metering pump with PVDF liquid end and level float switch.',
        brand: 'Seko',
        model: 'Tekna Evo AKL 800',
        origin: 'Italy',
        availability: 'Ex-Stock',
        quantity: 4,
        uom: 'SET',
        unit_price: 1650,
        line_total: 6600,
        technical_attributes: {
          'Capacity': '18 L/h @ 8 bar',
          'Diaphragm': 'Solid PTFE'
        },
        visible_attributes: ['Capacity', 'Diaphragm'],
        page_break_after: false
      },
      {
        id: 'sim_t_4',
        item_name: 'High-Performance Threshold Antiscalant & Dispersant Chemical',
        description: 'NSF/ANSI 60 certified phosphonate-blend scale inhibitor for calcium carbonate & sulfate control.',
        brand: 'Avista / Genesys',
        model: 'Vitec 3000',
        origin: 'UK',
        availability: 'Ex-Stock',
        quantity: 40,
        uom: 'DRUM (25KG)',
        unit_price: 420,
        line_total: 16800,
        technical_attributes: {
          'Certification': 'NSF/ANSI Standard 60 Potable Water',
          'Specific Gravity': '1.15 – 1.20 @ 25°C'
        },
        visible_attributes: ['Certification', 'Specific Gravity'],
        page_break_after: false
      },
      {
        id: 'sim_t_5',
        item_name: 'SS316L Multi-Cartridge Micron Filter Housing (12 x 40" DOE/SOE)',
        description: 'Heavy-duty swing-bolt closure sanitary polished housing with pressure gauge ports and drain valve.',
        brand: 'AquaTech Pro',
        model: 'MCH-1240-316L',
        origin: 'UAE / EU',
        availability: '2 Weeks',
        quantity: 2,
        uom: 'NOS',
        unit_price: 8900,
        line_total: 17800,
        technical_attributes: {
          'Flow Capacity': '90 m³/h @ 5 Micron',
          'Material': 'SS316L Electropolished'
        },
        visible_attributes: ['Flow Capacity', 'Material'],
        page_break_after: true
      },
      {
        id: 'sim_t_6',
        item_name: 'Online Digital Conductivity, TDS & Temperature Transmitter Panel',
        description: 'Dual-channel panel mount analyzer with 4-20mA isolated output, RS485 Modbus, and SS316 sensor.',
        brand: 'GF Signet',
        model: '9900-1P / 2850',
        origin: 'USA',
        availability: 'Ex-Stock',
        quantity: 3,
        uom: 'SET',
        unit_price: 2750,
        line_total: 8250,
        technical_attributes: {
          'Measurement Range': '0.05 to 50,000 µS/cm',
          'Output Signal': 'Dual 4-20 mA + Relay Alarm'
        },
        visible_attributes: ['Measurement Range', 'Output Signal'],
        page_break_after: false
      },
      {
        id: 'sim_t_7',
        item_name: 'Motorized Butterfly Valve Wafer Type with Quarter-Turn Actuator',
        description: 'EPDM seat, SS316 disc, IP67 electric actuator (24VDC/230VAC) with manual override handwheel.',
        brand: 'Georg Fischer',
        model: 'EA250-DN100',
        origin: 'Switzerland',
        availability: '1 Week',
        quantity: 6,
        uom: 'PCS',
        unit_price: 2150,
        line_total: 12900,
        technical_attributes: {
          'Nominal Size': 'DN100 (4 Inch)',
          'Enclosure Rating': 'IP67 Weatherproof'
        },
        visible_attributes: ['Nominal Size', 'Enclosure Rating'],
        page_break_after: false
      },
      {
        id: 'sim_t_8',
        item_name: 'Site Testing, Pre-Commissioning & Operator Training Package',
        description: 'Includes 5 days on-site chemical balancing, PLC interlock verification, and O&M handover manuals.',
        brand: 'Engineering Services',
        model: 'COMM-SVC-05D',
        origin: 'UAE',
        availability: 'As Scheduled',
        quantity: 1,
        uom: 'LOT',
        unit_price: 9500,
        line_total: 9500,
        technical_attributes: {
          'Deliverables': 'As-Built P&ID, Test Certificates & O&M Dossier'
        },
        visible_attributes: ['Deliverables'],
        page_break_after: false
      }
    ];
  }

  // Turnkey + Annex scenario
  return [
    {
      id: 'sim_tk_1',
      item_name: '250 m³/day Skid-Mounted Brackish Water Reverse Osmosis Plant (BWRO-250)',
      description: 'Complete factory-assembled and hydro-tested RO skid on epoxy-coated structural steel frame with Duplex 2205 HP manifold, Siemens PLC + 10" HMI, and automatic flushing system.',
      brand: 'Nirvana Engineering Systems',
      model: 'BWRO-250-DUPLEX',
      origin: 'UAE / EU Components',
      availability: '4–6 Weeks',
      quantity: 1,
      uom: 'SYSTEM',
      unit_price: 165000,
      line_total: 165000,
      technical_attributes: {
        'Permeate Production': '250 m³/day (10.5 m³/h Continuous)',
        'High Pressure Piping': 'Duplex Stainless Steel UNS S32205',
        'Control Panel': 'Siemens S7-1200 PLC + 10" Touch HMI (IP65)'
      },
      visible_attributes: ['Permeate Production', 'High Pressure Piping', 'Control Panel'],
      page_break_after: false
    },
    {
      id: 'sim_tk_2',
      item_name: 'Automatic Dual Media & Activated Carbon Pre-Treatment Filtration Skid',
      description: 'Includes FRP vessels 36"x72", Aquamatic diaphragm valve nest, stager controller, and graded filter media.',
      brand: 'Pentair / Structural',
      model: 'DMF-ACF-3672',
      origin: 'USA / Belgium',
      availability: '3 Weeks',
      quantity: 1,
      uom: 'SKID',
      unit_price: 42000,
      line_total: 42000,
      technical_attributes: {
        'Vessel Dimensions': '2 x 36" Dia x 72" H FRP (150 PSI)',
        'Backwash Automation': 'Differential Pressure + Timer Triggered'
      },
      visible_attributes: ['Vessel Dimensions', 'Backwash Automation'],
      page_break_after: false
    },
    {
      id: 'sim_tk_3',
      item_name: 'Clean-In-Place (CIP) Chemical Flushing & Heating Station',
      description: '500L conical PE tank, SS316L CIP circulation pump, 20" micron cartridge filter, and flexible hoses.',
      brand: 'Grundfos / Custom Skid',
      model: 'CIP-500-SS316',
      origin: 'UAE / Denmark',
      availability: '2 Weeks',
      quantity: 1,
      uom: 'SET',
      unit_price: 18500,
      line_total: 18500,
      technical_attributes: {
        'Tank Volume': '500 Liters Heavy-Duty LLDPE',
        'CIP Pump': 'Grundfos CM 10-3 SS316'
      },
      visible_attributes: ['Tank Volume', 'CIP Pump'],
      page_break_after: false
    }
  ];
}

const EXTRA_DUMMY_POOL: Array<Omit<QuotationLineItem, 'id' | 'line_total'>> = [
  {
    item_name: 'UV Water Disinfection Sterilizer Reactor Chamber (SS316L, 25 m³/h)',
    description: 'High-output amalgam UV lamp system with quartz sleeve, UV intensity monitor, and hour counter Ballast.',
    brand: 'Sterilight / Viqua',
    model: 'SHF-140',
    origin: 'Canada',
    availability: 'Ex-Stock',
    quantity: 2,
    uom: 'SET',
    unit_price: 5400,
    technical_attributes: {
      'UV Dose': '> 40 mJ/cm² at End of Lamp Life',
      'Chamber Material': '316L Stainless Steel (10 bar rated)'
    },
    visible_attributes: ['UV Dose', 'Chamber Material']
  },
  {
    item_name: 'Melt-Blown Polypropylene Sediment Filter Cartridge 40" x 2.5" (5 Micron)',
    description: 'Graded-density NSF-42 certified depth filter cartridge for RO pre-filtration.',
    brand: 'Pentair Pentek',
    model: 'DGD-5005-40',
    origin: 'USA',
    availability: 'Ex-Stock',
    quantity: 100,
    uom: 'PCS',
    unit_price: 48,
    technical_attributes: {
      'Micron Rating': '5 Micron Nominal',
      'Material': '100% Pure Virgin Polypropylene'
    },
    visible_attributes: ['Micron Rating', 'Material']
  },
  {
    item_name: 'Electromagnetic Inline Flow Meter DN80 (PTFE Liner, Hastelloy C Electrodes)',
    description: 'Flanged PN16 process water flow meter with backlit LCD display, pulse and 4-20mA Hart output.',
    brand: 'Endress+Hauser',
    model: 'Promag W 400 DN80',
    origin: 'Germany / France',
    availability: '2 Weeks',
    quantity: 2,
    uom: 'NOS',
    unit_price: 6850,
    technical_attributes: {
      'Accuracy': '±0.5% of Reading',
      'Protection Class': 'IP68 Submersible Sensor'
    },
    visible_attributes: ['Accuracy', 'Protection Class']
  },
  {
    item_name: 'Strong Acid Cation Exchange Resin (Food Grade Na+ Form)',
    description: 'High-capacity gel polystyrene sulfonate softening resin in 25 Liter sealed bags.',
    brand: 'Purolite',
    model: 'C100E',
    origin: 'UK / Romania',
    availability: 'Ex-Stock',
    quantity: 30,
    uom: 'BAG (25L)',
    unit_price: 195,
    technical_attributes: {
      'Total Exchange Capacity': '1.9 eq/L (min)',
      'Grade': 'Potable / Food Grade Certified'
    },
    visible_attributes: ['Total Exchange Capacity', 'Grade']
  }
];

export const WorkspaceDocumentProfileSettings: React.FC<WorkspaceDocumentProfileSettingsProps> = ({
  activeWorkspace,
  user,
  isAdmin,
  triggerToast
}) => {
  const workspaceId = activeWorkspace?.id || 'ws_default';

  // Loading & Saving States
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Full loaded profile snapshot so we never lose unedited fields on save
  const [rawProfileSnapshot, setRawProfileSnapshot] = useState<WorkspaceDocumentProfile | null>(null);

  // 1. Legal Identity & Profile State
  const [profileId, setProfileId] = useState<string>('');
  const [profileName, setProfileName] = useState<string>('Standard Legal Profile');
  const [legalEntityName, setLegalEntityName] = useState<string>('');
  const [trn, setTrn] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');
  const [addressLine2, setAddressLine2] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [website, setWebsite] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [stampSealUrl, setStampSealUrl] = useState<string>('');
  const [signatureImageUrl, setSignatureImageUrl] = useState<string>('');

  // Phase-3 Studio Parity Profile Defaults
  const [themeAccent, setThemeAccent] = useState<ThemeAccentKey>('navy');
  const [accentColor, setAccentColor] = useState<string>('#0f172a');
  const [customThemeColor, setCustomThemeColor] = useState<string>('');
  const [blockStyle, setBlockStyle] = useState<'framed' | 'minimal'>('framed');
  const [globalCardRadius, setGlobalCardRadius] = useState<'rounded' | 'sharp'>('rounded');
  const [fontSizeScale, setFontSizeScale] = useState<'compact' | 'standard' | 'large'>('standard');
  const [tableDensity, setTableDensity] = useState<'compact' | 'standard' | 'spacious'>('standard');

  // Default Header & Logo Display Mode Controls
  const [logoDisplayMode, setLogoDisplayMode] = useState<'logo_and_name' | 'logo_only' | 'full_banner' | 'no_logo'>('logo_and_name');
  const [headerLayoutMode, setHeaderLayoutMode] = useState<'split_left' | 'split_right' | 'centered' | 'banner'>('split_left');
  const [logoHeightPx, setLogoHeightPx] = useState<number>(48);
  const [showLogoOnContinuationPages, setShowLogoOnContinuationPages] = useState<boolean>(true);

  // Default Signatories & Authorization Controls
  const [signatoryType, setSignatoryType] = useState<'single' | 'dual' | 'stamp_only' | 'none'>('single');
  const [signatureStyle, setSignatureStyle] = useState<'script' | 'image' | 'line_only'>('script');
  const [primarySignatoryName, setPrimarySignatoryName] = useState<string>('');
  const [primarySignatoryTitle, setPrimarySignatoryTitle] = useState<string>('Commercial Director');
  const [secondarySignatoryName, setSecondarySignatoryName] = useState<string>('Authorized Signatory');
  const [secondarySignatoryTitle, setSecondarySignatoryTitle] = useState<string>('Managing Partner');
  const [showCompanySeal, setShowCompanySeal] = useState<boolean>(true);
  const [customerAcceptanceEnabled, setCustomerAcceptanceEnabled] = useState<boolean>(true);
  const [amountInWordsEnabled, setAmountInWordsEnabled] = useState<boolean>(true);

  // File Input Refs for Native Image Upload
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const sealInputRef = useRef<HTMLInputElement | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);

  // 2. Bank Accounts State (with Inline Edit Support)
  const [bankAccounts, setBankAccounts] = useState<DocumentProfileBankAccount[]>([]);
  const [showAddBank, setShowAddBank] = useState<boolean>(false);
  const [editingBankIndex, setEditingBankIndex] = useState<number | null>(null);
  const [newBank, setNewBank] = useState<DocumentProfileBankAccount>({
    bank_name: '',
    account_title: '',
    account_name: '',
    beneficiaryName: '',
    account_number: '',
    iban: '',
    swift_code: '',
    swift_bic: '',
    swiftCode: '',
    branch_address: '',
    branchName: '',
    currency: 'AED',
    is_default: false
  });

  // 3. Quotation Presets State
  const [presets, setPresets] = useState<QuotationPreset[]>([]);
  const [showAddPreset, setShowAddPreset] = useState<boolean>(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState<Partial<QuotationPreset>>({
    preset_name: '',
    default_tax_mode: 'taxes_extra',
    default_price_basis: 'Ex-Works / Delivered Site',
    default_payment_terms: '100% Advance / Approved Credit',
    default_validity_days: 30,
    signatory_mode: 'single',
    amount_in_words_enabled: true,
    visible_columns: {
      brand: true,
      model: true,
      origin: true,
      availability: true,
      unit_price: true,
      showUnitPrice: true,
      showUom: true,
      showItemAttributes: true
    }
  });

  // 4. Interactive Quotation Sandbox & Dummy Data Simulator State
  const [sandboxScenario, setSandboxScenario] = useState<SandboxScenarioKey>('standard_2');
  const [sandboxPresetId, setSandboxPresetId] = useState<string>('__unsaved_profile__');
  const [sandboxItems, setSandboxItems] = useState<QuotationLineItem[]>(() =>
    buildScenarioItems('standard_2')
  );
  const [sandboxFreight, setSandboxFreight] = useState<number>(0);
  const [showCustomItemForm, setShowCustomItemForm] = useState<boolean>(false);
  const [customDummyItem, setCustomDummyItem] = useState({
    item_name: '',
    description: '',
    brand: 'Grundfos',
    model: 'CR-15-4',
    origin: 'Denmark',
    availability: 'Ex-Stock',
    quantity: 1,
    uom: 'PCS',
    unit_price: 3200
  });
  const [isFullStudioSandboxOpen, setIsFullStudioSandboxOpen] = useState<boolean>(false);

  // Initial Data Fetch
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      QuotationRepository.getWorkspaceDocumentProfile(workspaceId),
      QuotationRepository.getPresets(workspaceId)
    ])
      .then(([prof, loadedPresets]) => {
        if (!isMounted) return;

        if (prof) {
          setRawProfileSnapshot(prof);
          setProfileId(prof.id || '');
          setProfileName(prof.profile_name || 'Standard Legal Profile');
          setLegalEntityName(prof.legal_entity_name || activeWorkspace?.name || '');
          setTrn(prof.trn || '');
          setAddressLine1(prof.address_line_1 || '');
          setAddressLine2(prof.address_line_2 || '');
          setCity(prof.city || '');
          setCountry(prof.country || '');
          setPhone(prof.phone || '');
          setEmail(prof.email || '');
          setWebsite(prof.website || '');
          setLogoUrl(prof.logo_url || prof.header_config?.logoUrl || '');
          setStampSealUrl(prof.company_seal_url || prof.stamp_seal_url || '');
          setSignatureImageUrl(prof.signature_image_url || '');

          const loadedTheme = (prof.theme_accent as ThemeAccentKey) || 'navy';
          setThemeAccent(loadedTheme);
          const matchingSwatch = THEME_ACCENT_SWATCHES.find((s) => s.key === loadedTheme);
          setAccentColor(prof.customThemeColor || prof.accent_color || matchingSwatch?.hex || '#0f172a');
          setCustomThemeColor(prof.customThemeColor || '');

          setBlockStyle(prof.block_style || 'framed');
          setGlobalCardRadius(prof.globalCardRadius || 'rounded');
          setFontSizeScale(prof.fontSizeScale || 'standard');
          setTableDensity(prof.table_density || 'standard');

          setLogoDisplayMode(prof.header_config?.logoDisplayMode || 'logo_and_name');
          setHeaderLayoutMode(prof.header_config?.headerLayoutMode || 'split_left');
          setLogoHeightPx(prof.header_config?.logoHeightPx || 48);
          setShowLogoOnContinuationPages(prof.header_config?.showLogoOnContinuationPages ?? true);

          setSignatoryType(prof.signatory_type || 'single');
          setSignatureStyle(prof.signature_style || 'script');
          setPrimarySignatoryName(prof.primary_signatory_name || user?.displayName || user?.name || 'Commercial Manager');
          setPrimarySignatoryTitle(prof.primary_signatory_title || 'Commercial Director');
          setSecondarySignatoryName(prof.secondary_signatory_name || 'Authorized Signatory');
          setSecondarySignatoryTitle(prof.secondary_signatory_title || 'Managing Partner');
          setShowCompanySeal(prof.show_company_seal ?? true);
          setCustomerAcceptanceEnabled(prof.customer_acceptance_enabled ?? true);
          setAmountInWordsEnabled(prof.amount_in_words_enabled ?? true);

          const normalizedBanks = (prof.bank_accounts || []).map((b) =>
            QuotationRepository.normalizeBankAccount(b, prof.legal_entity_name || activeWorkspace?.name)
          );
          setBankAccounts(normalizedBanks);
        } else {
          setLegalEntityName(activeWorkspace?.name || 'Corporate Legal Entity');
          setCountry('United Arab Emirates');
          setCity('Dubai');
          setPrimarySignatoryName(user?.displayName || user?.name || 'Commercial Director');
        }

        setPresets(loadedPresets);
      })
      .catch((err) => {
        console.error('Failed loading document profile or presets:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceId, activeWorkspace, user]);

  // Helper to construct complete, non-destructive WorkspaceDocumentProfile payload
  const buildMergedProfilePayload = (
    overrideBanks?: DocumentProfileBankAccount[],
    overrides?: Partial<WorkspaceDocumentProfile>
  ): WorkspaceDocumentProfile & { workspace_id: string } => {
    const resolvedBanks = (overrideBanks ?? bankAccounts).map((b) =>
      QuotationRepository.normalizeBankAccount(b, legalEntityName)
    );

    const nextHeaderConfig: QuotationHeaderConfig = {
      ...(rawProfileSnapshot?.header_config || {}),
      logoUrl: logoUrl || undefined,
      showLogo: logoDisplayMode !== 'no_logo',
      showCompanyName: logoDisplayMode !== 'logo_only',
      logoDisplayMode,
      headerLayoutMode,
      logoHeightPx,
      logoMaxWidthPx: logoDisplayMode === 'full_banner' ? 700 : 260,
      showLogoOnContinuationPages,
      repeatHeaderOnSubsequentPages: rawProfileSnapshot?.header_config?.repeatHeaderOnSubsequentPages ?? true
    };

    const payload: WorkspaceDocumentProfile & { workspace_id: string } = {
      ...(rawProfileSnapshot || {
        profile_name: profileName,
        legal_entity_name: legalEntityName,
        address_line_1: addressLine1,
        bank_accounts: resolvedBanks
      }),
      id: profileId || rawProfileSnapshot?.id || undefined,
      workspace_id: workspaceId,
      workspaceId: workspaceId,
      profile_name: profileName,
      legal_entity_name: legalEntityName,
      trn,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      country,
      phone,
      email,
      website,
      logo_url: logoUrl,
      stamp_seal_url: stampSealUrl,
      company_seal_url: stampSealUrl,
      signature_image_url: signatureImageUrl,
      accent_color: customThemeColor || accentColor,
      customThemeColor: customThemeColor || undefined,
      theme_accent: themeAccent,
      block_style: blockStyle,
      globalCardRadius,
      fontSizeScale,
      table_density: tableDensity,
      header_layout: headerLayoutMode === 'centered' ? 'centered' : headerLayoutMode === 'banner' ? 'minimal' : 'split',
      logo_position: headerLayoutMode === 'split_right' ? 'right' : headerLayoutMode === 'centered' ? 'center' : 'left',
      header_config: nextHeaderConfig,
      signatory_type: signatoryType,
      signature_style: signatureStyle,
      primary_signatory_name: primarySignatoryName,
      primary_signatory_title: primarySignatoryTitle,
      secondary_signatory_name: secondarySignatoryName,
      secondary_signatory_title: secondarySignatoryTitle,
      show_company_seal: showCompanySeal,
      customer_acceptance_enabled: customerAcceptanceEnabled,
      amount_in_words_enabled: amountInWordsEnabled,
      bank_accounts: resolvedBanks,
      is_default: true,
      ...(overrides || {})
    };

    return payload;
  };

  // Native File Upload Handlers (with automatic transparency-preserving HTML5 Canvas compression)
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'seal' | 'signature'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUri = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUri) return;
      const dataUri = await QuotationRepository.compressStudioImageDataUri(rawDataUri, {
        maxWidth: 600,
        maxHeight: 400,
        preserveTransparency: true,
        quality: 0.84
      });
      if (target === 'logo') {
        if (logoUrl && logoUrl.startsWith('http') && logoUrl !== dataUri) {
          deleteFromStorageBucket(logoUrl, activeWorkspace || undefined).catch(() => {});
        }
        setLogoUrl(dataUri);
        if (logoDisplayMode === 'no_logo') setLogoDisplayMode('logo_and_name');
      } else if (target === 'seal') {
        if (stampSealUrl && stampSealUrl.startsWith('http') && stampSealUrl !== dataUri) {
          deleteFromStorageBucket(stampSealUrl, activeWorkspace || undefined).catch(() => {});
        }
        setStampSealUrl(dataUri);
        setShowCompanySeal(true);
      } else if (target === 'signature') {
        if (signatureImageUrl && signatureImageUrl.startsWith('http') && signatureImageUrl !== dataUri) {
          deleteFromStorageBucket(signatureImageUrl, activeWorkspace || undefined).catch(() => {});
        }
        setSignatureImageUrl(dataUri);
        setSignatureStyle('image');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Save Legal Profile & Studio Defaults
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin) return;
    setSavingProfile(true);

    try {
      const prevLogo = rawProfileSnapshot?.logo_url || rawProfileSnapshot?.header_config?.logoUrl || '';
      const prevSeal = rawProfileSnapshot?.company_seal_url || rawProfileSnapshot?.stamp_seal_url || '';
      const prevSign = rawProfileSnapshot?.signature_image_url || '';

      const payload = buildMergedProfilePayload();
      const saved = await QuotationRepository.saveWorkspaceDocumentProfile(payload);
      setRawProfileSnapshot(saved);
      setProfileId(saved.id || '');

      if (prevLogo && prevLogo.startsWith('http') && prevLogo !== logoUrl) {
        deleteFromStorageBucket(prevLogo, activeWorkspace || undefined).catch(() => {});
      }
      if (prevSeal && prevSeal.startsWith('http') && prevSeal !== stampSealUrl) {
        deleteFromStorageBucket(prevSeal, activeWorkspace || undefined).catch(() => {});
      }
      if (prevSign && prevSign.startsWith('http') && prevSign !== signatureImageUrl) {
        deleteFromStorageBucket(prevSign, activeWorkspace || undefined).catch(() => {});
      }

      if (triggerToast) {
        triggerToast('Workspace document branding & Studio defaults saved!', 'success');
      }
    } catch (err: any) {
      console.error('Failed saving profile:', err);
      if (triggerToast) {
        triggerToast(err?.message || 'Failed saving branding profile', 'error');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  // Add or Update Bank Account
  const handleSaveBankAccount = () => {
    const bankName = (newBank.bank_name || newBank.bankName || '').trim();
    const accountNumber = (newBank.account_number || newBank.accountNumber || '').trim();
    if (!bankName || !accountNumber) {
      if (triggerToast) triggerToast('Bank Name and Account Number are required', 'error');
      return;
    }

    const normalizedEntry = QuotationRepository.normalizeBankAccount(
      {
        ...newBank,
        id:
          editingBankIndex !== null && bankAccounts[editingBankIndex]?.id
            ? bankAccounts[editingBankIndex].id
            : newBank.id || `bank_${Date.now()}`,
        bank_name: bankName,
        account_number: accountNumber,
        is_default:
          bankAccounts.length === 0
            ? true
            : Boolean(newBank.is_default ?? newBank.isDefault)
      },
      legalEntityName
    );

    let updatedList = [...bankAccounts];
    if (normalizedEntry.is_default) {
      updatedList = updatedList.map((b) => ({
        ...b,
        is_default: false,
        isDefault: false
      }));
    }

    if (editingBankIndex !== null && editingBankIndex >= 0 && editingBankIndex < updatedList.length) {
      updatedList[editingBankIndex] = normalizedEntry;
    } else {
      updatedList.push(normalizedEntry);
    }

    if (updatedList.length > 0 && !updatedList.some((b) => b.is_default || b.isDefault)) {
      updatedList[0].is_default = true;
      updatedList[0].isDefault = true;
    }

    setBankAccounts(updatedList);
    setNewBank({
      bank_name: '',
      account_title: '',
      account_name: '',
      beneficiaryName: '',
      account_number: '',
      iban: '',
      swift_code: '',
      swift_bic: '',
      swiftCode: '',
      branch_address: '',
      branchName: '',
      currency: 'AED',
      is_default: false
    });
    setEditingBankIndex(null);
    setShowAddBank(false);

    QuotationRepository.saveWorkspaceDocumentProfile(buildMergedProfilePayload(updatedList))
      .then((saved) => setRawProfileSnapshot(saved))
      .catch(console.error);

    if (triggerToast) {
      triggerToast(
        editingBankIndex !== null ? 'Bank account updated.' : 'Bank account added.',
        'success'
      );
    }
  };

  const handleEditBankAccount = (index: number) => {
    const target = bankAccounts[index];
    if (!target) return;
    const normalized = QuotationRepository.normalizeBankAccount(target, legalEntityName);
    setNewBank(normalized);
    setEditingBankIndex(index);
    setShowAddBank(true);
  };

  // Delete Bank Account
  const handleDeleteBankAccount = (index: number) => {
    const updated = bankAccounts.filter((_, idx) => idx !== index);
    if (updated.length > 0 && !updated.some((b) => b.is_default || b.isDefault)) {
      updated[0].is_default = true;
      updated[0].isDefault = true;
    }
    setBankAccounts(updated);

    QuotationRepository.saveWorkspaceDocumentProfile(buildMergedProfilePayload(updated))
      .then((saved) => setRawProfileSnapshot(saved))
      .catch(console.error);

    if (triggerToast) triggerToast('Bank account removed.', 'info');
  };

  // Set Default Bank Account
  const handleSetDefaultBank = (index: number) => {
    const updated = bankAccounts.map((b, idx) => ({
      ...b,
      is_default: idx === index,
      isDefault: idx === index
    }));
    setBankAccounts(updated);

    QuotationRepository.saveWorkspaceDocumentProfile(buildMergedProfilePayload(updated))
      .then((saved) => setRawProfileSnapshot(saved))
      .catch(console.error);
  };

  // Save / Edit Preset (Preserving 100% of Studio Snapshot Fields)
  const handleSavePreset = async () => {
    if (!presetForm.preset_name?.trim()) {
      if (triggerToast) triggerToast('Preset name is required', 'error');
      return;
    }

    try {
      const unitPriceChecked =
        presetForm.visible_columns?.unit_price ??
        presetForm.visible_columns?.showUnitPrice ??
        true;

      const syncedVisibleColumns = {
        brand: presetForm.visible_columns?.brand ?? true,
        model: presetForm.visible_columns?.model ?? true,
        origin: presetForm.visible_columns?.origin ?? true,
        availability: presetForm.visible_columns?.availability ?? true,
        unit_price: unitPriceChecked,
        showUnitPrice: unitPriceChecked,
        showUom: presetForm.visible_columns?.showUom ?? true,
        showItemAttributes: presetForm.visible_columns?.showItemAttributes ?? true
      };

      let saved: QuotationPreset;

      if (editingPresetId) {
        const existingPreset = presets.find((p) => p.id === editingPresetId);
        const updatedFields: Partial<QuotationPreset> = {
          ...(existingPreset || {}),
          preset_name: presetForm.preset_name.trim(),
          default_tax_mode: presetForm.default_tax_mode || 'taxes_extra',
          default_price_basis: presetForm.default_price_basis || 'Ex-Works',
          default_payment_terms: presetForm.default_payment_terms || '100% Advance',
          default_validity_days: Number(presetForm.default_validity_days) || 30,
          signatory_mode: presetForm.signatory_mode || 'single',
          signatory_type: presetForm.signatory_mode || existingPreset?.signatory_type || 'single',
          amount_in_words_enabled: presetForm.amount_in_words_enabled ?? existingPreset?.amount_in_words_enabled ?? true,
          visible_columns: syncedVisibleColumns
        };

        const updatedResult = await QuotationRepository.updatePreset(
          workspaceId,
          editingPresetId,
          updatedFields
        );
        saved = updatedResult || (await QuotationRepository.savePreset({
          ...(existingPreset || {}),
          ...updatedFields,
          id: editingPresetId,
          workspace_id: workspaceId,
          workspaceId
        } as QuotationPreset));
      } else {
        const payload: QuotationPreset = {
          workspace_id: workspaceId,
          workspaceId: workspaceId,
          preset_name: presetForm.preset_name.trim(),
          default_tax_mode: presetForm.default_tax_mode || 'taxes_extra',
          default_price_basis: presetForm.default_price_basis || 'Ex-Works',
          default_payment_terms: presetForm.default_payment_terms || '100% Advance',
          default_validity_days: Number(presetForm.default_validity_days) || 30,
          signatory_mode: presetForm.signatory_mode || 'single',
          signatory_type: presetForm.signatory_mode || 'single',
          amount_in_words_enabled: presetForm.amount_in_words_enabled ?? true,
          visible_columns: syncedVisibleColumns,
          is_default: presets.length === 0
        };
        saved = await QuotationRepository.savePreset(payload);
      }

      const refreshedPresets = await QuotationRepository.getPresets(workspaceId);
      setPresets(refreshedPresets.length > 0 ? refreshedPresets : [saved]);

      setShowAddPreset(false);
      setEditingPresetId(null);
      setPresetForm({
        preset_name: '',
        default_tax_mode: 'taxes_extra',
        default_price_basis: 'Ex-Works / Delivered Site',
        default_payment_terms: '100% Advance / Approved Credit',
        default_validity_days: 30,
        signatory_mode: 'single',
        amount_in_words_enabled: true,
        visible_columns: {
          brand: true,
          model: true,
          origin: true,
          availability: true,
          unit_price: true,
          showUnitPrice: true,
          showUom: true,
          showItemAttributes: true
        }
      });

      if (triggerToast) {
        triggerToast(`Quotation preset "${saved.preset_name}" saved with all Studio settings intact.`, 'success');
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(err?.message || 'Failed saving preset', 'error');
      }
    }
  };

  // Set Default Preset
  const handleSetDefaultPreset = async (presetId: string) => {
    if (!presetId) return;
    try {
      await QuotationRepository.setDefaultPreset(workspaceId, presetId);
      setPresets((prev) =>
        prev.map((p) => ({
          ...p,
          is_default: p.id === presetId
        }))
      );
      if (triggerToast) triggerToast('Default quotation preset updated.', 'success');
    } catch (err: any) {
      if (triggerToast) triggerToast(err?.message || 'Failed setting default preset', 'error');
    }
  };

  // Delete Preset
  const handleDeletePreset = async (presetId: string) => {
    if (!presetId) return;
    try {
      await QuotationRepository.deletePreset(presetId);
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (sandboxPresetId === presetId) {
        setSandboxPresetId('__unsaved_profile__');
      }
      if (triggerToast) triggerToast('Preset deleted.', 'info');
    } catch (err: any) {
      if (triggerToast) triggerToast(err?.message || 'Failed deleting preset', 'error');
    }
  };

  // ==========================================
  // SANDBOX & DUMMY DATA SIMULATOR HANDLERS
  // ==========================================
  const handleSelectScenario = (scenario: SandboxScenarioKey) => {
    setSandboxScenario(scenario);
    setSandboxItems(buildScenarioItems(scenario));
    setSandboxFreight(scenario === 'turnkey_annex' ? 4500 : 0);
  };

  const handleAddPoolDummyItem = () => {
    const randomTemplate = EXTRA_DUMMY_POOL[sandboxItems.length % EXTRA_DUMMY_POOL.length];
    const newItem: QuotationLineItem = {
      ...randomTemplate,
      id: `sim_extra_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      line_total: Number((randomTemplate.quantity * randomTemplate.unit_price).toFixed(2)),
      page_break_after: false
    };
    setSandboxItems((prev) => [...prev, newItem]);
  };

  const handleAddCustomDummyItem = () => {
    if (!customDummyItem.item_name.trim()) {
      triggerToast?.('Please enter an item description.', 'error');
      return;
    }
    const qty = Math.max(1, Number(customDummyItem.quantity) || 1);
    const price = Math.max(0, Number(customDummyItem.unit_price) || 0);
    const newItem: QuotationLineItem = {
      id: `sim_custom_${Date.now()}`,
      item_name: customDummyItem.item_name.trim(),
      description:
        customDummyItem.description.trim() ||
        'Supplied complete with manufacturer test certificate and standard warranty.',
      brand: customDummyItem.brand || 'OEM Standard',
      model: customDummyItem.model || 'STD-01',
      origin: customDummyItem.origin || 'UAE / EU',
      availability: customDummyItem.availability || 'Ex-Stock',
      quantity: qty,
      uom: customDummyItem.uom || 'PCS',
      unit_price: price,
      line_total: Number((qty * price).toFixed(2)),
      technical_attributes: {
        'Specification': `${customDummyItem.brand || 'OEM'} Model ${customDummyItem.model || 'STD'}`
      },
      visible_attributes: ['Specification'],
      page_break_after: false
    };
    setSandboxItems((prev) => [...prev, newItem]);
    setCustomDummyItem({
      item_name: '',
      description: '',
      brand: 'Grundfos',
      model: 'CR-15-4',
      origin: 'Denmark',
      availability: 'Ex-Stock',
      quantity: 1,
      uom: 'PCS',
      unit_price: 3200
    });
    setShowCustomItemForm(false);
  };

  const handleUpdateSandboxItem = (
    id: string,
    patch: Partial<Pick<QuotationLineItem, 'quantity' | 'unit_price' | 'page_break_after' | 'item_name'>>
  ) => {
    setSandboxItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextQty = patch.quantity !== undefined ? Math.max(1, Number(patch.quantity) || 1) : item.quantity;
        const nextPrice =
          patch.unit_price !== undefined ? Math.max(0, Number(patch.unit_price) || 0) : item.unit_price;
        return {
          ...item,
          ...patch,
          quantity: nextQty,
          unit_price: nextPrice,
          line_total: Number((nextQty * nextPrice).toFixed(2))
        };
      })
    );
  };

  const handleRemoveSandboxItem = (id: string) => {
    setSandboxItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRandomizePrices = () => {
    setSandboxItems((prev) =>
      prev.map((item) => {
        const multiplier = 0.8 + Math.random() * 0.45;
        const nextPrice = Math.max(25, Math.round((item.unit_price * multiplier) / 10) * 10);
        return {
          ...item,
          unit_price: nextPrice,
          line_total: Number((item.quantity * nextPrice).toFixed(2))
        };
      })
    );
  };

  const handleResetDummyItems = () => {
    setSandboxItems(buildScenarioItems(sandboxScenario));
    setSandboxFreight(sandboxScenario === 'turnkey_annex' ? 4500 : 0);
  };

  // Live Unsaved WorkspaceDocumentProfile for Preview & Studio Sandbox
  const liveSandboxProfile: WorkspaceDocumentProfile = useMemo(() => {
    return buildMergedProfilePayload();
  }, [
    rawProfileSnapshot,
    profileId,
    workspaceId,
    profileName,
    legalEntityName,
    trn,
    addressLine1,
    addressLine2,
    city,
    country,
    phone,
    email,
    website,
    logoUrl,
    stampSealUrl,
    signatureImageUrl,
    accentColor,
    customThemeColor,
    themeAccent,
    blockStyle,
    globalCardRadius,
    fontSizeScale,
    tableDensity,
    logoDisplayMode,
    headerLayoutMode,
    logoHeightPx,
    showLogoOnContinuationPages,
    signatoryType,
    signatureStyle,
    primarySignatoryName,
    primarySignatoryTitle,
    secondarySignatoryName,
    secondarySignatoryTitle,
    showCompanySeal,
    customerAcceptanceEnabled,
    amountInWordsEnabled,
    bankAccounts
  ]);

  const activeSandboxPreset = useMemo(() => {
    if (sandboxPresetId === '__unsaved_profile__') return null;
    return presets.find((p) => p.id === sandboxPresetId) || null;
  }, [sandboxPresetId, presets]);

  const activeDefaultBank = useMemo(() => {
    if (bankAccounts.length === 0) return undefined;
    const chosen = bankAccounts.find((b) => b.is_default || b.isDefault) || bankAccounts[0];
    return QuotationRepository.normalizeBankAccount(chosen, legalEntityName);
  }, [bankAccounts, legalEntityName]);

  // Construct Live Quotation Object for `<QuotationDocument />` and `<QuotationStudioModal />`
  const sandboxQuotation: Quotation = useMemo(() => {
    const activeTaxMode: QuotationTaxMode =
      activeSandboxPreset?.default_tax_mode || 'taxes_extra';
    const processedItems: QuotationLineItem[] = sandboxItems.map((item, idx) => {
      const lineTotal = Number(((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)).toFixed(2));
      return {
        ...item,
        id: item.id || `sim_item_${idx}`,
        unit: item.unit || item.uom || 'PCS',
        uom: item.uom || item.unit || 'PCS',
        brand_make: item.brand_make || item.brand || '',
        brand: item.brand || item.brand_make || '',
        model_part_no: item.model_part_no || item.model || '',
        model: item.model || item.model_part_no || '',
        country_of_origin: item.country_of_origin || item.origin || '',
        origin: item.origin || item.country_of_origin || '',
        total_price: lineTotal,
        line_total: lineTotal
      };
    });
    const financials = QuotationRepository.calculateTotals(
      processedItems,
      sandboxFreight,
      activeTaxMode,
      5
    );

    const sampleAnnexes: Attachment[] =
      sandboxScenario === 'turnkey_annex'
        ? [
            {
              id: 'sim_annex_1',
              name: 'Annex A: BWRO-250 Process & Skid Elevation Datasheet',
              url: SAMPLE_ANNEX_SVG_DATA_URI,
              type: 'image/svg+xml',
              uploadedAt: new Date().toISOString(),
              render_as_annex_page: true,
              show_title_on_annex: true
            }
          ]
        : activeSandboxPreset?.flyer_attachments || [];

    const resolvedSignatoryMode =
      activeSandboxPreset?.signatory_type ||
      activeSandboxPreset?.signatory_mode ||
      signatoryType;

    const resolvedThemeAccent =
      activeSandboxPreset?.theme_accent || themeAccent;

    const resolvedBlockStyle =
      activeSandboxPreset?.block_style || blockStyle;

    const resolvedCardRadius =
      activeSandboxPreset?.globalCardRadius || globalCardRadius;

    const resolvedFontScale =
      activeSandboxPreset?.fontSizeScale || fontSizeScale;

    const resolvedTableDensity =
      activeSandboxPreset?.table_density || tableDensity;

    const resolvedHeaderConfig: QuotationHeaderConfig = {
      ...liveSandboxProfile.header_config,
      ...(activeSandboxPreset?.header_config || {}),
      logoUrl:
        activeSandboxPreset?.header_config?.logoUrl ||
        activeSandboxPreset?.company_logo_url ||
        logoUrl ||
        undefined
    };

    return {
      id: 'sandbox_preview_quotation',
      workspace_id: workspaceId,
      workspaceId: workspaceId,
      enquiry_id: 'sandbox_enquiry_01',
      quote_number: 'QT-2026-SIM01',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-SIM01-R1',
      status: 'Draft',
      subject:
        sandboxScenario === 'turnkey_annex'
          ? 'Supply, Installation & Commissioning of 250 m³/day Containerized BWRO Plant'
          : sandboxScenario === 'tender_8'
          ? 'Annual Rate Contract — RO Membranes, Pressure Vessels & Dosing Systems'
          : 'Commercial Offer for Industrial Reverse Osmosis Membranes & Booster Pumps',
      client_contact_person: 'Eng. Tariq Al Mansoori (Procurement Director)',
      prepared_by: primarySignatoryName || user?.displayName || 'Commercial Engineering Team',
      client_snapshot: {
        entity_name: 'GULF EMIRATES INDUSTRIAL UTILITIES & WATER CORP.',
        contact_person: 'Eng. Tariq Al Mansoori (Procurement Director)',
        client_contact_person: 'Eng. Tariq Al Mansoori (Procurement Director)',
        address: 'Plot 44B, ICAD II Industrial Zone, Musaffah, Abu Dhabi, UAE',
        trn: '100498120000003',
        email: 'tenders@gulfutilities.ae',
        phone: '+971 2 554 8900'
      },
      sender_snapshot: {
        entity_name: legalEntityName || 'ADVANCED NIRVANA WATER TREATMENT EQUIPMENT TRADING LLC',
        address: [addressLine1, addressLine2, city, country].filter(Boolean).join(', '),
        trn: trn || '100234567800003',
        email: email || 'sales@nirvanawater.ae',
        phone: phone || '+971 4 338 9100',
        logo_url: resolvedHeaderConfig.logoUrl || logoUrl,
        stamp_seal_url: activeSandboxPreset?.company_seal_url || stampSealUrl
      },
      line_items: processedItems,
      visible_columns: activeSandboxPreset?.visible_columns || {
        brand: true,
        model: true,
        origin: true,
        availability: true,
        unit_price: true,
        showUnitPrice: true,
        showUom: true,
        showItemAttributes: true
      },
      tax_mode: activeTaxMode,
      subtotal: financials.subtotal,
      freight_amount: financials.freight_amount,
      tax_rate_percent: financials.tax_rate_percent,
      tax_amount: financials.tax_amount,
      grand_total: financials.grand_total,
      currency: activeDefaultBank?.currency || 'AED',
      price_basis:
        activeSandboxPreset?.default_price_basis || 'DDP Client Site, UAE',
      payment_terms:
        activeSandboxPreset?.default_payment_terms || '50% Advance with PO, 50% Prior to Dispatch',
      validity_days: activeSandboxPreset?.default_validity_days || 30,
      applied_bank_account: activeDefaultBank,
      selectedBank: activeDefaultBank as any,
      remittanceBankId: activeDefaultBank?.id,
      signatory_mode: resolvedSignatoryMode,
      signatory_type: resolvedSignatoryMode,
      signature_style: activeSandboxPreset?.signature_style || signatureStyle,
      signature_image_url: activeSandboxPreset?.signature_image_url || signatureImageUrl,
      primary_signatory_name:
        activeSandboxPreset?.primary_signatory_name || primarySignatoryName || 'Commercial Director',
      primary_signatory_title:
        activeSandboxPreset?.primary_signatory_title || primarySignatoryTitle || 'Commercial Director',
      secondary_signatory_name:
        activeSandboxPreset?.secondary_signatory_name || secondarySignatoryName || 'Authorized Signatory',
      secondary_signatory_title:
        activeSandboxPreset?.secondary_signatory_title || secondarySignatoryTitle || 'Managing Partner',
      show_company_seal: activeSandboxPreset?.show_company_seal ?? showCompanySeal,
      company_seal_url: activeSandboxPreset?.company_seal_url || stampSealUrl,
      company_logo_url: resolvedHeaderConfig.logoUrl || logoUrl,
      show_bank_details: activeSandboxPreset?.show_bank_details ?? true,
      show_commercial_terms: activeSandboxPreset?.show_commercial_terms ?? true,
      amount_in_words_enabled:
        activeSandboxPreset?.amount_in_words_enabled ?? amountInWordsEnabled,
      customer_acceptance_enabled:
        activeSandboxPreset?.customer_acceptance_enabled ?? customerAcceptanceEnabled,
      theme_accent: resolvedThemeAccent,
      customThemeColor:
        activeSandboxPreset?.customThemeColor || customThemeColor || undefined,
      block_style: resolvedBlockStyle,
      globalCardRadius: resolvedCardRadius,
      fontSizeScale: resolvedFontScale,
      table_density: resolvedTableDensity,
      header_config: resolvedHeaderConfig,
      recipient_config: activeSandboxPreset?.recipient_config || {
        showSubmittedTo: true,
        showCustomerTrn: true,
        showOfferMeta: true,
        showValidity: true,
        layout: 'side_by_side',
        style: resolvedBlockStyle,
        recipientCardWidth: '50',
        offerCardWidth: '50',
        recipientPlacement: 'left',
        offerPlacement: 'right',
        recipientCardStyle: resolvedBlockStyle,
        offerCardStyle: resolvedBlockStyle,
        globalCardRadius: resolvedCardRadius,
        recipientCardRadius: resolvedCardRadius,
        offerCardRadius: resolvedCardRadius,
        cardsOrder: 'recipient_first',
        subjectPlacement: 'below_cards'
      },
      footer_config: activeSandboxPreset?.footer_config || {
        showSystemGeneratedNotice: true,
        showPageNumbers: true,
        pageMode: 'auto'
      },
      layout_blocks: activeSandboxPreset?.layout_blocks || DEFAULT_QUOTATION_BLOCKS,
      flyer_attachments: sampleAnnexes,
      show_submittals_index: sampleAnnexes.length > 0,
      custom_notes:
        activeSandboxPreset?.custom_notes ||
        '1. All supplied membranes and pumps carry 12 months manufacturer warranty against manufacturing defects.\n2. Prices quoted are based on undivided lot order.',
      created_at: new Date().toISOString()
    };
  }, [
    activeSandboxPreset,
    sandboxItems,
    sandboxFreight,
    sandboxScenario,
    signatoryType,
    themeAccent,
    customThemeColor,
    blockStyle,
    globalCardRadius,
    fontSizeScale,
    tableDensity,
    liveSandboxProfile,
    logoUrl,
    stampSealUrl,
    signatureImageUrl,
    workspaceId,
    primarySignatoryName,
    primarySignatoryTitle,
    secondarySignatoryName,
    secondarySignatoryTitle,
    showCompanySeal,
    amountInWordsEnabled,
    customerAcceptanceEnabled,
    legalEntityName,
    addressLine1,
    addressLine2,
    city,
    country,
    trn,
    email,
    phone,
    activeDefaultBank,
    user
  ]);

  const sandboxEnquiry: Enquiry = useMemo(
    () =>
      ({
        id: 'sandbox_enquiry_01',
        sn: 1001,
        enquiry_date: new Date().toISOString().slice(0, 10),
        company_id: 'client_sim_01',
        company_name: 'GULF EMIRATES INDUSTRIAL UTILITIES & WATER CORP.',
        country: 'United Arab Emirates',
        workspace_id: workspaceId,
        workspaceId: workspaceId,
        enquiry_no: 'ENQ-SIM-2026',
        client_id: 'client_sim_01',
        client_name: 'GULF EMIRATES INDUSTRIAL UTILITIES & WATER CORP.',
        customer_trn: '100498120000003',
        concerned_person: 'Eng. Tariq Al Mansoori (Procurement Director)',
        subject: sandboxQuotation.subject,
        status: 'Active',
        line_items: sandboxItems as any,
        created_at: new Date().toISOString()
      } as unknown as Enquiry),
    [workspaceId, sandboxQuotation.subject, sandboxItems]
  );

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading Document Branding, Presets & Simulator...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Hidden File Inputs for Native Image Upload */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'logo')}
      />
      <input
        ref={sealInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'seal')}
      />
      <input
        ref={signatureInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e, 'signature')}
      />

      {/* =========================================================================
          PILLAR 1: LEGAL IDENTITY, CORPORATE ASSETS & QUOTATION STUDIO DEFAULTS
         ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Company Details
              </h3>
              <p className="text-xs text-slate-500">
                Legal entity name, tax registration, address, logo, stamp, and default signatories.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => handleSaveProfile()}
              disabled={savingProfile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingProfile ? 'Saving...' : 'Save Company Info'}</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-8">
          {/* Sub-section 1A: Legal Entity & Contact Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">
                Company Name (Legal Name)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={legalEntityName}
                onChange={(e) => setLegalEntityName(e.target.value)}
                placeholder="e.g. Global Industrial Equipment Trading LLC"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">
                Tax Registration Number (TRN / VAT Reg)
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={trn}
                onChange={(e) => setTrn(e.target.value)}
                placeholder="e.g. 100234567800003"
                className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Physical Address (Line 1)</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="e.g. Suite 402, Al Quoz Industrial Area 3"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Physical Address (Line 2 / P.O. Box)</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="e.g. P.O. Box 48192"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">City</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Dubai"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Country</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="United Arab Emirates"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Official Phone</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+971 4 123 4567"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Sales / Official Email</label>
                <input
                  type="email"
                  disabled={!isAdmin}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sales@company.com"
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Website URL</label>
              <input
                type="text"
                disabled={!isAdmin}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="www.nirvanawater.ae"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Sub-section 1B: Native File Uploaders + Preview Cards for Corporate Logo & Company Stamp / Seal */}
          <div className="pt-6 border-t border-slate-100">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              <span>Company Logo &amp; Official Stamp</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Corporate Logo Uploader Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Corporate Header Logo</span>
                    <span className="text-[11px] text-slate-500">
                      Supports PNG, SVG, JPG or wide corporate lockup banners.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Corporate Logo</span>
                      </button>
                    )}
                    {isAdmin && logoUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (logoUrl.startsWith('http')) {
                            deleteFromStorageBucket(logoUrl, activeWorkspace || undefined).catch(() => {});
                          }
                          setLogoUrl('');
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-28 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 p-1.5">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Corporate Logo Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-400 text-center font-medium">
                        No Custom Logo
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Or Paste Logo Image URL / Data URI
                    </label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://.../corporate-logo.png"
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Company Stamp / Seal Uploader Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Official Company Stamp / Seal</span>
                    <span className="text-[11px] text-slate-500">
                      Rendered in the quotation Signatory & Authorization block.
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => sealInputRef.current?.click()}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Company Stamp / Seal</span>
                      </button>
                    )}
                    {isAdmin && stampSealUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (stampSealUrl.startsWith('http')) {
                            deleteFromStorageBucket(stampSealUrl, activeWorkspace || undefined).catch(() => {});
                          }
                          setStampSealUrl('');
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-20 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 p-1.5">
                    {stampSealUrl ? (
                      <img
                        src={stampSealUrl}
                        alt="Company Seal Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-slate-400 text-center font-medium">
                        Vector Seal Fallback
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Or Paste Stamp / Seal Image URL
                    </label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={stampSealUrl}
                      onChange={(e) => setStampSealUrl(e.target.value)}
                      placeholder="https://.../company-seal.png"
                      className="w-full rounded-lg border border-slate-300 p-2 text-xs bg-white text-slate-800"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-section 1C: Default Signatories */}
          <div className="pt-6 border-t border-slate-100">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-4 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-emerald-600" />
              <span>Default Signatories</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Default Signatory Mode</label>
                <select
                  disabled={!isAdmin}
                  value={signatoryType}
                  onChange={(e) => setSignatoryType(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 bg-white font-semibold text-slate-800"
                >
                  <option value="single">Single Signatory (Primary Rep)</option>
                  <option value="dual">Dual Signatory (Primary + Co-Signer)</option>
                  <option value="stamp_only">Company Seal / Stamp Only</option>
                  <option value="none">None / Electronic Notice Only</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Default Signature Style</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'script', label: 'Cursive Script' },
                      { id: 'image', label: 'Uploaded Sign' },
                      { id: 'line_only', label: 'Line Only' }
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => setSignatureStyle(st.id)}
                      className={`px-2 py-2 rounded-lg font-bold text-[11px] border transition cursor-pointer ${
                        signatureStyle === st.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="w-16 h-10 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-1">
                    {signatureImageUrl ? (
                      <img
                        src={signatureImageUrl}
                        alt="Signature Preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-[9px] text-slate-400">No Sign Image</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-800 block">Signature Image</span>
                    <span className="text-[10px] text-slate-500">PNG transparent sign</span>
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => signatureInputRef.current?.click()}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg cursor-pointer"
                    >
                      Upload Signature
                    </button>
                    {signatureImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (signatureImageUrl.startsWith('http')) {
                            deleteFromStorageBucket(signatureImageUrl, activeWorkspace || undefined).catch(() => {});
                          }
                          setSignatureImageUrl('');
                        }}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Primary Signatory Name</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={primarySignatoryName}
                  onChange={(e) => setPrimarySignatoryName(e.target.value)}
                  placeholder="e.g. Eng. Khalid Al Rostamani"
                  className="w-full rounded-xl border border-slate-300 p-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Primary Signatory Title</label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={primarySignatoryTitle}
                  onChange={(e) => setPrimarySignatoryTitle(e.target.value)}
                  placeholder="e.g. Commercial Director"
                  className="w-full rounded-xl border border-slate-300 p-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Co-Signatory Name</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={secondarySignatoryName}
                    onChange={(e) => setSecondarySignatoryName(e.target.value)}
                    placeholder="Managing Partner"
                    className="w-full rounded-xl border border-slate-300 p-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Co-Signatory Title</label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={secondarySignatoryTitle}
                    onChange={(e) => setSecondarySignatoryTitle(e.target.value)}
                    placeholder="Executive Approver"
                    className="w-full rounded-xl border border-slate-300 p-2 text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PILLAR 2: REMITTANCE BANK ACCOUNTS MANAGER (NORMALIZED + INLINE EDIT)
         ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">2. Bank Accounts</h3>
              <p className="text-xs text-slate-500">
                Bank remittance accounts displayed on your quotations.
              </p>
            </div>
          </div>
          {isAdmin && !showAddBank && (
            <button
              type="button"
              onClick={() => {
                setEditingBankIndex(null);
                setNewBank({
                  bank_name: '',
                  account_title: legalEntityName || '',
                  account_name: legalEntityName || '',
                  beneficiaryName: legalEntityName || '',
                  account_number: '',
                  iban: '',
                  swift_code: '',
                  swift_bic: '',
                  swiftCode: '',
                  branch_address: '',
                  branchName: '',
                  currency: 'AED',
                  is_default: bankAccounts.length === 0
                });
                setShowAddBank(true);
              }}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition flex items-center space-x-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Bank Account</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {showAddBank && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 animate-in fade-in duration-100">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  {editingBankIndex !== null
                    ? 'Edit Wire Remittance Bank Account'
                    : 'Add New Wire Remittance Account'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBank(false);
                    setEditingBankIndex(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Bank Name *</label>
                  <input
                    type="text"
                    value={newBank.bank_name || newBank.bankName || ''}
                    onChange={(e) =>
                      setNewBank({
                        ...newBank,
                        bank_name: e.target.value,
                        bankName: e.target.value
                      })
                    }
                    placeholder="e.g. Emirates NBD"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">
                    Beneficiary / Account Title
                  </label>
                  <input
                    type="text"
                    value={
                      newBank.account_title ||
                      newBank.account_name ||
                      newBank.beneficiaryName ||
                      ''
                    }
                    onChange={(e) =>
                      setNewBank({
                        ...newBank,
                        account_title: e.target.value,
                        account_name: e.target.value,
                        beneficiaryName: e.target.value
                      })
                    }
                    placeholder="e.g. Industrial Trading LLC"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Account Number *</label>
                  <input
                    type="text"
                    value={newBank.account_number || newBank.accountNumber || ''}
                    onChange={(e) =>
                      setNewBank({
                        ...newBank,
                        account_number: e.target.value,
                        accountNumber: e.target.value
                      })
                    }
                    placeholder="101002345678"
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">IBAN Number</label>
                  <input
                    type="text"
                    value={newBank.iban || ''}
                    onChange={(e) => setNewBank({ ...newBank, iban: e.target.value })}
                    placeholder="AE07033000101002345678"
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono uppercase bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">SWIFT / BIC Code</label>
                  <input
                    type="text"
                    value={newBank.swift_code || newBank.swift_bic || newBank.swiftCode || ''}
                    onChange={(e) =>
                      setNewBank({
                        ...newBank,
                        swift_code: e.target.value,
                        swift_bic: e.target.value,
                        swiftCode: e.target.value
                      })
                    }
                    placeholder="EBILAEADXXX"
                    className="w-full rounded-lg border border-slate-300 p-2 font-mono uppercase bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Branch / Address</label>
                  <input
                    type="text"
                    value={newBank.branch_address || newBank.branchName || ''}
                    onChange={(e) =>
                      setNewBank({
                        ...newBank,
                        branch_address: e.target.value,
                        branchName: e.target.value
                      })
                    }
                    placeholder="e.g. Business Bay Corporate Branch, Dubai"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Currency</label>
                  <select
                    value={newBank.currency || 'AED'}
                    onChange={(e) => setNewBank({ ...newBank, currency: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="AED">AED (UAE Dirham)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(newBank.is_default ?? newBank.isDefault)}
                    onChange={(e) =>
                      setNewBank({
                        ...newBank,
                        is_default: e.target.checked,
                        isDefault: e.target.checked
                      })
                    }
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>Set as default primary account for new quotes</span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddBank(false);
                      setEditingBankIndex(null);
                    }}
                    className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBankAccount}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    {editingBankIndex !== null ? 'Update Bank Account' : 'Confirm Account'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {bankAccounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bankAccounts.map((b, idx) => {
                const accountTitle =
                  b.beneficiaryName || b.account_name || b.account_title || legalEntityName;
                const acctNumber = b.account_number || b.accountNumber || '—';
                const swiftVal = b.swiftCode || b.swift_bic || b.swift_code || '';
                const branchVal = b.branchName || b.branch_address || '';
                const isDef = Boolean(b.is_default ?? b.isDefault);
                return (
                  <div
                    key={b.id || idx}
                    className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                      isDef
                        ? 'bg-emerald-50/40 border-emerald-300 shadow-2xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center flex-wrap gap-1.5">
                          <span className="font-bold text-slate-900 text-xs">
                            {b.bank_name || b.bankName}
                          </span>
                          {isDef && (
                            <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded">
                              ★ DEFAULT
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded font-mono">
                            {b.currency || 'AED'}
                          </span>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center space-x-1">
                          {!isDef && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultBank(idx)}
                              className="text-[11px] text-emerald-700 hover:text-emerald-900 font-medium px-2 py-1 rounded hover:bg-emerald-50 cursor-pointer"
                            >
                              Set Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditBankAccount(idx)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded transition cursor-pointer"
                            title="Edit Bank Account"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBankAccount(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                            title="Delete Bank Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                      {accountTitle && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 shrink-0">Beneficiary:</span>
                          <span className="font-medium text-slate-800 truncate text-right">
                            {accountTitle}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400 shrink-0">Account No:</span>
                        <span className="font-mono font-bold text-slate-800 truncate text-right">
                          {acctNumber}
                        </span>
                      </div>
                      {b.iban && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 shrink-0">IBAN:</span>
                          <span className="font-mono font-bold text-slate-800 truncate text-right">
                            {b.iban}
                          </span>
                        </div>
                      )}
                      {swiftVal && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 shrink-0">SWIFT / BIC:</span>
                          <span className="font-mono font-semibold text-slate-800 truncate text-right">
                            {swiftVal}
                          </span>
                        </div>
                      )}
                      {branchVal && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400 shrink-0">Branch:</span>
                          <span className="font-medium text-slate-800 truncate text-right">
                            {branchVal}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
              <p className="text-xs text-slate-500">No remittance bank accounts configured yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          PILLAR 3: QUOTATION TEMPLATE PRESETS MANAGER (NON-DESTRUCTIVE + DEFAULT)
         ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">3. Quotation Presets</h3>
              <p className="text-xs text-slate-500">
                Create and manage distinct design and commercial templates (including sister-company branding).
              </p>
            </div>
          </div>
          {isAdmin && !showAddPreset && (
            <button
              type="button"
              onClick={() => {
                setEditingPresetId(null);
                setPresetForm({
                  preset_name: '',
                  default_tax_mode: 'taxes_extra',
                  default_price_basis: 'Ex-Works / Delivered Site',
                  default_payment_terms: '100% Advance / Approved Credit',
                  default_validity_days: 30,
                  signatory_mode: 'single',
                  amount_in_words_enabled: true,
                  visible_columns: {
                    brand: true,
                    model: true,
                    origin: true,
                    availability: true,
                    unit_price: true,
                    showUnitPrice: true,
                    showUom: true,
                    showItemAttributes: true
                  }
                });
                setShowAddPreset(true);
              }}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl transition flex items-center space-x-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Preset</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {showAddPreset && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 animate-in fade-in duration-100">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800">
                  {editingPresetId
                    ? 'Edit Quotation Preset (Preserves Studio Layout Blocks & Branding)'
                    : 'Configure New Quotation Preset'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddPreset(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Preset Name *</label>
                  <input
                    type="text"
                    value={presetForm.preset_name || ''}
                    onChange={(e) => setPresetForm({ ...presetForm, preset_name: e.target.value })}
                    placeholder="e.g. Standard Chemical Offer / Technical Proposal"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Default Tax Mode</label>
                  <select
                    value={presetForm.default_tax_mode || 'taxes_extra'}
                    onChange={(e) =>
                      setPresetForm({
                        ...presetForm,
                        default_tax_mode: e.target.value as QuotationTaxMode
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="taxes_extra">Taxes Extra (5% Add-on)</option>
                    <option value="tax_calculated">Inclusive (Tax in Price)</option>
                    <option value="tax_exempt">Tax Exempt (0%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Default Price Basis</label>
                  <input
                    type="text"
                    value={presetForm.default_price_basis || ''}
                    onChange={(e) =>
                      setPresetForm({ ...presetForm, default_price_basis: e.target.value })
                    }
                    placeholder="e.g. Ex-Works Dubai / Delivered Site"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Default Payment Terms</label>
                  <input
                    type="text"
                    value={presetForm.default_payment_terms || ''}
                    onChange={(e) =>
                      setPresetForm({ ...presetForm, default_payment_terms: e.target.value })
                    }
                    placeholder="e.g. 100% Advance Against PI"
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    value={presetForm.default_validity_days || 30}
                    onChange={(e) =>
                      setPresetForm({
                        ...presetForm,
                        default_validity_days: Number(e.target.value) || 30
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Signatory Mode</label>
                  <select
                    value={presetForm.signatory_mode || 'single'}
                    onChange={(e) =>
                      setPresetForm({
                        ...presetForm,
                        signatory_mode: e.target.value as QuotationSignatoryMode
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-2 bg-white"
                  >
                    <option value="single">Single Signatory (Deal Owner)</option>
                    <option value="dual">Dual Signatory (Owner + Manager)</option>
                    <option value="stamp_only">Company Seal Only</option>
                    <option value="none">None / Plain Document</option>
                  </select>
                </div>

                <div className="col-span-2 pt-2 border-t border-slate-200">
                  <label className="block text-slate-600 font-bold mb-2">
                    Visible Table Columns & Document Options
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {Object.entries({
                      brand: 'Brand / Make',
                      model: 'Model / Part #',
                      origin: 'Country of Origin',
                      availability: 'Delivery Time',
                      unit_price: 'Unit Price',
                      showUom: 'Unit (UOM)',
                      showItemAttributes: 'Technical Specs'
                    }).map(([colKey, colLabel]) => (
                      <label
                        key={colKey}
                        className="flex items-center space-x-2 select-none cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={(presetForm.visible_columns as any)?.[colKey] ?? true}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPresetForm({
                              ...presetForm,
                              visible_columns: {
                                ...presetForm.visible_columns,
                                [colKey]: checked,
                                ...(colKey === 'unit_price' ? { showUnitPrice: checked } : {})
                              }
                            });
                          }}
                          className="rounded border-slate-300 text-purple-600"
                        />
                        <span className="text-slate-700">{colLabel}</span>
                      </label>
                    ))}

                    <label className="flex items-center space-x-2 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={presetForm.amount_in_words_enabled ?? true}
                        onChange={(e) =>
                          setPresetForm({
                            ...presetForm,
                            amount_in_words_enabled: e.target.checked
                          })
                        }
                        className="rounded border-slate-300 text-purple-600"
                      />
                      <span className="text-slate-700">Amount in Words</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddPreset(false)}
                  className="px-3.5 py-2 border border-slate-300 text-slate-600 rounded-lg text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save Preset
                </button>
              </div>
            </div>
          )}

          {presets.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                    p.is_default
                      ? 'border-purple-300 bg-purple-50/30 shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-purple-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-900">{p.preset_name}</h4>
                        {p.is_default && (
                          <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-extrabold rounded-md flex items-center gap-1">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            <span>DEFAULT</span>
                          </span>
                        )}
                        {p.layout_blocks && p.layout_blocks.length > 0 && (
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded">
                            {p.layout_blocks.length} Studio Blocks
                          </span>
                        )}
                      </div>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold rounded-md">
                        {p.default_tax_mode === 'taxes_extra'
                          ? 'Taxes Extra (5%)'
                          : p.default_tax_mode === 'tax_calculated'
                          ? 'Tax Inclusive'
                          : 'Tax Exempt'}
                      </span>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center space-x-1">
                        {!p.is_default && p.id && (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultPreset(p.id!)}
                            className="px-2 py-1 text-[10px] font-bold text-purple-700 hover:bg-purple-100 rounded-lg transition flex items-center gap-1 cursor-pointer"
                          >
                            <Star className="w-3 h-3" />
                            <span>Set Default</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPresetId(p.id || null);
                            setPresetForm({
                              ...p,
                              visible_columns: {
                                brand: p.visible_columns?.brand ?? true,
                                model: p.visible_columns?.model ?? true,
                                origin: p.visible_columns?.origin ?? true,
                                availability: p.visible_columns?.availability ?? true,
                                unit_price:
                                  p.visible_columns?.unit_price ??
                                  p.visible_columns?.showUnitPrice ??
                                  true,
                                showUnitPrice:
                                  p.visible_columns?.showUnitPrice ??
                                  p.visible_columns?.unit_price ??
                                  true,
                                showUom: p.visible_columns?.showUom ?? true,
                                showItemAttributes: p.visible_columns?.showItemAttributes ?? true
                              }
                            });
                            setShowAddPreset(true);
                          }}
                          className="p-1 text-slate-400 hover:text-purple-600 rounded transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => p.id && handleDeletePreset(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Price Basis:</span>
                      <span className="font-semibold text-slate-800">{p.default_price_basis}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Payment:</span>
                      <span className="font-semibold text-slate-800">{p.default_payment_terms}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Validity:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {p.default_validity_days} Days
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
              <p className="text-xs text-slate-500">No custom quotation presets created yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          PILLAR 4: INTERACTIVE QUOTATION SANDBOX & DUMMY DATA SIMULATOR
         ========================================================================= */}
      <div className="bg-white rounded-2xl border-2 border-indigo-200/80 shadow-sm overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold tracking-tight text-white">
                  4. Live Quotation Preview
                </h3>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold rounded-md">
                  REAL-TIME A4
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Preview your presets and sample items or open Quotation Studio to customize layout &amp; design.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsFullStudioSandboxOpen(true)}
            className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Open in Quotation Studio</span>
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-6 space-y-6 bg-slate-50/70">
          {/* Row 1: 3 Sample Quote Templates + Active Preset Preview Selector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end bg-white p-4 rounded-xl border border-slate-200">
            <div className="lg:col-span-8">
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                Sample Quote Templates
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectScenario('standard_2')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-left transition cursor-pointer ${
                    sandboxScenario === 'standard_2'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="font-extrabold">⚡ Standard 2-Item Quote</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      sandboxScenario === 'standard_2' ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    Single-page RO membrane & pump offer
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectScenario('tender_8')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-left transition cursor-pointer ${
                    sandboxScenario === 'tender_8'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="font-extrabold">📦 8-Item Multi-Page Tender</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      sandboxScenario === 'tender_8' ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    Multi-page schedule + manual page break
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectScenario('turnkey_annex')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-bold text-left transition cursor-pointer ${
                    sandboxScenario === 'turnkey_annex'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="font-extrabold">🏢 High-Value Turnkey + Annex</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      sandboxScenario === 'turnkey_annex' ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    250 m³/d RO skid + freight + Annex flyer
                  </div>
                </button>
              </div>
            </div>

            <div className="lg:col-span-4">
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                Active Preset Preview Selector
              </label>
              <select
                value={sandboxPresetId}
                onChange={(e) => setSandboxPresetId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 bg-white text-xs font-bold text-slate-800"
              >
                <option value="__unsaved_profile__">
                  ✨ Current Unsaved Profile Defaults (Live Form State)
                </option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    📋 Preset: {p.preset_name} {p.is_default ? '(★ Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Interactive Dummy Line-Item Controls */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-extrabold text-slate-800">
                  Sample Line Items ({sandboxItems.length} Items • Grand Total:{' '}
                  {sandboxQuotation.currency} {sandboxQuotation.grand_total.toLocaleString()})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddPoolDummyItem}
                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Dummy Item</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomItemForm((prev) => !prev)}
                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Custom Item</span>
                </button>
                <button
                  type="button"
                  onClick={handleRandomizePrices}
                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Randomize Prices</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDummyItems}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Dummy Items</span>
                </button>
              </div>
            </div>

            {/* Inline Quick-Entry Form for Custom Dummy Item */}
            {showCustomItemForm && (
              <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 grid grid-cols-1 sm:grid-cols-6 gap-2.5 text-xs items-end">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Item Description *
                  </label>
                  <input
                    type="text"
                    value={customDummyItem.item_name}
                    onChange={(e) =>
                      setCustomDummyItem({ ...customDummyItem, item_name: e.target.value })
                    }
                    placeholder="e.g. Digital Dosing Skid 50 L/h"
                    className="w-full rounded-lg border border-slate-300 p-1.5 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Brand / Origin
                  </label>
                  <input
                    type="text"
                    value={customDummyItem.brand}
                    onChange={(e) =>
                      setCustomDummyItem({ ...customDummyItem, brand: e.target.value })
                    }
                    placeholder="Grundfos"
                    className="w-full rounded-lg border border-slate-300 p-1.5 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={customDummyItem.quantity}
                    onChange={(e) =>
                      setCustomDummyItem({
                        ...customDummyItem,
                        quantity: Number(e.target.value) || 1
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-1.5 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Unit Price
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={customDummyItem.unit_price}
                    onChange={(e) =>
                      setCustomDummyItem({
                        ...customDummyItem,
                        unit_price: Number(e.target.value) || 0
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 p-1.5 bg-white font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAddCustomDummyItem}
                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Add Item
                  </button>
                </div>
              </div>
            )}

            {/* Compact Interactive Dummy Items Table */}
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs">
              {sandboxItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-slate-800">{item.item_name}</span>
                      <span className="text-[10px] text-slate-400 ml-2">
                        ({item.brand} • {item.origin})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Qty:</span>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateSandboxItem(item.id, {
                            quantity: Number(e.target.value) || 1
                          })
                        }
                        className="w-14 rounded border border-slate-200 px-1.5 py-1 font-mono text-right text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Price:</span>
                      <input
                        type="number"
                        min={0}
                        value={item.unit_price}
                        onChange={(e) =>
                          handleUpdateSandboxItem(item.id, {
                            unit_price: Number(e.target.value) || 0
                          })
                        }
                        className="w-24 rounded border border-slate-200 px-1.5 py-1 font-mono text-right text-xs"
                      />
                    </div>

                    <button
                      type="button"
                      title="Toggle Manual Page Break After Item"
                      onClick={() =>
                        handleUpdateSandboxItem(item.id, {
                          page_break_after: !item.page_break_after
                        })
                      }
                      className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer ${
                        item.page_break_after
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Scissors className="w-3 h-3" />
                      <span>{item.page_break_after ? 'Page Break ON' : 'Break'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveSandboxItem(item.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Live A4 QuotationDocument Canvas */}
          <div className="bg-slate-800/95 rounded-2xl p-4 sm:p-6 overflow-x-auto border border-slate-700 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-white">Live A4 Document Render Preview</span>
                <span className="text-slate-400">
                  — Reflecting {sandboxPresetId === '__unsaved_profile__' ? 'Unsaved Profile Form State' : `Preset "${activeSandboxPreset?.preset_name}"`}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFullStudioSandboxOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer shadow-sm"
                >
                  Open in Quotation Studio →
                </button>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="origin-top scale-[0.75] sm:scale-[0.85] xl:scale-[0.95] transition-transform">
                <QuotationDocument
                  quotation={sandboxQuotation}
                  profile={liveSandboxProfile}
                  onSelectSection={() => setIsFullStudioSandboxOpen(true)}
                  onInlineFieldEdit={(fieldKey, nextValue) => {
                    if (fieldKey === 'primary_signatory_name') setPrimarySignatoryName(nextValue);
                    else if (fieldKey === 'primary_signatory_title') setPrimarySignatoryTitle(nextValue);
                    else if (fieldKey === 'secondary_signatory_name') setSecondarySignatoryName(nextValue);
                    else if (fieldKey === 'secondary_signatory_title') setSecondarySignatoryTitle(nextValue);
                    else if (fieldKey === 'header_field:trn') setTrn(nextValue);
                    else if (fieldKey === 'header_field:phone') setPhone(nextValue);
                    else if (fieldKey === 'header_field:email') setEmail(nextValue);
                    else if (fieldKey === 'header_field:website') setWebsite(nextValue);
                    else if (fieldKey === 'header_field:address') setAddressLine1(nextValue);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full 3-Pane Quotation Studio Sandbox Modal */}
      {isFullStudioSandboxOpen && (
        <QuotationStudioModal
          isOpen={isFullStudioSandboxOpen}
          onClose={() => setIsFullStudioSandboxOpen(false)}
          enquiry={sandboxEnquiry}
          editingQuotation={sandboxQuotation}
          profile={liveSandboxProfile}
          activeWorkspaceId={workspaceId}
          user={user}
          isSandboxMode={true}
          initialPresetId={
            sandboxPresetId !== '__unsaved_profile__' ? sandboxPresetId : undefined
          }
          salespersonName={primarySignatoryName || user?.displayName || 'Commercial Director'}
          triggerToast={triggerToast}
          onProfileAndPresetSaved={(savedProfile, savedPreset) => {
            setRawProfileSnapshot(savedProfile);
            if (savedProfile.id) setProfileId(savedProfile.id);
            if (savedProfile.legal_entity_name) setLegalEntityName(savedProfile.legal_entity_name);
            const nextTrn = savedProfile.trn ?? (savedProfile as any).tax_registration_number;
            if (nextTrn !== undefined) {
              setTrn(nextTrn || '');
            }
            if (savedProfile.address_line_1 !== undefined) setAddressLine1(savedProfile.address_line_1 || '');
            if (savedProfile.address_line_2 !== undefined) setAddressLine2(savedProfile.address_line_2 || '');
            if (savedProfile.city !== undefined) setCity(savedProfile.city || '');
            if (savedProfile.country !== undefined) setCountry(savedProfile.country || '');
            if (savedProfile.phone !== undefined) setPhone(savedProfile.phone || '');
            if (savedProfile.email !== undefined) setEmail(savedProfile.email || '');
            if (savedProfile.website !== undefined) setWebsite(savedProfile.website || '');
            if (savedProfile.logo_url !== undefined) setLogoUrl(savedProfile.logo_url || '');
            if (savedProfile.company_seal_url !== undefined || savedProfile.stamp_seal_url !== undefined) {
              setStampSealUrl(savedProfile.company_seal_url || savedProfile.stamp_seal_url || '');
            }
            if (savedProfile.signature_image_url !== undefined) {
              setSignatureImageUrl(savedProfile.signature_image_url || '');
            }
            if (savedProfile.theme_accent) setThemeAccent(savedProfile.theme_accent as ThemeAccentKey);
            if (savedProfile.customThemeColor !== undefined) {
              setCustomThemeColor(savedProfile.customThemeColor || '');
            }
            if (savedProfile.block_style) setBlockStyle(savedProfile.block_style);
            if (savedProfile.globalCardRadius) setGlobalCardRadius(savedProfile.globalCardRadius);
            if (savedProfile.fontSizeScale) setFontSizeScale(savedProfile.fontSizeScale);
            if (savedProfile.table_density) setTableDensity(savedProfile.table_density);
            if (savedProfile.header_config?.logoDisplayMode) {
              setLogoDisplayMode(savedProfile.header_config.logoDisplayMode);
            }
            if (savedProfile.header_config?.headerLayoutMode) {
              setHeaderLayoutMode(savedProfile.header_config.headerLayoutMode);
            }
            if (savedProfile.header_config?.logoHeightPx) {
              setLogoHeightPx(savedProfile.header_config.logoHeightPx);
            }
            if (savedProfile.header_config?.showLogoOnContinuationPages !== undefined) {
              setShowLogoOnContinuationPages(savedProfile.header_config.showLogoOnContinuationPages);
            }
            if (savedProfile.signatory_type) setSignatoryType(savedProfile.signatory_type);
            if (savedProfile.signature_style) setSignatureStyle(savedProfile.signature_style);
            if (savedProfile.primary_signatory_name) setPrimarySignatoryName(savedProfile.primary_signatory_name);
            if (savedProfile.primary_signatory_title) setPrimarySignatoryTitle(savedProfile.primary_signatory_title);
            if (savedProfile.secondary_signatory_name) setSecondarySignatoryName(savedProfile.secondary_signatory_name);
            if (savedProfile.secondary_signatory_title) setSecondarySignatoryTitle(savedProfile.secondary_signatory_title);
            if (savedProfile.show_company_seal !== undefined) setShowCompanySeal(savedProfile.show_company_seal);
            if (savedProfile.customer_acceptance_enabled !== undefined) {
              setCustomerAcceptanceEnabled(savedProfile.customer_acceptance_enabled);
            }
            if (savedProfile.amount_in_words_enabled !== undefined) {
              setAmountInWordsEnabled(savedProfile.amount_in_words_enabled);
            }
            if (savedPreset) {
              setPresets((prev) =>
                QuotationRepository.applyPresetUpdateInList(prev, savedPreset)
              );
              if (savedPreset.id) setSandboxPresetId(savedPreset.id);
            } else {
              QuotationRepository.getPresets(workspaceId)
                .then((refreshed) => setPresets(refreshed))
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
};

export default WorkspaceDocumentProfileSettings;
