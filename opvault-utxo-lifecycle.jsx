import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   OP_VAULT — UTXO Lifecycle Explorer with Taproot Internals

   Educational interactive explorer showing how OP_VAULT (BIP 345) UTXOs
   work at the Taproot level. Key architectural differences from CCV:
     - Internal key = recovery_pubkey (NOT NUMS!) → keypath IS spendable
     - OP_VAULT opcode enforces trigger output structure
     - OP_VAULT_RECOVER requires recoveryauth signature (anti-griefing)
     - BIP-32 derived trigger keys per vault
     - 3-key system: trigger, recoveryauth, recovery
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
const STYLE_ID = "opvault-utxo-kf";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes fadeIn { 0% { opacity:0; transform:translateY(12px) } 100% { opacity:1; transform:translateY(0) } }
    @keyframes pulseGlow { 0%,100% { box-shadow:0 0 0 0 rgba(59,130,246,0) } 50% { box-shadow:0 0 16px 4px rgba(59,130,246,0.25) } }
    @keyframes proofHighlight { 0% { opacity:0.3 } 50% { opacity:1 } 100% { opacity:0.3 } }
    @keyframes keyInsert { 0% { transform:translateX(-10px) rotate(-20deg); opacity:0 } 50% { transform:translateX(1px) rotate(10deg); opacity:1 } 100% { transform:translateX(0) rotate(0); opacity:1 } }
    @keyframes lockOpen { 0% { transform:translateY(0) } 60% { transform:translateY(-3px) rotate(-12deg) } 100% { transform:translateY(-4px) rotate(-16deg) } }
    @keyframes flowParticle { 0% { transform:translateY(-16px); opacity:0 } 30% { opacity:1 } 100% { transform:translateY(16px); opacity:0 } }
    @keyframes morphReveal { 0% { clip-path:circle(0% at 50% 50%); opacity:0 } 100% { clip-path:circle(100% at 50% 50%); opacity:1 } }
    .anim-in { animation: fadeIn 0.35s ease-out both }
    .anim-in-d1 { animation: fadeIn 0.35s ease-out 0.1s both }
    .anim-in-d2 { animation: fadeIn 0.35s ease-out 0.2s both }
    .anim-in-d3 { animation: fadeIn 0.35s ease-out 0.3s both }
    .anim-pulse { animation: pulseGlow 2s ease-in-out infinite }
    .anim-morph { animation: morphReveal 0.4s ease-out both }
    .proof-active { animation: proofHighlight 1.2s ease-in-out infinite }
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
function LockOpenIcon({ size = 16, color = "#16a34a", animate = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke={color} strokeWidth="2" fill={color + "12"} />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke={color} strokeWidth="2" strokeLinecap="round"
      style={animate ? { animation: "lockOpen 0.5s ease-out both" } : {}} />
    <circle cx="12" cy="16.5" r="1.5" fill={color} />
  </svg>;
}
function ShieldIcon({ size = 16, color = "#dc2626" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={color} strokeWidth="2" fill={color + "18"}
      strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/* ═══════════════════════════════════════════════════════════════════════
   DATA MODEL — OP_VAULT Taproot Architecture

   OP_VAULT uses P2TR with a CRITICAL difference from CCV:
     Internal key = recovery_pubkey (a REAL key, NOT NUMS)

   This means:
     - Keypath spend IS possible → direct recovery via recovery_pubkey
     - Scriptpath has 2 leaves per UTXO state (recover + trigger/withdraw)
     - OP_VAULT opcode constructs the trigger output's taptree
     - OP_VAULT_RECOVER requires recoveryauth_pubkey signature (anti-griefing)
   ═══════════════════════════════════════════════════════════════════════ */

const TAPROOT = {
  vault: {
    nakedKey: "recovery_pubkey",
    nakedKeyDesc: "This IS a real key — the recovery cold storage destination. Keypath spend = direct recovery.",
    keypathSpendable: true,
    keypathDesc: "Spending via keypath sends directly to recovery — equivalent to OP_VAULT_RECOVER but without the script overhead",
    tweakSteps: [
      { label: "Internal key", formula: "internal_key = recovery_pubkey", note: "Real key — NOT NUMS. Keypath is a valid recovery path." },
      { label: "Build Merkle root", formula: "merkle_root = TapBranch(recover, trigger)", note: "Two leaf scripts in a balanced tree" },
      { label: "Compute tweak", formula: "t = TaggedHash(\"TapTweak\", recovery_pubkey || merkle_root)", note: "Commits to both key and tree" },
      { label: "Output key", formula: "Q = recovery_pubkey + t · G", note: "32-byte point on chain — looks like any other P2TR" },
    ],
    scriptPubKey: "OP_1 <Q>",
    scriptPubKeyNote: "34 bytes — indistinguishable from a regular Taproot output. No one can tell this is a vault.",
    tree: {
      structure: "binary",
      root: "TapBranch",
      left: { type: "leaf", id: "recover_vault", label: "recover", depth: 1 },
      right: { type: "leaf", id: "trigger", label: "trigger", depth: 1 },
      proofs: {
        recover_vault: {
          desc: "Proof: sibling is trigger leaf hash",
          path: ["H(trigger)"],
          controlSize: "33 + 32 = 65 bytes",
        },
        trigger: {
          desc: "Proof: sibling is recover leaf hash",
          path: ["H(recover)"],
          controlSize: "33 + 32 = 65 bytes",
        },
      },
    },
  },
  trigger_state: {
    nakedKey: "recovery_pubkey",
    nakedKeyDesc: "Same recovery_pubkey as internal key — keypath recovery still works",
    keypathSpendable: true,
    keypathDesc: "Keypath recovery remains available even during the unvaulting timelock period",
    tweakSteps: [
      { label: "Internal key", formula: "internal_key = recovery_pubkey", note: "Preserved from the vault UTXO" },
      { label: "Build new taptree", formula: "merkle_root = TapBranch(recover, withdraw)", note: "OP_VAULT constructs this tree automatically", highlight: true },
      { label: "Compute tweak", formula: "t = TaggedHash(\"TapTweak\", recovery_pubkey || merkle_root)", note: "New tree, same key" },
      { label: "Output key", formula: "Q = recovery_pubkey + t · G", note: "New Q — different from vault because tree changed" },
    ],
    scriptPubKey: "OP_1 <Q>",
    scriptPubKeyNote: "34 bytes — the OP_VAULT opcode computed this Q automatically during trigger",
    tree: {
      structure: "binary",
      root: "TapBranch",
      left: { type: "leaf", id: "recover_trigger", label: "recover", depth: 1 },
      right: { type: "leaf", id: "withdraw", label: "withdraw", depth: 1 },
      proofs: {
        recover_trigger: {
          desc: "Proof: sibling is withdraw leaf hash",
          path: ["H(withdraw)"],
          controlSize: "33 + 32 = 65 bytes",
        },
        withdraw: {
          desc: "Proof: sibling is recover leaf hash",
          path: ["H(recover)"],
          controlSize: "33 + 32 = 65 bytes",
        },
      },
    },
  },
};

/* ─── Key model ──────────────────────────────────────────────────── */
const KEY_TYPES = {
  trigger:     { id: "trigger_pk", label: "trigger_pubkey", short: "Trigger Key", color: "#2563eb", bg: "#dbeafe", border: "#93c5fd" },
  recovauth:   { id: "recovauth_pk", label: "recoveryauth_pubkey", short: "Recovery Auth Key", color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
  none:        { id: "none", label: "No Key", short: "Keyless", color: "#16a34a", bg: "#dcfce7", border: "#86efac" },
};

/* ─── Leaf scripts ───────────────────────────────────────────────── */
const LEAVES = {
  trigger: {
    id: "trigger", label: "trigger", color: C.blue, keyType: "trigger",
    desc: "Start withdrawal — OP_VAULT enforces the trigger output structure",
    script: [
      { op: "<trigger_pubkey>", note: "BIP-32 derived per vault from xpub", indent: 0 },
      { op: "OP_CHECKSIGVERIFY", note: "require Schnorr signature from trigger key", hl: true, isKey: true, indent: 0 },
      { op: "<spend_delay>", note: "e.g. 10 blocks — timelock for withdrawal", indent: 0 },
      { op: "2", note: "leaf count for the trigger output taptree", indent: 0 },
      { op: "<OP_CSV, OP_DROP, OP_CTV>", note: "the withdrawal leaf template — 3 opcodes", indent: 0 },
      { op: "OP_VAULT", note: "constructs trigger output with new taptree", hl: true, indent: 0 },
    ],
    scriptNote: "OP_VAULT reads spend_delay and the leaf template from the stack, constructs a new P2TR output with taptree [recover, withdraw], and verifies the spending transaction creates it.",
    witness: [
      { item: "<revault_amount>", bytes: "8 B", desc: "Amount to re-vault (0 if spending entire UTXO)" },
      { item: "<revault_idx>", bytes: "4 B", desc: "Output index for re-vault output (-1 if none)" },
      { item: "<trigger_vout_idx>", bytes: "4 B", desc: "Output index for the trigger output" },
      { item: "<ctv_hash>", bytes: "32 B", desc: "CTV template hash for the eventual withdrawal" },
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from trigger_pubkey" },
      { item: "<trigger_script>", bytes: "~55 B", desc: "This trigger leaf's script bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || recovery_pubkey || H(recover)" },
    ],
    witnessNote: "7 witness items (~292 vB total). The OP_VAULT opcode reads ctv_hash, spend_delay, and the leaf template from the witness/stack, then constructs and enforces the trigger output's P2TR address.",
    leadsTo: "trigger_state",
  },
  recover_vault: {
    id: "recover_vault", label: "recover", color: C.red, keyType: "recovauth",
    desc: "Authorized recovery — requires recoveryauth signature (anti-griefing)",
    script: [
      { op: "<recoveryauth_pubkey>", note: "authorization key — prevents griefing", indent: 0 },
      { op: "OP_CHECKSIGVERIFY", note: "require signature — NOT like CCV's OP_TRUE!", hl: true, isKey: true, indent: 0 },
      { op: "<recovery_spk_hash>", note: "SHA256 of the recovery scriptPubKey", indent: 0 },
      { op: "OP_VAULT_RECOVER", note: "enforce output goes to recovery address", hl: true, indent: 0 },
    ],
    scriptNote: "OP_VAULT_RECOVER checks that the output scriptPubKey hashes to recovery_spk_hash. The recoveryauth signature prevents anyone from griefing the vault by broadcasting unauthorized recovery transactions — a key improvement over CCV's OP_TRUE recovery.",
    witness: [
      { item: "<recovery_vout_idx>", bytes: "4 B", desc: "Output index for recovery output" },
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from recoveryauth_pubkey" },
      { item: "<recover_script>", bytes: "~70 B", desc: "This recover leaf's script bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || recovery_pubkey || H(trigger)" },
    ],
    witnessNote: "4 witness items (~170 vB). The recoveryauth_pubkey signature prevents griefing — unlike CCV where anyone can trigger recovery and lock funds in cold storage.",
    leadsTo: "recovery",
  },
  withdraw: {
    id: "withdraw", label: "withdraw", color: C.green, keyType: "none",
    desc: "Complete withdrawal after timelock — CTV enforces exact outputs",
    script: [
      { op: "<ctv_hash>", note: "template hash — committed at trigger time", indent: 0 },
      { op: "<spend_delay>", note: "e.g. 10 blocks — same as trigger", indent: 0 },
      { op: "OP_CHECKSEQUENCEVERIFY", note: "must wait spend_delay blocks", hl: true, indent: 0 },
      { op: "OP_DROP", note: "clean the stack", indent: 0 },
      { op: "OP_CHECKTEMPLATEVERIFY", note: "outputs must match ctv_hash exactly", hl: true, indent: 0 },
    ],
    scriptNote: "Pure math enforcement — no signature at all. The CSV timelock provides the security window for recovery. Once the delay passes, CTV ensures the outputs match what was committed at trigger time.",
    witness: [
      { item: "<withdraw_script>", bytes: "~40 B", desc: "This withdrawal leaf's script bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || recovery_pubkey || H(recover)" },
    ],
    witnessNote: "Just 2 witness items (~112 vB) — the leanest spend path. No signature data needed at all. The script is self-enforcing via CSV + CTV.",
    leadsTo: "withdrawal",
  },
  recover_trigger: {
    id: "recover_trigger", label: "recover", color: C.red, keyType: "recovauth",
    desc: "Recovery during timelock — same authorized mechanism",
    script: [
      { op: "<recoveryauth_pubkey>", note: "same auth key as vault state", indent: 0 },
      { op: "OP_CHECKSIGVERIFY", note: "require authorization signature", hl: true, isKey: true, indent: 0 },
      { op: "<recovery_spk_hash>", note: "SHA256 of recovery scriptPubKey", indent: 0 },
      { op: "OP_VAULT_RECOVER", note: "enforce output goes to recovery address", hl: true, indent: 0 },
    ],
    scriptNote: "Identical logic to vault-state recovery. This path is available during the entire timelock period — if the trigger was unauthorized, the owner can recover funds before the withdrawal completes.",
    witness: [
      { item: "<recovery_vout_idx>", bytes: "4 B", desc: "Output index for recovery output" },
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from recoveryauth_pubkey" },
      { item: "<recover_script>", bytes: "~70 B", desc: "This recover leaf's script bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || recovery_pubkey || H(withdraw)" },
    ],
    witnessNote: "4 items (~170 vB). Same cost as vault-state recovery. This is the safety net during the timelock window.",
    leadsTo: "recovery",
  },
};

/* ─── UTXO definitions ───────────────────────────────────────────── */
const UTXO_DEFS = {
  vault: {
    id: "vault", title: "Vault UTXO", color: C.blue,
    leaves: ["trigger", "recover_vault"],
  },
  trigger_state: {
    id: "trigger_state", title: "Trigger Output (Unvaulting)", color: C.amber,
    leaves: ["withdraw", "recover_trigger"],
  },
};

/* ─── Terminal outputs ───────────────────────────────────────────── */
const TERMINALS = {
  withdrawal: {
    id: "withdrawal", title: "Withdrawal Output", type: "P2TR / P2WPKH (destination)", color: C.green,
    details: [
      "CTV-committed outputs — exact structure locked at trigger time",
      "Destination address chosen by the vault owner during trigger",
      "No covenant constraints — simple standard output",
      "TERMINAL — funds released to the owner",
    ],
  },
  recovery: {
    id: "recovery", title: "Recovery Output", type: "P2TR(recovery_pubkey)", color: C.red,
    details: [
      "Funds swept to the pre-committed recovery address",
      "OP_VAULT_RECOVER enforces the scriptPubKey matches recovery_spk_hash",
      "Authorized recovery — recoveryauth_pubkey must sign (prevents griefing)",
      "TERMINAL — emergency cold storage",
    ],
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Layer 0: On-chain reality ───────────────────────────────────── */
function OnChainView({ taproot, utxoColor }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-gradient-to-r from-slate-50 to-slate-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Layer 0 — What miners see on chain</span>
      </div>
      <div className="font-mono text-sm bg-white rounded-lg px-4 py-3 border border-slate-200 flex items-center gap-3">
        <span className="text-slate-400 text-xs">scriptPubKey:</span>
        <span className="text-slate-500">OP_1</span>
        <span className="px-2 py-1 rounded font-bold" style={{ backgroundColor: utxoColor.light, color: utxoColor.text }}>
          &lt;Q&gt;
        </span>
        <span className="text-slate-300 text-xs ml-2">← 34 bytes total</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 ml-1">{taproot.scriptPubKeyNote}</p>
    </div>
  );
}

/* ─── Layer 1: Taproot key construction ───────────────────────────── */
function TweakPipeline({ taproot, utxoColor, isActive }) {
  return (
    <div className="rounded-xl border-2 p-4" style={{ borderColor: utxoColor.bg + "40", backgroundColor: utxoColor.light + "60" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: utxoColor.bg }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: utxoColor.text }}>
          Layer 1 — How Q is constructed
        </span>
      </div>

      <div className="space-y-2">
        {taproot.tweakSteps.map((step, i) => (
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

      {/* Keypath callout — THIS is the big difference from CCV */}
      {taproot.keypathSpendable && (
        <div className="mt-3 rounded-lg p-3 border-2 border-dashed" style={{ borderColor: C.green.bg + "60", backgroundColor: C.green.light }}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldIcon size={14} color={C.green.dark} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-green-700">Keypath is SPENDABLE</span>
          </div>
          <p className="text-xs text-green-800">
            Unlike CCV (which uses NUMS), OP_VAULT uses <code className="font-bold bg-green-200 px-1 rounded">recovery_pubkey</code> as
            the internal key. This means the holder of the recovery private key can spend this UTXO directly via keypath —
            no script revelation needed. {taproot.keypathDesc}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Layer 2: Merkle tree ───────────────────────────────────────── */
function MerkleTree({ taproot, utxoId, activeLeaf, onLeafClick }) {
  const tree = taproot.tree;
  const proofPaths = tree.proofs;
  const activeProof = activeLeaf ? proofPaths[activeLeaf] : null;
  const isVault = utxoId === "vault";

  const pn = (id) => {
    if (!activeLeaf) return false;
    if (id === activeLeaf) return "active";
    // In a 2-leaf tree, the other leaf is always the sibling
    const leaves = isVault ? ["trigger", "recover_vault"] : ["withdraw", "recover_trigger"];
    const other = leaves.find(l => l !== activeLeaf);
    if (id === other) return "sibling";
    return false;
  };

  const leftId = isVault ? "recover_vault" : "recover_trigger";
  const rightId = isVault ? "trigger" : "withdraw";
  const leftLeaf = LEAVES[leftId];
  const rightLeaf = LEAVES[rightId];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Layer 2 — Taptree (Merkle tree of spending scripts)
        </span>
      </div>

      {/* Keypath vs scriptpath */}
      <div className="flex items-center gap-4 mb-4 ml-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className="w-6 h-[2px] bg-green-400" />
          <span>Keypath: <strong className="text-green-600">SPENDABLE</strong> (recovery_pubkey → direct recovery)</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className="w-6 h-[2px] bg-blue-400" />
          <span>Scriptpath: reveal a leaf + Merkle proof ↓</span>
        </div>
      </div>

      {/* Tree SVG — always 2 leaves */}
      <svg viewBox="0 0 400 110" className="w-full max-w-sm mx-auto" style={{ height: 110 }}>
        {/* Edges */}
        <line x1="200" y1="20" x2="110" y2="70"
          stroke={pn(leftId) === "active" ? leftLeaf.color.bg : "#d1d5db"}
          strokeWidth={pn(leftId) === "active" ? 2.5 : 1.5} />
        <line x1="200" y1="20" x2="290" y2="70"
          stroke={pn(rightId) === "active" ? rightLeaf.color.bg : "#d1d5db"}
          strokeWidth={pn(rightId) === "active" ? 2.5 : 1.5} />

        {/* Root */}
        <circle cx="200" cy="20" r="8" fill={C.slate.bg} stroke="#475569" strokeWidth="1.5" />
        <text x="200" y="23" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">root</text>

        {/* Left leaf */}
        <g onClick={() => onLeafClick(leftId)} className="cursor-pointer">
          <rect x="40" y="58" width="140" height="28" rx="8"
            fill={pn(leftId) === "active" ? leftLeaf.color.light : "white"}
            stroke={pn(leftId) === "active" ? leftLeaf.color.bg : leftLeaf.color.bg + "60"}
            strokeWidth={pn(leftId) === "active" ? 2.5 : 1.5} />
          <text x="110" y="76" textAnchor="middle" fontSize="10" fill={leftLeaf.color.text} fontWeight="bold">
            {leftLeaf.label}
          </text>
          {pn(leftId) === "sibling" && <text x="183" y="73" fontSize="7" fill={C.amber.bg} fontWeight="bold">PROOF</text>}
        </g>

        {/* Right leaf */}
        <g onClick={() => onLeafClick(rightId)} className="cursor-pointer">
          <rect x="220" y="58" width="140" height="28" rx="8"
            fill={pn(rightId) === "active" ? rightLeaf.color.light : "white"}
            stroke={pn(rightId) === "active" ? rightLeaf.color.bg : rightLeaf.color.bg + "60"}
            strokeWidth={pn(rightId) === "active" ? 2.5 : 1.5} />
          <text x="290" y="76" textAnchor="middle" fontSize="10" fill={rightLeaf.color.text} fontWeight="bold">
            {rightLeaf.label}
          </text>
          {pn(rightId) === "sibling" && <text x="363" y="73" fontSize="7" fill={C.amber.bg} fontWeight="bold">PROOF</text>}
        </g>

        {/* Key badges */}
        <g transform="translate(43, 58)">
          <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.recovauth.bg} stroke={KEY_TYPES.recovauth.border} strokeWidth="0.8" />
          <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.recovauth.color} fontWeight="bold">auth key</text>
        </g>
        <g transform="translate(223, 58)">
          {isVault ? (
            <>
              <rect x="0" y="-12" width="36" height="12" rx="6" fill={KEY_TYPES.trigger.bg} stroke={KEY_TYPES.trigger.border} strokeWidth="0.8" />
              <text x="18" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.trigger.color} fontWeight="bold">key</text>
            </>
          ) : (
            <>
              <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.none.bg} stroke={KEY_TYPES.none.border} strokeWidth="0.8" />
              <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.none.color} fontWeight="bold">CTV+CSV</text>
            </>
          )}
        </g>

        {/* Proof annotation */}
        {activeLeaf && activeProof && (
          <text x="200" y="106" textAnchor="middle" fontSize="8" fill="#64748b">
            Merkle proof ({activeProof.controlSize}): {activeProof.path.join(" + ")}
          </text>
        )}
      </svg>

      {/* Hash construction */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash("TapLeaf", 0xc0 || script)</code>
          <div className="text-slate-400 mt-0.5">Each leaf is a tagged SHA256</div>
        </div>
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash("TapBranch", sort(L, R))</code>
          <div className="text-slate-400 mt-0.5">Branches are sorted then hashed</div>
        </div>
        <div className="text-[10px] text-center p-1.5 rounded bg-green-50 border border-green-200">
          <code className="text-green-700">internal_key = recovery_pubkey</code>
          <div className="text-green-600 mt-0.5">Real key, not NUMS!</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Layer 3: Leaf detail ───────────────────────────────────────── */
function LeafDetail({ leaf, taproot, onExecute }) {
  const kt = KEY_TYPES[leaf.keyType];
  const isKeyless = leaf.keyType === "none";
  const proof = taproot.tree.proofs[leaf.id];

  return (
    <div className="space-y-3 anim-in">

      {/* Key authorization */}
      <div className="rounded-xl border-2 p-3" style={{ borderColor: kt.border, backgroundColor: kt.bg + "40" }}>
        <div className="flex items-center gap-3">
          {isKeyless ? (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: kt.bg, border: `2px solid ${kt.border}` }}>
              <LockOpenIcon size={20} color={kt.color} animate={true} />
            </div>
          ) : leaf.keyType === "recovauth" ? (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: kt.bg, border: `2px solid ${kt.border}` }}>
              <ShieldIcon size={20} color={kt.color} />
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
                ? "CSV timelock + CTV template — no human signature needed"
                : leaf.keyType === "recovauth"
                  ? "recoveryauth_pubkey must sign — prevents griefing (unlike CCV's OP_TRUE)"
                  : "trigger_pubkey must sign — BIP-32 derived per vault from xpub"}
            </div>
          </div>
        </div>
      </div>

      {/* Script */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 anim-in-d1">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Leaf Script (bytecode)</div>
        <div className="font-mono text-xs leading-relaxed space-y-0.5">
          {leaf.script.map((s, i) => (
            <div key={i} className="flex gap-2">
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
        {leaf.scriptNote && (
          <p className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-100">{leaf.scriptNote}</p>
        )}
      </div>

      {/* Witness stack */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 anim-in-d2">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">
          Witness Stack (what the spender provides)
        </div>
        <div className="space-y-1">
          {leaf.witness.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-slate-300 font-mono text-[10px] w-4 text-right">[{i}]</span>
              <code className="font-mono font-semibold text-slate-800 bg-slate-50 px-1.5 py-0.5 rounded">{w.item}</code>
              <span className="text-slate-400 text-[10px]">{w.bytes}</span>
              <span className="text-slate-500 text-[10px]">{w.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-100">{leaf.witnessNote}</p>

        {/* Control block anatomy */}
        {proof && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Control Block Anatomy</div>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">(0xc0|neg)</span>
              <span className="text-slate-300">||</span>
              <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">recovery_pk (32B)</span>
              <span className="text-slate-300">||</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                {proof.path.length > 0 ? proof.path.join(" || ") : "∅"} ({proof.path.length * 32}B)
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              The internal pubkey in the control block is <strong>recovery_pubkey</strong> (not NUMS).
              The verifier reconstructs Merkle root, then checks Q = P + TaggedHash("TapTweak", P || root) · G
            </p>
          </div>
        )}
      </div>

      {/* OP_VAULT opcode detail (for trigger leaf) */}
      {leaf.id === "trigger" && (
        <div className="rounded-lg p-3 border-2 border-dashed border-blue-300 bg-blue-50 anim-in-d3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">OP_VAULT Opcode — What it does</span>
          </div>
          <div className="text-xs text-blue-800 space-y-1">
            <p>OP_VAULT reads from the stack: spend_delay, leaf_count, and the withdrawal leaf template (OP_CSV, OP_DROP, OP_CTV).</p>
            <p>It constructs a new taptree: <code className="bg-blue-200 px-1 rounded">[recover_leaf, withdraw_leaf]</code> where the withdraw leaf
              embeds the ctv_hash and spend_delay from the witness.</p>
            <p>It then builds the trigger output's P2TR address using the same recovery_pubkey as internal key, and verifies the spending
              transaction creates this output.</p>
          </div>
        </div>
      )}

      {/* Anti-griefing callout (for recover leaves) */}
      {leaf.keyType === "recovauth" && (
        <div className="rounded-lg p-3 border-2 border-dashed border-red-300 bg-red-50 anim-in-d3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldIcon size={14} color={C.red.dark} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">Anti-Griefing: Authorized Recovery</span>
          </div>
          <p className="text-xs text-red-800">
            CCV vaults use <code className="bg-red-200 px-1 rounded">OP_TRUE</code> for recovery — anyone can trigger it,
            which means an attacker could grief the vault by sweeping funds to cold storage repeatedly.
            OP_VAULT requires <code className="bg-red-200 px-1 rounded">recoveryauth_pubkey</code> to sign,
            ensuring only the vault owner can initiate recovery. This is derived from a passphrase via PBKDF2.
          </p>
        </div>
      )}

      {/* Fee management */}
      <div className="rounded-lg p-2.5 bg-slate-50 border border-slate-200 anim-in-d3">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Fee Management</div>
        <p className="text-[11px] text-slate-600">
          OP_VAULT uses a separate fee wallet (2-input transaction pattern). The vault UTXO is input[0],
          a fee UTXO is input[1]. This adds ~50 vB overhead but avoids the need for CPFP anchor outputs.
        </p>
      </div>

      {/* Execute button */}
      <button onClick={onExecute}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
        style={{ backgroundColor: leaf.color.bg }}>
        {isKeyless
          ? <><LockOpenIcon size={16} color="white" /> Execute (keyless) — see output UTXO</>
          : leaf.keyType === "recovauth"
            ? <><ShieldIcon size={16} color="white" /> Authorize recovery — see output UTXO</>
            : <><KeyIcon size={16} color="white" /> Sign & broadcast — see output UTXO</>}
      </button>
    </div>
  );
}

/* ─── Transition animation ────────────────────────────────────────── */
function TransitionView({ leaf, fromColor, toColor, onDone }) {
  const kt = KEY_TYPES[leaf.keyType];
  const isKeyless = leaf.keyType === "none";

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
          : leaf.keyType === "recovauth"
            ? <ShieldIcon size={22} color={kt.color} />
            : <KeyIcon size={22} color={kt.color} animate />}
        <span className="text-sm font-semibold" style={{ color: kt.color }}>
          {isKeyless ? "CSV verified, CTV checking template..." :
            leaf.keyType === "recovauth" ? "Verifying recoveryauth signature..." :
              `Signing with ${kt.label}...`}
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

      <span className="text-[10px] text-slate-400">
        {leaf.id === "trigger" ? "OP_VAULT constructing trigger output..." : "Script validated — new UTXO materializing..."}
      </span>
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
          No Taproot taptree — spendable directly. The vault lifecycle ends here.
        </div>
      </div>
    </div>
  );
}

/* ─── 3-Key system overview ──────────────────────────────────────── */
function KeySystemOverview() {
  const keys = [
    { label: "trigger_pubkey", role: "Signs trigger tx — BIP-32 derived per vault from xpub", color: C.blue, derivation: "m/86'/0'/0'/0/i" },
    { label: "recoveryauth_pubkey", role: "Authorizes recovery — PBKDF2 from passphrase", color: C.red, derivation: "PBKDF2(pass)" },
    { label: "recovery_pubkey", role: "Cold storage destination — also the Taproot internal key", color: C.purple, derivation: "cold wallet" },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">3-Key System</div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => (
          <div key={i} className="text-center p-2 rounded-lg border" style={{ borderColor: k.color.bg + "40", backgroundColor: k.color.light }}>
            <code className="text-[10px] font-bold" style={{ color: k.color.text }}>{k.label}</code>
            <div className="text-[8px] text-slate-500 mt-0.5">{k.role}</div>
            <div className="text-[8px] font-mono text-slate-400 mt-0.5">{k.derivation}</div>
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
export default function OPVaultUTXOLifecycle() {
  const [path, setPath] = useState([{ label: "Vault UTXO", color: C.blue }]);
  const [currentUTXO, setCurrentUTXO] = useState("vault");
  const [activeLeaf, setActiveLeaf] = useState(null);
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

  const handleLeafClick = useCallback((leafId) => {
    setActiveLeaf(prev => prev === leafId ? null : leafId);
    setTimeout(() => scrollTo("bottom"), 100);
  }, [scrollTo]);

  const handleExecute = useCallback(() => {
    if (!activeLeaf) return;
    const leaf = LEAVES[activeLeaf];
    setTransitioning(leaf);
    scrollTo("bottom");
  }, [activeLeaf, scrollTo]);

  const handleTransitionDone = useCallback(() => {
    const leaf = transitioning;
    if (!leaf) return;
    setTransitioning(null);
    setActiveLeaf(null);

    const target = leaf.leadsTo;
    if (TERMINALS[target]) {
      setTerminal(TERMINALS[target]);
      setPath(p => [...p, { label: leaf.label, color: leaf.color }, { label: TERMINALS[target].title, color: TERMINALS[target].color }]);
    } else {
      setCurrentUTXO(target);
      setPath(p => [...p, { label: leaf.label, color: leaf.color }, { label: UTXO_DEFS[target].title, color: UTXO_DEFS[target].color }]);
    }
    scrollTo("top");
  }, [transitioning, scrollTo]);

  const handleReset = useCallback(() => {
    setCurrentUTXO("vault");
    setTerminal(null);
    setActiveLeaf(null);
    setTransitioning(null);
    setPath([{ label: "Vault UTXO", color: C.blue }]);
    scrollTo("top");
  }, [scrollTo]);

  const handleNavigate = useCallback((i) => { if (i === 0) handleReset(); }, [handleReset]);

  const utxoDef = UTXO_DEFS[currentUTXO];
  const taproot = TAPROOT[currentUTXO];
  const leaf = activeLeaf ? LEAVES[activeLeaf] : null;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <h1 className="text-base font-bold text-slate-800">OP_VAULT — UTXO Lifecycle Explorer</h1>
            <p className="text-[11px] text-slate-500">
              Peel back the layers: on-chain output → Taproot key → Merkle tree → script → witness → next UTXO
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
                  P2TR(recovery_pubkey, {currentUTXO === "vault" ? "[recover, trigger]" : "[recover, withdraw]"})
                </code>
              </div>
            </div>

            {/* Layer 0 */}
            <OnChainView taproot={taproot} utxoColor={utxoDef.color} />

            {/* Layer 1 */}
            <TweakPipeline taproot={taproot} utxoColor={utxoDef.color} isActive={!activeLeaf} />

            {/* Key system overview (vault state only) */}
            {currentUTXO === "vault" && <KeySystemOverview />}

            {/* Layer 2 */}
            <MerkleTree taproot={taproot} utxoId={currentUTXO} activeLeaf={activeLeaf} onLeafClick={handleLeafClick} />

            {/* Layer 3 */}
            {leaf && !transitioning && (
              <LeafDetail leaf={leaf} taproot={taproot} onExecute={handleExecute} />
            )}

            {/* Transition */}
            {transitioning && (
              <TransitionView
                leaf={transitioning}
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
