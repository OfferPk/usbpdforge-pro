/**
 * USBPDForge Pro - SVDM & Alternate Mode Protocol Engine
 * Standards: USB-PD 3.1 VDM Specification & VESA DisplayPort Alt Mode on USB Type-C v2.1
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.USBPDVDMEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVIDS = {
    PD_SID: 0xFF00,
    DISPLAYPORT: 0xFF01,
    THUNDERBOLT: 0x8087
  };

  const VDM_COMMANDS = {
    1: 'Discover Identity',
    2: 'Discover SVIDs',
    3: 'Discover Modes',
    4: 'Enter Mode',
    5: 'Exit Mode',
    16: 'DP Status Update',
    17: 'DP Configure'
  };

  const CMD_TYPES = {
    0: 'Initiator',
    1: 'ACK',
    2: 'NAK',
    3: 'BUSY'
  };

  class USBPDVDMEngine {
    /**
     * Dissects 32-bit Structured VDM Header
     */
    static parseVDMHeader(vdmWord) {
      const svid = (vdmWord >>> 16) & 0xFFFF;
      const vdmType = (vdmWord >> 15) & 0x01; // 1 = Structured, 0 = Unstructured
      const structVer = (vdmWord >> 13) & 0x03;
      const objPos = (vdmWord >> 8) & 0x07;
      const cmdType = (vdmWord >> 6) & 0x03;
      const command = vdmWord & 0x1F;

      let svidName = 'Vendor Specific (0x' + svid.toString(16).toUpperCase() + ')';
      if (svid === SVIDS.PD_SID) svidName = 'Standard USB-PD (0xFF00)';
      else if (svid === SVIDS.DISPLAYPORT) svidName = 'VESA DisplayPort (0xFF01)';
      else if (svid === SVIDS.THUNDERBOLT) svidName = 'Intel Thunderbolt (0x8087)';

      return {
        rawHex: '0x' + (vdmWord >>> 0).toString(16).padStart(8, '0').toUpperCase(),
        svid,
        svidName,
        isStructured: vdmType === 1,
        version: structVer === 1 ? 'Version 2.0' : 'Version 1.0',
        objectPosition: objPos,
        commandType: CMD_TYPES[cmdType] || `Type_${cmdType}`,
        command: VDM_COMMANDS[command] || `Command_${command}`
      };
    }

    /**
     * Builds Cable E-Marker ID Header & VDOs
     */
    static buildCableEMarker(options = {}) {
      const {
        vendorId = 0x05AC, // e.g. Apple
        productId = 0x1234,
        maxCurrent_A = 5.0, // 3.0 or 5.0
        isEprCapable = true, // 20V (SPR) or 50V (EPR)
        usbSpeed = 'USB4_GEN3_40G' // USB2, GEN1, GEN2, USB4_GEN3, USB4_GEN4
      } = options;

      // ID Header VDO (32 bits)
      let idHeader = (vendorId & 0xFFFF);
      idHeader |= (3 << 27); // Device Capability: Passive Cable (3 = Passive, 4 = Active)
      idHeader |= (1 << 26); // Modal Operation Supported

      // Cert Stat VDO (Test ID)
      const certStat = 0x00010042;

      // Product VDO
      const productVdo = (productId << 16) | 0x0100;

      // Passive Cable VDO (32 bits)
      let cableVdo = 0;
      // Current handling: Bits 6..5 (01 = 3A, 10 = 5A)
      cableVdo |= (maxCurrent_A >= 5.0 ? 0x02 : 0x01) << 5;

      // Voltage capability: Bits 10..9 (00 = 20V SPR, 01 = 50V EPR)
      if (isEprCapable) {
        cableVdo |= (0x01 << 9);
      }

      // USB Signaling speed: Bits 2..0
      if (usbSpeed === 'USB4_GEN3_40G') cableVdo |= 0x03; // USB4 40G
      else if (usbSpeed === 'GEN2_10G') cableVdo |= 0x02; // Gen2 10G
      else if (usbSpeed === 'GEN1_5G') cableVdo |= 0x01;  // Gen1 5G
      else cableVdo |= 0x00; // USB 2.0 only

      return {
        idHeaderVdo: idHeader >>> 0,
        certStatVdo: certStat >>> 0,
        productVdo: productVdo >>> 0,
        cableVdo: cableVdo >>> 0,
        summary: {
          vendorId: '0x' + vendorId.toString(16).padStart(4, '0').toUpperCase(),
          maxCurrent: `${maxCurrent_A}A`,
          maxVoltage: isEprCapable ? '50V (EPR 240W Certified)' : '20V (SPR 100W Max)',
          usbSpeed
        }
      };
    }
  }

  return USBPDVDMEngine;
});
