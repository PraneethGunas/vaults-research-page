import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   CTV Vault — UTXO Lifecycle Explorer

   Educational interactive explorer showing how CTV vault UTXOs work.
   CTV vaults do NOT use Taproot — they use bare CTV scripts and P2WSH.
   This explorer shows: output types, script hashing, IF/ELSE branching,
   witness construction, CTV template verification, and fee management.
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── palette ──────────────────────────────────────────────────────── */
const C = {
  blue:   { bg: "#3b82f6", dark: "#1d4ed8", light: "#dbeafe", text: "#1e40af", glow: "rgba(59,130,246,0.18)" },
  amber:  { bg: "#f59e0b", dark: "#d97706", light: "#fef3c7", text: "#92400e", glow: "rgba(245,158,11,0.18)" },
  green:  { bg: "#22c55e", dark: "#16a34a", light: "#dcfce7", text: "#166534", glow: "rgba(34,197,94,0.18)" },
  red:    { bg: "#ef4444", dark: "#dc2626", light: "#fee2e2", text: "#991b1b", glow: "rgba(239,68,68,0.18)" },
  purple: { bg: "#8b5cf6", dark: "#6d28d9", light: "#ede9fe", text: "#5b21b6", glow: "rgba(139,92,246,0.18)" },
  cyan:   { bg: "#06b6d4", dark: "#0891b2", light: "#cffafe", text: "#155e75", glow: "rgba(6,182,212,0.18)" },
  slate:  { bg: "#64748b", dark: "#334155", light: "#f1f5f9", text: "#334155", glow: "rgba(100,116,139,0.08)" },
  orange: { bg: "#f97316", dark: "#ea580c", light: "#fff7ed", text: "#9a3412", glow: "rgba(249,115,22,0.18)" },
};

