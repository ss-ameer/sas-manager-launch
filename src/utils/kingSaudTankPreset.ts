import { LineItem, LineItemComponent } from '../types';

export const KING_SAUD_STP_HS_CODE = '73090090';

export const KING_SAUD_OPTION_A_SCOPE_NOTES =
  '1. Zinc-Aluminium-Magnesium alloy steel with Enamel color coated sheets, reinforced PVC liners, HDG structure & FRP Deck roof or Zincalume Dome Roof + External HDG Ladder, 1 No Drain Nozzle + Top Manhole + Level Indicator.\n' +
  '2. Corrugated sheet with the profiles pitch of 76 mm and depth of 18 mm of higher strength as per ASTM A 929 / BS EN10346.';

export const KING_SAUD_OPTION_B_SCOPE_NOTES =
  '1. Glass-Fused-To-Steel bolted storage tanks with External HDG Ladder, 1 No Drain Nozzle + Top Manhole + Level Indicator.\n' +
  '2. Tank design is based on AWWA D103-09.\n' +
  '3. Glass-Fused-To-Steel (GFS) tanks use specialized Titanium-rich steel plate, Titanium dioxide (TiO2) on both sides (280–420 microns thickness).\n' +
  '4. Bolt protection has polymer encapsulation with hot dipped galvanized bolts.';

export const KING_SAUD_SHARED_ACCESSORIES: LineItemComponent[] = [
  {
    id: 'acc_hdg_outlet_600',
    sn: 'A1',
    item_name: 'HDG FLANGED OUTLET 600MM (RF PAD & E TABLE) HDG SIDE',
    remark: 'Included Standard Tank Nozzle & Outlet Assembly',
    quantity: 17,
    unit: 'NOS',
    cost_price: 0,
    unit_price: 0,
    total_price: 0,
    is_included_accessory: true
  },
  {
    id: 'acc_hdg_ladder_48',
    sn: 'A2',
    item_name: 'HDG CAGE LADDER UPTO 4.8 MTRS WITH PLATFORM',
    remark: 'Included External Access Ladder & Safety Platform',
    quantity: 4,
    unit: 'NOS',
    cost_price: 0,
    unit_price: 0,
    total_price: 0,
    is_included_accessory: true
  },
  {
    id: 'acc_hdg_ladder_60',
    sn: 'A3',
    item_name: 'HDG CAGE LADDER UPTO 6.0 MTRS WITH PLATFORM',
    remark: 'Included External Access Ladder & Safety Platform',
    quantity: 8,
    unit: 'NOS',
    cost_price: 0,
    unit_price: 0,
    total_price: 0,
    is_included_accessory: true
  },
  {
    id: 'acc_hdg_ladder_84',
    sn: 'A4',
    item_name: 'HDG CAGE LADDER UPTO 8.4 MTRS WITH PLATFORM',
    remark: 'Included External Access Ladder & Safety Platform',
    quantity: 2,
    unit: 'NOS',
    cost_price: 0,
    unit_price: 0,
    total_price: 0,
    is_included_accessory: true
  },
  {
    id: 'acc_hdg_ladder_36',
    sn: 'A5',
    item_name: 'HDG CAGE LADDER UPTO 3.6 MTRS WITH PLATFORM',
    remark: 'Included External Access Ladder & Safety Platform',
    quantity: 3,
    unit: 'NOS',
    cost_price: 0,
    unit_price: 0,
    total_price: 0,
    is_included_accessory: true
  },
  {
    id: 'acc_hdg_airvent_100',
    sn: 'A6',
    item_name: 'HDG GOOSE NECK AIRVENT 100NB',
    remark: 'Included Roof Air Vent Assembly',
    quantity: 17,
    unit: 'NOS',
    cost_price: 0,
    unit_price: 0,
    total_price: 0,
    is_included_accessory: true
  }
];

