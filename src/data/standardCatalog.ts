import { ProductAttribute } from '../types';

export interface StandardCatalogSeedItem {
  name: string;
  product_type: string;
  description: string;
  unit: 'Nos' | 'M3' | 'MT' | 'Set' | 'LS' | 'Kg';
  unit_price: number;
  sku?: string;
  attributes: ProductAttribute[];
}

export const STANDARD_CATALOG_SEED: StandardCatalogSeedItem[] = [
  {
    name: 'RO Membrane (8" SWC5-LD)',
    product_type: 'RO Membranes',
    description: 'RO MEMBRANE - Size: 8" Dia x 40" Length, Model: SWC5-LD, Thin Film Composite Spiral Wound, Brand: Hydranautics',
    unit: 'Nos',
    unit_price: 2100,
    attributes: [
      { key: 'Brand / Make', value: 'Hydranautics' },
      { key: 'Model', value: 'SWC5-LD' },
      { key: 'Size', value: '8" Dia x 40"' }
    ]
  },
  {
    name: 'FRP MMF Vessel (63" x 67")',
    product_type: 'FRP Vessels',
    description: 'FRP Multimedia Filter Vessel 63" x 67", Design Pressure 10.5 Bar, Vertical, FRP MOC, Brand: Premium',
    unit: 'Nos',
    unit_price: 8750,
    attributes: [
      { key: 'Brand / Make', value: 'Premium' },
      { key: 'Dimensions', value: '63" x 67"' },
      { key: 'Pressure Rating', value: '10.5 Bar' }
    ]
  },
  {
    name: 'Filter Media for 63"x67" Tank',
    product_type: 'Filter Media',
    description: 'Filter Media for 63"x67" Tank, Graded Sand Media - 2,475 KG (Anthracite & Sand Media), Brand: Aquafil',
    unit: 'Set',
    unit_price: 2182,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Graded Sand & Anthracite' },
      { key: 'Weight', value: '2,475 KG' }
    ]
  },
  {
    name: 'FRP MMF Vessel (63" x 86")',
    product_type: 'FRP Vessels',
    description: 'FRP Multimedia Filter Vessel 63" x 86", Design Pressure 10.5 Bar, Vertical, Brand: Premium',
    unit: 'Nos',
    unit_price: 17500,
    attributes: [
      { key: 'Brand / Make', value: 'Premium' },
      { key: 'Dimensions', value: '63" x 86"' },
      { key: 'Pressure Rating', value: '10.5 Bar' }
    ]
  },
  {
    name: 'Auto MPV WS3 Valve (for 63"x86")',
    product_type: 'Valves',
    description: 'Auto MPV for 63"x86", 3" In/Out Size, Multiport, Automatic Programmable, Model: WS3, Brand: Clack (USA)',
    unit: 'Set',
    unit_price: 14225,
    attributes: [
      { key: 'Brand / Make', value: 'Clack (USA)' },
      { key: 'Model', value: 'WS3' },
      { key: 'Size', value: '3" In/Out' }
    ]
  },
  {
    name: 'Graded Media for 63"x86" Vessel',
    product_type: 'Filter Media',
    description: 'Graded Media for MMF Vessel 63"x86" (Anthracite 175kg, Fine Sand 1400kg, Coarse Sand 350kg, Gravel 1100kg), Brand: Aquafil',
    unit: 'Set',
    unit_price: 3173,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Anthracite, Sand & Gravel' }
    ]
  },
  {
    name: 'Calcium Hypochlorite (70% Bucket)',
    product_type: 'Chemicals',
    description: 'Calcium Hypochlorite, Granular Form, Available Chlorine: 70%, Packing: 45 Kg Bucket, Brand: Aquatick',
    unit: 'Nos',
    unit_price: 900,
    attributes: [
      { key: 'Brand / Make', value: 'Aquatick' },
      { key: 'Form', value: 'Granular' },
      { key: 'Concentration', value: '70%' },
      { key: 'Packaging Type', value: '45 Kg Bucket' }
    ]
  },
  {
    name: 'Silica Sand (0.4-0.8mm, M3)',
    product_type: 'Filter Media',
    description: 'Silica Sand, Size: 0.4-0.8mm, Packing: 50 Kg Bags, Brand: Aquafil, Make: UAE',
    unit: 'M3',
    unit_price: 544,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Silica Sand' },
      { key: 'Effective Size', value: '0.4-0.8mm' }
    ]
  },
  {
    name: 'Silica Gravel (3-5mm, M3)',
    product_type: 'Filter Media',
    description: 'Silica Gravel, Size: 3-5mm, Packing: 50 Kg Bags, Brand: Aquafil, Make: UAE',
    unit: 'M3',
    unit_price: 880,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Silica Gravel' },
      { key: 'Effective Size', value: '3-5mm' }
    ]
  },
  {
    name: 'Silica Gravel (8-12mm, M3)',
    product_type: 'Filter Media',
    description: 'Silica Gravel, Size: 8-12mm, Packing: 50 Kg Bags, Brand: Aquafil, Make: UAE',
    unit: 'M3',
    unit_price: 2400,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Silica Gravel' },
      { key: 'Effective Size', value: '8-12mm' }
    ]
  },
  {
    name: 'Pebbles (20-40mm, M3)',
    product_type: 'Filter Media',
    description: 'Pebbles, Size: 20-40mm, Packing: 50 Kg Bags, Brand: Aquafil, Make: UAE',
    unit: 'M3',
    unit_price: 2400,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Pebbles' },
      { key: 'Effective Size', value: '20-40mm' }
    ]
  },
  {
    name: 'Cartridge Filter Housing (315 x 40")',
    product_type: 'Cartridge Filters',
    description: 'Cartridge Filter Housing, 24-28 m3/hr Design Flow, Model: 315 x 40", 9 Elements, Element Size: 2.5" x 40", MOC: uPVC, Make: Burton+',
    unit: 'Nos',
    unit_price: 1600,
    attributes: [
      { key: 'Brand / Make', value: 'Burton+' },
      { key: 'Material', value: 'uPVC' },
      { key: 'Length', value: '40"' }
    ]
  },
  {
    name: 'Absolute Cartridge Filter (AVFRP 40-12)',
    product_type: 'Cartridge Filters',
    description: 'Absolute Cartridge Filter Housing, 24-28 m3/hr Design Flow, Model: AVFRP 40-12, 12 Elements, Pleated DOE Element, Micron: 10, MOC: PP, Make: Burton+',
    unit: 'Nos',
    unit_price: 4020,
    attributes: [
      { key: 'Brand / Make', value: 'Burton+' },
      { key: 'Micron Rating', value: '10' },
      { key: 'Material', value: 'PP' }
    ]
  },
  {
    name: 'RO Pressure Vessel (8"x4E, 1200PSI)',
    product_type: 'RO Housing',
    description: 'RO Pressure Vessel, 8" x 4E, 1200 PSI, 1.5" Side Port with Accessories, Make: Standard',
    unit: 'Nos',
    unit_price: 3850,
    attributes: [
      { key: 'Brand / Make', value: 'Standard' },
      { key: 'Pressure Rating', value: '1200 PSI' }
    ]
  },
  {
    name: 'FRP Multimedia Filter Vessel (42"x72")',
    product_type: 'FRP Vessels',
    description: 'Multimedia Filter Vessel 42" x 72", Design Pressure 10.5 Bar, ASME Standard, Brand: Standard',
    unit: 'Nos',
    unit_price: 5900,
    attributes: [
      { key: 'Brand / Make', value: 'Standard' },
      { key: 'Dimensions', value: '42" x 72"' },
      { key: 'Pressure Rating', value: '10.5 Bar' }
    ]
  },
  {
    name: 'Media for MMF 42"x72" Vessel',
    product_type: 'Filter Media',
    description: 'Media for MMF 42"x72" (Anthracite 3 bags, Fine Sand, Coarse Sand, Silica Gravel), Brand: Aquafil',
    unit: 'Set',
    unit_price: 1595,
    attributes: [
      { key: 'Brand / Make', value: 'Aquafil' },
      { key: 'Media Type', value: 'Anthracite, Sand & Silica Gravel' }
    ]
  },
  {
    name: 'RO Cartridge Filter (215 x 40)',
    product_type: 'Cartridge Filters',
    description: 'RO Cartridge Filter with Cartridge Filter, Design Flow 14m3/hr, Model: 215 x 40, Make: Burton+',
    unit: 'Nos',
    unit_price: 1400,
    attributes: [
      { key: 'Brand / Make', value: 'Burton+' }
    ]
  },
  {
    name: 'Electric Actuated Frontal Frame',
    product_type: 'Valves',
    description: 'Electric Actuated Butterfly Valves with Frontal Frame MSEP Tubes, uPVC Plumbing, Manual Butterfly valves, Pressure Gauges, assembled by Technical Team',
    unit: 'Set',
    unit_price: 22800,
    attributes: [
      { key: 'Actuator Type', value: 'Electric Actuated' },
      { key: 'Connection Type', value: 'uPVC Plumbing' }
    ]
  },
  {
    name: 'WIKA SS316 Pressure Gauge (0-100PSI)',
    product_type: 'Other',
    description: 'WIKA Pressure Gauge, 4" Dial, Lower Bottom Mount, Glycerine filled, 0-100 PSI / 0-7 Bar, Connection: SS316, 1/2" MNPT, Model 233.53.100',
    unit: 'Nos',
    unit_price: 165,
    attributes: [
      { key: 'Brand / Make', value: 'WIKA' },
      { key: 'Model', value: '233.53.100' }
    ]
  },
  {
    name: 'WIKA Brass Pressure Gauge (0-230PSI)',
    product_type: 'Other',
    description: 'WIKA Pressure Gauge, 4" Dial, Back Mount, Glycerine filled, 0-230 PSI / 0-16 Bar, Connection: Brass, 1/2" MNPT, Model 213.53.100',
    unit: 'Nos',
    unit_price: 210,
    attributes: [
      { key: 'Brand / Make', value: 'WIKA' },
      { key: 'Model', value: '213.53.100' }
    ]
  }
];