/* ─── inject CSS keyframes ────────────────────────────────────────── */
const STYLE_ID = "ctv-utxo-kf";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes fadeIn { 0% { opacity:0; transform:translateY(12px) } 100% { opacity:1; transform:translateY(0) } }
    @keyframes pulseGlow { 0%,100% { box-shadow:0 0 0 0 rgba(59,130,246,0) } 50% { box-shadow:0 0 16px 4px rgba(59,130,246,0.25) } }
    @keyframes keyInsert { 0% { transform:translateX(-10px) rotate(-20deg); opacity:0 } 50% { transform:translateX(1px) rotate(10deg); opacity:1 } 100% { transform:translateX(0) rotate(0); opacity:1 } }
    @keyframes lockOpen { 0% { transform:translateY(0) } 60% { transform:translateY(-3px) rotate(-12deg) } 100% { transform:translateY(-4px) rotate(-16deg) } }
    @keyframes flowParticle { 0% { transform:translateY(-16px); opacity:0 } 30% { opacity:1 } 100% { transform:translateY(16px); opacity:0 } }
    @keyframes morphReveal { 0% { clip-path:circle(0% at 50% 50%); opacity:0 } 100% { clip-path:circle(100% at 50% 50%); opacity:1 } }
    @keyframes hashPulse { 0%,100% { background-color: rgba(245,158,11,0.08) } 50% { background-color: rgba(245,158,11,0.25) } }
    .anim-in { animation: fadeIn 0.35s ease-out both }
    .anim-in-d1 { animation: fadeIn 0.35s ease-out 0.1s both }
    .anim-in-d2 { animation: fadeIn 0.35s ease-out 0.2s both }
    .anim-in-d3 { animation: fadeIn 0.35s ease-out 0.3s both }
    .anim-pulse { animation: pulseGlow 2s ease-in-out infinite }
    .anim-morph { animation: morphReveal 0.4s ease-out both }
  `;
  document.head.appendChild(s);
}

/* ─── SVG icons ───────────────────────────────────────────────────── */
function KeyIcon({ size = 16, color = "#2563eb", animate = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    style={animate ? { animation: "keyInsert 0.7s ease-out both" } : {}}>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function LockClosedIcon({ size = 16, color = "#2563eb" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke={color} strokeWidth="2" fill={color + "18"} />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="16.5" r="1.5" fill={color} />
  </svg>;
}
function LockOpenIcon({ size = 16, color = "#16a34a", animate = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke={color} strokeWidth="2" fill={color + "12"} />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke={color} strokeWidth="2" strokeLinecap="round"
      style={animate ? { animation: "lockOpen 0.5s ease-out both" } : {}} />
    <circle cx="12" cy="16.5" r="1.5" fill={color} />
  </svg>;
}
function HashIcon({ size = 16, color = "#d97706" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/* ═══════════════════════════════════════════════════════════════════════
   DATA MODEL — CTV Vault Architecture

   CTV vaults use a LINEAR 4-step chain:
     deposit → to_vault (bare CTV) → unvault (P2WSH IF/ELSE) → hot OR cold

   NO Taproot. NO Merkle trees. NO key tweaking.
   Instead: raw script hashing, CTV template commitment, OP_IF branching.

   The CTV hash itself is the central cryptographic primitive:
     SHA256(nVersion || nLockTime || scriptSigs_hash || input_count ||
            sequences_hash || output_count || outputs_hash || input_index)
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── CTV Hash model ─────────────────────────────────────────────── */
const CTV_HASH = {
  name: "CTV Template Hash (BIP 119)",
  algo: "SHA256",
  fields: [
    { name: "nVersion", bytes: "4 B", desc: "Transaction version (usually 2)" },
    { name: "nLockTime", bytes: "4 B", desc: "Locktime of the spending tx" },
    { name: "scriptSigs hash", bytes: "32 B", desc: "SHA256 of all scriptSig's (empty for segwit)" },
    { name: "input count", bytes: "4 B", desc: "Number of inputs" },
    { name: "sequences hash", bytes: "32 B", desc: "SHA256 of all nSequence values" },
    { name: "output count", bytes: "4 B", desc: "Number of outputs" },
    { name: "outputs hash", bytes: "32 B", desc: "SHA256 of all outputs (amount + scriptPubKey)" },
    { name: "input index", bytes: "4 B", desc: "Index of this input in the tx" },
  ],
  note: "The hash commits to ALL outputs but NOT to input amounts or prevouts — this allows CPFP fee bumping via additional inputs",
};

/* ─── Script wrapping model ──────────────────────────────────────── */
const SCRIPT_WRAPPING = {
  vault: {
    type: "Bare CTV Script",
    typeDesc: "Raw script — not wrapped in P2SH or P2WSH",
    scriptPubKey: "<ctv_hash> OP_CHECKTEMPLATEVERIFY",
    scriptPubKeyBytes: "34 bytes",
    note: "The scriptPubKey IS the script — the ctv_hash is visible on chain. Anyone who sees it knows this is a CTV vault output.",
    construction: [
      { label: "Build spending tx", formula: "tx = {outputs: [to_unvault, cpfp_anchor]}", note: "The exact future transaction that will spend this UTXO" },
      { label: "Compute CTV hash", formula: "h = SHA256(nVersion || nLockTime || ... || outputs_hash || input_index)", note: "Template hash commits to everything except input amounts", highlight: true },
      { label: "Build scriptPubKey", formula: "scriptPubKey = <h> OP_CTV", note: "Raw CTV opcode with the hash — 34 bytes total" },
    ],
    privacyNote: "The CTV hash is VISIBLE on chain — an observer can tell this is a vault. Compare to Taproot P2TR where everything looks like a regular payment.",
  },
  unvault: {
    type: "P2WSH (Pay-to-Witness-Script-Hash)",
    typeDesc: "Script hidden behind a SHA256 hash — revealed at spend time",
    scriptPubKey: "OP_0 <SHA256(witness_script)>",
    scriptPubKeyBytes: "34 bytes",
    note: "On chain, only the 32-byte hash is visible. The full IF/ELSE script is revealed in the witness when spending.",
    construction: [
      { label: "Build witness script", formula: "ws = OP_IF <delay> OP_CSV OP_DROP <hot_pk> OP_CHECKSIG OP_ELSE <cold_hash> OP_CTV OP_ENDIF", note: "Two spending paths in one script" },
      { label: "Hash the script", formula: "script_hash = SHA256(witness_script)", note: "Single SHA256 — not double like P2SH", highlight: true },
      { label: "Build scriptPubKey", formula: "scriptPubKey = OP_0 <script_hash>", note: "OP_0 signals version 0 witness program → P2WSH" },
    ],
    privacyNote: "The P2WSH hash hides the script structure, but the OP_0 prefix identifies it as a segwit output (distinguishable from Taproot's OP_1).",
  },
};

/* ─── Key model ──────────────────────────────────────────────────── */
const KEY_TYPES = {
  hot: { id: "hot_pk", label: "hot_privkey", short: "Hot Key", color: "#2563eb", bg: "#dbeafe", border: "#93c5fd" },
  none: { id: "none", label: "No Key", short: "Keyless", color: "#16a34a", bg: "#dcfce7", border: "#86efac" },
};

const KEYS = {
  from_privkey: { label: "from_privkey", role: "Deposit source", color: C.slate },
  hot_privkey: { label: "hot_privkey", role: "Signs hot-path withdrawal", color: C.blue },
  cold_privkey: { label: "cold_privkey", role: "Destination cold wallet (never signs in vault)", color: C.red },
  fees_privkey: { label: "fees_privkey", role: "CPFP anchor output recipient", color: C.slate },
};

/* ─── Spending paths (leaf equivalent) ───────────────────────────── */
const PATHS = {
  spend_vault: {
    id: "spend_vault", label: "spend (CTV)", color: C.blue, keyType: "none",
    desc: "Advance vault → Unvault state — CTV enforces the exact next transaction",
    branchSide: null,
    script: [
      { op: "<ctv_hash>", note: "32-byte template hash (committed at vault creation)", indent: 0 },
      { op: "OP_CHECKTEMPLATEVERIFY", note: "spending tx must EXACTLY match this hash", hl: true, indent: 0 },
    ],
    witness: [
      { item: "(empty)", bytes: "0 B", desc: "Bare CTV script — no witness needed! The scriptPubKey IS the script." },
    ],
    witnessNote: "Since this is a bare script (not P2WSH, not P2TR), the spending conditions are in the scriptPubKey itself. The CTV opcode checks the spending transaction's template hash matches — no signature, no witness data required.",
    ctvCommits: "Outputs: [to_unvault UTXO, CPFP anchor (550 sats)]",
    leadsTo: "unvaulting",
  },
  hot_path: {
    id: "hot_path", label: "hot path (withdraw)", color: C.green, keyType: "hot",
    desc: "Withdraw to hot wallet after timelock — requires hot_privkey signature",
    branchSide: "IF",
    script: [
      { op: "OP_IF", note: "witness provides 0x01 to take this branch", indent: 0 },
      { op: "  <block_delay>", note: "e.g. 10 blocks (~100 min)", indent: 1 },
      { op: "  OP_CHECKSEQUENCEVERIFY", note: "relative timelock — must wait", hl: true, indent: 1 },
      { op: "  OP_DROP", note: "clean the stack", indent: 1 },
      { op: "  <hot_pubkey>", note: "public key for hot wallet", indent: 1 },
      { op: "  OP_CHECKSIG", note: "require ECDSA signature", hl: true, isKey: true, indent: 1 },
      { op: "OP_ELSE", note: "─── cold path below ───", indent: 0, dimmed: true },
      { op: "  ...", note: "", indent: 1, dimmed: true },
      { op: "OP_ENDIF", note: "", indent: 0, dimmed: true },
    ],
    witness: [
      { item: "<sig>", bytes: "71-72 B", desc: "DER-encoded ECDSA signature from hot_privkey" },
      { item: "0x01", bytes: "1 B", desc: "Branch selector — OP_TRUE → takes the IF branch" },
      { item: "<witness_script>", bytes: "~79 B", desc: "The full IF/ELSE script (revealed for verification)" },
    ],
    witnessNote: "P2WSH witness: the full script is revealed here. The verifier hashes it, confirms it matches the scriptPubKey hash, then executes. The 0x01 byte selects the IF (hot) branch.",
    ctvCommits: null,
    leadsTo: "hot_withdrawal",
  },
  cold_path: {
    id: "cold_path", label: "cold path (recover)", color: C.red, keyType: "none",
    desc: "Emergency sweep to cold storage — CTV-only, no signature needed, immediate",
    branchSide: "ELSE",
    script: [
      { op: "OP_IF", note: "─── hot path above ───", indent: 0, dimmed: true },
      { op: "  ...", note: "", indent: 1, dimmed: true },
      { op: "OP_ELSE", note: "witness provides empty bytes to take this branch", indent: 0 },
      { op: "  <tocold_ctv_hash>", note: "template hash for cold recovery tx", indent: 1 },
      { op: "  OP_CHECKTEMPLATEVERIFY", note: "outputs must match — sends to cold_pubkey", hl: true, indent: 1 },
      { op: "OP_ENDIF", note: "", indent: 0 },
    ],
    witness: [
      { item: '""', bytes: "0 B", desc: "Empty bytes → falsy → takes the ELSE branch" },
      { item: "<witness_script>", bytes: "~79 B", desc: "The full IF/ELSE script (revealed for verification)" },
    ],
    witnessNote: "No signature at all! The empty byte triggers the ELSE branch. CTV alone enforces that the outputs go to cold_pubkey. Anyone on the network can broadcast this transaction — it's a public recovery mechanism.",
    ctvCommits: "Outputs: [to_cold (cold_pubkey), CPFP anchor (550 sats)]",
    leadsTo: "cold_recovery",
  },
};

/* ─── UTXO definitions ───────────────────────────────────────────── */
const UTXO_DEFS = {
  vault: {
    id: "vault", title: "Vault UTXO", color: C.blue,
    paths: ["spend_vault"],
    wrapping: SCRIPT_WRAPPING.vault,
  },
  unvaulting: {
    id: "unvaulting", title: "Unvault UTXO", color: C.amber,
    paths: ["hot_path", "cold_path"],
    wrapping: SCRIPT_WRAPPING.unvault,
  },
};

/* ─── Terminal outputs ───────────────────────────────────────────── */
const TERMINALS = {
  hot_withdrawal: {
    id: "hot_withdrawal", title: "Hot Wallet Output", type: "P2WPKH(hot_pubkey)", color: C.green,
    details: [
      "Standard P2WPKH — funds controlled by hot_privkey",
      "Amount determined by CTV hash at vault creation time",
      "Includes CPFP anchor output (550 sats to fees_pubkey) for fee bumping",
      "TERMINAL — funds released for spending",
    ],
  },
  cold_recovery: {
    id: "cold_recovery", title: "Cold Storage Output", type: "P2WPKH(cold_pubkey)", color: C.red,
    details: [
      "Standard P2WPKH — funds swept to cold_pubkey",
      "CTV enforces exact amount and destination — no deviation possible",
      "Anyone can trigger this path (no signature) — designed for watchtower use",
      "TERMINAL — emergency cold storage",
    ],
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Layer 0: On-chain reality ───────────────────────────────────── */
function OnChainView({ wrapping, utxoColor }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Layer 0 — What miners see on chain</span>
      </div>

      {/* Script type badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-1 rounded-md text-xs font-bold text-white" style={{ backgroundColor: utxoColor.bg }}>
          {wrapping.type}
        </span>
        <span className="text-[11px] text-slate-500">{wrapping.typeDesc}</span>
      </div>

      {/* scriptPubKey */}
      <div className="font-mono text-sm bg-white rounded-lg px-4 py-3 border border-slate-200 flex items-center gap-3">
        <span className="text-slate-400 text-xs">scriptPubKey:</span>
        <span className="font-bold" style={{ color: utxoColor.text }}>{wrapping.scriptPubKey}</span>
        <span className="text-slate-300 text-xs ml-auto">{wrapping.scriptPubKeyBytes}</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 ml-1">{wrapping.note}</p>

      {/* Privacy callout */}
      <div className="mt-3 rounded-lg p-2.5 border border-amber-200 bg-amber-50">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Privacy Note</span>
        </div>
        <p className="text-[11px] text-amber-800">{wrapping.privacyNote}</p>
      </div>
    </div>
  );
}

/* ─── Layer 1: Script construction pipeline ───────────────────────── */
function ConstructionPipeline({ wrapping, utxoColor, isActive }) {
  return (
    <div className="rounded-xl border-2 p-4" style={{ borderColor: utxoColor.bg + "40", backgroundColor: utxoColor.light + "60" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: utxoColor.bg }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: utxoColor.text }}>
          Layer 1 — How the output script is constructed
        </span>
      </div>

      <div className="space-y-2">
        {wrapping.construction.map((step, i) => (
          <div key={i} className={`flex items-start gap-3 ${isActive ? 'anim-in' : ''}`}
            style={isActive ? { animationDelay: `${i * 0.12}s` } : {}}>
            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: step.highlight ? C.orange.bg : utxoColor.bg }}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs bg-white rounded px-3 py-1.5 border border-slate-200"
                style={step.highlight ? { borderColor: C.orange.bg, backgroundColor: C.orange.light } : {}}>
                <span className="text-slate-400 text-[10px] mr-2">{step.label}:</span>
                <span className={step.highlight ? "text-orange-800 font-bold" : "text-slate-800 font-semibold"}>
                  {step.formula}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 ml-1">{step.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── CTV Hash breakdown ─────────────────────────────────────────── */
function CTVHashBreakdown({ isActive }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <HashIcon size={14} color={C.amber.dark} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
          Inside the CTV Hash — What it commits to
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {CTV_HASH.fields.map((f, i) => (
          <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-amber-100 ${isActive ? 'anim-in' : ''}`}
            style={isActive ? { animationDelay: `${i * 0.06}s` } : {}}>
            <code className="text-[10px] font-bold font-mono text-amber-800 whitespace-nowrap">{f.name}</code>
            <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded">{f.bytes}</span>
            <span className="text-[9px] text-slate-500 ml-auto">{f.desc}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg p-2.5 border-2 border-dashed border-orange-300 bg-orange-50">
        <p className="text-[11px] text-orange-800">{CTV_HASH.note}</p>
      </div>
    </div>
  );
}