export const KING_SAUD_OPTION_A_SST_COMPONENTS: LineItemComponent[] = [
  {
    id: 'sst_comp_1',
    sn: '1.1',
    item_name: 'SST 475-60; Dia : 16.04m ; Ht : 6.0m ; Gross Cap : 1219KL',
    remark: 'Equalization Tank (Closed Type Roof)',
    quantity: 1,
    unit: 'NOS',
    cost_price: 45500,
    unit_price: 45500,
    total_price: 45500,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_2',
    sn: '1.2',
    item_name: 'SST 85-48; Dia : 6.79m ; Ht : 4.8m ; Gross Cap : 174 KL',
    remark: 'Anoxic Tanks (Open Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 13500,
    unit_price: 13500,
    total_price: 40500,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_3',
    sn: '1.3',
    item_name: 'SST 310-60; Dia : 12.96m ; Ht : 6.0m ; Gross Cap : 795KL',
    remark: 'Aeration Tanks (Open Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 29750,
    unit_price: 29750,
    total_price: 89250,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_4',
    sn: '1.4',
    item_name: 'SST 155-48; Dia : 9.17m ; Ht : 4.8m ; Gross Cap : 317 KL',
    remark: 'Secondary Clarifier (Open Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 17500,
    unit_price: 17500,
    total_price: 52500,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_5',
    sn: '1.5',
    item_name: 'SST 70-48; Dia : 6.16m ; Ht : 4.8m ; Gross Cap : 143KL',
    remark: 'CCT (Open Roof)',
    quantity: 1,
    unit: 'NOS',
    cost_price: 12000,
    unit_price: 12000,
    total_price: 12000,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_6',
    sn: '1.6',
    item_name: 'SST 105-48; Dia : 7.55m ; Ht : 4.8m ; Gross Cap : 215KL',
    remark: 'Water Tank (Closed Type Roof)',
    quantity: 1,
    unit: 'NOS',
    cost_price: 16000,
    unit_price: 16000,
    total_price: 16000,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_7',
    sn: '1.7',
    item_name: 'SST 1720-84; Dia : 30.52m ; Ht : 8.4m ; Gross Cap : 6146KL',
    remark: 'TSE Tanks (Closed Type Roof)',
    quantity: 2,
    unit: 'NOS',
    cost_price: 173500,
    unit_price: 173500,
    total_price: 347000,
    is_included_accessory: false
  },
  {
    id: 'sst_comp_8',
    sn: '1.8',
    item_name: 'SST 70-36; Dia : 6.16m ; Ht : 3.6m ; Gross Cap : 107KL',
    remark: 'Sludge Holding Tank (Closed Type Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 9500,
    unit_price: 9500,
    total_price: 28500,
    is_included_accessory: false
  },
  ...KING_SAUD_SHARED_ACCESSORIES.map((acc, idx) => ({
    ...acc,
    id: `sst_${acc.id}`,
    sn: `1.${9 + idx}`
  }))
];

export const KING_SAUD_OPTION_B_GFS_COMPONENTS: LineItemComponent[] = [
  {
    id: 'gfs_comp_1',
    sn: '2.1',
    item_name: 'GFS475-60; Dia : 16.04m ; Ht : 6.0m ; Gross Cap : 1219KL',
    remark: 'Equalization Tank (Closed Type Roof)',
    quantity: 1,
    unit: 'NOS',
    cost_price: 59500,
    unit_price: 59500,
    total_price: 59500,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_2',
    sn: '2.2',
    item_name: 'GFS85-48; Dia : 6.79m ; Ht : 4.8m ; Gross Cap : 174 KL',
    remark: 'Anoxic Tanks (Open Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 18000,
    unit_price: 18000,
    total_price: 54000,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_3',
    sn: '2.3',
    item_name: 'GFS310-60; Dia : 12.96m ; Ht : 6.0m ; Gross Cap : 795KL',
    remark: 'Aeration Tanks (Open Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 40000,
    unit_price: 40000,
    total_price: 120000,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_4',
    sn: '2.4',
    item_name: 'GFS155-48; Dia : 9.17m ; Ht : 4.8m ; Gross Cap : 317 KL',
    remark: 'Secondary Clarifier (Open Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 23250,
    unit_price: 23250,
    total_price: 69750,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_5',
    sn: '2.5',
    item_name: 'GFS70-48; Dia : 6.16m ; Ht : 4.8m ; Gross Cap : 143KL',
    remark: 'CCT (Open Roof)',
    quantity: 1,
    unit: 'NOS',
    cost_price: 16000,
    unit_price: 16000,
    total_price: 16000,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_6',
    sn: '2.6',
    item_name: 'GFS105-48; Dia : 7.55m ; Ht : 4.8m ; Gross Cap : 215KL',
    remark: 'Water Tank (Closed Type Roof)',
    quantity: 1,
    unit: 'NOS',
    cost_price: 21500,
    unit_price: 21500,
    total_price: 21500,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_7',
    sn: '2.7',
    item_name: 'GFS1720-84; Dia : 30.52m ; Ht : 8.4m ; Gross Cap : 6146KL',
    remark: 'TSE Tanks (Closed Type Roof)',
    quantity: 2,
    unit: 'NOS',
    cost_price: 228000,
    unit_price: 228000,
    total_price: 456000,
    is_included_accessory: false
  },
  {
    id: 'gfs_comp_8',
    sn: '2.8',
    item_name: 'GFS70-36; Dia : 6.16m ; Ht : 3.6m ; Gross Cap : 107KL',
    remark: 'Sludge Holding Tank (Closed Type Roof)',
    quantity: 3,
    unit: 'NOS',
    cost_price: 12500,
    unit_price: 12500,
    total_price: 37500,
    is_included_accessory: false
  },
  ...KING_SAUD_SHARED_ACCESSORIES.map((acc, idx) => ({
    ...acc,
    id: `gfs_${acc.id}`,
    sn: `2.${9 + idx}`
  }))
];

