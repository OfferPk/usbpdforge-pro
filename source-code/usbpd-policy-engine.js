/**
 * USBPDForge Pro - Power Negotiation & Policy Engine
 * Models USB-PD 3.1 SPR (100W) & EPR (240W) Power Contracts
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.USBPDPolicyEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class USBPDPolicyEngine {
    constructor() {
      this.standardProfiles = [
        { id: 1, name: 'Standard 15W', voltage_V: 5.0, maxCurrent_A: 3.0, power_W: 15.0, type: 'Fixed' },
        { id: 2, name: 'QuickCharge 27W', voltage_V: 9.0, maxCurrent_A: 3.0, power_W: 27.0, type: 'Fixed' },
        { id: 3, name: 'Ultrabook 45W', voltage_V: 15.0, maxCurrent_A: 3.0, power_W: 45.0, type: 'Fixed' },
        { id: 4, name: 'Full SPR 100W', voltage_V: 20.0, maxCurrent_A: 5.0, power_W: 100.0, type: 'Fixed', requires5ACable: true },
        { id: 5, name: 'Samsung 45W PPS', minVoltage_V: 3.3, maxVoltage_V: 21.0, maxCurrent_A: 5.0, power_W: 45.0, type: 'PPS', requires5ACable: true },
        { id: 6, name: 'MacBook Pro 140W EPR', voltage_V: 28.0, maxCurrent_A: 5.0, power_W: 140.0, type: 'EPR_Fixed', isEpr: true, requires5ACable: true },
        { id: 7, name: 'Gaming Laptop 180W EPR', voltage_V: 36.0, maxCurrent_A: 5.0, power_W: 180.0, type: 'EPR_Fixed', isEpr: true, requires5ACable: true },
        { id: 8, name: 'Max Ceiling 240W EPR', voltage_V: 48.0, maxCurrent_A: 5.0, power_W: 240.0, type: 'EPR_Fixed', isEpr: true, requires5ACable: true },
        { id: 9, name: 'Universal 240W AVS', minVoltage_V: 15.0, maxVoltage_V: 48.0, maxCurrent_A: 5.0, power_W: 240.0, type: 'EPR_AVS', isEpr: true, requires5ACable: true }
      ];
    }

    /**
     * Evaluates a Power Contract request from a Sink against Source capabilities
     */
    evaluateContract(sourceCaps, requestRDO, cableEMarker) {
      const position = requestRDO.objectPosition;
      if (position < 1 || position > sourceCaps.length) {
        return {
          status: 'REJECT',
          reason: `Invalid PDO position: ${position} (Source offers ${sourceCaps.length} PDOs)`
        };
      }

      const selectedPDO = sourceCaps[position - 1];
      const cableMaxCurrent = cableEMarker.maxCurrent_A || 3.0;
      const requestedCurrent = requestRDO.operatingCurrent_mA / 1000;

      // Cable verification rule (USB-PD 3.1 Section 6.4)
      if (requestedCurrent > 3.0 && cableMaxCurrent < 5.0) {
        return {
          status: 'REJECT',
          reason: `Cable current limit exceeded: requested ${requestedCurrent}A but cable is rated for ${cableMaxCurrent}A without 5A E-Marker`,
          hazard: 'CABLE_MELTDOWN_RISK'
        };
      }

      // EPR verification rule
      if (selectedPDO.voltage_V > 20.0 || (selectedPDO.maxVoltage_V && selectedPDO.maxVoltage_V > 20.0)) {
        if (!cableEMarker.isEprCapable) {
          return {
            status: 'REJECT',
            reason: `EPR voltage requested (${selectedPDO.voltage_V || selectedPDO.maxVoltage_V}V) but cable lacks EPR 50V rating`,
            hazard: 'DIELECTRIC_BREAKDOWN_RISK'
          };
        }
      }

      // Contract calculation
      let negotiatedVoltage = selectedPDO.voltage_V || 20.0;
      if (selectedPDO.type.includes('PPS') || selectedPDO.type.includes('AVS')) {
        negotiatedVoltage = (requestRDO.outputVoltage_mV || 9000) / 1000;
      }

      const negotiatedCurrent = Math.min(requestedCurrent, selectedPDO.maxCurrent_A || 3.0);
      const negotiatedPower_W = negotiatedVoltage * negotiatedCurrent;

      // Efficiency calculation (GaN FET modeling)
      const efficiency = negotiatedPower_W > 100 ? 0.945 : 0.92;
      const heatDissipation_W = negotiatedPower_W * (1 - efficiency);

      return {
        status: 'ACCEPT',
        pdoIndex: position,
        profileName: selectedPDO.name || `PDO ${position}`,
        contract: {
          voltage_V: Number(negotiatedVoltage.toFixed(2)),
          current_A: Number(negotiatedCurrent.toFixed(2)),
          power_W: Number(negotiatedPower_W.toFixed(1)),
          isEPR: negotiatedVoltage > 20.0,
          efficiencyPercent: (efficiency * 100).toFixed(1),
          heatDissipation_W: heatDissipation_W.toFixed(2)
        }
      };
    }
  }

  return USBPDPolicyEngine;
});
