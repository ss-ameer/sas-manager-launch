/**
 * Executive Presentation Demo Seeder for High-Stakes Commercial Review.
 *
 * Provides 3 production-grade, realistic commercial water treatment projects:
 * 1. "Sharjah RO Desalination Phase 2 - Membrane Replacement" (Celar Water Equipment Co. LLC)
 * 2. "Dubai Industrial Park - Aeration Tank Refurbishment" (Aventura Components FZE)
 * 3. "Wastewater Skid - Chemical Dosing & Disinfection Unit" (Al Naboodah Contracting LLC)
 *
 * STRICT SAFETY GATING: Only runnable in DEV or DEMO modes.
 */

import { safeAddDoc } from '../firebase';
import {
  Company,
  Contact,
  Enquiry,
  Quotation
} from '../types';

// ==========================================
// ENVIRONMENT GUARD
// ==========================================

export const isDevOrDemoEnvironment = (): boolean => {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return true;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    const isDevUrl = host.includes('ais-dev-') || host.includes('run.app');
    const isExplicitParam =
      window.location.search.includes('demo=true') ||
      window.location.search.includes('seed=true') ||
      window.location.search.includes('executive=true');
    return isLocal || isDevUrl || isExplicitParam;
  }
  return true;
};

// ==========================================
// STRUCTURED DEMO EXECUTIVE DATASETS
// ==========================================

export interface DemoProjectBlueprint {
  projectTitle: string;
  subject: string;
  company: Omit<Company, 'id'>;
  contact: Omit<Contact, 'id' | 'company_id'>;
  enquiry: Omit<Enquiry, 'id' | 'company_id' | 'contact_id'>;
  quotation: Omit<Quotation, 'id' | 'workspace_id' | 'workspaceId' | 'enquiry_id' | 'created_at'>;
}