export function recalculateCompositeItemTotals(
  components: LineItemComponent[],
  parentQty: number = 1
): {
  components: LineItemComponent[];
  packageUnitPrice: number;
  packageCostPrice: number;
  packageTotalPrice: number;
} {
  const safeParentQty = Math.max(1, Number(parentQty) || 1);
  let sumSell = 0;
  let sumCost = 0;

  const updated = (components || []).map((c, idx) => {
    const qty = Math.max(0, Number(c.quantity) || 0);
    if (c.is_included_accessory) {
      return {
        ...c,
        sn: c.sn || `${idx + 1}`,
        quantity: qty,
        unit_price: 0,
        total_price: 0
      };
    }
    const uPrice = Number(c.unit_price) || 0;
    const cPrice = Number(c.cost_price) || 0;
    const tPrice = Number((qty * uPrice).toFixed(2));
    sumSell += tPrice;
    sumCost += Number((qty * cPrice).toFixed(2));
    return {
      ...c,
      sn: c.sn || `${idx + 1}`,
      quantity: qty,
      unit_price: uPrice,
      cost_price: cPrice,
      total_price: tPrice
    };
  });

  const roundedSell = Number(sumSell.toFixed(2));
  const roundedCost = Number(sumCost.toFixed(2));
  return {
    components: updated,
    packageUnitPrice: roundedSell,
    packageCostPrice: roundedCost,
    packageTotalPrice: Number((roundedSell * safeParentQty).toFixed(2))
  };
}

export function applyMarkupToSubComponents(
  components: LineItemComponent[],
  markupPercent: number
): LineItemComponent[] {
  const factor = 1 + (Number(markupPercent) || 0) / 100;
  return (components || []).map((c) => {
    if (c.is_included_accessory) {
      return { ...c, unit_price: 0, total_price: 0 };
    }
    const baseCost =
      Number(c.cost_price) > 0 ? Number(c.cost_price) : Number(c.unit_price) || 0;
    const newUnitPrice = Number((baseCost * factor).toFixed(2));
    const qty = Math.max(0, Number(c.quantity) || 0);
    return {
      ...c,
      cost_price: baseCost,
      unit_price: newUnitPrice,
      total_price: Number((qty * newUnitPrice).toFixed(2))
    };
  });
}

