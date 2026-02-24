import { useState, useCallback, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   CCV Vault — UTXO Lifecycle Explorer with Taproot Internals

   Educational interactive explorer showing how CCV vault UTXOs work
   at the Taproot level: key construction, taptree Merkle trees,
   state embedding via tweaks, witness construction, and script execution.
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
const STYLE_ID = "ccv-utxo-kf";
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
    @keyframes tweakCompute { 0% { background-size:0% 100% } 100% { background-size:100% 100% } }
    @keyframes morphReveal { 0% { clip-path:circle(0% at 50% 50%); opacity:0 } 100% { clip-path:circle(100% at 50% 50%); opacity:1 } }
    @keyframes hashFlow { 0% { stroke-dashoffset: 8 } 100% { stroke-dashoffset: 0 } }
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
function KeyIcon({ size=16, color="#2563eb", animate=false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    style={animate ? {animation:"keyInsert 0.7s ease-out both"} : {}}>
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function LockClosedIcon({ size=16, color="#2563eb" }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke={color} strokeWidth="2" fill={color+"18"}/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="16.5" r="1.5" fill={color}/>
  </svg>;
}
function LockOpenIcon({ size=16, color="#16a34a", animate=false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="11" width="18" height="11" rx="2" stroke={color} strokeWidth="2" fill={color+"12"}/>
    <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke={color} strokeWidth="2" strokeLinecap="round"
      style={animate ? {animation:"lockOpen 0.5s ease-out both"} : {}}/>
    <circle cx="12" cy="16.5" r="1.5" fill={color}/>
  </svg>;
}

/* ─── Taproot data model ──────────────────────────────────────────── */

/*
  The real pipeline (from pymatt source):

  1. naked_internal_key = NUMS (unspendable)
  2. IF state data exists:
       state_tweaked_key = naked_key + SHA256(naked_key || state_data) · G
     ELSE:
       state_tweaked_key = naked_key
  3. Build taptree from clause scripts:
       leaf_hash = TaggedHash("TapLeaf", 0xc0 || compact_size(script) || script)
       branch_hash = TaggedHash("TapBranch", sort(left, right))
  4. Compute final tweak:
       t = TaggedHash("TapTweak", state_tweaked_key || merkle_root)
  5. Output key:
       Q = state_tweaked_key + t · G
  6. scriptPubKey = OP_1 <Q>       (34 bytes on chain)

  To spend via scriptpath, the witness is:
       [...args, signature?] [leaf_script] [control_block]
       control_block = (leaf_version | negflag) || internal_pubkey || merkle_proof
*/

const TAPROOT = {
  vault: {
    nakedKey: "NUMS_KEY",
    nakedKeyHex: "50929b74...88ac",
    nakedKeyDesc: "Nothing-Up-My-Sleeve point — no one knows the private key",
    hasState: false,
    stateDesc: null,
    tweakSteps: [
      { label: "No state data", formula: "internal_key = NUMS_KEY", note: "No state tweak needed — naked key used directly" },
      { label: "Build Merkle root", formula: "merkle_root = root(T₁)", note: "Tagged hashes of the 3 leaf scripts" },
      { label: "Compute tweak", formula: "t = TaggedHash(\"TapTweak\", NUMS || merkle_root)", note: "Commits to both key and tree" },
      { label: "Output key", formula: "Q = NUMS + t · G", note: "This 32-byte point is all that's on chain" },
    ],
    scriptPubKey: "OP_1 <Q>",
    scriptPubKeyNote: "34 bytes total — a miner sees nothing but a public key",
    tree: {
      // Huffman-like: trigger is most common, gets depth 1
      // trigger_and_revault + recover share depth 2
      structure: "binary",
      root: "TapBranch",
      left: { type: "leaf", id: "trigger", label: "trigger", depth: 1 },
      right: {
        type: "branch",
        left: { type: "leaf", id: "trigger_and_revault", label: "t&r", depth: 2 },
        right: { type: "leaf", id: "recover_vault", label: "recover", depth: 2 },
      },
      proofs: {
        trigger: {
          desc: "Proof: sibling is the right branch hash",
          path: ["H(TapBranch(t&r, recover))"],
          controlSize: "33 + 32 = 65 bytes",
        },
        trigger_and_revault: {
          desc: "Proof: sibling leaf + uncle branch",
          path: ["H(recover)", "H(trigger)"],
          controlSize: "33 + 64 = 97 bytes",
        },
        recover_vault: {
          desc: "Proof: sibling leaf + uncle branch",
          path: ["H(t&r)", "H(trigger)"],
          controlSize: "33 + 64 = 97 bytes",
        },
      },
    },
  },
  unvaulting: {
    nakedKey: "NUMS_KEY",
    nakedKeyHex: "50929b74...88ac",
    nakedKeyDesc: "Same NUMS point — keypath still disabled",
    hasState: true,
    stateData: "ctv_hash",
    stateDesc: "32-byte CTV template hash — chosen during trigger, carried through the tweak",
    tweakSteps: [
      { label: "State tweak", formula: "tweaked_key = NUMS + SHA256(NUMS || ctv_hash) · G", note: "State is embedded INSIDE the public key itself", highlight: true },
      { label: "Build Merkle root", formula: "merkle_root = root(T₂)", note: "Tagged hashes of 2 leaf scripts" },
      { label: "Compute tweak", formula: "t = TaggedHash(\"TapTweak\", tweaked_key || merkle_root)", note: "Double commitment: state + tree" },
      { label: "Output key", formula: "Q = tweaked_key + t · G", note: "Encodes state, tree, AND key — all in 32 bytes" },
    ],
    scriptPubKey: "OP_1 <Q>",
    scriptPubKeyNote: "Still just 34 bytes — the ctv_hash is invisible on chain until spent",
    tree: {
      structure: "binary",
      root: "TapBranch",
      left: { type: "leaf", id: "withdraw", label: "withdraw", depth: 1 },
      right: { type: "leaf", id: "recover_unvault", label: "recover", depth: 1 },
      proofs: {
        withdraw: {
          desc: "Proof: sibling is recover leaf hash",
          path: ["H(recover)"],
          controlSize: "33 + 32 = 65 bytes",
        },
        recover_unvault: {
          desc: "Proof: sibling is withdraw leaf hash",
          path: ["H(withdraw)"],
          controlSize: "33 + 32 = 65 bytes",
        },
      },
    },
  },
};

const KEY_TYPES = {
  unvault: { id: "unvault_pk", label: "unvault_pk", short: "Trigger Key", color: "#2563eb", bg: "#dbeafe", border: "#93c5fd" },
  none:    { id: "none",       label: "No Key",     short: "Keyless",     color: "#16a34a", bg: "#dcfce7", border: "#86efac" },
};

const LEAVES = {
  trigger: {
    id: "trigger", label: "trigger", color: C.blue, keyType: "unvault",
    desc: "Advance vault → Unvaulting state",
    script: [
      { op: "<ctv_hash> <out_i>", note: "witness args", indent: 0 },
      { op: "NUMS_KEY", note: "pk for output", indent: 0 },
      { op: "T₂_merkle_root", note: "taptree of Unvaulting", indent: 0 },
      { op: "0", note: "mode = PRESERVE_OUTPUT", indent: 0 },
      { op: "OP_CHECKCONTRACTVERIFY", note: "enforce output structure", hl: true, indent: 0 },
      { op: "unvault_pk OP_CHECKSIG", note: "require trigger key", hl: true, isKey: true, indent: 0 },
    ],
    witness: [
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from unvault_pk" },
      { item: "<ctv_hash>", bytes: "32 B", desc: "Template hash — becomes state in output" },
      { item: "<out_i>", bytes: "1-4 B", desc: "Output index for CCV" },
      { item: "<leaf_script>", bytes: "~89 B", desc: "The trigger clause bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || NUMS || H(right_branch)" },
    ],
    ccvMode: "0 (PRESERVE) — output amount ≥ input",
    stateCarried: "ctv_hash → embedded in Unvaulting output's Taproot tweak",
    leadsTo: "unvaulting",
  },
  trigger_and_revault: {
    id: "trigger_and_revault", label: "trigger & revault", color: C.purple, keyType: "unvault",
    desc: "Split: partial withdrawal + re-vault remainder",
    script: [
      { op: "── CCV #1: revault ──", heading: true },
      { op: "0 OP_SWAP", note: "no data tweak for revault", indent: 0 },
      { op: "<revault_out_i>", note: "from witness", indent: 0 },
      { op: "-1", note: "pk sentinel → keep current key", indent: 0 },
      { op: "-1", note: "taptree sentinel → keep current tree", indent: 0 },
      { op: "CCV_FLAG_DEDUCT", note: "mode = DEDUCT amount", indent: 0 },
      { op: "OP_CHECKCONTRACTVERIFY", note: "creates re-vaulted output", hl: true, indent: 0 },
      { op: "── CCV #2: trigger ──", heading: true },
      { op: "<ctv_hash> <out_i>", note: "from witness", indent: 0 },
      { op: "NUMS_KEY", note: "pk for unvaulting output", indent: 0 },
      { op: "T₂_merkle_root", note: "taptree of Unvaulting", indent: 0 },
      { op: "0", note: "mode = PRESERVE", indent: 0 },
      { op: "OP_CHECKCONTRACTVERIFY", note: "creates unvaulting output", hl: true, indent: 0 },
      { op: "unvault_pk OP_CHECKSIG", note: "require trigger key", hl: true, isKey: true, indent: 0 },
    ],
    witness: [
      { item: "<sig>", bytes: "64 B", desc: "Schnorr signature from unvault_pk" },
      { item: "<ctv_hash>", bytes: "32 B", desc: "Template hash for partial withdrawal" },
      { item: "<out_i>", bytes: "1-4 B", desc: "Index for unvaulting output" },
      { item: "<revault_out_i>", bytes: "1-4 B", desc: "Index for re-vault output" },
      { item: "<leaf_script>", bytes: "~150 B", desc: "The trigger_and_revault clause" },
      { item: "<control_block>", bytes: "97 B", desc: "(0xc0|neg) || NUMS || H(recover) || H(trigger)" },
    ],
    ccvMode: "DEDUCT (revault) + PRESERVE (trigger) — two CCV calls",
    stateCarried: "ctv_hash → Unvaulting tweak; Vault taptree preserved in re-vault",
    leadsTo: "split",
  },
  recover_vault: {
    id: "recover_vault", label: "recover", color: C.red, keyType: "none",
    desc: "Emergency sweep to cold storage — anyone can invoke",
    script: [
      { op: "0", note: "no data tweak", indent: 0 },
      { op: "OP_SWAP", note: "<out_i> from witness", indent: 0 },
      { op: "recover_pk", note: "recovery public key", indent: 0 },
      { op: "0", note: "taptree = none (bare key)", indent: 0 },
      { op: "0", note: "mode = PRESERVE_OUTPUT", indent: 0 },
      { op: "OP_CHECKCONTRACTVERIFY", note: "→ OpaqueP2TR(recover_pk)", hl: true, indent: 0 },
      { op: "OP_TRUE", note: "NO signature needed!", hl: true, isKey: true, indent: 0 },
    ],
    witness: [
      { item: "<out_i>", bytes: "1-4 B", desc: "Output index for recovery output" },
      { item: "<leaf_script>", bytes: "~60 B", desc: "The recover clause bytecode" },
      { item: "<control_block>", bytes: "97 B", desc: "(0xc0|neg) || NUMS || H(t&r) || H(trigger)" },
    ],
    ccvMode: "0 (PRESERVE) → OpaqueP2TR(recover_pk)",
    stateCarried: "None — terminal, no covenant constraints",
    leadsTo: "recovery",
  },
  withdraw: {
    id: "withdraw", label: "withdraw", color: C.green, keyType: "none",
    desc: "Complete the withdrawal after timelock — math enforces everything",
    script: [
      { op: "OP_DUP", note: "duplicate ctv_hash", indent: 0 },
      { op: "── verify input contract ──", heading: true },
      { op: "-1", note: "index sentinel → current input", indent: 1 },
      { op: "NUMS_KEY", note: "pk must match this UTXO", indent: 1 },
      { op: "-1", note: "taptree must match T₂", indent: 1 },
      { op: "CCV_FLAG_CHECK_INPUT", note: "mode = verify, don't create", indent: 1 },
      { op: "OP_CHECKCONTRACTVERIFY", note: "confirms ctv_hash in tweak", hl: true, indent: 1 },
      { op: "── timelock ──", heading: true },
      { op: "<spend_delay> OP_CSV", note: "e.g. 144 blocks (~1 day)", hl: true, indent: 0 },
      { op: "OP_DROP", note: "", indent: 0 },
      { op: "── template verification ──", heading: true },
      { op: "OP_CHECKTEMPLATEVERIFY", note: "outputs must match ctv_hash exactly", hl: true, indent: 0 },
    ],
    witness: [
      { item: "<ctv_hash>", bytes: "32 B", desc: "State data — read from the tweak, verified by CCV CHECK_INPUT" },
      { item: "<leaf_script>", bytes: "~80 B", desc: "The withdraw clause bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || tweaked_NUMS || H(recover)" },
    ],
    ccvMode: "CHECK_INPUT (verify) then CTV (enforce outputs)",
    stateCarried: "ctv_hash consumed — CTV enforces exact output structure",
    leadsTo: "withdrawal",
  },
  recover_unvault: {
    id: "recover_unvault", label: "recover", color: C.red, keyType: "none",
    desc: "Emergency sweep — same OP_TRUE, anyone can invoke",
    script: [
      { op: "0", note: "no data tweak", indent: 0 },
      { op: "OP_SWAP", note: "<out_i> from witness", indent: 0 },
      { op: "recover_pk", note: "recovery public key", indent: 0 },
      { op: "0", note: "taptree = none", indent: 0 },
      { op: "0", note: "mode = PRESERVE_OUTPUT", indent: 0 },
      { op: "OP_CHECKCONTRACTVERIFY", note: "→ OpaqueP2TR(recover_pk)", hl: true, indent: 0 },
      { op: "OP_TRUE", note: "NO signature needed!", hl: true, isKey: true, indent: 0 },
    ],
    witness: [
      { item: "<out_i>", bytes: "1-4 B", desc: "Output index for recovery output" },
      { item: "<leaf_script>", bytes: "~60 B", desc: "The recover clause bytecode" },
      { item: "<control_block>", bytes: "65 B", desc: "(0xc0|neg) || tweaked_NUMS || H(withdraw)" },
    ],
    ccvMode: "0 (PRESERVE) → OpaqueP2TR(recover_pk)",
    stateCarried: "None — terminal",
    leadsTo: "recovery",
  },
};

const UTXO_DEFS = {
  vault: {
    id: "vault", title: "Vault UTXO", color: C.blue,
    leaves: ["trigger", "trigger_and_revault", "recover_vault"],
  },
  unvaulting: {
    id: "unvaulting", title: "Unvaulting UTXO", color: C.amber,
    leaves: ["withdraw", "recover_unvault"],
  },
};

const TERMINALS = {
  withdrawal: {
    id: "withdrawal", title: "Withdrawal Output", type: "P2TR(destination)", color: C.green,
    details: [
      "CTV-committed outputs — structure locked by ctv_hash",
      "Destination address chosen at trigger time, immutable since",
      "No taptree, no covenant — simple P2TR keypath spend",
      "TERMINAL — funds released to the owner",
    ],
  },
  recovery: {
    id: "recovery", title: "Recovery Output", type: "P2TR(recover_pk)", color: C.red,
    details: [
      "OpaqueP2TR — bare keypath output, no scripts",
      "recover_pk was fixed at vault creation time",
      "No taptree, no further covenant constraints",
      "TERMINAL — emergency cold storage",
    ],
  },
  split: {
    id: "split", title: "Split Outputs", color: C.purple, isSplit: true,
    outputs: [
      { title: "Unvaulting UTXO", type: "P2TR(NUMS, T₂)", color: C.amber,
        details: ["Partial amount from CCV PRESERVE", "ctv_hash in tweak — same as normal trigger path", "Full Unvaulting taptree: withdraw + recover"] },
      { title: "Re-Vaulted UTXO", type: "P2TR(NUMS, T₁)", color: C.purple,
        details: ["Remainder via CCV DEDUCT (input − partial)", "pk=-1, taptree=-1 → same key, same tree", "This IS a new Vault — lifecycle restarts"] },
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
        <div className="w-2 h-2 rounded-full bg-slate-400"/>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Layer 0 — What miners see on chain</span>
      </div>
      <div className="font-mono text-sm bg-white rounded-lg px-4 py-3 border border-slate-200 flex items-center gap-3">
        <span className="text-slate-400 text-xs">scriptPubKey:</span>
        <span className="text-slate-500">OP_1</span>
        <span className="px-2 py-1 rounded font-bold" style={{backgroundColor: utxoColor.light, color: utxoColor.text}}>
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
    <div className="rounded-xl border-2 p-4" style={{borderColor: utxoColor.bg + "40", backgroundColor: utxoColor.light + "60"}}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{backgroundColor: utxoColor.bg}}/>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{color: utxoColor.text}}>
          Layer 1 — How Q is constructed
        </span>
      </div>

      {/* Pipeline steps */}
      <div className="space-y-2">
        {taproot.tweakSteps.map((step, i) => (
          <div key={i} className={`flex items-start gap-3 ${isActive ? 'anim-in' : ''}`}
            style={isActive ? {animationDelay: `${i * 0.12}s`} : {}}>
            {/* Step number */}
            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{backgroundColor: step.highlight ? C.orange.bg : utxoColor.bg}}>
              {i + 1}
            </div>
            {/* Formula */}
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs bg-white rounded px-3 py-1.5 border border-slate-200"
                style={step.highlight ? {borderColor: C.orange.bg, backgroundColor: C.orange.light} : {}}>
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

      {/* State data callout for Unvaulting */}
      {taproot.hasState && (
        <div className="mt-3 rounded-lg p-3 border-2 border-dashed" style={{borderColor: C.orange.bg + "60", backgroundColor: C.orange.light}}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700">State embedding</span>
          </div>
          <p className="text-xs text-orange-800">
            The <code className="font-bold bg-orange-200 px-1 rounded">ctv_hash</code> is baked into the public key itself via a point multiplication.
            No one can see it on chain — but the withdraw script can extract and verify it using CCV's CHECK_INPUT mode.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Layer 2: Merkle tree visualization ──────────────────────────── */

function MerkleTree({ treeData, utxoId, activeLeaf, onLeafClick }) {
  const tap = TAPROOT[utxoId];
  const tree = tap.tree;
  const isVault = utxoId === "vault";

  // Layout for vault (3 leaves, depth 2) vs unvaulting (2 leaves, depth 1)
  if (isVault) return (
    <VaultMerkleTree tree={tree} activeLeaf={activeLeaf} onLeafClick={onLeafClick} tap={tap}/>
  );
  return (
    <UnvaultingMerkleTree tree={tree} activeLeaf={activeLeaf} onLeafClick={onLeafClick} tap={tap}/>
  );
}

function VaultMerkleTree({ tree, activeLeaf, onLeafClick, tap }) {
  const proofPaths = tap.tree.proofs;
  const activeProof = activeLeaf ? proofPaths[activeLeaf] : null;

  // Is this node on the proof path? (highlighted as "revealed")
  const isProofNode = (nodeId) => {
    if (!activeLeaf || !activeProof) return false;
    // The active leaf itself
    if (nodeId === activeLeaf) return "active";
    // Check if this node's hash appears in the proof
    if (activeLeaf === "trigger") {
      return nodeId === "right_branch" ? "sibling" : false;
    }
    if (activeLeaf === "trigger_and_revault") {
      return (nodeId === "recover_vault" || nodeId === "trigger") ? "sibling" : false;
    }
    if (activeLeaf === "recover_vault") {
      return (nodeId === "trigger_and_revault" || nodeId === "trigger") ? "sibling" : false;
    }
    return false;
  };

  const leafColor = (id) => LEAVES[id]?.color || C.slate;
  const pn = (id) => isProofNode(id);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-slate-400"/>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Layer 2 — Taptree T₁ (Merkle tree of spending scripts)
        </span>
      </div>

      {/* Two spending modes */}
      <div className="flex items-center gap-4 mb-4 ml-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className="w-6 h-[2px] bg-slate-300 line-through"/>
          <span>Keypath: <strong className="text-red-500">DISABLED</strong> (NUMS = no private key exists)</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className="w-6 h-[2px] bg-blue-400"/>
          <span>Scriptpath: reveal a leaf + Merkle proof ↓</span>
        </div>
      </div>

      {/* Tree SVG */}
      <svg viewBox="0 0 400 140" className="w-full max-w-md mx-auto" style={{height: 140}}>
        {/* Edges */}
        <line x1="200" y1="20" x2="100" y2="60"
          stroke={pn("trigger") === "active" ? C.blue.bg : "#d1d5db"} strokeWidth={pn("trigger") === "active" ? 2.5 : 1.5}/>
        <line x1="200" y1="20" x2="300" y2="60"
          stroke={pn("right_branch") === "sibling" || pn("trigger_and_revault") === "active" || pn("recover_vault") === "active" ? C.amber.bg : "#d1d5db"}
          strokeWidth={(pn("trigger_and_revault") === "active" || pn("recover_vault") === "active" || pn("right_branch") === "sibling") ? 2.5 : 1.5}/>
        <line x1="300" y1="60" x2="240" y2="110"
          stroke={pn("trigger_and_revault") === "active" ? C.purple.bg : "#d1d5db"} strokeWidth={pn("trigger_and_revault") === "active" ? 2.5 : 1.5}/>
        <line x1="300" y1="60" x2="360" y2="110"
          stroke={pn("recover_vault") === "active" ? C.red.bg : "#d1d5db"} strokeWidth={pn("recover_vault") === "active" ? 2.5 : 1.5}/>

        {/* Root node */}
        <circle cx="200" cy="20" r="8" fill={C.slate.bg} stroke="#475569" strokeWidth="1.5"/>
        <text x="200" y="23" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">root</text>

        {/* Right internal branch */}
        <circle cx="300" cy="60" r="7" fill={pn("right_branch") === "sibling" ? C.amber.bg : "#94a3b8"} stroke="#475569" strokeWidth="1.5"
          className={pn("right_branch") === "sibling" ? "proof-active" : ""}/>

        {/* Leaf: trigger (depth 1) */}
        <g onClick={() => onLeafClick("trigger")} className="cursor-pointer">
          <rect x="55" y="48" width="90" height="28" rx="8"
            fill={pn("trigger") === "active" ? C.blue.light : "white"}
            stroke={pn("trigger") === "active" ? C.blue.bg : C.blue.bg + "60"} strokeWidth={pn("trigger") === "active" ? 2.5 : 1.5}/>
          <text x="100" y="66" textAnchor="middle" fontSize="10" fill={C.blue.text} fontWeight="bold">trigger</text>
          {pn("trigger") === "sibling" && <text x="148" y="63" fontSize="7" fill={C.amber.bg} fontWeight="bold">PROOF</text>}
        </g>

        {/* Leaf: trigger_and_revault (depth 2) */}
        <g onClick={() => onLeafClick("trigger_and_revault")} className="cursor-pointer">
          <rect x="195" y="98" width="90" height="28" rx="8"
            fill={pn("trigger_and_revault") === "active" ? C.purple.light : "white"}
            stroke={pn("trigger_and_revault") === "active" ? C.purple.bg : C.purple.bg + "60"} strokeWidth={pn("trigger_and_revault") === "active" ? 2.5 : 1.5}/>
          <text x="240" y="116" textAnchor="middle" fontSize="9" fill={C.purple.text} fontWeight="bold">t & r</text>
        </g>

        {/* Leaf: recover (depth 2) */}
        <g onClick={() => onLeafClick("recover_vault")} className="cursor-pointer">
          <rect x="315" y="98" width="80" height="28" rx="8"
            fill={pn("recover_vault") === "active" ? C.red.light : "white"}
            stroke={pn("recover_vault") === "active" ? C.red.bg : C.red.bg + "60"} strokeWidth={pn("recover_vault") === "active" ? 2.5 : 1.5}/>
          <text x="355" y="116" textAnchor="middle" fontSize="9" fill={C.red.text} fontWeight="bold">recover</text>
        </g>

        {/* Key badges on leaves */}
        <g transform="translate(58, 48)">
          <rect x="0" y="-12" width="36" height="12" rx="6" fill={KEY_TYPES.unvault.bg} stroke={KEY_TYPES.unvault.border} strokeWidth="0.8"/>
          <text x="18" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.unvault.color} fontWeight="bold">🔑 key</text>
        </g>
        <g transform="translate(198, 98)">
          <rect x="0" y="-12" width="36" height="12" rx="6" fill={KEY_TYPES.unvault.bg} stroke={KEY_TYPES.unvault.border} strokeWidth="0.8"/>
          <text x="18" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.unvault.color} fontWeight="bold">🔑 key</text>
        </g>
        <g transform="translate(318, 98)">
          <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.none.bg} stroke={KEY_TYPES.none.border} strokeWidth="0.8"/>
          <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.none.color} fontWeight="bold">🔓 open</text>
        </g>

        {/* Proof annotation - sibling hashes */}
        {activeLeaf && activeProof && (
          <text x="200" y="138" textAnchor="middle" fontSize="8" fill="#64748b">
            Merkle proof ({activeProof.controlSize}): {activeProof.path.join(" + ")}
          </text>
        )}
      </svg>

      {/* Hash construction explanation */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash("TapLeaf", 0xc0 || script)</code>
          <div className="text-slate-400 mt-0.5">Each leaf is a tagged SHA256</div>
        </div>
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash("TapBranch", sort(L, R))</code>
          <div className="text-slate-400 mt-0.5">Branches are sorted then hashed</div>
        </div>
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash = SHA256(tag || tag || data)</code>
          <div className="text-slate-400 mt-0.5">Domain separation via double-tag</div>
        </div>
      </div>
    </div>
  );
}

function UnvaultingMerkleTree({ tree, activeLeaf, onLeafClick, tap }) {
  const proofPaths = tap.tree.proofs;
  const activeProof = activeLeaf ? proofPaths[activeLeaf] : null;
  const pn = (id) => {
    if (!activeLeaf) return false;
    if (id === activeLeaf) return "active";
    if (activeLeaf === "withdraw" && id === "recover_unvault") return "sibling";
    if (activeLeaf === "recover_unvault" && id === "withdraw") return "sibling";
    return false;
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-slate-400"/>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Layer 2 — Taptree T₂ (Merkle tree of spending scripts)
        </span>
      </div>
      <div className="flex items-center gap-4 mb-4 ml-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className="w-6 h-[2px] bg-slate-300 line-through"/>
          <span>Keypath: <strong className="text-red-500">DISABLED</strong> (NUMS)</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <div className="w-6 h-[2px] bg-amber-400"/>
          <span>Scriptpath: two leaves, both keyless ↓</span>
        </div>
      </div>

      <svg viewBox="0 0 400 100" className="w-full max-w-sm mx-auto" style={{height: 100}}>
        <line x1="200" y1="20" x2="120" y2="70"
          stroke={pn("withdraw") === "active" ? C.green.bg : "#d1d5db"} strokeWidth={pn("withdraw") === "active" ? 2.5 : 1.5}/>
        <line x1="200" y1="20" x2="280" y2="70"
          stroke={pn("recover_unvault") === "active" ? C.red.bg : "#d1d5db"} strokeWidth={pn("recover_unvault") === "active" ? 2.5 : 1.5}/>

        <circle cx="200" cy="20" r="8" fill={C.slate.bg} stroke="#475569" strokeWidth="1.5"/>
        <text x="200" y="23" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">root</text>

        <g onClick={() => onLeafClick("withdraw")} className="cursor-pointer">
          <rect x="65" y="58" width="110" height="28" rx="8"
            fill={pn("withdraw") === "active" ? C.green.light : "white"}
            stroke={pn("withdraw") === "active" ? C.green.bg : C.green.bg + "60"} strokeWidth={pn("withdraw") === "active" ? 2.5 : 1.5}/>
          <text x="120" y="76" textAnchor="middle" fontSize="10" fill={C.green.text} fontWeight="bold">withdraw</text>
          {pn("withdraw") === "sibling" && <text x="178" y="73" fontSize="7" fill={C.amber.bg} fontWeight="bold">PROOF</text>}
        </g>
        <g onClick={() => onLeafClick("recover_unvault")} className="cursor-pointer">
          <rect x="225" y="58" width="110" height="28" rx="8"
            fill={pn("recover_unvault") === "active" ? C.red.light : "white"}
            stroke={pn("recover_unvault") === "active" ? C.red.bg : C.red.bg + "60"} strokeWidth={pn("recover_unvault") === "active" ? 2.5 : 1.5}/>
          <text x="280" y="76" textAnchor="middle" fontSize="10" fill={C.red.text} fontWeight="bold">recover</text>
          {pn("recover_unvault") === "sibling" && <text x="338" y="73" fontSize="7" fill={C.amber.bg} fontWeight="bold">PROOF</text>}
        </g>

        {/* Key badges */}
        <g transform="translate(68, 58)">
          <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.none.bg} stroke={KEY_TYPES.none.border} strokeWidth="0.8"/>
          <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.none.color} fontWeight="bold">🔓 CTV+CSV</text>
        </g>
        <g transform="translate(228, 58)">
          <rect x="0" y="-12" width="42" height="12" rx="6" fill={KEY_TYPES.none.bg} stroke={KEY_TYPES.none.border} strokeWidth="0.8"/>
          <text x="21" y="-3" textAnchor="middle" fontSize="6" fill={KEY_TYPES.none.color} fontWeight="bold">🔓 open</text>
        </g>

        {activeLeaf && activeProof && (
          <text x="200" y="96" textAnchor="middle" fontSize="8" fill="#64748b">
            Merkle proof ({activeProof.controlSize}): {activeProof.path.join(" + ")}
          </text>
        )}
      </svg>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash("TapLeaf", ...)</code>
          <div className="text-slate-400 mt-0.5">Leaf hash of each script</div>
        </div>
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">TaggedHash("TapBranch", ...)</code>
          <div className="text-slate-400 mt-0.5">Sorted children hashed</div>
        </div>
        <div className="text-[10px] text-center p-1.5 rounded bg-slate-50 border border-slate-200">
          <code className="text-slate-600">Both leaves are keyless</code>
          <div className="text-slate-400 mt-0.5">Math enforces security</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Layer 3: Expanded leaf (script + witness + key) ─────────────── */

function LeafDetail({ leaf, taproot, utxoId, onExecute }) {
  const kt = KEY_TYPES[leaf.keyType];
  const isKeyless = leaf.keyType === "none";
  const proof = taproot.tree.proofs[leaf.id];

  return (
    <div className="space-y-3 anim-in">

      {/* Key authorization */}
      <div className="rounded-xl border-2 p-3" style={{borderColor: kt.border, backgroundColor: kt.bg + "40"}}>
        <div className="flex items-center gap-3">
          {isKeyless ? (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{backgroundColor: kt.bg, border: `2px solid ${kt.border}`}}>
              <LockOpenIcon size={20} color={kt.color} animate={true}/>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{backgroundColor: kt.bg, border: `2px solid ${kt.border}`}}>
              <KeyIcon size={20} color={kt.color} animate={true}/>
            </div>
          )}
          <div>
            <div className="text-xs font-bold" style={{color: kt.color}}>{kt.short}</div>
            <div className="text-[10px] text-slate-600">
              {isKeyless
                ? leaf.id === "withdraw"
                  ? "CTV template + CSV timelock enforce everything — no human signature"
                  : "OP_TRUE — anyone on the network can broadcast this transaction"
                : "Vault owner must sign with " + kt.label + " (hot key)"}
            </div>
          </div>
        </div>
      </div>

      {/* Script */}
      <div className="bg-white rounded-xl p-3 border border-slate-200 anim-in-d1">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Leaf Script (bytecode)</div>
        <div className="font-mono text-xs leading-relaxed space-y-0.5">
          {leaf.script.map((s, i) => (
            <div key={i} className={s.heading ? "mt-2 mb-0.5" : "flex gap-2"}>
              {s.heading ? (
                <span className="text-slate-400 font-semibold text-[10px] tracking-wider uppercase">{s.op}</span>
              ) : (
                <>
                  <span className="text-slate-300 w-3 text-right select-none text-[10px]">{i}</span>
                  <span className={
                    s.isKey ? "text-amber-700 font-bold bg-amber-50 px-1 rounded" :
                    s.hl ? "text-blue-700 font-semibold" : "text-slate-700"
                  } style={{marginLeft: (s.indent || 0) * 12}}>
                    {s.isKey && <span className="mr-1">{s.op.includes("TRUE") ? "🔓" : "🔑"}</span>}
                    {s.op}
                  </span>
                  {s.note && <span className="text-slate-400 text-[10px]">// {s.note}</span>}
                </>
              )}
            </div>
          ))}
        </div>
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

        {/* Control block breakdown */}
        {proof && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Control Block Anatomy</div>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">(0xc0|neg)</span>
              <span className="text-slate-300">||</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">internal_pk (32B)</span>
              <span className="text-slate-300">||</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                {proof.path.length > 0 ? proof.path.join(" || ") : "∅"} ({proof.path.length * 32}B)
              </span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              The verifier reconstructs the Merkle root from the leaf script + proof hashes, then checks Q = P + TaggedHash("TapTweak", P || root) · G
            </p>
          </div>
        )}
      </div>

      {/* CCV mode + state */}
      <div className="grid grid-cols-2 gap-2 anim-in-d3">
        <div className="bg-white rounded-lg p-2.5 border border-slate-200">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">CCV Mode</div>
          <p className="text-[11px] text-slate-700">{leaf.ccvMode}</p>
        </div>
        <div className="rounded-lg p-2.5 border" style={{backgroundColor: C.amber.light, borderColor: C.amber.bg + "40"}}>
          <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider mb-1">State After</div>
          <p className="text-[11px] text-amber-800">{leaf.stateCarried}</p>
        </div>
      </div>

      {/* Execute button */}
      <button onClick={onExecute}
        className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
        style={{backgroundColor: leaf.color.bg}}>
        {isKeyless
          ? <><LockOpenIcon size={16} color="white"/> Execute (keyless) → see output UTXO</>
          : <><KeyIcon size={16} color="white"/> Sign & broadcast → see output UTXO</>}
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
      {/* Signing / open path */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl anim-pulse"
        style={{backgroundColor: kt.bg, border: `2px solid ${kt.border}`}}>
        {isKeyless
          ? <LockOpenIcon size={22} color={kt.color} animate/>
          : <KeyIcon size={22} color={kt.color} animate/>}
        <span className="text-sm font-semibold" style={{color: kt.color}}>
          {isKeyless ? "Open path — submitting witness..." : `Signing with ${kt.label}...`}
        </span>
      </div>

      {/* Flow particles */}
      <div className="relative" style={{height: 40}}>
        <div className="absolute left-1/2 w-0.5 rounded-full" style={{
          height: 40, transform: "translateX(-50%)",
          background: `linear-gradient(to bottom, ${fromColor}, ${toColor})`}} />
        {[0,1,2].map(i => <div key={i} className="absolute left-1/2 w-2 h-2 rounded-full"
          style={{transform:"translateX(-50%)", backgroundColor: toColor, opacity:0.7,
            animation: `flowParticle 0.7s ease-in-out ${i*0.2}s infinite`}}/>)}
        <svg width="16" height="10" className="absolute left-1/2 bottom-0" style={{transform:"translateX(-50%)"}}>
          <polygon points="8,10 2,0 14,0" fill={toColor} opacity="0.7"/>
        </svg>
      </div>

      <span className="text-[10px] text-slate-400">Script validated → new UTXO materializing...</span>
    </div>
  );
}

/* ─── Terminal card ───────────────────────────────────────────────── */

function TerminalCard({ terminal }) {
  if (terminal.isSplit) {
    return (
      <div className="space-y-3 anim-morph">
        <div className="text-center">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
            CCV DEDUCT mode: one input → two outputs
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {terminal.outputs.map((out, i) => (
            <div key={i} className="rounded-xl border-2 overflow-hidden"
              style={{borderColor: out.color.bg, boxShadow: `0 4px 16px ${out.color.glow}`,
                animation: `fadeIn 0.35s ease-out ${i*0.15}s both`}}>
              <div className="px-4 py-2" style={{backgroundColor: out.color.bg}}>
                <h3 className="text-white font-bold text-sm">{out.title}</h3>
                <code className="text-white/80 text-[11px]">{out.type}</code>
              </div>
              <div className="p-3 bg-white space-y-1">
                {out.details.map((d, j) => (
                  <div key={j} className="text-[11px] text-slate-600 flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor: out.color.bg}}/>
                    {d}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 overflow-hidden anim-morph"
      style={{borderColor: terminal.color.bg, boxShadow: `0 4px 16px ${terminal.color.glow}`}}>
      <div className="px-4 py-2.5" style={{backgroundColor: terminal.color.bg}}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold">{terminal.title}</h3>
          <code className="text-white/80 text-xs bg-white/20 px-2 py-0.5 rounded">{terminal.type}</code>
        </div>
      </div>
      <div className="p-4 bg-white space-y-1.5">
        {terminal.details.map((d, i) => (
          <div key={i} className="text-sm text-slate-600 flex items-start gap-2">
            <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: terminal.color.bg}}/>
            {d}
          </div>
        ))}
        <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
          No Taproot taptree — this is a simple P2TR output. Spendable directly via keypath with the destination/recovery private key.
        </div>
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
            style={{backgroundColor: step.color.light, color: step.color.text}}>
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

export default function CCVUTXOLifecycle() {
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
      if (pos === "bottom") contentRef.current.scrollTo({top: contentRef.current.scrollHeight, behavior: "smooth"});
      else if (pos === "top") contentRef.current.scrollTo({top: 0, behavior: "smooth"});
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
      setPath(p => [...p, {label: leaf.label, color: leaf.color}, {label: TERMINALS[target].title, color: TERMINALS[target].color}]);
    } else {
      setCurrentUTXO(target);
      setPath(p => [...p, {label: leaf.label, color: leaf.color}, {label: UTXO_DEFS[target].title, color: UTXO_DEFS[target].color}]);
    }
    scrollTo("top");
  }, [transitioning, scrollTo]);

  const handleReset = useCallback(() => {
    setCurrentUTXO("vault");
    setTerminal(null);
    setActiveLeaf(null);
    setTransitioning(null);
    setPath([{label: "Vault UTXO", color: C.blue}]);
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
            <h1 className="text-base font-bold text-slate-800">CCV Vault — UTXO Lifecycle Explorer</h1>
            <p className="text-[11px] text-slate-500">
              Peel back the layers: on-chain output → Taproot key → Merkle tree → script → witness → next UTXO
            </p>
          </div>
          <button onClick={handleReset}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            Reset
          </button>
        </div>
        <Breadcrumb path={path} onNavigate={handleNavigate}/>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {!terminal ? (
          <>
            {/* UTXO header */}
            <div className="rounded-xl px-4 py-2.5" style={{backgroundColor: utxoDef.color.bg}}>
              <div className="flex items-center justify-between">
                <h2 className="text-white font-bold">{utxoDef.title}</h2>
                <code className="text-white/80 text-xs bg-white/20 px-2 py-0.5 rounded">
                  P2TR({taproot.nakedKey}, {currentUTXO === "vault" ? "T₁" : "T₂"})
                </code>
              </div>
            </div>

            {/* Layer 0: On-chain */}
            <OnChainView taproot={taproot} utxoColor={utxoDef.color}/>

            {/* Layer 1: Key construction */}
            <TweakPipeline taproot={taproot} utxoColor={utxoDef.color} isActive={!activeLeaf}/>

            {/* Layer 2: Merkle tree */}
            <MerkleTree treeData={taproot.tree} utxoId={currentUTXO} activeLeaf={activeLeaf} onLeafClick={handleLeafClick}/>

            {/* Layer 3: Expanded leaf detail */}
            {leaf && !transitioning && (
              <LeafDetail leaf={leaf} taproot={taproot} utxoId={currentUTXO} onExecute={handleExecute}/>
            )}

            {/* Transition animation */}
            {transitioning && (
              <TransitionView
                leaf={transitioning}
                fromColor={utxoDef.color.bg}
                toColor={TERMINALS[transitioning.leadsTo]?.color.bg || UTXO_DEFS[transitioning.leadsTo]?.color.bg || "#64748b"}
                onDone={handleTransitionDone}/>
            )}
          </>
        ) : (
          <>
            <TerminalCard terminal={terminal}/>
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