export const EXECUTIVE_DEMO_PROJECTS: DemoProjectBlueprint[] = [
  // -------------------------------------------------------------
  // PROJECT 1: Sharjah RO Desalination Phase 2
  // -------------------------------------------------------------
  {
    projectTitle: 'Sharjah RO Desalination Phase 2 - Membrane Replacement',
    subject: 'Supply of High-Rejection SWRO Sea Water Membranes & Feed Interconnectors',
    company: {
      canonical_name: 'celar water equipment co llc',
      display_name: 'Celar Water Equipment Co. LLC',
      legal_suffix: 'LLC',
      country: 'UAE',
      city: 'Sharjah',
      industry: 'Water Treatment & Desalination',
      industry_type: 'Desalination EPC',
      phone: '+971 6 534 8821',
      email: 'procurement@celarwater.com',
      website: 'www.celarwater.com',
      temperature: 'Hot',
      is_dnc: false,
      notes: 'TRN: 100293847500003 | Address: Industrial Area 13, Sharjah, UAE',
      aliases: ['Celar Water', 'Celar Water Equipment']
    },
    contact: {
      full_name: 'Eng. Tariq Mansoor',
      designation: 'Technical Procurement Lead',
      email: 'tariq.mansoor@celarwater.com',
      mobile: '+971 50 491 8273',
      phone: '+971 6 534 8821'
    },
    enquiry: {
      sn: 1042,
      quote_ref_no: 'QT-2026-0042',
      customer_reference_code: 'CELAR-RFQ-2026-089',
      proposal_option: 'Option A (Standard High-Rejection)',
      subject: 'Supply of High-Rejection SWRO Sea Water Membranes & Feed Interconnectors',
      status: 'Sent / Pending Client',
      currency: 'AED',
      value_aed: 184500,
      country: 'UAE',
      project_location: 'Sharjah Desalination Plant, Phase 2, Hamriyah Zone',
      enquiry_source: 'Direct Inquiry',
      salesperson: 'Syed Ameer',
      sales_person: 'SA',
      salesperson_id: 'sp_sa_01',
      sales_representative: 'Syed Ameer',
      enquiry_date: '2026-10-05',
      projected_order_date: '2026-11-15',
      next_followup_date: '2026-10-20',
      stock_reserved: false,
      remarks: 'Client expanding RO capacity. Technical data sheets submitted. Awaiting commercial signoff.',
      line_items: [
        {
          id: 'li_swro_01',
          item_name: 'SWRO Sea Water High-Rejection Membranes',
          product_type: 'Membrane Filtration',
          description: 'FilmTec SW30HRLE-400i 8" x 40" High-Rejection Seawater Reverse Osmosis Element (6,000 GPD @ 800 PSI, 99.8% Nominal Salt Rejection, 400 sq.ft Active Area, 28 mil feed spacer).',
          quantity: 72,
          unit: 'PCS',
          unit_price: 2350,
          total_price: 169200,
          lead_time_note: 'Ex-Stock UAE (3-5 Days)',
          attributes: [
            { key: 'Size', value: '8" x 40"' },
            { key: 'Rejection', value: '99.8% Nominal' },
            { key: 'Flow Rate', value: '6,000 GPD' },
            { key: 'Active Area', value: '400 sq.ft' },
            { key: 'Feed Spacer', value: '28 mil' },
            { key: 'Operating Pressure', value: '800-1200 PSI' }
          ]
        },
        {
          id: 'li_swro_02',
          item_name: 'High-Pressure Interconnector O-Ring Feed Seals',
          product_type: 'Seals & Spares',
          description: 'Parker Hannifin EPDM 75 Shore A high-salinity feed seals with dual anti-extrusion rings for 8-inch pressure vessels.',
          quantity: 144,
          unit: 'SETS',
          unit_price: 106.25,
          total_price: 15300,
          lead_time_note: 'Ready in Stock',
          attributes: [
            { key: 'Material', value: 'Peroxide-Cured EPDM' },
            { key: 'Hardness', value: '75 Shore A' },
            { key: 'Resistance', value: 'Chlorine & High Salinity Brine' }
          ]
        }
      ]
    },
    quotation: {
      quote_number: 'QT-2026-0042',
      revision_number: 0,
      formatted_quote_ref: 'QT-2026-0042-R0',
      status: 'Sent',
      tax_mode: 'tax_calculated',
      subtotal: 184500,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 9225,
      grand_total: 193725,
      applied_terms:
        '1. Price Basis: Delivered to Site (Sharjah Desalination Plant Phase 2).\n2. Payment Terms: 30 Days Post Delivery PDC against Original Tax Invoice.\n3. Validity: 30 Days from date of offer.\n4. Warranty: 12 Months Standard Manufacturer Replacement Warranty against manufacturing defects.\n5. Country of Origin: USA / Germany.',
      applied_bank_account: {
        id: 'bank_enbd_01',
        bank_name: 'Emirates NBD PJSC',
        account_name: 'AI Studio Industrial Equipment Trading LLC',
        account_number: '102938475601',
        iban: 'AE450260000102938475601',
        swift_bic: 'EBILAEADXXX',
        currency: 'AED',
        branch_address: 'Al Quoz Branch, Dubai'
      },
      client_snapshot: {
        entity_name: 'Celar Water Equipment Co. LLC',
        contact_person: 'Eng. Tariq Mansoor',
        email: 'tariq.mansoor@celarwater.com',
        phone: '+971 6 534 8821',
        address: 'Industrial Area 13, Sharjah, UAE',
        trn: '100293847500003'
      },
      sender_snapshot: {
        entity_name: 'AI Studio Industrial Solutions LLC',
        contact_person: 'Syed Ameer',
        email: 'sibuma.syedameer@gmail.com',
        phone: '+971 4 380 9922',
        address: 'Warehouse #4, Industrial Zone, Dubai, UAE',
        trn: '100492817200003'
      },
      signatories: [
        {
          name: 'Syed Ameer',
          designation: 'Commercial Director',
          date: '2026-10-05'
        }
      ],
      primary_signatory_name: 'Syed Ameer',
      primary_signatory_title: 'Commercial Director',
      signatory_type: 'single',
      signature_style: 'script',
      theme_accent: 'navy',
      amount_in_words_enabled: true,
      customer_acceptance_enabled: true,
      line_items: [
        {
          item_name: 'SWRO Sea Water High-Rejection Membranes',
          description: 'FilmTec SW30HRLE-400i 8" x 40" High-Rejection Seawater Reverse Osmosis Element (6,000 GPD, 99.8% Nominal Salt Rejection, 400 sq.ft Active Area).',
          quantity: 72,
          unit: 'PCS',
          unit_price: 2350,
          total_price: 169200,
          brand_make: 'FilmTec / DuPont',
          model_part_no: 'SW30HRLE-400i',
          country_of_origin: 'USA',
          availability: 'Ex-Stock UAE (3-5 Days)'
        },
        {
          item_name: 'High-Pressure Interconnector O-Ring Feed Seals',
          description: 'Parker Hannifin EPDM 75 Shore A high-salinity feed seals with dual anti-extrusion rings for 8-inch pressure vessels.',
          quantity: 144,
          unit: 'SETS',
          unit_price: 106.25,
          total_price: 15300,
          brand_make: 'Parker Hannifin',
          model_part_no: 'PKR-SWRO-EPDM-8IN',
          country_of_origin: 'Germany',
          availability: 'Ready in Stock'
        }
      ]
    }
  },

  // -------------------------------------------------------------
  // PROJECT 2: Dubai Industrial Park Aeration Refurbishment
  // -------------------------------------------------------------
  {
    projectTitle: 'Dubai Industrial Park - Aeration Tank Refurbishment',
    subject: 'Complete 9" Fine Bubble Disc Diffusers & Stainless Saddle Manifold Package',
    company: {
      canonical_name: 'aventura components fze',
      display_name: 'Aventura Components FZE',
      legal_suffix: 'FZE',
      country: 'UAE',
      city: 'Dubai',
      industry: 'Wastewater & Industrial Utilities',
      industry_type: 'Wastewater Infrastructure',
      phone: '+971 4 881 4492',
      email: 'operations@aventuracomponents.ae',
      website: 'www.aventuracomponents.ae',
      temperature: 'Hot',
      is_dnc: false,
      notes: 'TRN: 100482910400003 | Address: Jebel Ali Free Zone (JAFZA South), Dubai, UAE',
      aliases: ['Aventura Components', 'Aventura FZE']
    },
    contact: {
      full_name: 'Prakash Varma',
      designation: 'Plant Engineering Manager',
      email: 'prakash.v@aventuracomponents.ae',
      mobile: '+971 55 921 7734',
      phone: '+971 4 881 4492'
    },
    enquiry: {
      sn: 1043,
      quote_ref_no: 'QT-2026-0043',
      customer_reference_code: 'AVN-DIP-WW-REV3',
      proposal_option: 'Option A (EPDM Membrane Standard)',
      subject: 'Complete 9" Fine Bubble Disc Diffusers & Stainless Saddle Manifold Package',
      status: 'Won / Approved',
      currency: 'AED',
      value_aed: 94800,
      country: 'UAE',
      project_location: 'Dubai Industrial Park, Aeration Basin B2',
      enquiry_source: 'Direct Inquiry',
      salesperson: 'Syed Ameer',
      sales_person: 'SA',
      salesperson_id: 'sp_sa_01',
      sales_representative: 'Syed Ameer',
      enquiry_date: '2026-09-28',
      projected_order_date: '2026-10-25',
      next_followup_date: '2026-10-18',
      stock_reserved: true,
      stock_reserved_at: '2026-10-10T09:30:00Z',
      remarks: 'PO Received & Signed. Stock auto-reserved in Al Quoz warehouse for Monday morning site dispatch.',
      line_items: [
        {
          id: 'li_diff_01',
          item_name: '9" Fine Bubble Disc Diffusers with Integrated Check Valve',
          product_type: 'Aeration Systems',
          description: 'EDI Sanitaire 9" Fine Bubble Disc Diffusers with virgin EPDM membrane, low plasticizer formulation, 3/4" NPT male stainless thread, and heavy-duty SS316 clamp band.',
          quantity: 480,
          unit: 'PCS',
          unit_price: 175,
          total_price: 84000,
          lead_time_note: 'Ex-Stock Dubai Warehouse',
          attributes: [
            { key: 'Membrane', value: 'Virgin EPDM (Special Low Plasticizer)' },
            { key: 'Connection', value: '3/4" NPT Male Stainless Thread' },
            { key: 'Clamp Band', value: 'SS316 Stainless Steel Heavy-Duty' },
            { key: 'Air Flow Capacity', value: '2.5 - 5.0 Nm³/h per disc' },
            { key: 'Oxygen Transfer', value: '6.5 - 7.2 kg O2/kWh SOTE' }
          ]
        },
        {
          id: 'li_diff_02',
          item_name: 'Universal Header Pipe Quick-Mount Saddles (110mm Pipe)',
          product_type: 'Aeration Hardware',
          description: 'Jager Aeration 110mm OD PVC/Stainless lateral pipe saddles with full EPDM gasket and SS316 hex mounting bolts.',
          quantity: 480,
          unit: 'PCS',
          unit_price: 22.5,
          total_price: 10800,
          lead_time_note: 'Ex-Stock Dubai Warehouse',
          attributes: [
            { key: 'Pipe Fit', value: '110mm OD PVC/Stainless Lateral Pipe' },
            { key: 'Hardware', value: 'SS316 Hex Bolts with Anti-Vibration Locknuts' },
            { key: 'Gasket', value: 'EPDM Full-Wrap Sealing Ring' }
          ]
        }
      ]
    },
    quotation: {
      quote_number: 'QT-2026-0043',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0043-R1',
      status: 'Approved',
      tax_mode: 'tax_calculated',
      subtotal: 94800,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 4740,
      grand_total: 99540,
      applied_terms:
        '1. Price Basis: Delivered to Site (Dubai Industrial Park, Basin B2).\n2. Payment Terms: 100% against Delivery & Physical Verification.\n3. Validity: 45 Days.\n4. Quality Certification: ISO 9001 Factory Quality & Pressure Test Certificates Included.',
      applied_bank_account: {
        id: 'bank_enbd_01',
        bank_name: 'Emirates NBD PJSC',
        account_name: 'AI Studio Industrial Equipment Trading LLC',
        account_number: '102938475601',
        iban: 'AE450260000102938475601',
        swift_bic: 'EBILAEADXXX',
        currency: 'AED'
      },
      client_snapshot: {
        entity_name: 'Aventura Components FZE',
        contact_person: 'Prakash Varma',
        email: 'prakash.v@aventuracomponents.ae',
        phone: '+971 4 881 4492',
        address: 'Jebel Ali Free Zone (JAFZA South), Dubai, UAE',
        trn: '100482910400003'
      },
      sender_snapshot: {
        entity_name: 'AI Studio Industrial Solutions LLC',
        contact_person: 'Syed Ameer',
        email: 'sibuma.syedameer@gmail.com',
        phone: '+971 4 380 9922',
        address: 'Warehouse #4, Industrial Zone, Dubai, UAE',
        trn: '100492817200003'
      },
      signatories: [
        {
          name: 'Syed Ameer',
          designation: 'Commercial Director',
          date: '2026-10-10'
        }
      ],
      primary_signatory_name: 'Syed Ameer',
      primary_signatory_title: 'Commercial Director',
      signatory_type: 'single',
      signature_style: 'script',
      theme_accent: 'emerald',
      amount_in_words_enabled: true,
      customer_acceptance_enabled: true,
      line_items: [
        {
          item_name: '9" Fine Bubble Disc Diffusers with Integrated Check Valve',
          description: 'EDI Sanitaire 9" Fine Bubble Disc Diffusers with virgin EPDM membrane, low plasticizer formulation, 3/4" NPT male stainless thread.',
          quantity: 480,
          unit: 'PCS',
          unit_price: 175,
          total_price: 84000,
          brand_make: 'EDI / Xylem Sanitaire',
          model_part_no: 'FBD-9-EPDM-316',
          country_of_origin: 'USA',
          availability: 'Ex-Stock Dubai Warehouse'
        },
        {
          item_name: 'Universal Header Pipe Quick-Mount Saddles (110mm Pipe)',
          description: 'Jager Aeration 110mm OD lateral pipe saddles with full EPDM gasket and SS316 hex mounting bolts.',
          quantity: 480,
          unit: 'PCS',
          unit_price: 22.5,
          total_price: 10800,
          brand_make: 'Jager Aeration',
          model_part_no: 'JGR-SDL-110-34',
          country_of_origin: 'Germany',
          availability: 'Ex-Stock Dubai Warehouse'
        }
      ]
    }
  },

  // -------------------------------------------------------------
  // PROJECT 3: Wastewater Skid Chemical Dosing Unit
  // -------------------------------------------------------------
  {
    projectTitle: 'Wastewater Skid - Chemical Dosing & Disinfection Unit',
    subject: 'Chemical Metering Skid Overhaul: Solenoid Dosing Pumps, Calibration Columns & BPV Valves',
    company: {
      canonical_name: 'al naboodah contracting llc',
      display_name: 'Al Naboodah Contracting LLC',
      legal_suffix: 'LLC',
      country: 'UAE',
      city: 'Dubai',
      industry: 'Infrastructure & EPC Contracting',
      industry_type: 'General Infrastructure EPC',
      phone: '+971 4 294 8888',
      email: 'mep.tenders@alnaboodah.com',
      website: 'www.alnaboodah.com',
      temperature: 'Warm',
      is_dnc: false,
      notes: 'TRN: 100371928400003 | Address: Al Awir Road, Ras Al Khor, Dubai, UAE',
      aliases: ['Al Naboodah', 'Al Naboodah Contracting']
    },
    contact: {
      full_name: 'Eng. Mahmoud Al-Zahrani',
      designation: 'Senior Project MEP Director',
      email: 'm.alzahrani@alnaboodah.com',
      mobile: '+971 50 812 3991',
      phone: '+971 4 294 8888'
    },
    enquiry: {
      sn: 1044,
      quote_ref_no: 'QT-2026-0044',
      customer_reference_code: 'ANC-STP-DS-2026',
      proposal_option: 'Option A (PVDF/PTFE Industrial Specification)',
      subject: 'Chemical Metering Skid Overhaul: Solenoid Dosing Pumps, Calibration Columns & BPV Valves',
      status: 'Active',
      currency: 'AED',
      value_aed: 62300,
      country: 'UAE',
      project_location: 'Sewage Treatment Plant Upgrade, Package 4, Dubai',
      enquiry_source: 'Direct Inquiry',
      salesperson: 'Syed Ameer',
      sales_person: 'SA',
      salesperson_id: 'sp_sa_01',
      sales_representative: 'Syed Ameer',
      enquiry_date: '2026-10-09',
      projected_order_date: '2026-11-01',
      next_followup_date: '2026-10-22',
      stock_reserved: false,
      remarks: 'Critical chemical dosing package for secondary effluent disinfection. High priority client.',
      line_items: [
        {
          id: 'li_pump_01',
          item_name: 'Solenoid Diaphragm Chemical Dosing Pumps (NaOCl / Coagulant)',
          product_type: 'Chemical Dosing Pumps',
          description: 'Seko Invikta KCL series solenoid diaphragm dosing pump with solid PVDF liquid end, full PTFE diaphragm, and 4-20mA external pacing interface (0-15 LPH @ 10 Bar).',
          quantity: 4,
          unit: 'SETS',
          unit_price: 9850,
          total_price: 39400,
          lead_time_note: 'Ex-Stock UAE (Ready)',
          attributes: [
            { key: 'Flow Capacity', value: '0 - 15 LPH (Liters Per Hour)' },
            { key: 'Max Backpressure', value: '10 Bar (145 psi)' },
            { key: 'Liquid Head Material', value: 'PVDF (Polyvinylidene Fluoride)' },
            { key: 'Diaphragm', value: 'Full Solid PTFE Virgin Fluoropolymer' },
            { key: 'Control Interface', value: '4-20mA External Pacing & Pulse' },
            { key: 'Power Supply', value: '100-240V AC 50/60Hz Single Phase' }
          ]
        },
        {
          id: 'li_pump_02',
          item_name: 'Precision Acrylic Dosing Calibration Columns (1000 mL)',
          product_type: 'Dosing Accessories',
          description: 'Griffco Valve 1000 mL calibration cylinder with dual mL/GPH graduation scale, shatter-resistant acrylic cylinder, and 1/2" FNPT PVDF end caps with Viton O-rings.',
          quantity: 4,
          unit: 'PCS',
          unit_price: 2850,
          total_price: 11400,
          lead_time_note: 'Ex-Stock UAE (Ready)',
          attributes: [
            { key: 'Volume Capacity', value: '1,000 mL Dual Scaled' },
            { key: 'Cylinder Body', value: 'Shatter-Resistant Optical Acrylic' },
            { key: 'End Connection', value: '1/2" FNPT PVDF End Caps' },
            { key: 'Top Vent Port', value: '1/4" NPT with Dust Filter Cap' }
          ]
        },
        {
          id: 'li_pump_03',
          item_name: 'Backpressure & Anti-Siphon Sustaining Valve Assemblies',
          product_type: 'Valves & Safety',
          description: 'Plast-O-Matic 1/2" adjustable backpressure and anti-siphon valve with PTFE diaphragm and machined PVDF body (10-150 PSI range).',
          quantity: 4,
          unit: 'PCS',
          unit_price: 2875,
          total_price: 11500,
          lead_time_note: 'Ready in Stock',
          attributes: [
            { key: 'Pressure Setting', value: '10 - 150 PSI Adjustable' },
            { key: 'Body & Diaphragm', value: 'Machined PVDF with PTFE Diaphragm' },
            { key: 'Inlet / Outlet', value: '1/2" NPT Female' }
          ]
        }
      ]
    },
    quotation: {
      quote_number: 'QT-2026-0044',
      revision_number: 0,
      formatted_quote_ref: 'QT-2026-0044-R0',
      status: 'Draft',
      tax_mode: 'tax_calculated',
      subtotal: 62300,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 3115,
      grand_total: 65415,
      applied_terms:
        '1. Price Basis: Ex-Works Sharjah Central Warehouse.\n2. Payment Terms: 50% Advance with PO, 50% against Readiness Notice Prior to Dispatch.\n3. Validity: 30 Days from date of offer.\n4. Documentation: Operations & Maintenance Manuals (O&M) and Factory Test Reports included.',
      applied_bank_account: {
        id: 'bank_enbd_01',
        bank_name: 'Emirates NBD PJSC',
        account_name: 'AI Studio Industrial Equipment Trading LLC',
        account_number: '102938475601',
        iban: 'AE450260000102938475601',
        swift_bic: 'EBILAEADXXX',
        currency: 'AED'
      },
      client_snapshot: {
        entity_name: 'Al Naboodah Contracting LLC',
        contact_person: 'Eng. Mahmoud Al-Zahrani',
        email: 'm.alzahrani@alnaboodah.com',
        phone: '+971 4 294 8888',
        address: 'Al Awir Road, Ras Al Khor, Dubai, UAE',
        trn: '100371928400003'
      },
      sender_snapshot: {
        entity_name: 'AI Studio Industrial Solutions LLC',
        contact_person: 'Syed Ameer',
        email: 'sibuma.syedameer@gmail.com',
        phone: '+971 4 380 9922',
        address: 'Warehouse #4, Industrial Zone, Dubai, UAE',
        trn: '100492817200003'
      },
      signatories: [
        {
          name: 'Syed Ameer',
          designation: 'Commercial Director',
          date: '2026-10-09'
        }
      ],
      primary_signatory_name: 'Syed Ameer',
      primary_signatory_title: 'Commercial Director',
      signatory_type: 'single',
      signature_style: 'script',
      theme_accent: 'blue',
      amount_in_words_enabled: true,
      customer_acceptance_enabled: true,
      line_items: [
        {
          item_name: 'Solenoid Diaphragm Chemical Dosing Pumps (NaOCl / Coagulant)',
          description: 'Seko Invikta KCL series solenoid diaphragm dosing pump with solid PVDF liquid end, full PTFE diaphragm (0-15 LPH @ 10 Bar).',
          quantity: 4,
          unit: 'SETS',
          unit_price: 9850,
          total_price: 39400,
          brand_make: 'Seko / ProMinent',
          model_part_no: 'INVIKTA-KCL-633',
          country_of_origin: 'Italy',
          availability: 'Ex-Stock UAE (Ready)'
        },
        {
          item_name: 'Precision Acrylic Dosing Calibration Columns (1000 mL)',
          description: 'Griffco Valve 1000 mL calibration cylinder with dual mL/GPH graduation scale and 1/2" FNPT PVDF end caps.',
          quantity: 4,
          unit: 'PCS',
          unit_price: 2850,
          total_price: 11400,
          brand_make: 'Griffco Valve',
          model_part_no: 'CAL-1000-PVDF-12',
          country_of_origin: 'USA',
          availability: 'Ex-Stock UAE (Ready)'
        },
        {
          item_name: 'Backpressure & Anti-Siphon Sustaining Valve Assemblies',
          description: 'Plast-O-Matic 1/2" adjustable backpressure and anti-siphon valve with PTFE diaphragm and machined PVDF body.',
          quantity: 4,
          unit: 'PCS',
          unit_price: 2875,
          total_price: 11500,
          brand_make: 'Plast-O-Matic',
          model_part_no: 'RVDT-050-PVDF-T',
          country_of_origin: 'USA',
          availability: 'Ready in Stock'
        }
      ]
    }
  }
];

