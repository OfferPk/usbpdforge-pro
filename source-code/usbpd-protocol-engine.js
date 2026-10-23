/**
 * USBPDForge Pro - Core Protocol Engine (USB-PD 3.1 & EPR 240W)
 * Standards: USB Power Delivery Specification Rev 3.1 v1.8, USB Type-C 2.2
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.USBPDProtocolEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 4b/5b Symbol Encoding Table (USB-PD 3.1 Section 5.5)
  const NIBBLE_TO_5B = [
    0x1E, // 0 -> 11110
    0x09, // 1 -> 01001
    0x14, // 2 -> 10100
    0x15, // 3 -> 10101
    0x0A, // 4 -> 01010
    0x0B, // 5 -> 01011
    0x0E, // 6 -> 01110
    0x0F, // 7 -> 01111
    0x12, // 8 -> 10010
    0x13, // 9 -> 10011
    0x16, // A -> 10110
    0x17, // B -> 10111
    0x1A, // C -> 11010
    0x1B, // D -> 11011
    0x1C, // E -> 11100
    0x1D  // F -> 11101
  ];

  const FIVE_B_TO_NIBBLE = {};
  for (let i = 0; i < 16; i++) {
    FIVE_B_TO_NIBBLE[NIBBLE_TO_5B[i]] = i;
  }

  // K-Codes for SOP Delimiters
  const K_CODES = {
    SYNC_1: 0x18, // 11000
    SYNC_2: 0x11, // 10001
    SYNC_3: 0x06, // 00110
    RST_1:  0x07, // 00111
    RST_2:  0x19, // 11001
    EOP:    0x0D  // 01101
  };

  // SOP Types
  const SOP_TYPES = {
    SOP: 'SOP',
    SOP_PRIME: "SOP'",
    SOP_DOUBLE_PRIME: "SOP''",
    HARD_RESET: 'HARD_RESET',
    CABLE_RESET: 'CABLE_RESET'
  };

  // Message Types (USB-PD 3.1)
  const CONTROL_MSG_TYPES = {
    1: 'GoodCRC',
    2: 'GotoMin',
    3: 'Accept',
    4: 'Reject',
    5: 'Ping',
    6: 'PS_RDY',
    7: 'Get_Source_Cap',
    8: 'Get_Sink_Cap',
    9: 'DR_Swap',
    10: 'PR_Swap',
    11: 'VCONN_Swap',
    12: 'Wait',
    13: 'Soft_Reset',
    16: 'Not_Supported'
  };

  const DATA_MSG_TYPES = {
    1: 'Source_Capabilities',
    2: 'Request',
    3: 'BIST',
    4: 'Sink_Capabilities',
    5: 'Battery_Status',
    6: 'Alert',
    7: 'Get_Country_Info',
    8: 'Enter_USB',
    9: 'EPR_Request',
    10: 'EPR_Mode',
    11: 'Source_Info',
    12: 'Revision',
    15: 'Vendor_Defined'
  };

  class USBPDProtocolEngine {
    constructor() {
      this.K_CODES = K_CODES;
      this.SOP_TYPES = SOP_TYPES;
      this.CONTROL_MSG_TYPES = CONTROL_MSG_TYPES;
      this.DATA_MSG_TYPES = DATA_MSG_TYPES;
      this.crcTable = this._buildCrc32Table();
    }

    _buildCrc32Table() {
      const poly = 0xEDB88320; // Inverted 0x04C11DB7
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (poly ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
      }
      return table;
    }

    /**
     * Computes USB-PD 32-bit CRC over Header and Data Objects
     */
    calculateCRC32(bytes) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) {
        crc = this.crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
      }
      return (~crc) >>> 0;
    }

    /**
     * Synthesizes 16-bit Message Header (USB-PD 3.1)
     */
    buildHeader(options) {
      const {
        msgType = 1,
        numDataObjects = 0,
        msgId = 0,
        portPowerRole = 1, // 0 = Sink, 1 = Source
        specRev = 2,       // 0 = Rev 1.0, 1 = Rev 2.0, 2 = Rev 3.0/3.1
        portDataRole = 1,  // 0 = UFP, 1 = DFP
        cablePlug = 0,     // 0 = DFP/UFP, 1 = Cable Plug
        extended = 0       // 0 = Standard, 1 = Extended
      } = options;

      let hdr = 0;
      hdr |= (msgType & 0x1F);
      hdr |= ((portDataRole & 0x01) << 5);
      hdr |= ((specRev & 0x03) << 6);
      hdr |= ((cablePlug & 0x01) << 8);
      hdr |= ((msgId & 0x07) << 9);
      hdr |= ((numDataObjects & 0x07) << 12);
      hdr |= ((extended & 0x01) << 15);

      // Port power role is only applicable if cablePlug is 0
      if (!cablePlug) {
        hdr |= ((portPowerRole & 0x01) << 8);
      }

      return hdr & 0xFFFF;
    }

    /**
     * Dissects 16-bit Message Header
     */
    parseHeader(headerWord) {
      const msgType = headerWord & 0x1F;
      const portDataRole = (headerWord >> 5) & 0x01;
      const specRev = (headerWord >> 6) & 0x03;
      const portPowerRole = (headerWord >> 8) & 0x01;
      const msgId = (headerWord >> 9) & 0x07;
      const numDataObjects = (headerWord >> 12) & 0x07;
      const extended = (headerWord >> 15) & 0x01;

      const isDataMsg = numDataObjects > 0;
      const msgTypeName = isDataMsg
        ? (DATA_MSG_TYPES[msgType] || `Data_Msg_${msgType}`)
        : (CONTROL_MSG_TYPES[msgType] || `Control_Msg_${msgType}`);

      return {
        headerRaw: headerWord,
        msgType,
        msgTypeName,
        isDataMsg,
        numDataObjects,
        msgId,
        portPowerRole: portPowerRole === 1 ? 'Source' : 'Sink',
        portDataRole: portDataRole === 1 ? 'DFP' : 'UFP',
        specRev: specRev === 2 ? 'Rev 3.0/3.1' : (specRev === 1 ? 'Rev 2.0' : 'Rev 1.0'),
        extended: extended === 1
      };
    }

    /**
     * Builds Fixed Supply Power Data Object (PDO - 32 bits)
     */
    buildFixedPDO(options) {
      const {
        voltage_mV = 5000,
        current_mA = 3000,
        dualRolePower = true,
        suspendSupported = true,
        unconstrainedPower = true,
        usbCommCapable = true,
        dualRoleData = true,
        eprCapable = false
      } = options;

      let pdo = 0; // Type = 00b (Fixed Supply)
      if (dualRolePower) pdo |= (1 << 29);
      if (suspendSupported) pdo |= (1 << 28);
      if (unconstrainedPower) pdo |= (1 << 27);
      if (usbCommCapable) pdo |= (1 << 26);
      if (dualRoleData) pdo |= (1 << 25);
      if (eprCapable) pdo |= (1 << 23);

      const voltUnits = Math.round(voltage_mV / 50) & 0x3FF; // 50mV units
      const currUnits = Math.round(current_mA / 10) & 0x3FF; // 10mA units

      pdo |= (voltUnits << 10);
      pdo |= currUnits;

      return pdo >>> 0;
    }

    /**
     * Builds Augmented PDO (APDO) / PPS or EPR AVS (32 bits)
     */
    buildAPDO(options) {
      const {
        isEprAvs = false,
        minVoltage_mV = 3300,
        maxVoltage_mV = 21000,
        maxCurrent_mA = 5000
      } = options;

      let apdo = (3 << 30); // Supply type 11b (Augmented)
      if (isEprAvs) {
        apdo |= (1 << 28); // APDO type 01b (EPR AVS)
        const maxV = Math.round(maxVoltage_mV / 100) & 0x1FF; // 100mV units
        const minV = Math.round(minVoltage_mV / 100) & 0x1FF; // 100mV units
        const maxI = Math.round(maxCurrent_mA / 50) & 0xFF;    // 50mA units
        apdo |= (maxV << 17);
        apdo |= (minV << 8);
        apdo |= maxI;
      } else {
        // SPR PPS (3.3V to 21V)
        const maxV = Math.round(maxVoltage_mV / 100) & 0xFF; // 100mV units
        const minV = Math.round(minVoltage_mV / 100) & 0xFF; // 100mV units
        const maxI = Math.round(maxCurrent_mA / 50) & 0x7F;   // 50mA units
        apdo |= (maxV << 17);
        apdo |= (minV << 8);
        apdo |= maxI;
      }
      return apdo >>> 0;
    }

    /**
     * Dissects a 32-bit Power Data Object (PDO)
     */
    parsePDO(pdoWord) {
      const supplyType = (pdoWord >>> 30) & 0x03;

      if (supplyType === 0) {
        // Fixed Supply
        const dualRolePower = ((pdoWord >> 29) & 1) === 1;
        const unconstrainedPower = ((pdoWord >> 27) & 1) === 1;
        const usbCommCapable = ((pdoWord >> 26) & 1) === 1;
        const eprCapable = ((pdoWord >> 23) & 1) === 1;
        const volt_mV = ((pdoWord >> 10) & 0x3FF) * 50;
        const curr_mA = (pdoWord & 0x3FF) * 10;
        const power_W = (volt_mV * curr_mA) / 1000000;

        return {
          type: 'Fixed Supply',
          voltage_mV: volt_mV,
          voltage_V: (volt_mV / 1000).toFixed(1),
          current_mA: curr_mA,
          current_A: (curr_mA / 1000).toFixed(2),
          power_W: power_W.toFixed(1),
          dualRolePower,
          unconstrainedPower,
          usbCommCapable,
          eprCapable,
          rawHex: '0x' + pdoWord.toString(16).padStart(8, '0').toUpperCase()
        };
      } else if (supplyType === 3) {
        // Augmented PDO (PPS / EPR AVS)
        const apdoType = (pdoWord >>> 28) & 0x03;
        const isEpr = apdoType === 1;
        let minV, maxV, maxI;

        if (isEpr) {
          maxV = ((pdoWord >> 17) & 0x1FF) * 100;
          minV = ((pdoWord >> 8) & 0x1FF) * 100;
          maxI = (pdoWord & 0xFF) * 50;
        } else {
          maxV = ((pdoWord >> 17) & 0xFF) * 100;
          minV = ((pdoWord >> 8) & 0xFF) * 100;
          maxI = (pdoWord & 0x7F) * 50;
        }

        const maxPower_W = (maxV * maxI) / 1000000;

        return {
          type: isEpr ? 'EPR AVS (Adjustable Voltage)' : 'SPR PPS (Programmable)',
          minVoltage_mV: minV,
          maxVoltage_mV: maxV,
          minVoltage_V: (minV / 1000).toFixed(1),
          maxVoltage_V: (maxV / 1000).toFixed(1),
          maxCurrent_mA: maxI,
          maxCurrent_A: (maxI / 1000).toFixed(2),
          maxPower_W: maxPower_W.toFixed(1),
          rawHex: '0x' + pdoWord.toString(16).padStart(8, '0').toUpperCase()
        };
      }

      return {
        type: supplyType === 1 ? 'Variable Supply' : 'Battery Supply',
        rawHex: '0x' + pdoWord.toString(16).padStart(8, '0').toUpperCase()
      };
    }

    /**
     * Builds Request Data Object (RDO - 32 bits)
     */
    buildRDO(options) {
      const {
        objectPosition = 1,
        giveBack = false,
        capabilityMismatch = false,
        operatingCurrent_mA = 3000,
        maxOperatingCurrent_mA = 3000,
        isPPS = false,
        outputVoltage_mV = 9000
      } = options;

      let rdo = (objectPosition & 0x07) << 28;
      if (giveBack) rdo |= (1 << 27);
      if (capabilityMismatch) rdo |= (1 << 26);

      if (isPPS) {
        const voltUnits = Math.round(outputVoltage_mV / 20) & 0x7FF; // 20mV units
        const currUnits = Math.round(operatingCurrent_mA / 50) & 0x7F; // 50mA units
        rdo |= (voltUnits << 9);
        rdo |= currUnits;
      } else {
        const opCurr = Math.round(operatingCurrent_mA / 10) & 0x3FF; // 10mA units
        const maxCurr = Math.round(maxOperatingCurrent_mA / 10) & 0x3FF; // 10mA units
        rdo |= (opCurr << 10);
        rdo |= maxCurr;
      }

      return rdo >>> 0;
    }

    /**
     * Assembles a complete wire frame (SOP + Header + Data Objects + CRC32 + EOP)
     */
    assemblePacket(sopType, headerWord, dataObjects = []) {
      const payloadBytes = new Uint8Array(2 + (dataObjects.length * 4));
      const view = new DataView(payloadBytes.buffer);

      // Header is little endian on wire in USB-PD
      view.setUint16(0, headerWord, true);

      for (let i = 0; i < dataObjects.length; i++) {
        view.setUint32(2 + (i * 4), dataObjects[i], true);
      }

      const crc = this.calculateCRC32(payloadBytes);

      const packetBytes = new Uint8Array(payloadBytes.length + 4);
      packetBytes.set(payloadBytes, 0);
      const pView = new DataView(packetBytes.buffer);
      pView.setUint32(payloadBytes.length, crc, true);

      return {
        sopType,
        header: this.parseHeader(headerWord),
        dataObjects: dataObjects.map(d => this.parsePDO(d)),
        crc32: '0x' + crc.toString(16).padStart(8, '0').toUpperCase(),
        wireBytes: packetBytes
      };
    }

    /**
     * Encodes 8-bit bytes into 4b/5b BMC symbols
     */
    encode4b5b(bytes) {
      const symbols = [];
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        const lowNibble = b & 0x0F;
        const highNibble = (b >> 4) & 0x0F;
        symbols.push(NIBBLE_TO_5B[lowNibble]);
        symbols.push(NIBBLE_TO_5B[highNibble]);
      }
      return symbols;
    }

    /**
     * Generates a Wireshark / Sigrok PCAP capture file
     */
    generatePCAP(packets) {
      const globalHeader = new Uint8Array(24);
      const ghView = new DataView(globalHeader.buffer);
      ghView.setUint32(0, 0xa1b2c3d4, false); // Magic Number
      ghView.setUint16(4, 2, false);          // Version 2.4
      ghView.setUint16(6, 4, false);
      ghView.setUint32(16, 65535, false);     // Snaplen
      ghView.setUint32(20, 147, false);       // LINKTYPE_USER0 (USB-PD CC line)

      const packetBuffers = [];
      let totalLength = 24;
      const baseSec = Math.floor(Date.now() / 1000) - 20;

      for (let idx = 0; idx < packets.length; idx++) {
        const raw = packets[idx];
        const pHeader = new Uint8Array(16);
        const phView = new DataView(pHeader.buffer);
        phView.setUint32(0, baseSec + idx, false);
        phView.setUint32(4, idx * 80000, false);
        phView.setUint32(8, raw.length, false);
        phView.setUint32(12, raw.length, false);

        packetBuffers.push(pHeader, raw);
        totalLength += 16 + raw.length;
      }

      const pcap = new Uint8Array(totalLength);
      pcap.set(globalHeader, 0);
      let offset = 24;
      for (const b of packetBuffers) {
        pcap.set(b, offset);
        offset += b.length;
      }
      return pcap;
    }
  }

  return USBPDProtocolEngine;
});