/* ─── Layer 2: Spending paths ────────────────────────────────────── */
function SpendingPaths({ utxoId, activePath, onPathClick }) {
  const utxo = UTXO_DEFS[utxoId];
  const isVault = utxoId === "vault";

  if (isVault) return <VaultSpendingPath activePath={activePath} onPathClick={onPathClick} />;
  return <UnvaultSpendingPaths activePath={activePath} onPathClick={onPathClick} />;
}

function VaultSpendingPath({ activePath, onPathClick }) {
  const path = PATHS.spend_vault;
  const isActive = activePath === "spend_vault";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Layer 2 — Spending path (single path — CTV-enforced)
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4 ml-1 text-[10px] text-slate-400">
        <span>No branching logic — CTV hash alone determines the next transaction</span>
      </div>

      {/* Single path visualization */}
      <svg viewBox="0 0 400 80" className="w-full max-w-sm mx-auto" style={{ height: 80 }}>
        {/* Arrow from UTXO to spend path */}
        <line x1="100" y1="40" x2="180" y2="40" stroke="#d1d5db" strokeWidth="2" strokeDasharray="6 3" />
        <polygon points="178,36 186,40 178,44" fill="#d1d5db" />

        {/* UTXO box */}
        <rect x="10" y="22" width="90" height="36" rx="8" fill={C.blue.light} stroke={C.blue.bg} strokeWidth="1.5" />
        <text x="55" y="38" textAnchor="middle" fontSize="8" fill={C.blue.text} fontWeight="bold">Vault UTXO</text>
        <text x="55" y="48" textAnchor="middle" fontSize="7" fill={C.blue.text}>bare CTV</text>

        {/* Spend path button */}
        <g onClick={() => onPathClick("spend_vault")} className="cursor-pointer">
          <rect x="190" y="18" width="200" height="44" rx="10"
            fill={isActive ? C.blue.light : "white"}
            stroke={isActive ? C.blue.bg : C.blue.bg + "60"}
            strokeWidth={isActive ? 2.5 : 1.5} />
          <text x="290" y="36" textAnchor="middle" fontSize="10" fill={C.blue.text} fontWeight="bold">
            OP_CHECKTEMPLATEVERIFY
          </text>
          <text x="290" y="50" textAnchor="middle" fontSize="8" fill={C.blue.text}>keyless — math only</text>
        </g>

        {/* Key badge */}
        <g transform="translate(193, 18)">
          <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.none.bg} stroke={KEY_TYPES.none.border} strokeWidth="0.8" />
          <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.none.color} fontWeight="bold">no key</text>
        </g>
      </svg>
    </div>
  );
}

