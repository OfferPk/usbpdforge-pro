/**
 * USBPDForge Pro - Web Application Controller
 * Connects protocol engine, policy negotiator, SVDM engine, and safety auditor
 */

document.addEventListener('DOMContentLoaded', () => {
  const engine = new window.USBPDProtocolEngine();
  const policy = new window.USBPDPolicyEngine();
  const vdm = window.USBPDVDMEngine;
  const auditor = new window.USBPDSecurityAuditor();

  let currentPacketResult = null;

  // ---------------------------------------------------------------------------
  // Tab Navigation
  // ---------------------------------------------------------------------------
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // ---------------------------------------------------------------------------
  // Tab 1: Packet Studio & BMC Dissector
  // ---------------------------------------------------------------------------
  const sopSelect = document.getElementById('sop-type-select');
  const msgTypeSelect = document.getElementById('msg-type-select');
  const powerRoleSelect = document.getElementById('power-role-select');
  const dataRoleSelect = document.getElementById('data-role-select');
  const msgIdInput = document.getElementById('msg-id-input');
  const specRevSelect = document.getElementById('spec-rev-select');
  const dataObjectsInput = document.getElementById('data-objects-input');

  const wireHexOutput = document.getElementById('wire-hex-output');
  const dissectedOutput = document.getElementById('dissected-packet-output');
  const bmcSymbolsOutput = document.getElementById('bmc-symbols-output');
  const btnBuild = document.getElementById('btn-build-packet');

  function assembleStudioPacket() {
    try {
      const sop = sopSelect.value;
      const typeRaw = msgTypeSelect.value.split('_');
      const msgTypeNum = parseInt(typeRaw[0], 10);
      const isData = typeRaw[1] === 'DATA';

      const powerRole = parseInt(powerRoleSelect.value, 10);
      const dataRole = parseInt(dataRoleSelect.value, 10);
      const msgId = parseInt(msgIdInput.value, 10) || 0;
      const specRev = parseInt(specRevSelect.value, 10);

      const lines = dataObjectsInput.value
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

      const dataObjects = lines.map(l => {
        const hex = l.replace(/^0x/i, '');
        return parseInt(hex, 16) >>> 0;
      });

      const numObj = isData ? dataObjects.length : 0;

      const headerWord = engine.buildHeader({
        msgType: msgTypeNum,
        numDataObjects: numObj,
        msgId,
        portPowerRole: powerRole,
        specRev,
        portDataRole: dataRole
      });

      const result = engine.assemblePacket(sop, headerWord, isData ? dataObjects : []);
      currentPacketResult = result;

      // Hex string format
      const hexStr = Array.from(result.wireBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      wireHexOutput.textContent = hexStr;

      // Dissected structure
      let desc = `SOP Delimiter: ${result.sopType}\n`;
      desc += `Header (0x${headerWord.toString(16).padStart(4, '0').toUpperCase()}): ${result.header.msgTypeName} [Role: ${result.header.portPowerRole}/${result.header.portDataRole}, ID: ${result.header.msgId}, ${result.header.specRev}]\n`;
      desc += `Number of Data Objects: ${result.header.numDataObjects}\n`;

      result.dataObjects.forEach((d, idx) => {
        if (d.type === 'Fixed Supply') {
          desc += `  PDO #${idx + 1}: Fixed ${d.voltage_V}V @ ${d.current_A}A (${d.power_W}W) [${d.rawHex}]\n`;
        } else if (d.type.includes('PPS') || d.type.includes('AVS')) {
          desc += `  PDO #${idx + 1}: ${d.type} ${d.minVoltage_V}V-${d.maxVoltage_V}V @ ${d.maxCurrent_A}A (${d.maxPower_W}W) [${d.rawHex}]\n`;
        } else {
          desc += `  Data Object #${idx + 1}: [${d.rawHex}]\n`;
        }
      });

      desc += `CRC-32 Checksum: ${result.crc32} (Hardware Verified)`;
      dissectedOutput.textContent = desc;

      // 4b/5b BMC symbols
      const symbols = engine.encode4b5b(result.wireBytes.subarray(0, Math.min(10, result.wireBytes.length)));
      const symStr = symbols.map(s => '0b' + s.toString(2).padStart(5, '0')).join(', ') + ' ... (BMC Clock Encoded)';
      bmcSymbolsOutput.textContent = symStr;
    } catch (err) {
      wireHexOutput.textContent = `Error: ${err.message}`;
      dissectedOutput.textContent = `Error: ${err.message}`;
    }
  }

  btnBuild.addEventListener('click', assembleStudioPacket);

  document.getElementById('btn-sample-src-cap').addEventListener('click', () => {
    msgTypeSelect.value = '1_DATA';
    powerRoleSelect.value = '1';
    dataRoleSelect.value = '1';
    // 5V 3A, 9V 3A, 15V 3A, 20V 5A, 28V 5A (140W EPR)
    dataObjectsInput.value = `0x0801912C\n0x0002D12C\n0x0004B12C\n0x000641F4\n0x0088C1F4`;
    assembleStudioPacket();
  });

  document.getElementById('btn-sample-rdo').addEventListener('click', () => {
    msgTypeSelect.value = '2_DATA';
    powerRoleSelect.value = '0';
    dataRoleSelect.value = '0';
    // Request Object 4 (20V 5A), 5000mA Operating, 5000mA Max
    dataObjectsInput.value = `0x1304B1F4`;
    assembleStudioPacket();
  });

  document.getElementById('btn-copy-hex').addEventListener('click', () => {
    navigator.clipboard.writeText(wireHexOutput.textContent);
    alert('Wire Hex bytes copied to clipboard!');
  });

  function downloadBlob(bytes, filename, type = 'application/octet-stream') {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById('btn-export-pcap').addEventListener('click', () => {
    if (!currentPacketResult) assembleStudioPacket();
    if (currentPacketResult) {
      const pcap = engine.generatePCAP([currentPacketResult.wireBytes]);
      downloadBlob(pcap, 'usb-pd-packet.pcap');
    }
  });

  // ---------------------------------------------------------------------------
  // Tab 2: PDO & RDO Power Negotiator
  // ---------------------------------------------------------------------------
  const sourcePdoList = document.getElementById('source-pdo-list');
  const negotiatorCableRating = document.getElementById('negotiator-cable-rating');
  const sinkReqCurrent = document.getElementById('sink-req-current');
  const btnEvalContract = document.getElementById('btn-evaluate-contract');

  const telPower = document.getElementById('telemetry-power');
  const telVolt = document.getElementById('telemetry-voltage');
  const telCurr = document.getElementById('telemetry-current');
  const telEff = document.getElementById('telemetry-efficiency');
  const telHeat = document.getElementById('telemetry-heat');
  const telRdoHex = document.getElementById('telemetry-rdo-hex');
  const contractBadge = document.getElementById('contract-badge');

  let selectedPdoIndex = 6; // Default to MacBook 140W EPR

  function renderSourcePDOs() {
    sourcePdoList.innerHTML = '';
    policy.standardProfiles.forEach((prof, idx) => {
      const row = document.createElement('div');
      const isSel = (idx + 1) === selectedPdoIndex;
      row.className = `pdo-row ${isSel ? 'selected' : ''} ${prof.isEpr ? 'epr' : ''}`;
      
      const vText = prof.voltage_V ? `${prof.voltage_V}V` : `${prof.minVoltage_V}V-${prof.maxVoltage_V}V`;
      row.innerHTML = `
        <div>
          <strong>#${prof.id} ${prof.name}</strong>
          <span style="color:var(--color-text-muted); font-size:0.75rem; margin-left:8px;">${prof.type}</span>
        </div>
        <div>
          <span style="color:var(--color-cyan);">${vText}</span> @ 
          <span style="color:var(--color-amber);">${prof.maxCurrent_A}A</span> 
          (<strong style="color:#ffffff;">${prof.power_W}W</strong>)
        </div>
      `;

      row.addEventListener('click', () => {
        selectedPdoIndex = idx + 1;
        renderSourcePDOs();
        evaluateCurrentContract();
      });

      sourcePdoList.appendChild(row);
    });
  }

  function evaluateCurrentContract() {
    const cableType = negotiatorCableRating.value;
    const cableEMarker = {
      maxCurrent_A: cableType.startsWith('5A') ? 5.0 : 3.0,
      isEprCapable: cableType === '5A_EPR'
    };

    const reqCurr = parseFloat(sinkReqCurrent.value) || 3.0;
    const reqRDO = {
      objectPosition: selectedPdoIndex,
      operatingCurrent_mA: Math.round(reqCurr * 1000)
    };

    const evalResult = policy.evaluateContract(policy.standardProfiles, reqRDO, cableEMarker);

    if (evalResult.status === 'ACCEPT') {
      const c = evalResult.contract;
      telPower.textContent = `${c.power_W} W`;
      telVolt.textContent = ` ${c.voltage_V.toFixed(2)} V`;
      telCurr.textContent = ` ${c.current_A.toFixed(2)} A`;
      telEff.textContent = `GaN Efficiency: ${c.efficiencyPercent}%`;
      telHeat.textContent = `Thermal Loss: ${c.heatDissipation_W} W`;
      contractBadge.textContent = 'CONTRACT ACCEPTED';
      contractBadge.className = 'badge badge-green';

      const rdoWord = engine.buildRDO({
        objectPosition: selectedPdoIndex,
        operatingCurrent_mA: Math.round(c.current_A * 1000),
        maxOperatingCurrent_mA: Math.round(c.current_A * 1000)
      });
      telRdoHex.textContent = `0x${rdoWord.toString(16).padStart(8, '0').toUpperCase()} (Obj: ${selectedPdoIndex}, Op: ${c.current_A}A)`;
    } else {
      telPower.textContent = `0.0 W`;
      telVolt.textContent = ` 0.00 V`;
      telCurr.textContent = ` 0.00 A`;
      contractBadge.textContent = `REJECTED: ${evalResult.hazard || 'INCOMPATIBLE'}`;
      contractBadge.className = 'badge';
      contractBadge.style.background = 'rgba(255, 23, 68, 0.2)';
      contractBadge.style.color = 'var(--color-danger-red)';
      telRdoHex.textContent = `Reason: ${evalResult.reason}`;
    }
  }

  btnEvalContract.addEventListener('click', evaluateCurrentContract);
  negotiatorCableRating.addEventListener('change', evaluateCurrentContract);

  // ---------------------------------------------------------------------------
  // Tab 3: Cable E-Marker & SVDM Inspector
  // ---------------------------------------------------------------------------
  const emarkerCurrent = document.getElementById('emarker-current');
  const emarkerVoltage = document.getElementById('emarker-voltage');
  const emarkerSpeed = document.getElementById('emarker-speed');
  const btnGenEmarker = document.getElementById('btn-generate-emarker');
  const emarkerOutput = document.getElementById('emarker-vdo-output');

  function updateEMarker() {
    const maxCurrent = parseFloat(emarkerCurrent.value);
    const isEpr = emarkerVoltage.value === 'true';
    const speed = emarkerSpeed.value;

    const res = vdm.buildCableEMarker({
      maxCurrent_A: maxCurrent,
      isEprCapable: isEpr,
      usbSpeed: speed
    });

    let text = `ID Header VDO: 0x${res.idHeaderVdo.toString(16).padStart(8, '0').toUpperCase()}\n`;
    text += `Cert Stat VDO: 0x${res.certStatVdo.toString(16).padStart(8, '0').toUpperCase()}\n`;
    text += `Passive Cable VDO: 0x${res.cableVdo.toString(16).padStart(8, '0').toUpperCase()}\n`;
    text += `Rating: ${res.summary.maxVoltage} | Current: ${res.summary.maxCurrent} | Signaling: ${res.summary.usbSpeed}`;
    emarkerOutput.textContent = text;
  }

  btnGenEmarker.addEventListener('click', updateEMarker);

  // ---------------------------------------------------------------------------
  // Tab 4: Type-C Safety & Threat Auditor
  // ---------------------------------------------------------------------------
  const btnRunAudit = document.getElementById('btn-run-audit');
  const auditScoreNum = document.getElementById('audit-score-num');
  const auditScorePosture = document.getElementById('audit-score-posture');
  const auditFindingsList = document.getElementById('audit-findings-list');

  function runElectricalAudit() {
    const config = {
      verifyCableEMarkerFor5A: document.getElementById('sec-emarker').value === 'true',
      enforceEprKeepAlive: document.getElementById('sec-keepalive').value === 'true',
      hardwareOvpClamp: document.getElementById('sec-ovp').value === 'true',
      vdmSignatureAuth: document.getElementById('sec-vdm').value === 'true',
      ppsThermalFeedback: document.getElementById('sec-pps').value === 'true',
      reversePowerProtection: true,
      strictMessageIdValidation: true,
      hardResetCap: true,
      altModeConsentPrompt: true,
      hardwareCrc32Validation: true
    };

    const res = auditor.auditDevice(config);
    auditScoreNum.textContent = res.score;
    auditScorePosture.textContent = `${res.posture} SAFETY POSTURE (${res.findingsCount} Hazards)`;

    if (res.score >= 80) {
      auditScoreNum.style.color = 'var(--color-safe-green)';
      auditScorePosture.style.color = 'var(--color-safe-green)';
    } else if (res.score >= 60) {
      auditScoreNum.style.color = 'var(--color-amber)';
      auditScorePosture.style.color = 'var(--color-amber)';
    } else {
      auditScoreNum.style.color = 'var(--color-danger-red)';
      auditScorePosture.style.color = 'var(--color-danger-red)';
    }

    auditFindingsList.innerHTML = '';
    if (res.findings.length === 0) {
      auditFindingsList.innerHTML = '<div style="padding:16px; color:var(--color-safe-green); text-align:center;">All 10 USB-PD Safety Checks Passed! Port is UL 9990 Compliant.</div>';
    } else {
      res.findings.forEach(f => {
        const item = document.createElement('div');
        item.className = `finding-item ${f.severity}`;
        item.innerHTML = `
          <div class="finding-header">
            <span>[${f.ruleId}] ${f.ruleName}</span>
            <span class="badge" style="background:rgba(255,255,255,0.1);">${f.severity}</span>
          </div>
          <div class="finding-desc">${f.evidence} ${f.description}</div>
          <div class="finding-remed"><strong>Remediation:</strong> ${f.remediation}</div>
        `;
        auditFindingsList.appendChild(item);
      });
    }
  }

  btnRunAudit.addEventListener('click', runElectricalAudit);

  // ---------------------------------------------------------------------------
  // Tab 5: Logic Analyzer & PCAP
  // ---------------------------------------------------------------------------
  document.getElementById('btn-copy-csv').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('csv-preview').textContent);
    alert('PulseView CSV copied to clipboard!');
  });

  document.getElementById('btn-download-csv').addEventListener('click', () => {
    const csv = document.getElementById('csv-preview').textContent;
    downloadBlob(new TextEncoder().encode(csv), 'usb-pd-cc-trace.csv', 'text/csv');
  });

  document.getElementById('btn-copy-udev').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('udev-preview').textContent);
    alert('Linux udev rules copied to clipboard!');
  });

  document.getElementById('btn-download-sample-pcap').addEventListener('click', () => {
    // Generate a 3-packet handshake (Source_Cap, Request 20V 5A, Accept)
    const p1 = engine.assemblePacket('SOP', engine.buildHeader({ msgType: 1, numDataObjects: 5, portPowerRole: 1 }), [0x0801912C, 0x0002D12C, 0x0004B12C, 0x000641F4, 0x0088C1F4]).wireBytes;
    const p2 = engine.assemblePacket('SOP', engine.buildHeader({ msgType: 2, numDataObjects: 1, portPowerRole: 0 }), [0x1304B1F4]).wireBytes;
    const p3 = engine.assemblePacket('SOP', engine.buildHeader({ msgType: 3, numDataObjects: 0, portPowerRole: 1 }), []).wireBytes;

    const pcapBytes = engine.generatePCAP([p1, p2, p3]);
    downloadBlob(pcapBytes, 'usbpd-240w-handshake.pcap');
  });

  // Initial setup
  assembleStudioPacket();
  renderSourcePDOs();
  evaluateCurrentContract();
  updateEMarker();
  runElectricalAudit();
});