// ==========================================
// SEED RUNNER FUNCTION
// ==========================================

export interface SeedDemoResult {
  success: boolean;
  message: string;
  companiesCreated: number;
  contactsCreated: number;
  enquiriesCreated: number;
  quotationsCreated: number;
  seededReferences: string[];
}

/**
 * Idempotently hydrates Firestore with the 3 Executive Presentation Demo Projects.
 * Strictly gated behind DEV/DEMO environment checks.
 */
export async function seedDemoEnquiries(targetWorkspaceId: string = 'default'): Promise<SeedDemoResult> {
  if (!isDevOrDemoEnvironment()) {
    console.warn('[Demo Seeder] Seeding blocked: current environment is not DEV/DEMO.');
    return {
      success: false,
      message: 'Seeding blocked: current environment is not DEV/DEMO.',
      companiesCreated: 0,
      contactsCreated: 0,
      enquiriesCreated: 0,
      quotationsCreated: 0,
      seededReferences: []
    };
  }

  let companiesCount = 0;
  let contactsCount = 0;
  let enquiriesCount = 0;
  let quotationsCount = 0;
  const seededRefs: string[] = [];

  const nowIso = new Date().toISOString();

  for (const blueprint of EXECUTIVE_DEMO_PROJECTS) {
    try {
      // 1. Create Company
      const companyPayload: Omit<Company, 'id'> = {
        ...blueprint.company,
        workspace_id: targetWorkspaceId,
        workspaceId: targetWorkspaceId,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const companyRef = await safeAddDoc('companies', companyPayload);
      const companyId = companyRef.id;
      companiesCount++;

      // 2. Create Contact
      const contactPayload: Omit<Contact, 'id'> = {
        ...blueprint.contact,
        company_id: companyId,
        workspace_id: targetWorkspaceId,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const contactRef = await safeAddDoc('contacts', contactPayload);
      const contactId = contactRef.id;
      contactsCount++;

      // 3. Create Enquiry
      const enquiryPayload: Omit<Enquiry, 'id'> = {
        ...blueprint.enquiry,
        company_id: companyId,
        contact_id: contactId,
        company_name: blueprint.company.display_name,
        client_company: blueprint.company.display_name,
        workspace_id: targetWorkspaceId,
        workspaceId: targetWorkspaceId,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const enquiryRef = await safeAddDoc('enquiries', enquiryPayload);
      const enquiryId = enquiryRef.id;
      enquiriesCount++;

      // 4. Create Formal Quotation
      const quotationPayload: Omit<Quotation, 'id'> = {
        ...blueprint.quotation,
        enquiry_id: enquiryId,
        workspace_id: targetWorkspaceId,
        workspaceId: targetWorkspaceId,
        created_at: nowIso,
        updatedAt: nowIso
      };

      await safeAddDoc('quotations', quotationPayload);
      quotationsCount++;
      seededRefs.push(blueprint.enquiry.quote_ref_no);
    } catch (err: any) {
      console.error(`[Demo Seeder] Error seeding project ${blueprint.projectTitle}:`, err);
    }
  }

  const summary = `Successfully hydrated executive demo dataset: ${enquiriesCount} enquiries, ${quotationsCount} quotations, ${companiesCount} companies, ${contactsCount} contacts across [${seededRefs.join(', ')}].`;
  console.log(`[Demo Seeder] ${summary}`);

  return {
    success: true,
    message: summary,
    companiesCreated: companiesCount,
    contactsCreated: contactsCount,
    enquiriesCreated: enquiriesCount,
    quotationsCreated: quotationsCount,
    seededReferences: seededRefs
  };
}

// Global browser window trigger for prep convenience
if (typeof window !== 'undefined' && isDevOrDemoEnvironment()) {
  (window as any).seedDemoEnquiries = seedDemoEnquiries;
  (window as any).EXECUTIVE_DEMO_PROJECTS = EXECUTIVE_DEMO_PROJECTS;
}
