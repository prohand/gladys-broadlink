// -----------------------------------------------------------------------------
// Supported Broadlink products, keyed by the "devtype" announced in the hello
// answer. Source: python-broadlink SUPPORTED_TYPES.
//
// `protocol` selects the command encoding (see commands.js); `kind` selects the
// Gladys device blueprint (see src/devices/).
// -----------------------------------------------------------------------------

const PRODUCTS = {
  // --- Smart plugs -----------------------------------------------------------
  sp1: { kind: 'plug', types: { 0x0000: 'SP1' } },
  sp2: {
    kind: 'plug',
    types: {
      0x2717: 'NEO',
      0x2719: 'SP2-compatible',
      0x271a: 'SP2-compatible',
      0x2720: 'SP mini',
      0x2728: 'SP2-compatible',
      0x273e: 'SP mini',
      0x7530: 'SP2',
      0x7539: 'SP2-IL',
      0x753e: 'SP mini 3',
      0x7540: 'MP2',
      0x7544: 'SP2-CL',
      0x7546: 'SP2-UK/BR/IN',
      0x7547: 'SC1',
      0x7549: 'SP mini 3',
      0x7918: 'SP2',
      0x7919: 'SP2-compatible',
      0x791a: 'SP2-compatible',
      0x7d0d: 'SP mini 3',
    },
  },
  sp2s: {
    kind: 'plug',
    types: { 0x2711: 'SP2', 0x2716: 'NEO PRO', 0x271d: 'Ego', 0x2736: 'SP mini+' },
  },
  sp3: { kind: 'plug', types: { 0x2733: 'SP3', 0x7d00: 'SP3-EU' } },
  sp3s: { kind: 'plug', types: { 0x9479: 'SP3S-US', 0x947a: 'SP3S-EU' } },
  sp4: {
    kind: 'plug',
    types: {
      0x7568: 'SP4L-CN',
      0x756b: 'SP4M-JP',
      0x756c: 'SP4M',
      0x756f: 'MCB1',
      0x7579: 'SP4L-EU',
      0x757b: 'SP4L-AU',
      0x7583: 'SP mini 3',
      0x7587: 'SP4L-UK',
      0x7d11: 'SP mini 3',
      0xa4f9: 'WS4',
      0xa569: 'SP4L-UK',
      0xa56a: 'MCB1',
      0xa56b: 'SCB1E',
      0xa56c: 'SP4L-EU',
      0xa576: 'SP4L-AU',
      0xa589: 'SP4L-UK',
      0xa5d3: 'SP4L-EU',
      0xa6f4: 'SP4D-US',
    },
  },
  sp4b: {
    kind: 'plug',
    types: {
      0x5115: 'SCB1E',
      0x51e2: 'AHC/U-01',
      0x6111: 'MCB1',
      0x6113: 'SCB1E',
      0x618b: 'SP4L-EU',
      0x6489: 'SP4L-AU',
      0x648b: 'SP4M-US',
      0x648c: 'SP4L-US',
      0x6494: 'SCB2',
    },
  },

  // --- Power strips ----------------------------------------------------------
  mp1: {
    kind: 'strip',
    types: { 0x4eb5: 'MP1-1K4S', 0x4ef7: 'MP1-1K4S', 0x4f1b: 'MP1-1K3S2U', 0x4f65: 'MP1-1K3S2U' },
  },

  // --- Universal remotes (IR, + RF on the "pro" models) ----------------------
  rmmini: {
    kind: 'remote',
    types: {
      0x2737: 'RM mini 3',
      0x278f: 'RM mini',
      0x27b7: 'RM mini 3',
      0x27c2: 'RM mini 3',
      0x27c7: 'RM mini 3',
      0x27cc: 'RM mini 3',
      0x27cd: 'RM mini 3',
      0x27d0: 'RM mini 3',
      0x27d1: 'RM mini 3',
      0x27d3: 'RM mini 3',
      0x27dc: 'RM mini 3',
      0x27de: 'RM mini 3',
    },
  },
  rmpro: {
    kind: 'remote',
    types: {
      0x2712: 'RM pro/pro+',
      0x272a: 'RM pro',
      0x273d: 'RM pro',
      0x277c: 'RM home',
      0x2783: 'RM home',
      0x2787: 'RM pro',
      0x278b: 'RM plus',
      0x2797: 'RM pro+',
      0x279d: 'RM pro+',
      0x27a1: 'RM plus',
      0x27a6: 'RM plus',
      0x27a9: 'RM pro+',
      0x27c3: 'RM pro+',
    },
  },
  rmminib: {
    kind: 'remote',
    types: { 0x5f36: 'RM mini 3', 0x6507: 'RM mini 3', 0x6508: 'RM mini 3' },
  },
  rm4mini: {
    kind: 'remote',
    types: {
      0x51da: 'RM4 mini',
      0x5209: 'RM4 TV mate',
      0x520c: 'RM4 mini',
      0x520d: 'RM4C mini',
      0x5211: 'RM4C mate',
      0x5212: 'RM4 TV mate',
      0x5216: 'RM4 mini',
      0x521c: 'RM4 mini',
      0x6070: 'RM4C mini',
      0x610e: 'RM4 mini',
      0x610f: 'RM4C mini',
      0x62bc: 'RM4 mini',
      0x62be: 'RM4C mini',
      0x6364: 'RM4S',
      0x648d: 'RM4 mini',
      0x6539: 'RM4C mini',
      0x653a: 'RM4 mini',
    },
  },
  rm4pro: {
    kind: 'remote',
    types: {
      0x520b: 'RM4 pro',
      0x5213: 'RM4 pro',
      0x5218: 'RM4C pro',
      0x6026: 'RM4 pro',
      0x6184: 'RM4C pro',
      0x61a2: 'RM4 pro',
      0x649b: 'RM4 pro',
      0x653c: 'RM4 pro',
    },
  },

  // --- Environment sensor ----------------------------------------------------
  a1: { kind: 'sensor', types: { 0x2714: 'A1' } },
};

// Flattened index: devtype -> { protocol, kind, model }.
const BY_DEVTYPE = new Map();
for (const [protocol, { kind, types }] of Object.entries(PRODUCTS)) {
  for (const [devtype, model] of Object.entries(types)) {
    BY_DEVTYPE.set(Number(devtype), { protocol, kind, model });
  }
}

/**
 * @param {number} devtype
 * @returns {{ protocol: string, kind: string, model: string } | undefined}
 */
export function getModel(devtype) {
  return BY_DEVTYPE.get(Number(devtype));
}

/** "0x2737" style label, for logs and the device params. */
export function formatDevtype(devtype) {
  return `0x${Number(devtype).toString(16).padStart(4, '0')}`;
}

/** Remote protocols able to learn radio (433/315 MHz) codes. */
export const RF_PROTOCOLS = new Set(['rmpro', 'rm4pro']);
