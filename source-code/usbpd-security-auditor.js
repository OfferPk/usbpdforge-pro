/**
 * USBPDForge Pro - Electrical Safety & Cybersecurity Auditor
 * Standards: USB-PD 3.1 Chapter 8 (Electrical Requirements), UL 9990, IEC 62368-1
 * Pure ES6+ Module - Zero External Runtime Dependencies
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.USBPDSecurityAuditor = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class USBPDSecurityAuditor {
    constructor() {
      this.AUDIT_RULES = [
        {
          id: 'USBPD_SEC_01',
          name: 'Cable E-Marker 5A Overload Verification',
          category: 'Thermal & Fire Safety',
          severity: 'CRITICAL',
          weight: 15,
          description: 'Sinks requesting over 3.0A (up to 5.0A) must verify an electronically marked cable reporting 5A capability. Delivering 5A over unrated 3A cables causes catastrophic wire melting.',
          remediation: 'Mandate SOP\' Discover Identity check before accepting RDO current > 3.0A. Limit fallback current strictly to 3.0A if cable lacks valid 5A E-Marker.'
        },
        {
          id: 'USBPD_SEC_02',
          name: 'EPR 240W Arc Prevention & KeepAlive Hardening',
          category: 'High-Voltage Electrical Safety',
          severity: 'CRITICAL',
          weight: 15,
          description: 'Voltages up to 48V under 5A (240W) create severe electric arc hazards during live physical unplug. Sinks and Sources must maintain EPR_KeepAlive pings (tEPRKeepAlive < 1000ms).',
          remediation: 'Enforce EPR_KeepAlive timer (750ms). Trigger immediate VBUS discharge to vSafe5V if EPR_KeepAlive times out or CC line disconnects.'
        },
        {
          id: 'USBPD_SEC_03',
          name: 'VBUS Over-Voltage Crowbar Protection',
          category: 'Hardware Destruction Mitigation',
          severity: 'HIGH',
          weight: 15,
          description: 'Rogue or failing chargers delivering 20V/48V into a 5V-only sink will destroy PMIC chips unless hardware crowbar or OVP FETs trigger within < 10 microseconds.',
          remediation: 'Implement hardware OVP latching circuit rated for 55V on VBUS. Refuse contract if source offers voltages exceeding sink declared absolute maximum.'
        },
        {
          id: 'USBPD_SEC_04',
          name: 'Reverse Power Back-Feeding Defense',
          category: 'Power Flow Integrity',
          severity: 'HIGH',
          weight: 10,
          description: 'Faulty Dual-Role Power (DRP) negotiation can cause the sink battery to inadvertently discharge and back-feed into a connected peripheral or rogue charger.',
          remediation: 'Enforce strict Power Role Swap (PR_Swap) validation. Disable reverse VBUS discharge FETs unless explicitly authorized by user UI policy.'
        },
        {
          id: 'USBPD_SEC_05',
          name: 'BadUSB Malicious VDM Firmware Injection',
          category: 'Host Platform Cybersecurity',
          severity: 'HIGH',
          weight: 10,
          description: 'Unchecked Vendor Defined Messages (VDMs) allow rogue charging cables or accessories to flash malicious firmware payloads directly into the PD controller EEPROM.',
          remediation: 'Cryptographically authenticate firmware update VDMs using ECDSA P-256 signatures. Lock PD controller bootloader write-protect fuses in production.'
        },
        {
          id: 'USBPD_SEC_06',
          name: 'Dynamic PPS Thermal Throttling Contract',
          category: 'Battery Management & Safety',
          severity: 'MEDIUM',
          weight: 10,
          description: 'During Programmable Power Supply (PPS) charging, lack of dynamic 20mV stepdown requests when lithium cell temperature exceeds 45°C causes battery swelling.',
          remediation: 'Integrate NTC thermistor feedback into PD policy engine. Force RDO current step-down or fallback to 5V 1A if battery temperature exceeds 45°C.'
        },
        {
          id: 'USBPD_SEC_07',
          name: 'MessageID Counter Replay Attack Prevention',
          category: 'Protocol State Machine Integrity',
          severity: 'MEDIUM',
          weight: 10,
          description: 'USB-PD uses a 3-bit MessageID (0..7). Failure to reject frames with stale or out-of-order MessageIDs allows replay of obsolete power requests.',
          remediation: 'Strictly check MessageID against local tracking counter. Issue Soft_Reset if duplicate MessageID is received unexpectedly.'
        },
        {
          id: 'USBPD_SEC_08',
          name: 'Hard Reset Oscillation Exhaustion Limiter',
          category: 'Denial of Service Mitigation',
          severity: 'MEDIUM',
          weight: 5,
          description: 'A rogue device repeatedly pulsing Hard Reset can trap the charger in an endless VBUS discharge/charge cycle, overheating flyback transformers.',
          remediation: 'Cap Hard Reset count to max 2 attempts (nHardResetCount). If negotiation fails, enter ErrorRecovery state and detach CC pull-up/pull-down.'
        },
        {
          id: 'USBPD_SEC_09',
          name: 'Unauthenticated DisplayPort Alt Mode Tap Protection',
          category: 'Data Confidentiality & Privacy',
          severity: 'MEDIUM',
          weight: 5,
          description: 'Entering DP Alt Mode automatically re-routes high-speed differential pairs. Malicious docking stations can intercept video or PCIe sideband signals.',
          remediation: 'Require operating system user prompt before executing Enter_Mode for non-standard SVIDs. Pin-lock high-speed multiplexers.'
        },
        {
          id: 'USBPD_SEC_10',
          name: 'CRC-32 Frame Integrity Gatekeeper',
          category: 'Signaling Robustness',
          severity: 'MEDIUM',
          weight: 5,
          description: 'Noise on the CC line can corrupt bits. Processing PD packets without verifying the 32-bit polynomial CRC can lead to corrupted voltage contracts.',
          remediation: 'Verify hardware CRC-32 (0x04C11DB7) before passing packet to protocol layer. Send GoodCRC only when checksum passes 100% cleanly.'
        }
      ];
    }

    /**
     * Executes the 10-point USB-PD security audit on port & controller configuration
     */
    auditDevice(config = {}) {
      const findings = [];
      let totalDeductions = 0;

      // Rule 1: Cable 5A check
      if (!config.verifyCableEMarkerFor5A) {
        findings.push(this.createFinding('USBPD_SEC_01', 'Sink accepts >3A power contracts without checking SOP\' Cable E-Marker.'));
        totalDeductions += 15;
      }

      // Rule 2: EPR KeepAlive & arc protection
      if (!config.enforceEprKeepAlive) {
        findings.push(this.createFinding('USBPD_SEC_02', 'EPR KeepAlive pings (750ms) not enforced; arc disconnect hazard at 48V/240W.'));
        totalDeductions += 15;
      }

      // Rule 3: VBUS OVP
      if (!config.hardwareOvpClamp) {
        findings.push(this.createFinding('USBPD_SEC_03', 'Hardware VBUS over-voltage crowbar clamp missing or response time > 10us.'));
        totalDeductions += 15;
      }

      // Rule 4: Reverse back-feeding
      if (!config.reversePowerProtection) {
        findings.push(this.createFinding('USBPD_SEC_04', 'PR_Swap allowed without user policy consent; risk of reverse battery drainage.'));
        totalDeductions += 10;
      }

      // Rule 5: VDM firmware security
      if (!config.vdmSignatureAuth) {
        findings.push(this.createFinding('USBPD_SEC_05', 'PD controller accepts unauthenticated vendor VDM firmware flashing.'));
        totalDeductions += 10;
      }

      // Rule 6: PPS thermal throttling
      if (!config.ppsThermalFeedback) {
        findings.push(this.createFinding('USBPD_SEC_06', 'No dynamic PPS voltage step-down integrated with battery thermistor monitoring.'));
        totalDeductions += 10;
      }

      // Rule 7: MessageID replay check
      if (!config.strictMessageIdValidation) {
        findings.push(this.createFinding('USBPD_SEC_07', 'MessageID tracking disabled; vulnerable to packet replay desync.'));
        totalDeductions += 10;
      }

      // Rule 8: Hard Reset loop limiter
      if (!config.hardResetCap) {
        findings.push(this.createFinding('USBPD_SEC_08', 'Hard reset cycle count uncapped; vulnerable to endless reset oscillation DoS.'));
        totalDeductions += 5;
      }

      // Rule 9: Alt Mode consent
      if (!config.altModeConsentPrompt) {
        findings.push(this.createFinding('USBPD_SEC_09', 'DisplayPort Alt Mode multiplexing granted automatically without host OS authorization.'));
        totalDeductions += 5;
      }

      // Rule 10: Strict CRC validation
      if (!config.hardwareCrc32Validation) {
        findings.push(this.createFinding('USBPD_SEC_10', 'PHY relies on software CRC or fails to reject corrupted packets.'));
        totalDeductions += 5;
      }

      const score = Math.max(0, 100 - totalDeductions);
      let posture = 'POOR';
      if (score >= 90) posture = 'EXCELLENT';
      else if (score >= 75) posture = 'GOOD';
      else if (score >= 60) posture = 'ACCEPTABLE';

      return {
        auditTimestamp: new Date().toISOString(),
        score,
        posture,
        totalRulesAudited: this.AUDIT_RULES.length,
        findingsCount: findings.length,
        criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
        highCount: findings.filter(f => f.severity === 'HIGH').length,
        mediumCount: findings.filter(f => f.severity === 'MEDIUM').length,
        findings
      };
    }

    createFinding(ruleId, evidence) {
      const rule = this.AUDIT_RULES.find(r => r.id === ruleId);
      return {
        ruleId,
        ruleName: rule.name,
        category: rule.category,
        severity: rule.severity,
        evidence,
        description: rule.description,
        remediation: rule.remediation
      };
    }
  }

  return USBPDSecurityAuditor;
});