export function getKingSaudOptionASstItem(currency: 'AED' | 'USD' = 'USD'): LineItem {
  const rate = currency === 'AED' ? 3.6725 : 1;
  const scaledComponents = KING_SAUD_OPTION_A_SST_COMPONENTS.map((c) => {
    if (c.is_included_accessory) return { ...c };
    const uPrice = Number((c.unit_price * rate).toFixed(2));
    const cPrice = Number(((c.cost_price || c.unit_price) * rate).toFixed(2));
    return {
      ...c,
      cost_price: cPrice,
      unit_price: uPrice,
      total_price: Number((c.quantity * uPrice).toFixed(2))
    };
  });
  const totals = recalculateCompositeItemTotals(scaledComponents, 1);

  return {
    id: `item_ks_sst_${Date.now()}_a`,
    sku: 'STP-SST-KSAB-01',
    item_name: 'Supply of Secure Store Water Storage Tank (SST)',
    product_type: 'Water Storage Tank Package',
    description:
      'Complete Multi-Tank STP Package — Secure Store Water Storage Tanks (SST) with Zinc-Aluminium-Magnesium alloy steel, reinforced PVC liners, HDG structure & roof, and standard HDG accessories (King Saud Air Base Development STP — Ref: 26-27/SQ/1898).',
    quantity: 1,
    unit: 'SET',
    unit_price: totals.packageUnitPrice,
    cost_price: totals.packageCostPrice,
    total_price: totals.packageTotalPrice,
    lead_time_note: '6-8 Weeks Ex-Works',
    brand_make: 'Secure Store (SST)',
    model_part_no: 'SST-STP-17TANK-SET',
    country_of_origin: 'India / UAE',
    hs_code: KING_SAUD_STP_HS_CODE,
    option: 'Option A',
    option_scope_notes: KING_SAUD_OPTION_A_SCOPE_NOTES,
    is_composite_set: true,
    package_pricing_mode: 'itemized',
    sub_components: totals.components,
    attributes: [
      { key: 'System Type', value: 'Secure Store Water Storage Tank (SST)' },
      { key: 'Total Tanks in Set', value: '17 Nos (8 Tank Configurations)' },
      { key: 'Standard', value: 'ASTM A 929 / BS EN10346' },
      { key: 'HSN/SAC Code', value: KING_SAUD_STP_HS_CODE }
    ]
  };
}

export function getKingSaudOptionBGfsItem(currency: 'AED' | 'USD' = 'USD'): LineItem {
  const rate = currency === 'AED' ? 3.6725 : 1;
  const scaledComponents = KING_SAUD_OPTION_B_GFS_COMPONENTS.map((c) => {
    if (c.is_included_accessory) return { ...c };
    const uPrice = Number((c.unit_price * rate).toFixed(2));
    const cPrice = Number(((c.cost_price || c.unit_price) * rate).toFixed(2));
    return {
      ...c,
      cost_price: cPrice,
      unit_price: uPrice,
      total_price: Number((c.quantity * uPrice).toFixed(2))
    };
  });
  const totals = recalculateCompositeItemTotals(scaledComponents, 1);

  return {
    id: `item_ks_gfs_${Date.now()}_b`,
    sku: 'STP-GFS-KSAB-02',
    item_name: 'Supply of Glass-Fused-To-Steel (GFS) Water Storage Tank',
    product_type: 'Water Storage Tank Package',
    description:
      'Complete Multi-Tank STP Package — Glass-Fused-To-Steel (GFS) Bolted Storage Tanks as per AWWA D103-09 with Titanium-rich steel plate (TiO2 280–420 microns) and standard HDG accessories (King Saud Air Base Development STP — Ref: 26-27/SQ/1899).',
    quantity: 1,
    unit: 'SET',
    unit_price: totals.packageUnitPrice,
    cost_price: totals.packageCostPrice,
    total_price: totals.packageTotalPrice,
    lead_time_note: '6-8 Weeks Ex-Works',
    brand_make: 'Glass-Fused-To-Steel (GFS)',
    model_part_no: 'GFS-STP-17TANK-SET',
    country_of_origin: 'India / UAE',
    hs_code: KING_SAUD_STP_HS_CODE,
    option: 'Option B',
    option_scope_notes: KING_SAUD_OPTION_B_SCOPE_NOTES,
    is_composite_set: true,
    package_pricing_mode: 'itemized',
    sub_components: totals.components,
    attributes: [
      { key: 'System Type', value: 'Glass-Fused-To-Steel (GFS) Tank Package' },
      { key: 'Total Tanks in Set', value: '17 Nos (8 Tank Configurations)' },
      { key: 'Design Standard', value: 'AWWA D103-09 (TiO2 280–420 microns)' },
      { key: 'HSN/SAC Code', value: KING_SAUD_STP_HS_CODE }
    ]
  };
}

export function getKingSaudStpLineItems(currency: 'AED' | 'USD' = 'USD'): LineItem[] {
  return [getKingSaudOptionASstItem(currency), getKingSaudOptionBGfsItem(currency)];
}