function UnvaultSpendingPaths({ activePath, onPathClick }) {
  const isHot = activePath === "hot_path";
  const isCold = activePath === "cold_path";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Layer 2 — OP_IF / OP_ELSE branching (two spending paths in one script)
        </span>
      </div>

      {/* Comparison with Taproot */}
      <div className="flex items-center gap-4 mb-3 ml-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span>No Merkle tree — both paths are in ONE witness script, selected by a stack byte</span>
        </div>
      </div>

      {/* IF/ELSE branching SVG */}
      <svg viewBox="0 0 440 160" className="w-full max-w-lg mx-auto" style={{ height: 160 }}>
        {/* P2WSH box */}
        <rect x="150" y="5" width="140" height="30" rx="8" fill={C.amber.light} stroke={C.amber.bg} strokeWidth="1.5" />
        <text x="220" y="18" textAnchor="middle" fontSize="8" fill={C.amber.text} fontWeight="bold">P2WSH witness script</text>
        <text x="220" y="28" textAnchor="middle" fontSize="7" fill={C.amber.text}>OP_IF ... OP_ELSE ... OP_ENDIF</text>

        {/* Fork lines */}
        <line x1="220" y1="35" x2="110" y2="70" stroke={isHot ? C.green.bg : "#d1d5db"} strokeWidth={isHot ? 2.5 : 1.5} />
        <line x1="220" y1="35" x2="330" y2="70" stroke={isCold ? C.red.bg : "#d1d5db"} strokeWidth={isCold ? 2.5 : 1.5} />

        {/* Branch selector labels */}
        <text x="155" y="53" textAnchor="middle" fontSize="8" fill={isHot ? C.green.dark : "#94a3b8"} fontWeight="bold">
          witness: 0x01
        </text>
        <text x="285" y="53" textAnchor="middle" fontSize="8" fill={isCold ? C.red.dark : "#94a3b8"} fontWeight="bold">
          witness: ""
        </text>

        {/* IF branch — hot path */}
        <g onClick={() => onPathClick("hot_path")} className="cursor-pointer">
          <rect x="20" y="72" width="180" height="54" rx="10"
            fill={isHot ? C.green.light : "white"}
            stroke={isHot ? C.green.bg : C.green.bg + "60"}
            strokeWidth={isHot ? 2.5 : 1.5} />
          <text x="30" y="88" fontSize="9" fill={C.green.text} fontWeight="bold">IF branch (hot path)</text>
          <text x="30" y="100" fontSize="8" fill={C.green.text} fontFamily="monospace">
            CSV(10) + hot_pk CHECKSIG
          </text>
          <text x="30" y="116" fontSize="7" fill="#64748b">Requires: timelock + ECDSA signature</text>
        </g>

        {/* ELSE branch — cold path */}
        <g onClick={() => onPathClick("cold_path")} className="cursor-pointer">
          <rect x="240" y="72" width="180" height="54" rx="10"
            fill={isCold ? C.red.light : "white"}
            stroke={isCold ? C.red.bg : C.red.bg + "60"}
            strokeWidth={isCold ? 2.5 : 1.5} />
          <text x="250" y="88" fontSize="9" fill={C.red.text} fontWeight="bold">ELSE branch (cold path)</text>
          <text x="250" y="100" fontSize="8" fill={C.red.text} fontFamily="monospace">
            tocold_ctv_hash OP_CTV
          </text>
          <text x="250" y="116" fontSize="7" fill="#64748b">No signature — CTV only — immediate</text>
        </g>

        {/* Key badges */}
        <g transform="translate(23, 72)">
          <rect x="0" y="-12" width="36" height="12" rx="6" fill={KEY_TYPES.hot.bg} stroke={KEY_TYPES.hot.border} strokeWidth="0.8" />
          <text x="18" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.hot.color} fontWeight="bold">key</text>
        </g>
        <g transform="translate(243, 72)">
          <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.none.bg} stroke={KEY_TYPES.none.border} strokeWidth="0.8" />
          <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.none.color} fontWeight="bold">no key</text>
        </g>

        {/* Comparison note */}
        <text x="220" y="150" textAnchor="middle" fontSize="7" fill="#94a3b8">
          Unlike Taproot, BOTH paths are revealed in the witness — the unused branch leaks information
        </text>
      </svg>
    </div>
  );
}

