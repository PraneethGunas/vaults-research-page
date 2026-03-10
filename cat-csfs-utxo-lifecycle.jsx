import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   CAT+CSFS Vault — UTXO Lifecycle Explorer

   Educational interactive explorer showing how CAT+CSFS vault UTXOs work.
   CAT+CSFS vaults use Taproot P2TR with dual Schnorr verification via
   OP_CAT + OP_CHECKSIGFROMSTACK. Both vault and vault-loop are P2TR with
   NUMS unspendable internal key. Vault-loop adds CSV delay in withdraw leaf.
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
  emerald: { bg: "#10b981", dark: "#059669", light: "#d1fae5", text: "#065f46", glow: "rgba(16,185,129,0.18)" },
};

/* ─── inject CSS keyframes ────────────────────────────────────────── */
const STYLE_ID = "cat-csfs-utxo-kf";
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
    @keyframes treeGrow { 0% { opacity:0; transform:scale(0.8) } 100% { opacity:1; transform:scale(1) } }
    .anim-in { animation: fadeIn 0.35s ease-out both }
    .anim-in-d1 { animation: fadeIn 0.35s ease-out 0.1s both }
    .anim-in-d2 { animation: fadeIn 0.35s ease-out 0.2s both }
    .anim-in-d3 { animation: fadeIn 0.35s ease-out 0.3s both }
    .anim-pulse { animation: pulseGlow 2s ease-in-out infinite }
    .anim-morph { animation: morphReveal 0.4s ease-out both }
    .anim-tree { animation: treeGrow 0.45s ease-out both }
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
function TreeIcon({ size = 16, color = "#059669" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 3l8 6v3h-4v9h-8v-9H4v-3l8-6m0 0v15m-3-6h6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/* ═══════════════════════════════════════════════════════════════════════
   DATA MODEL — CAT+CSFS Vault Architecture

   CAT+CSFS vaults use a DUAL-LEAF TAPROOT structure:
     vault (P2TR) ─┬─ trigger leaf (CSFS+CAT introspection) ─→ vault-loop
                  └─ recover leaf (cold CHECKSIG) ─→ cold

     vault-loop (P2TR) ─┬─ withdraw leaf (CSV + CSFS+CAT) ─→ destination
                       └─ recover leaf (cold CHECKSIG) ─→ cold

   BOTH vault and vault-loop use:
   - Taproot P2TR (OP_1 + 32-byte key)
   - NUMS unspendable internal key (nothing-up-my-sleeve)
   - 2-leaf taptree: leaf_version | tapleaf_hash

   Hot key signs both trigger and withdraw via dual Schnorr verification.
   Cold key can recover at any time via simple CHECKSIG.
   ═════════════════════════════════════════════════════════════════════ */

/* ─── Taproot construction model ──────────────────────────────────── */
const TAPROOT_CONSTRUCTION = {
  name: "Taproot P2TR Construction",
  algo: "SHA256 (tagged hashes)",
  steps: [
    {
      label: "Build taptree",
      desc: "Create leaf nodes with version byte (0xc0 = OP_1)",
      detail: "Each leaf = leaf_version || script"
    },
    {
      label: "Compute tapleaf_hash",
      desc: "Hash each leaf: TapLeaf(leaf_version || compact_size(len) || script)",
      highlight: true,
      detail: "32 bytes per leaf"
    },
    {
      label: "Build taptree merkle",
      desc: "If 2 leaves: TapBranch(tapleaf_hash_0, tapleaf_hash_1)",
      detail: "Ordered by hash value (deterministic)"
    },
    {
      label: "Compute taptree_hash",
      desc: "TapTweak(internal_key_point, taptree_hash)",
      highlight: true,
      detail: "Merkle root tagged with internal key"
    },
    {
      label: "Build output key",
      desc: "output_key = internal_key + tweak*G (Schnorr key tweaking)",
      highlight: true,
      detail: "32-byte Schnorr public key"
    },
    {
      label: "Build scriptPubKey",
      desc: "OP_1 <output_key>",
      detail: "34 bytes total: 0x51 || output_key"
    },
  ],
};

/* ─── SIGHASH model for dual verification ───────────────────────── */
const CAT_CSFS_SIGHASH = {
  name: "SIGHASH_SINGLE|ANYONECANPAY (0x83)",
  algo: "SHA256 (signature)",
  fields: [
    { name: "epoch", bytes: "1 B", desc: "Epoch byte (0x00)" },
    { name: "hash_type", bytes: "1 B", desc: "SIGHASH_SINGLE|ANYONECANPAY (0x83)" },
    { name: "nVersion", bytes: "4 B", desc: "Transaction version" },
    { name: "nLockTime", bytes: "4 B", desc: "Locktime" },
    { name: "spend_type", bytes: "1 B", desc: "Spend type (ext_flag=1 for script-path spend)" },
    { name: "prevout (this input)", bytes: "36 B", desc: "Outpoint of this input only (ANYONECANPAY)" },
    { name: "amount (this input)", bytes: "8 B", desc: "Amount of this input only" },
    { name: "scriptPubKey", bytes: "var", desc: "scriptPubKey of this input" },
    { name: "nSequence", bytes: "4 B", desc: "Sequence of this input only" },
    { name: "sha_single_output", bytes: "32 B", desc: "SHA256(amount || scriptPubKey) of corresponding output — the LOCKED DESTINATION" },
    { name: "tapleaf_hash", bytes: "32 B", desc: "Hash of this leaf script" },
    { name: "key_version", bytes: "1 B", desc: "Key version (0x00)" },
    { name: "codesep_pos", bytes: "4 B", desc: "OP_CODESEPARATOR position (0xffffffff = none)" },
  ],
  note: "SIGHASH_SINGLE covers only one output (destination-locked). ANYONECANPAY covers only one input. This allows fee-paying inputs to be added without invalidating the covenant signature. The destination is locked via sha_single_output inside the leaf script.",
};

/* ─── Script wrapping model ──────────────────────────────────────── */
const SCRIPT_WRAPPING = {
  vault: {
    type: "P2TR (Taproot)",
    typeDesc: "Taproot output — looks like a regular payment on chain, but holds a 2-leaf taptree",
    scriptPubKey: "OP_1 <output_key (tweaked with taptree)>",
    scriptPubKeyBytes: "34 bytes",
    note: "Everything is hidden until spend time. Observers cannot tell this is a vault. Compare to bare CTV or P2WSH which leak the script structure.",
    privacyNote: "Maximum privacy — indistinguishable from Taproot key-path spends. No script hash visible. The taptree structure is unknown until someone spends.",
    taptree: {
      internal_key: "NUMS point (unspendable — just a placeholder)",
      leaves: [
        { id: "trigger", name: "trigger leaf", script: "OP_CHECKSIGVERIFY OP_CAT OP_CAT OP_CHECKSIGFROMSTACK ... (dual verification)", privacy: "Hidden until trigger" },
        { id: "recover", name: "recover leaf", script: "<cold_pubkey> OP_CHECKSIG", privacy: "Hidden until recovery" },
      ],
      note: "If anyone tries to spend via key-path, they need the internal key (which is unknown). They must use script-path instead.",
    },
  },
  vault_loop: {
    type: "P2TR (Taproot)",
    typeDesc: "Taproot output — same structure as vault, but withdraw leaf includes CSV delay",
    scriptPubKey: "OP_1 <output_key (tweaked with taptree)>",
    scriptPubKeyBytes: "34 bytes",
    note: "Another P2TR. Withdraw leaf has CSV timelock. Recover leaf is identical to vault.",
    privacyNote: "Also indistinguishable from regular payment. CSV delay is hidden in the leaf.",
    taptree: {
      internal_key: "NUMS point",
      leaves: [
        { id: "withdraw", name: "withdraw leaf", script: "OP_CHECKSEQUENCEVERIFY OP_DROP OP_CHECKSIGVERIFY OP_CAT OP_CAT OP_CHECKSIGFROMSTACK ... (CSV + dual verification)", privacy: "CSV hidden; dual verification hidden" },
        { id: "recover", name: "recover leaf", script: "<cold_pubkey> OP_CHECKSIG", privacy: "Hidden until recovery" },
      ],
      note: "Withdraw path has a 10-block (or configurable) CSV delay before dual verification begins.",
    },
  },
};

/* ─── Key model ──────────────────────────────────────────────────── */
const KEYS = {
  hot_privkey: { label: "hot_privkey", role: "Signs trigger and withdraw via dual Schnorr verification", color: C.blue },
  cold_privkey: { label: "cold_privkey", role: "Signs recovery transactions (simple CHECKSIG in recover leaf)", color: C.red },
};

/* ─── Spending paths (leaf equivalent) ───────────────────────────── */
const PATHS = {
  trigger: {
    id: "trigger", label: "trigger (dual Schnorr)", color: C.emerald, keyType: "hot",
    desc: "Advance vault → Vault-loop state — dual verification locks in destination",
    leafSide: "trigger",
    script: [
      { op: "<hot_sig>", note: "Signature from hot_privkey", indent: 0 },
      { op: "OP_CHECKSIGVERIFY", note: "Step 1: verify sig is valid for this tx's sighash", hl: true, indent: 0 },
      { op: "<preimage_prefix> <preimage_suffix>", note: "Witness-provided preimage pieces", indent: 0 },
      { op: "OP_CAT OP_CAT", note: "Step 2: concatenate prefix + sha_single_output + suffix", hl: true, indent: 0 },
      { op: "<embedded_sha_single_output>", note: "Constant from leaf: locked destination", indent: 0 },
      { op: "OP_CHECKSIGFROMSTACK", note: "Step 3: verify same sig against reassembled preimage (Schnorr uniqueness)", hl: true, indent: 0 },
    ],
    witness: [
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from hot_privkey (covers full sighash)" },
      { item: "<preimage_prefix>", bytes: "~70 B", desc: "First part of sighash (up to sha_single_output)" },
      { item: "<preimage_suffix>", bytes: "~80 B", desc: "Second part of sighash (after sha_single_output)" },
      { item: "<script>", bytes: "~130 B", desc: "Trigger leaf script (revealed for verification)" },
    ],
    witnessNote: "Schnorr signature is verified twice: once against the real sighash (CHECKSIGVERIFY), once against the preimage assembled from witness pieces (CHECKSIGFROMSTACK). If both pass, the preimage MUST match the real tx (Schnorr is deterministic). The embedded sha_single_output locks the destination.",
    leadsTo: "vault_loop",
  },
  recover: {
    id: "recover", label: "recover (cold sweep)", color: C.red, keyType: "cold",
    desc: "Emergency recovery to cold storage — immediate, no timelock, no dual verification",
    leafSide: "recover",
    script: [
      { op: "<cold_sig>", note: "Signature from cold_privkey", indent: 0 },
      { op: "<cold_pubkey>", note: "Public key for cold storage", indent: 0 },
      { op: "OP_CHECKSIG", note: "Simple ECDSA verification — no covenants at all", hl: true, indent: 0 },
    ],
    witness: [
      { item: "<sig>", bytes: "71-72 B", desc: "ECDSA signature from cold_privkey" },
      { item: "<script>", bytes: "~35 B", desc: "Recover leaf script (revealed for verification)" },
    ],
    witnessNote: "Unlike trigger, this is standard ECDSA (not Schnorr dual verification). Available at any time from vault or vault-loop. No destination lock — funds go to cold_pubkey's address.",
    leadsTo: "cold_recovery",
  },
  withdraw: {
    id: "withdraw", label: "withdraw (after CSV)", color: C.green, keyType: "hot",
    desc: "Withdraw to pre-locked destination after 10-block delay — dual verification with CSV",
    leafSide: "withdraw",
    script: [
      { op: "<10> OP_CHECKSEQUENCEVERIFY", note: "Relative timelock — must wait 10 blocks", hl: true, indent: 0 },
      { op: "OP_DROP", note: "Clean the stack", indent: 0 },
      { op: "<hot_sig>", note: "Signature from hot_privkey", indent: 0 },
      { op: "OP_CHECKSIGVERIFY", note: "Step 1: verify sig for this tx's sighash", indent: 0 },
      { op: "<preimage_prefix> <preimage_suffix>", note: "Witness-provided preimage pieces", indent: 0 },
      { op: "OP_CAT OP_CAT", note: "Step 2: concatenate and assemble preimage", indent: 0 },
      { op: "<embedded_sha_single_output>", note: "Constant from leaf: locked destination (pre-committed at vault creation)", indent: 0 },
      { op: "OP_CHECKSIGFROMSTACK", note: "Step 3: verify same sig against preimage (destination locked)", hl: true, indent: 0 },
    ],
    witness: [
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from hot_privkey" },
      { item: "<preimage_prefix>", bytes: "~70 B", desc: "First part of sighash" },
      { item: "<preimage_suffix>", bytes: "~80 B", desc: "Second part of sighash" },
      { item: "<script>", bytes: "~145 B", desc: "Withdraw leaf script (revealed for verification)" },
    ],
    witnessNote: "Same dual Schnorr verification as trigger, but with a CSV (CHECKSEQUENCEVERIFY) delay prepended. After 10 blocks, the withdrawal is finalized to the pre-locked destination (sha_single_output).",
    leadsTo: "destination_withdrawal",
  },
};

/* ─── UTXO definitions ───────────────────────────────────────────── */
const UTXO_DEFS = {
  vault: {
    id: "vault", title: "Vault UTXO", color: C.blue,
    paths: ["trigger", "recover"],
    wrapping: SCRIPT_WRAPPING.vault,
  },
  vault_loop: {
    id: "vault_loop", title: "Vault-Loop UTXO", color: C.amber,
    paths: ["withdraw", "recover"],
    wrapping: SCRIPT_WRAPPING.vault_loop,
  },
};

/* ─── Terminal outputs ───────────────────────────────────────────── */
const TERMINALS = {
  destination_withdrawal: {
    id: "destination_withdrawal", title: "Withdrawal Output (Pre-Locked Destination)", type: "P2TR or P2WPKH", color: C.green,
    details: [
      "Funds sent to destination locked at vault creation time",
      "Destination is committed via sha_single_output in the withdraw leaf",
      "Amount and scriptPubKey are both part of the SIGHASH_SINGLE commitment",
      "Cannot be changed without cold recovery + re-vaulting",
      "TERMINAL — funds released to predetermined receiver",
    ],
  },
  cold_recovery: {
    id: "cold_recovery", title: "Cold Storage Output", type: "P2TR or P2WPKH", color: C.red,
    details: [
      "Funds swept to cold_privkey's address (ECDSA signature in recover leaf)",
      "Available at any time from vault or vault-loop (no delay)",
      "Only cold_privkey can trigger — hot_privkey cannot sign this path",
      "Used for emergency recovery or key rotation",
      "TERMINAL — emergency cold storage",
    ],
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═════════════════════════════════════════════════════════════════════ */

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
      <div className="mt-3 rounded-lg p-2.5 border border-cyan-200 bg-cyan-50">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">Privacy Note</span>
        </div>
        <p className="text-[11px] text-cyan-800">{wrapping.privacyNote}</p>
      </div>

      {/* Taptree visualization */}
      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 anim-tree">
        <div className="flex items-center gap-2 mb-2">
          <TreeIcon size={14} color={C.emerald.dark} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Taptree Structure</span>
        </div>
        <div className="ml-2 space-y-1">
          <div className="text-[10px] text-emerald-800 font-mono">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600">internal_key:</span>
              <span className="font-bold">{wrapping.taptree.internal_key}</span>
            </div>
          </div>
          <div className="mt-1.5 space-y-1">
            {wrapping.taptree.leaves.map((leaf, i) => (
              <div key={i} className="border border-emerald-200 rounded px-2 py-1 bg-white">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold text-emerald-700">{leaf.name}</span>
                  <span className="text-slate-500">—</span>
                  <span className="text-slate-600 font-mono">{leaf.script}</span>
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5">Privacy: {leaf.privacy}</div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-emerald-700 mt-2 italic">{wrapping.taptree.note}</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Taproot Construction Pipeline ───────────────────────────────── */
function TaprootConstructionPipeline({ isActive }) {
  return (
    <div className="rounded-xl border-2 p-4" style={{ borderColor: C.emerald.bg + "40", backgroundColor: C.emerald.light + "60" }}>
      <div className="flex items-center gap-2 mb-3">
        <TreeIcon size={14} color={C.emerald.dark} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: C.emerald.text }}>
          Layer 1 — Taproot Construction: Internal Key → Taptree → Output Key
        </span>
      </div>

      <div className="space-y-2">
        {TAPROOT_CONSTRUCTION.steps.map((step, i) => (
          <div key={i} className={`flex items-start gap-3 ${isActive ? 'anim-in' : ''}`}
            style={isActive ? { animationDelay: `${i * 0.12}s` } : {}}>
            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: step.highlight ? C.orange.bg : C.emerald.bg }}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs bg-white rounded px-3 py-1.5 border border-slate-200"
                style={step.highlight ? { borderColor: C.orange.bg, backgroundColor: C.orange.light } : {}}>
                <span className="text-slate-400 text-[10px] mr-2">{step.label}:</span>
                <span className={step.highlight ? "text-orange-800 font-bold" : "text-slate-800 font-semibold"}>
                  {step.desc}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 ml-1">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── SIGHASH breakdown ──────────────────────────────────────────── */
function SIGHASHBreakdown({ isActive }) {
  return (
    <div className="rounded-xl border border-purple-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <HashIcon size={14} color={C.purple.dark} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-700">
          Dual Schnorr Verification — SIGHASH_SINGLE|ANYONECANPAY
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {CAT_CSFS_SIGHASH.fields.map((f, i) => (
          <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-purple-100 ${isActive ? 'anim-in' : ''}`}
            style={isActive ? { animationDelay: `${i * 0.06}s` } : {}}>
            <code className="text-[10px] font-bold font-mono text-purple-800 whitespace-nowrap">{f.name}</code>
            <span className="text-[9px] text-purple-600 bg-purple-50 px-1 py-0.5 rounded">{f.bytes}</span>
            <span className="text-[9px] text-slate-500 ml-auto">{f.desc}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg p-2.5 border-2 border-dashed border-cyan-300 bg-cyan-50">
        <p className="text-[11px] text-cyan-800">{CAT_CSFS_SIGHASH.note}</p>
      </div>
    </div>
  );
}

/* ─── Layer 2: Spending paths ────────────────────────────────────── */
function SpendingPaths({ utxoId, activePath, onPathClick }) {
  const isVault = utxoId === "vault";
  const paths = isVault ? ["trigger", "recover"] : ["withdraw", "recover"];
  const isVaultLoop = utxoId === "vault_loop";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Layer 2 — Two spending paths in taptree (both hidden until spend)
        </span>
      </div>

      <div className="flex items-center gap-4 mb-4 ml-1 text-[10px] text-slate-400">
        <span>Taproot script-path: select one leaf at spend time</span>
      </div>

      {/* SVG with taptree */}
      <svg viewBox="0 0 480 200" className="w-full max-w-lg mx-auto" style={{ height: 200 }}>
        {/* UTXO box */}
        <rect x="20" y="30" width="120" height="40" rx="8" fill={C.blue.light} stroke={C.blue.bg} strokeWidth="1.5" />
        <text x="80" y="48" textAnchor="middle" fontSize="8" fill={C.blue.text} fontWeight="bold">P2TR UTXO</text>
        <text x="80" y="58" textAnchor="middle" fontSize="7" fill={C.blue.text}>(Taproot)</text>

        {/* Arrow down */}
        <line x1="80" y1="70" x2="80" y2="95" stroke="#d1d5db" strokeWidth="2" />

        {/* Internal key box */}
        <rect x="30" y="100" width="100" height="30" rx="6" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1" />
        <text x="80" y="120" textAnchor="middle" fontSize="8" fill="#4b5563" fontWeight="bold">internal_key (NUMS)</text>

        {/* Branching down */}
        <line x1="80" y1="130" x2="150" y2="160" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="3 2" />
        <line x1="80" y1="130" x2="380" y2="160" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="3 2" />

        {/* Leaf 1: trigger/withdraw */}
        <g onClick={() => onPathClick(isVault ? "trigger" : "withdraw")} className="cursor-pointer">
          <rect x="100" y="170" width="100" height="24" rx="8"
            fill={activePath === (isVault ? "trigger" : "withdraw") ? C.emerald.light : "white"}
            stroke={activePath === (isVault ? "trigger" : "withdraw") ? C.emerald.bg : C.emerald.bg + "60"}
            strokeWidth={activePath === (isVault ? "trigger" : "withdraw") ? 2 : 1.5} />
          <text x="150" y="187" textAnchor="middle" fontSize="9" fill={C.emerald.text} fontWeight="bold">
            {isVault ? "trigger" : "withdraw"} leaf
          </text>
        </g>

        {/* Leaf 2: recover */}
        <g onClick={() => onPathClick("recover")} className="cursor-pointer">
          <rect x="330" y="170" width="100" height="24" rx="8"
            fill={activePath === "recover" ? C.red.light : "white"}
            stroke={activePath === "recover" ? C.red.bg : C.red.bg + "60"}
            strokeWidth={activePath === "recover" ? 2 : 1.5} />
          <text x="380" y="187" textAnchor="middle" fontSize="9" fill={C.red.text} fontWeight="bold">
            recover leaf
          </text>
        </g>

        {/* Comparison note */}
        <text x="240" y="215" textAnchor="middle" fontSize="7" fill="#94a3b8">
          Unlike CTV (P2WSH with OP_IF), both paths are in separate leaves. Only one is revealed at spend.
        </text>
      </svg>
    </div>
  );
}

/* ─── Layer 3: Path detail (script + witness) ─────────────────────── */
function PathDetail({ path, utxoId, onExecute }) {
  const isRecovery = path.id === "recover";
  const color = path.color;

  return (
    <div className="space-y-3 anim-in">

      {/* Key authorization */}
      <div className="rounded-xl border-2 p-3" style={{ borderColor: color.bg + "60", backgroundColor: color.light + "40" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: color.light, border: `2px solid ${color.bg}` }}>
            <KeyIcon size={20} color={color.dark} animate={true} />
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: color.text }}>
              {isRecovery ? "Cold Key (ECDSA)" : "Hot Key (Schnorr)"}
            </div>
            <div className="text-[10px] text-slate-600">
              {isRecovery
                ? "cold_privkey signs a simple CHECKSIG. No dual verification. Available at any time."
                : path.id === "trigger"
                  ? "hot_privkey signs via dual Schnorr verification (CHECKSIGVERIFY + CAT + CSFS). Destination locked via sha_single_output."
                  : "hot_privkey signs via dual Schnorr verification after CSV delay. Withdraw destination is pre-locked at vault creation."}
            </div>
          </div>
        </div>
      </div>

      {/* Script */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 anim-in-d1">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {path.leafSide} Leaf Script
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: color.light, color: color.text }}>
            {path.leafSide}
          </span>
        </div>
        <div className="font-mono text-xs leading-relaxed space-y-0.5">
          {path.script.map((s, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-300 w-3 text-right select-none text-[10px]">{i}</span>
              <span className={
                s.hl ? "text-emerald-700 font-semibold" : "text-slate-700"
              } style={{ marginLeft: (s.indent || 0) * 12 }}>
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

      {/* Fee management callout */}
      <div className="rounded-lg p-2.5 bg-cyan-50 border border-cyan-200 anim-in-d3">
        <div className="text-[10px] text-cyan-700 font-bold uppercase tracking-wider mb-1">
          Fee Management — SIGHASH_SINGLE|ANYONECANPAY
        </div>
        <p className="text-[11px] text-cyan-800">
          The covenant signature only covers ONE output (the destination). Additional fee-paying inputs can be added
          without invalidating the signature. No anchor outputs needed — fee bumping is flexible and efficient.
        </p>
      </div>

      {/* Execute button */}
      <button onClick={onExecute}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
        style={{ backgroundColor: color.bg }}>
        <KeyIcon size={16} color="white" />
        {isRecovery ? "Sign with cold_key — Recover" : path.id === "trigger" ? "Sign with hot_key — Trigger" : "Sign with hot_key — Withdraw"}
      </button>
    </div>
  );
}

/* ─── Transition animation ────────────────────────────────────────── */
function TransitionView({ path, fromColor, toColor, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [onDone]);

  const isRecovery = path.id === "recover";

  return (
    <div className="flex flex-col items-center py-4 gap-3 anim-in">
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl anim-pulse"
        style={{ backgroundColor: path.color.light, border: `2px solid ${path.color.bg}` }}>
        <KeyIcon size={22} color={path.color.dark} animate />
        <span className="text-sm font-semibold" style={{ color: path.color.dark }}>
          {isRecovery ? "Cold signature verifying..." : "Dual Schnorr verification..."}
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
          Output reached terminal state. No more covenant constraints. This is where the vault lifecycle ends.
        </div>
      </div>
    </div>
  );
}

/* ─── Key system overview ────────────────────────────────────────── */
function KeySystemOverview() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">2-Key System</div>
      <div className="grid grid-cols-2 gap-2">
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
   ═════════════════════════════════════════════════════════════════════ */
export default function CATCSFSUTXOLifecycle() {
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
            <h1 className="text-base font-bold text-slate-800">CAT+CSFS Vault — UTXO Lifecycle Explorer</h1>
            <p className="text-[11px] text-slate-500">
              Taproot P2TR with dual Schnorr verification (OP_CAT + OP_CHECKSIGFROMSTACK) — See taptree, tapscript, leaf selection, and covenant enforcement
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

            {/* Layer 1: Taproot construction pipeline */}
            <TaprootConstructionPipeline isActive={!activePath} />

            {/* SIGHASH breakdown (show for vault) */}
            {currentUTXO === "vault" && <SIGHASHBreakdown isActive={!activePath} />}

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
