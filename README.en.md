[简体中文](README.md) ｜ **English**

### Copyright Notice
This is a **non-commercial open-source project**. Copyright is jointly owned by six co-authors: the project lead author, Mr.Wang, Mr.Ding, Xudong, Mr.Liu and Jiaxiang. It is provided for technical study and exchange only; any commercial use without the prior written authorization of all authors is prohibited. The copyright will later be transferred in whole to a designated corporate entity, which may then carry out commercial operations lawfully.

> The Chinese text of [LICENSE](LICENSE) is the authoritative legal document. This English page is a courtesy translation for reference only; if there is any discrepancy, the Chinese version prevails.

### Full Copyright Evidence
This repository discloses **only a minimal runnable proof subset** of five innovative capabilities, solely to demonstrate original authorship and copyright ownership. All complete implementations — the server main program, the full import recognition engine, the zero-dependency XLSX reader/writer, the complete natural-language rule engine, the front-end UI and 3D rendering, deployment scripts and release packages — are held exclusively by the six co-authors listed above. The full commit history, with immutable timestamps, is archived in the authors' private GitHub repository `RackAtlas-full`.

The Git hash of this repository's first public commit, `44c37598dc83653d7101900ab3631ad2733327d3`, is uniquely bound to the first-commit hash of the full project in the private repository, `c93e7ba378d2fd8dbc33f0f773d511ddb9d3bd1d`. The pair can be cross-verified during copyright examination and serves as supporting evidence of authorship.

The timestamp anchor for the full codebase is the GitHub `created_at` of the private repository `RackAtlas-full`: `2026-11-10T11:47:43Z` (19:47:43 Beijing time), recorded objectively by GitHub and not modifiable by the authors. The `created_at` of this public repository `RackAtlas` is `2026-11-10T15:20:55Z` (23:20:55 Beijing time), later than the private one — consistent with "full codebase first, public subset later". Every file in this repository is a verbatim extract from, or a minimal demonstration-level reimplementation of, the corresponding logic in the private repository. Both repositories carry a byte-identical `LICENSE`; the private repository additionally contains `docs/版权存证核验.md` recording the same hashes. The hashes above point to **already-fixed historical commits** that cannot be rewritten, so writing them into a later README creates no self-reference; all subsequent commits here are ordinary commits — no amend, no force-push, no history rewriting.

## RackAtlas · Rack Atlas

> **A 3D IDC operations platform** — three-dimensional rack visualization and U-position ledger for data centers.

Four-level structure: **rooms → rack columns → racks → U-position devices**. Pick a room from the portal, inspect the layout in the 3D hall, double-click a rack to manage its U positions, locate a device instantly by serial number, and click a link in an exported Excel sheet to jump straight back to the web UI.

The design goal is **fully offline, zero npm dependencies, single-JSON storage**: one `server.js` serves the app, one `data/rack.json` holds every room, rack and device. Windows and Linux packages work out of the box, which suits intranet and air-gapped data-center operations.

This repository is its **minimal runnable proof subset**: it publishes only the core logic and self-check scripts for five innovative capabilities, and no complete implementation.

## Scope (Minimal Proof Subset)

This repository **deliberately publishes no complete implementation**. It contains only a **minimal runnable proof subset** of five innovative capabilities, demonstrating that these features were originally implemented in this project and establishing copyright ownership:

| Innovation | Proof subset | Runnable self-check |
|---|---|---|
| Device ↔ network-switch port linkage | `lib/linkage.js` | `node examples/linkage-demo.js` |
| Natural-language commands tolerant of messy input | `lib/nl-public-demo.js` | `node examples/nl-demo.js` |
| Manual-operation undo and recent changes | `lib/undo-public-demo.js` | `node examples/undo-demo.js` |
| Excel / JSON export design | `lib/export-public-demo.js` | `node examples/export-demo.js` |
| Temporary rack-name format inference during import | `lib/rack-format-public-demo.js` | `node examples/rack-format-demo.js` |

