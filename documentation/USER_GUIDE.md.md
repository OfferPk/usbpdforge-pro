# USBPDForge Pro — Hardware Engineer & Operations User Guide

**Product Version**: 1.0.0  
**Target Roles**: Power Electronics Engineers, USB-IF Compliance Specialists, Firmware Developers, Hardware Security Researchers

---

## 1\. Quick Start Guide

### 1.1 Web Studio Launch

SECSForge Pro is completely self-contained with zero external runtime dependencies. Open `index.html` in any modern web browser:

\# Launch directly in browser

google-chrome source-code/index.html

\# Or serve locally

python3 \-m http.server 8080

Open `http://localhost:8080` in your web browser.

### 1.2 Standalone Python CLI Tool

The standalone CLI utility (`usbpd-cli.py`) operates headlessly on Linux, macOS, and Windows:

\# Make executable

chmod \+x build/usbpd-cli.py

\# Display help

./build/usbpd-cli.py \--help

---

## 2\. Interactive Studio Tutorials

### Tutorial A: Assembling a 140W EPR Source Capabilities Packet

1. Open **Tab 1: Packet Studio & BMC Dissector**.  
2. Set **Message Type** to `Data: Source_Capabilities (0x01)`.  
3. Set **Port Power Role** to `Source (Provider)` and **Port Data Role** to `DFP`.  
4. Click **Load 140W EPR Source Cap** to populate standard Fixed 5V, 9V, 15V, 20V, and 28V (140W) PDOs.  
5. Click **Assemble Wire Packet**.  
6. View the exact byte breakdown in the **Wire Frame Bytes** and **Dissected Packet Structure** panels.  
7. Click **Export Wireshark PCAP** to save a `.pcap` capture file.

### Tutorial B: Simulating Sink Contract Negotiation & Cable Overload Protection

1. Open **Tab 2: PDO & RDO Power Negotiator**.  
2. Select **\#6 MacBook Pro 140W EPR (28V 5A)** from the Source Capabilities list.  
3. In the **Connected Cable Rating** dropdown, select `3A Standard Cable (60W Max, No E-Marker)`.  
4. Click **Negotiate Power Contract**.  
5. Observe that the contract is immediately **REJECTED: CABLE\_MELTDOWN\_RISK** because delivering 5A over an unrated 3A cable violates USB-PD safety.  
6. Switch the cable rating to `5A / 50V EPR Certified` and re-evaluate to see the contract successfully **ACCEPTED** with real-time GaN efficiency and heat dissipation telemetry.

### Tutorial C: Synthesizing Cable E-Marker VDOs

1. Open **Tab 3: Cable E-Marker & SVDM**.  
2. Select **5.0A (Certified E-Marker)** and **50V (EPR 240W Certified)**.  
3. Set **USB Signaling Capability** to `USB4 Gen3 (40 Gbps)`.  
4. Click **Synthesize E-Marker VDOs**.  
5. Review the decoded ID Header VDO, Cert Stat VDO, and Passive Cable VDO.

### Tutorial D: Running the 10-Point Electrical Safety Audit

1. Open **Tab 4: Type-C Safety & Threat Auditor**.  
2. Adjust the port configuration toggles to reflect your hardware design.  
3. Click **Execute 10-Point Electrical Audit**.  
4. Examine your calculated safety score (\$0 \\dots 100\$), hazard breakdown, and prioritized UL 9990 remediation advice.

---

## 3\. CLI Command Reference

### `header` — Build or Dissect 16-Bit Header

\# Build a Source Capabilities header with 3 PDOs

./build/usbpd-cli.py header \--type 1 \--num-obj 3 \--role source

\# Parse an existing hex header word

./build/usbpd-cli.py header \--parse 0x1141

### `pdo` — Encode or Parse Power Data Objects

\# Encode 28V 5A (140W) EPR Fixed PDO

./build/usbpd-cli.py pdo \--voltage 28.0 \--current 5.0 \--epr

\# Parse hex PDO word

./build/usbpd-cli.py pdo \--parse 0x0801912C

### `rdo` — Build Request Data Object

./build/usbpd-cli.py rdo \--pos 4 \--current 5.0

### `pcap` — Export Wireshark Capture

./build/usbpd-cli.py pcap \--out usbpd\_capture.pcap