/* ─── Layer 3: Path detail (script + witness) ─────────────────────── */
function PathDetail({ path, utxoId, onExecute }) {
  const kt = KEY_TYPES[path.keyType];
  const isKeyless = path.keyType === "none";

  return (
    <div className="space-y-3 anim-in">

      {/* Key / keyless authorization */}
      <div className="rounded-xl border-2 p-3" style={{ borderColor: kt.border, backgroundColor: kt.bg + "40" }}>
        <div className="flex items-center gap-3">
          {isKeyless ? (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: kt.bg, border: `2px solid ${kt.border}` }}>
              <LockOpenIcon size={20} color={kt.color} animate={true} />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: kt.bg, border: `2px solid ${kt.border}` }}>
              <KeyIcon size={20} color={kt.color} animate={true} />
            </div>
          )}
          <div>
            <div className="text-xs font-bold" style={{ color: kt.color }}>{kt.short}</div>
            <div className="text-[10px] text-slate-600">
              {isKeyless
                ? path.id === "cold_path"
                  ? "OP_TRUE equivalent — empty witness selects ELSE, CTV enforces outputs. Anyone can broadcast."
                  : path.id === "spend_vault"
                    ? "Bare CTV script — the spending transaction's template hash must match. No witness data at all."
                    : "No signature needed"
                : "Vault owner must sign with hot_privkey (ECDSA) + wait for CSV timelock"}
            </div>
          </div>
        </div>
      </div>

      {/* Script */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 anim-in-d1">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {utxoId === "vault" ? "scriptPubKey (bare script)" : "Witness Script (P2WSH)"}
          </div>
          {path.branchSide && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{
                backgroundColor: path.branchSide === "IF" ? C.green.light : C.red.light,
                color: path.branchSide === "IF" ? C.green.text : C.red.text
              }}>
              {path.branchSide} branch
            </span>
          )}
        </div>
        <div className="font-mono text-xs leading-relaxed space-y-0.5">
          {path.script.map((s, i) => (
            <div key={i} className={`flex gap-2 ${s.dimmed ? 'opacity-30' : ''}`}>
              <span className="text-slate-300 w-3 text-right select-none text-[10px]">{i}</span>
              <span className={
                s.isKey ? "text-amber-700 font-bold bg-amber-50 px-1 rounded" :
                  s.hl ? "text-blue-700 font-semibold" : "text-slate-700"
              } style={{ marginLeft: (s.indent || 0) * 12 }}>
                {s.isKey && <span className="mr-1">🔑</span>}
                {s.op}
              </span>
              {s.note && <span className="text-slate-400 text-[10px]">// {s.note}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Witness stack */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 anim-in-d2">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">
          Witness Stack
        </div>
        <div className="space-y-1">
          {path.witness.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-slate-300 font-mono text-[10px] w-4 text-right">[{i}]</span>
              <code className="font-mono font-semibold text-slate-800 bg-slate-50 px-1.5 py-0.5 rounded">{w.item}</code>
              <span className="text-slate-400 text-[10px]">{w.bytes}</span>
              <span className="text-slate-500 text-[10px]">{w.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-2 border-t border-slate-100 pt-2">{path.witnessNote}</p>
      </div>

      {/* CTV commitment callout */}
      {path.ctvCommits && (
        <div className="rounded-lg p-3 border-2 border-dashed border-amber-300 bg-amber-50 anim-in-d2">
          <div className="flex items-center gap-2 mb-1">
            <HashIcon size={14} color={C.amber.dark} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">CTV Hash Commits To</span>
          </div>
          <p className="text-xs text-amber-800 font-mono">{path.ctvCommits}</p>
        </div>
      )}

      {/* CPFP fee management */}
      <div className="rounded-lg p-2.5 bg-slate-50 border border-slate-200 anim-in-d3">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Fee Management — CPFP Anchors</div>
        <p className="text-[11px] text-slate-600">
          CTV commits to outputs but NOT input amounts. Each CTV-committed transaction includes a 550-sat anchor output
          to <code className="bg-slate-200 px-1 rounded">fees_pubkey</code>. The fee wallet spends this anchor in a child
          transaction, paying the actual fee via CPFP (Child Pays For Parent).
        </p>
      </div>

      {/* Execute button */}
      <button onClick={onExecute}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
        style={{ backgroundColor: path.color.bg }}>
        {isKeyless
          ? <><LockOpenIcon size={16} color="white" /> Execute (keyless) — see output UTXO</>
          : <><KeyIcon size={16} color="white" /> Sign & broadcast — see output UTXO</>}
      </button>
    </div>
  );
}

/* ─── Transition animation ────────────────────────────────────────── */
function TransitionView({ path, fromColor, toColor, onDone }) {
  const kt = KEY_TYPES[path.keyType];
  const isKeyless = path.keyType === "none";

  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="flex flex-col items-center py-4 gap-3 anim-in">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl anim-pulse"
        style={{ backgroundColor: kt.bg, border: `2px solid ${kt.border}` }}>
        {isKeyless
          ? <LockOpenIcon size={22} color={kt.color} animate />
          : <KeyIcon size={22} color={kt.color} animate />}
        <span className="text-sm font-semibold" style={{ color: kt.color }}>
          {isKeyless ? "CTV verifying template hash..." : `Signing with ${kt.label}...`}
        </span>
      </div>

      <div className="relative" style={{ height: 40 }}>
        <div className="absolute left-1/2 w-0.5 rounded-full" style={{
          height: 40, transform: "translateX(-50%)",
          background: `linear-gradient(to bottom, ${fromColor}, ${toColor})`
        }} />
        {[0, 1, 2].map(i => <div key={i} className="absolute left-1/2 w-2 h-2 rounded-full"
          style={{
            transform: "translateX(-50%)", backgroundColor: toColor, opacity: 0.7,
            animation: `flowParticle 0.7s ease-in-out ${i * 0.2}s infinite`
          }} />)}
        <svg width="16" height="10" className="absolute left-1/2 bottom-0" style={{ transform: "translateX(-50%)" }}>
          <polygon points="8,10 2,0 14,0" fill={toColor} opacity="0.7" />
        </svg>
      </div>

      <span className="text-[10px] text-slate-400">Script validated — new UTXO materializing...</span>
    </div>
  );
}

/* ─── Terminal card ───────────────────────────────────────────────── */
function TerminalCard({ terminal }) {
  return (
    <div className="rounded-xl border-2 overflow-hidden anim-morph"
      style={{ borderColor: terminal.color.bg, boxShadow: `0 4px 16px ${terminal.color.glow}` }}>
      <div className="px-4 py-2.5" style={{ backgroundColor: terminal.color.bg }}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">{terminal.title}</h3>
          <code className="text-white/80 text-xs bg-white/20 px-2 py-0.5 rounded">{terminal.type}</code>
        </div>
      </div>
      <div className="p-4 bg-white space-y-1.5">
        {terminal.details.map((d, i) => (
          <div key={i} className="text-sm text-slate-600 flex items-start gap-2">
            <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: terminal.color.bg }} />
            {d}
          </div>
        ))}
        <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
          Standard P2WPKH output — no covenants, no script hash. Spendable with a single ECDSA signature. This is where the vault lifecycle ends.
        </div>
      </div>
    </div>
  );
}

/* ─── Key system overview ────────────────────────────────────────── */
function KeySystemOverview() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">4-Key System</div>
      <div className="grid grid-cols-4 gap-2">
        {Object.values(KEYS).map((k, i) => (
          <div key={i} className="text-center p-1.5 rounded-lg border" style={{ borderColor: k.color.bg + "40", backgroundColor: k.color.light }}>
            <code className="text-[10px] font-bold" style={{ color: k.color.text }}>{k.label}</code>
            <div className="text-[8px] text-slate-500 mt-0.5">{k.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Breadcrumb ──────────────────────────────────────────────────── */
function Breadcrumb({ path, onNavigate }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {path.map((step, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300 text-xs">→</span>}
          <button onClick={() => onNavigate(i)}
            className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
            style={{ backgroundColor: step.color.light, color: step.color.text }}>
            {step.label}
          </button>
        </span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════════ */
export default function CTVUTXOLifecycle() {
  const [path, setPath] = useState([{ label: "Vault UTXO", color: C.blue }]);
  const [currentUTXO, setCurrentUTXO] = useState("vault");
  const [activePath, setActivePath] = useState(null);
  const [terminal, setTerminal] = useState(null);
  const [transitioning, setTransitioning] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => { injectStyles(); }, []);

  const scrollTo = useCallback((pos) => {
    if (!contentRef.current) return;
    setTimeout(() => {
      if (pos === "bottom") contentRef.current.scrollTo({ top: contentRef.current.scrollHeight, behavior: "smooth" });
      else if (pos === "top") contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
  }, []);

  const handlePathClick = useCallback((pathId) => {
    setActivePath(prev => prev === pathId ? null : pathId);
    setTimeout(() => scrollTo("bottom"), 100);
  }, [scrollTo]);

  const handleExecute = useCallback(() => {
    if (!activePath) return;
    const p = PATHS[activePath];
    setTransitioning(p);
    scrollTo("bottom");
  }, [activePath, scrollTo]);

  const handleTransitionDone = useCallback(() => {
    const p = transitioning;
    if (!p) return;
    setTransitioning(null);
    setActivePath(null);

    const target = p.leadsTo;
    if (TERMINALS[target]) {
      setTerminal(TERMINALS[target]);
      setPath(prev => [...prev, { label: p.label, color: p.color }, { label: TERMINALS[target].title, color: TERMINALS[target].color }]);
    } else {
      setCurrentUTXO(target);
      setPath(prev => [...prev, { label: p.label, color: p.color }, { label: UTXO_DEFS[target].title, color: UTXO_DEFS[target].color }]);
    }
    scrollTo("top");
  }, [transitioning, scrollTo]);

  const handleReset = useCallback(() => {
    setCurrentUTXO("vault");
    setTerminal(null);
    setActivePath(null);
    setTransitioning(null);
    setPath([{ label: "Vault UTXO", color: C.blue }]);
    scrollTo("top");
  }, [scrollTo]);

  const handleNavigate = useCallback((i) => { if (i === 0) handleReset(); }, [handleReset]);

  const utxoDef = UTXO_DEFS[currentUTXO];
  const spendPath = activePath ? PATHS[activePath] : null;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <h1 className="text-base font-bold text-slate-800">CTV Vault — UTXO Lifecycle Explorer</h1>
            <p className="text-[11px] text-slate-500">
              Peel back the layers: on-chain output → script construction → CTV hash → spending paths → witness → next UTXO
            </p>
          </div>
          <button onClick={handleReset}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            Reset
          </button>
        </div>
        <Breadcrumb path={path} onNavigate={handleNavigate} />
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {!terminal ? (
          <>
            {/* UTXO header */}
            <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: utxoDef.color.bg }}>
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold">{utxoDef.title}</h2>
                <code className="text-white/80 text-xs bg-white/20 px-2 py-0.5 rounded">
                  {utxoDef.wrapping.type}
                </code>
              </div>
            </div>

            {/* Layer 0: On-chain */}
            <OnChainView wrapping={utxoDef.wrapping} utxoColor={utxoDef.color} />

            {/* Layer 1: Construction pipeline */}
            <ConstructionPipeline wrapping={utxoDef.wrapping} utxoColor={utxoDef.color} isActive={!activePath} />

            {/* CTV Hash breakdown (show for vault) */}
            {currentUTXO === "vault" && <CTVHashBreakdown isActive={!activePath} />}

            {/* Key system overview */}
            {currentUTXO === "vault" && <KeySystemOverview />}

            {/* Layer 2: Spending paths */}
            <SpendingPaths utxoId={currentUTXO} activePath={activePath} onPathClick={handlePathClick} />

            {/* Layer 3: Path detail */}
            {spendPath && !transitioning && (
              <PathDetail path={spendPath} utxoId={currentUTXO} onExecute={handleExecute} />
            )}

            {/* Transition */}
            {transitioning && (
              <TransitionView
                path={transitioning}
                fromColor={utxoDef.color.bg}
                toColor={TERMINALS[transitioning.leadsTo]?.color.bg || UTXO_DEFS[transitioning.leadsTo]?.color.bg || "#64748b"}
                onDone={handleTransitionDone} />
            )}
          </>
        ) : (
          <>
            <TerminalCard terminal={terminal} />
            <div className="flex justify-center pt-2 pb-4">
              <button onClick={handleReset}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">
                Back to Vault — explore another path
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