All five self-check scripts are pure in-memory, dependency-free, offline and write nothing to disk. Run them directly with `node`; all assertions pass.

**Not included in this repository**: any server main program, HTTP endpoint implementation, UI page, stylesheet, front-end interaction component, 3D rendering asset, static file server, the full import recognition engine, the zero-dependency XLSX engine, the complete AI rule engine, system administration, or deployment scripts. All of those exist only in the private repository `RackAtlas-full`, to keep the source code safe.

## The Five Innovations

1. **Device ↔ network-switch port linkage**: enter only the uplink switch serial number and port on a device, and the system locates the switch and lights up that port automatically. VLAN changes are synchronized back to the port, port conflicts are never silently overwritten, and decommissioning a device turns off only the ports it occupied. Proof subset: `lib/linkage.js`; notes: `docs/创新功能说明.md`.
2. **Natural-language commands tolerant of messy input**: "change data with one sentence" handles typos, colloquialisms, garbled phrasing, multiple commands separated by Chinese semicolons, questions that must not be misread as writes, port ranges and power-related terms. Only a tiny capability proof subset is published (about 220 lines versus 5,190 lines of the full implementation; fewer than 20 lines are verbatim). The complete rule table, action table, plan execution, LLM fallback, system prompt and front-end interaction are not included. Notes: `docs/AI创新功能说明.md`.
3. **Manual-operation undo and recent changes**: a full-store snapshot is taken before every manual modification, with LIFO undo and a step limit; recent changes are aggregated in reverse chronological order, enriched with rack/room information, and orphaned records are filtered out. Proof subset: `lib/undo-public-demo.js`; notes: `docs/撤销与导出功能说明.md`.
4. **Excel / JSON export design**: whitelist parsing of export options (format, coloring mode, hyperlinks, room scope, file name, detail type) plus validation of custom color mappings. Proof subset: `lib/export-public-demo.js`; notes: `docs/撤销与导出功能说明.md`.
5. **Temporary rack-name format inference during import**: when the built-in rules cannot handle a rack-name style such as `101机房A01`, `A区01`, `1F-A01` or `A栋01`, the user types one real rack name as a sample and the system infers the "room / column / index" structure from that sample and parses the whole batch accordingly. It applies to the current import only, never misreads names that do not match the sample, and falls back to the built-in rules on failure. Proof subset: `lib/rack-format-public-demo.js`; notes: `docs/创新功能说明.md`.

## Proof Subset Files

- `lib/linkage.js`, `lib/nl-public-demo.js`, `lib/undo-public-demo.js`, `lib/export-public-demo.js`, `lib/rack-format-public-demo.js`: five self-contained proof modules, each a **tiny verbatim extract plus a minimal demonstration-level implementation** of the corresponding logic in the full project.
- `examples/linkage-demo.js`, `examples/nl-demo.js`, `examples/undo-demo.js`, `examples/export-demo.js`, `examples/rack-format-demo.js`: five runnable self-checks.
- `docs/创新功能说明.md`, `docs/AI创新功能说明.md`, `docs/撤销与导出功能说明.md`: innovation notes and disclosure boundaries (in Chinese).
- `LICENSE`, `README.md`, `README.en.md`, `package.json`, `.gitattributes`, `.gitignore`: license, bilingual documentation and minimal project configuration.

## Integrity Verification

The commit message of every commit records a unique SHA-256 over all files in this repository. To reproduce it: exclude `.git/`, sort all files lexicographically by relative path, concatenate each as "UTF-8 relative path + 0x00 + raw file bytes + 0x00", then take the SHA-256 of the result. Recomputing it lets anyone confirm that the repository contents have not been altered.

The full license text is in [LICENSE](LICENSE) (Chinese is authoritative).

## Contact

For open-source and copyright matters — licensing enquiries, copyright verification, private vulnerability reports, or correction/takedown requests — please contact:
**zyx.05@qq.com**

This address is a contact channel published voluntarily by the authors and is not part of any data-center operational data.
